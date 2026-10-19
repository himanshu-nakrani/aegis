"""aegis — Aegis platform CLI.

Commands:
    gate — run a regression experiment and pass/fail on the verdict.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

POLL_INTERVAL_S = 2.0
DEFAULT_TIMEOUT_S = 300.0


def _request(method: str, url: str, key: str | None, body: dict | None = None) -> dict | list:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if key:
        req.add_header("X-Aegis-API-Key", key)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body_bytes = resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        try:
            payload = json.loads(detail)
            if isinstance(payload.get("detail"), (str, dict)):
                detail = payload["detail"]
        except json.JSONDecodeError:
            pass
        raise CliError(f"HTTP {exc.code} from {method} {url}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise CliError(f"cannot reach {url}: {exc.reason}") from exc
    # N7: a 2xx body that isn't JSON must fail with a clean CliError (exit 2),
    # not a raw JSONDecodeError traceback.
    try:
        return json.loads(body_bytes)
    except json.JSONDecodeError:
        raise CliError(f"unexpected non-JSON response from {method} {url}") from None


class CliError(Exception):
    pass


def _versions(base: str, workflow: str, key: str | None) -> list[dict]:
    return _request("GET", f"{base}/api/workflows/{workflow}/versions", key)


def _pick_versions(
    versions: list[dict],
    version: str | None,
    baseline: str | None,
    published_id: str | None = None,
) -> tuple[str, str]:
    """Resolve candidate/baseline version IDs.

    Flags may be a version UUID or an integer version_number. Defaults:
    candidate = latest, baseline = the *published* version (not merely the
    second-newest saved one — a saved-only version is a misleading gate).
    """

    def resolve(name: str | None, default_index: int, label: str) -> str:
        if name:
            for v in versions:
                if v.get("id") == name or str(v.get("version_number")) == str(name):
                    vid = v.get("id")
                    if vid:
                        return vid
            raise CliError(f"{label} version {name!r} not found on workflow")
        # Default baseline: the published version, not just "second newest" —
        # an unpublished save is not what the gate should compare against.
        # A stale published pointer (id not in the version list) falls through.
        if label == "baseline" and published_id and any(
            v.get("id") == published_id for v in versions
        ):
            return published_id
        try:
            vid = versions[default_index].get("id")
            if not vid:
                raise CliError(f"{label} version row missing id field")
            return vid
        except IndexError:
            raise CliError(
                f"workflow needs at least {default_index + 1} versions to gate; "
                "pass --version/--baseline to choose explicitly"
            ) from None

    candidate_id = resolve(version, 0, "candidate")
    baseline_id = resolve(baseline, 1, "baseline")
    # Publishing the latest version must not gate it against itself.
    if baseline is None and candidate_id == baseline_id:
        for v in versions:
            vid = v.get("id")
            if vid and vid != candidate_id:
                return candidate_id, vid
        raise CliError(
            "published version is the only version; pass --baseline to compare explicitly"
        )
    return candidate_id, baseline_id


def cmd_gate(args: argparse.Namespace) -> int:
    base = args.url.rstrip("/")

    try:
        versions = _versions(base, args.workflow, args.key)
        if not versions:
            raise CliError(f"workflow {args.workflow} has no versions")
        # N7: resolve the default baseline against the *published* version, not
        # merely the second-newest saved row.
        published = _request("GET", f"{base}/api/workflows/{args.workflow}/published", args.key)
        published_id = published.get("published_version_id") if isinstance(published, dict) else None
        version_id, baseline_id = _pick_versions(
            versions, args.version, args.baseline, published_id=published_id
        )

        exp = _request(
            "POST",
            f"{base}/api/experiments",
            args.key,
            {
                "workflow_id": args.workflow,
                "dataset_id": args.dataset,
                "version_id": version_id,
                "baseline_version_id": baseline_id,
                "kind": "regression",
                "max_eval_drop": args.threshold,
            },
        )
        exp_id = exp.get("id") if isinstance(exp, dict) else None
        if not exp_id:
            raise CliError("experiment create returned no id (malformed response)")
        print(f"experiment {exp_id} created (kind=regression, threshold={args.threshold})")
        deadline = time.monotonic() + args.timeout
        gate = None
        while time.monotonic() < deadline:
            gate = _request("GET", f"{base}/api/experiments/{exp_id}/gate", args.key)
            if not isinstance(gate, dict):
                raise CliError("gate response was not an object")
            status = gate.get("status")
            if status != "pending":
                break
            time.sleep(POLL_INTERVAL_S)
        else:
            raise CliError(f"timed out after {args.timeout}s waiting for the gate")

        if not isinstance(gate, dict):
            raise CliError("gate response was not an object")
        gate_status = gate.get("status")
        print(
            f"gate status={gate_status} gate_passed={gate.get('gate_passed')} "
            f"eval_delta={gate.get('eval_delta')} failure_delta={gate.get('failure_delta')} "
            f"max_eval_drop={gate.get('max_eval_drop')}"
        )
        for reason in gate.get("reasons") or []:
            print(f"  - {reason}")

        if gate_status == "passed":
            return 0
        if gate_status == "failed":
            return 1
        # error / not_applicable / missing — inconclusive, do not let it slip.
        return 2

    except CliError as exc:
        print(f"aegis gate: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("aegis gate: interrupted", file=sys.stderr)
        return 130


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="aegis", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    gate = sub.add_parser(
        "gate",
        help="Run a regression experiment and exit non-zero on eval regression.",
        description=(
            "Creates a regression experiment (candidate vs baseline version over a "
            "dataset), polls GET /api/experiments/{id}/gate until the verdict lands, "
            "and exits 0 (passed), 1 (failed), or 2 (error/not_applicable)."
        ),
    )
    gate.add_argument("--url", required=True, help="API base URL, e.g. https://api.example.com")
    gate.add_argument(
        "--key",
        default=os.environ.get("AEGIS_API_KEY"),
        help="Account API key sent as X-Aegis-API-Key. Required when the server has "
        "AUTH_ENABLED=true. Defaults to $AEGIS_API_KEY.",
    )
    gate.add_argument("--workflow", required=True, help="Workflow ID")
    gate.add_argument("--dataset", required=True, help="Dataset ID")
    gate.add_argument(
        "--threshold",
        type=float,
        required=True,
        help="Max allowed drop in average eval score vs baseline (max_eval_drop)",
    )
    gate.add_argument("--version", default=None, help="Candidate version ID or number (default: latest)")
    gate.add_argument("--baseline", default=None, help="Baseline version ID or number (default: previous)")
    gate.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_S,
        help=f"Seconds to wait for the verdict (default {DEFAULT_TIMEOUT_S:g})",
    )
    gate.set_defaults(fn=cmd_gate)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    sys.exit(args.fn(args))


if __name__ == "__main__":
    main()
