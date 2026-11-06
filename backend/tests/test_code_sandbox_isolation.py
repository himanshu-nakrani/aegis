"""Capability probes bypass the AST only inside the trusted WASI runner."""

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path
from uuid import uuid4

import pytest

from app.services import code_runtime, code_sandbox, code_sandbox_worker


@pytest.fixture(scope="session")
def wasi_runtime():
    # The suite provisions this immutable runtime before pytest; do not silently
    # skip the containment checks when a required runtime is missing.
    return code_runtime.runtime_paths()


def _guest_json(wasi_runtime, source, *, timeout=10.0, fuel=code_sandbox.CODE_FUEL):
    module_path, stdlib_dir = wasi_runtime
    output = code_sandbox_worker._run_wasi(
        str(module_path),
        str(stdlib_dir),
        textwrap.dedent(source),
        "",
        timeout=timeout,
        memory_bytes=code_sandbox.CODE_MEMORY_BYTES,
        fuel=fuel,
    )
    return json.loads(output.strip())


def test_wasi_guest_cannot_observe_server_environment(wasi_runtime, monkeypatch):
    sentinel = f"server-secret-{uuid4()}"
    monkeypatch.setenv("AEGIS_SANDBOX_SERVER_SECRET", sentinel)
    observed = _guest_json(
        wasi_runtime,
        """
        import json
        import os
        print(json.dumps(dict(os.environ)))
        """,
    )
    assert observed == {}
    assert sentinel not in json.dumps(observed)


def test_native_worker_clears_environment_in_real_isolated_process(monkeypatch):
    sentinel = f"server-secret-{uuid4()}"
    monkeypatch.setenv("AEGIS_SANDBOX_SERVER_SECRET", sentinel)
    worker_path = str(Path(code_sandbox_worker.__file__).resolve())
    source = textwrap.dedent(
        f"""
        import importlib.util
        import json
        import os
        import sys

        spec = importlib.util.spec_from_file_location("trusted_worker", {worker_path!r})
        worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(worker)

        before = dict(os.environ)
        os.environ["AEGIS_CHILD_ONLY_SECRET"] = "must be cleared"
        worker._configure_process(5.0)
        print(json.dumps({{"before": before, "after": dict(os.environ)}}))
        """
    )
    process = subprocess.run(
        [sys.executable, "-I", "-S", "-c", source],
        env={},
        close_fds=True,
        capture_output=True,
        text=True,
        timeout=15.0,
        check=True,
    )
    observed = json.loads(process.stdout)
    assert "AEGIS_SANDBOX_SERVER_SECRET" not in observed["before"]
    assert sentinel not in process.stdout
    assert observed["after"] == {}


def test_wasi_guest_cannot_read_host_files_or_traverse_mount(wasi_runtime, tmp_path):
    secret = tmp_path / "server-secret.txt"
    secret.write_text(f"host-only-secret-{uuid4()}", encoding="utf-8")
    host_path = str(secret.resolve())
    paths = [
        host_path,
        "/lib/../../" + host_path.lstrip("/"),
        "/lib/python3.13/../../../../" + host_path.lstrip("/"),
        "/proc/self/root" + host_path,
    ]
    observed = _guest_json(
        wasi_runtime,
        f"""
        import json
        results = []
        for path in {paths!r}:
            try:
                with open(path, "r") as stream:
                    stream.read()
            except OSError:
                results.append({{"path": path, "denied": True}})
            else:
                results.append({{"path": path, "denied": False}})
        print(json.dumps(results))
        """,
    )
    assert observed == [{"path": path, "denied": True} for path in paths]


def test_wasi_standard_library_is_read_only(wasi_runtime):
    _, stdlib_dir = wasi_runtime
    probe_name = f"aegis-readonly-probe-{uuid4()}.txt"
    root_host_probe = stdlib_dir / probe_name
    nested_host_probe = stdlib_dir / "python3.13" / probe_name
    try:
        observed = _guest_json(
            wasi_runtime,
            f"""
            import json
            import os
            with open("/lib/python3.13/json/__init__.py", "r") as stream:
                readable = bool(stream.read())
            try:
                with open({('/lib/' + probe_name)!r}, "w") as stream:
                    stream.write("must not reach the host")
            except OSError:
                root_denied = True
            else:
                root_denied = False
            try:
                with open({('/lib/python3.13/' + probe_name)!r}, "w") as stream:
                    stream.write("must not reach the host")
            except OSError:
                nested_denied = True
            else:
                nested_denied = False
            print(json.dumps({{
                "readable": readable,
                "root_denied": root_denied,
                "nested_denied": nested_denied,
            }}))
            """,
        )
        assert observed == {"readable": True, "root_denied": True, "nested_denied": True}
        assert not root_host_probe.exists()
        assert not nested_host_probe.exists()
    finally:
        # Only remove uniquely named probe files if an insecure runtime wrote them.
        if root_host_probe.exists():
            root_host_probe.unlink()
        if nested_host_probe.exists():
            nested_host_probe.unlink()


def test_wasi_guest_has_no_socket_or_process_capabilities(wasi_runtime):
    observed = _guest_json(
        wasi_runtime,
        """
        import json
        import sys
        results = {}
        try:
            import socket
            with socket.socket() as connection:
                connection.bind(("127.0.0.1", 0))
        except (OSError, ImportError, NotImplementedError, AttributeError):
            results["socket_denied"] = True
        else:
            results["socket_denied"] = False
        try:
            import subprocess
            subprocess.run([sys.executable, "-c", "pass"], check=True)
        except (OSError, ImportError, NotImplementedError, AttributeError):
            results["process_denied"] = True
        else:
            results["process_denied"] = False
        print(json.dumps(results))
        """,
    )
    assert observed == {"socket_denied": True, "process_denied": True}


def test_wasi_large_allocation_is_stopped_and_next_guest_recovers(wasi_runtime):
    with pytest.raises(ValueError, match="MemoryError"):
        _guest_json(
            wasi_runtime,
            """
            import json
            allocation = bytearray(512 * 1024 * 1024)
            print(json.dumps({"allocated": len(allocation)}))
            """,
        )
    assert _guest_json(wasi_runtime, "import json; print(json.dumps({'recovered': True}))") == {
        "recovered": True,
    }


def test_wasi_timeout_and_fuel_budget_enforcement(wasi_runtime):
    # Short timeout triggers epoch interruption.
    with pytest.raises(ValueError, match="timed out"):
        _guest_json(
            wasi_runtime,
            """
            while True:
                pass
            """,
            timeout=0.3,
        )

    # Exhausting the fuel counter triggers out of fuel trap.
    with pytest.raises(ValueError, match="CPU budget"):
        _guest_json(
            wasi_runtime,
            """
            total = 0
            for i in range(1000000):
                total += i
            """,
            fuel=1000,
        )

    # VM recovers immediately on the next execution.
    assert _guest_json(wasi_runtime, "import json; print(json.dumps({'recovered': True}))") == {
        "recovered": True,
    }


def test_wasi_state_does_not_cross_runs(wasi_runtime):
    sentinel = f"guest-state-{uuid4()}"
    first = _guest_json(
        wasi_runtime,
        f"""
        import builtins
        import json
        import os
        builtins.aegis_guest_state = {sentinel!r}
        json.aegis_guest_state = {sentinel!r}
        os.environ["AEGIS_GUEST_STATE"] = {sentinel!r}
        print(json.dumps({{
            "builtins": builtins.aegis_guest_state,
            "module": json.aegis_guest_state,
            "environment": os.environ["AEGIS_GUEST_STATE"],
        }}))
        """,
    )
    assert first == {"builtins": sentinel, "module": sentinel, "environment": sentinel}
    second = _guest_json(
        wasi_runtime,
        """
        import builtins
        import json
        import os
        print(json.dumps({
            "builtins": hasattr(builtins, "aegis_guest_state"),
            "module": hasattr(json, "aegis_guest_state"),
            "environment": os.environ.get("AEGIS_GUEST_STATE"),
        }))
        """,
    )
    assert second == {"builtins": False, "module": False, "environment": None}


def test_code_sandbox_output_limit_releases_worker(monkeypatch):
    monkeypatch.setattr(code_sandbox, "CODE_MAX_OUTPUT_BYTES", 512)
    with pytest.raises(ValueError, match="Code output exceeds"):
        code_sandbox.run_sandboxed_code("result = 'x' * 1024", {}, "")
    recovered = code_sandbox.run_sandboxed_code("result = {'recovered': True}", {}, "")
    assert json.loads(recovered) == {"recovered": True}


def test_code_sandbox_missing_runtime_fails_closed(tmp_path, monkeypatch):
    monkeypatch.setattr(code_runtime, "RUNTIME_ROOT", tmp_path / "missing-runtime")
    with pytest.raises(ValueError, match=r"python -m app\.services\.code_runtime --fetch"):
        code_runtime.runtime_paths()
    with pytest.raises(ValueError, match=r"python -m app\.services\.code_runtime --fetch"):
        code_sandbox.run_sandboxed_code("result = 'must not run natively'", {}, "")
