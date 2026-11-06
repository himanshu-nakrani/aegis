# Quality-gated publishing — design specification

Status: **Proposed; not implemented by this document.**

Companions: [Continuous knowledge-source sync](2026-11-06-knowledge-source-sync-design.md) · [Eval-backed Fix this run](2026-11-06-eval-backed-run-repair-design.md).

This document owns the shared immutable execution/evaluation contracts used by all three features. The knowledge specification owns revision storage and access checks; the repair specification owns diagnosis, proposed edits, and candidate adoption.

## 1. Product decision

Every future publication must present fresh, server-generated evidence that the exact candidate satisfies the workflow's release policy. Publishing an older version as a rollback uses the same path. There is no `force`, skipped-check, or client-asserted pass flag.

A release check runs the candidate and the currently published baseline against one frozen dataset and one frozen evaluator configuration. It measures output quality, per-case execution regressions, latency, and cost. A successful check authorizes only its recorded candidate, dependencies, policy, baseline, and publication generation.

Existing deployments keep serving during migration; their historical quality is **unattested**, not retroactively declared passing. The next publication requires a configured policy and a new check. Authenticated authoring runs and explicitly unpublished development schedules remain development paths; this feature does not pretend that every experiment or draft run is a production release.

### Goals

- Prevent UI, API, and CLI callers from publishing an unevaluated, regressing, stale, or substituted candidate.
- Make the decision inspectable: exact inputs, expected outputs, evaluator versions, failing cases, denominators, thresholds, and measured deltas.
- Evaluate the same authored configuration that published invocation will execute, including prompt/sub-workflow references and knowledge revisions.
- Support first publication and honest recovery from a failing baseline without inventing missing baseline scores.
- Reuse the existing experiment runner, provider adapters, evaluation functions, credentials, and durable job/run infrastructure.

### Non-goals

Canary routing, shadow production traffic, automatic rollback, autonomous deployment, environments/workspaces, new roles or providers, arbitrary user-written scorers, repeated stochastic significance testing, and a claim that mutable external services or LLM responses are deterministic. Evaluation fixtures test responses to recorded/simulated actions; they do not certify that a future real-world action succeeds.

## 2. Current implementation and necessary changes

| Observed seam | Current behavior | Required change |
|---|---|---|
| [`platform.py`](../../../backend/app/api/platform.py#L53) | `PublishPayload` contains `version_id`; publishing changes `published_version_id`, syncs deployment/schedules, and audits without checking an experiment. | Route every publication through the transactional release service. |
| [`workflows.py`](../../../backend/app/api/workflows.py#L568) | An ordinary save can overwrite the highest unpublished version; highest version also means current draft. | Append-only graph versions and an explicit draft pointer; otherwise a version UUID is not an immutable evaluation identity. |
| [`experiments.py`](../../../backend/app/api/experiments.py#L31) | Creates batch/regression experiments and exposes a persisted verdict through `GET /gate`. | Add immutable evidence and purpose; an ad-hoc experiment is not publication authorization. |
| [`experiment_runner.py`](../../../backend/app/services/experiment_runner.py#L146) | Reads live dataset items at worker start; passes their input, not their expected output, into ordinary workflow runs. Results and request options share `summary_json`. | Snapshot before queueing, score against frozen expectations separately, persist options/results independently, and retain per-case evidence. |
| [`experiment_runner.py`](../../../backend/app/services/experiment_runner.py#L83) | Aggregates available metrics and net failure count. | Require complete applicable evidence and identify newly failing case IDs, not just a net count. |
| [`eval.py`](../../../backend/app/services/eval.py#L50), [`eval_deterministic.py`](../../../backend/app/services/eval_deterministic.py#L99) | Content quality uses a 1–5 aggregate; deterministic match scores map to `1 + 4 * match_score`. | Preserve that scale and the existing toxicity inversion. |
| [`executor.py`](../../../backend/app/services/executor.py#L839), [`prompt_service.py`](../../../backend/app/services/prompt_service.py#L97), [`sub_workflow.py`](../../../backend/app/services/sub_workflow.py#L48) | Resolves live presets/prompts; sub-workflows select their highest version. | Manifest-backed runs must not re-resolve mutable authoring references. |
| [`job_queue.py`](../../../backend/app/services/job_queue.py#L85) | Cross-dialect queued-to-running CAS exists; renewable leases do not. | Add fenced leases for the new long-running jobs, not another queue system. |
| [`HeaderActions.tsx`](../../../frontend/src/components/canvas/chrome/HeaderActions.tsx#L48), [`VersionHistory.tsx`](../../../frontend/src/components/canvas/VersionHistory.tsx#L49) | Both call `publishVersion` directly. | Both open the same release-review surface. |
| [`deployments.py`](../../../backend/app/services/deployments.py#L44) | Deployment credentials are revoked when the version ID changes. | Revoke when the accepted release changes, including a new manifest for the same top-level version. |

These are source observations, not runtime verification of the proposed feature.

## 3. User experience

### Configure a release policy

The Deploy sheet gains a **Release checks** tab before the existing invocation/credential tabs. On an unconfigured workflow it offers a dataset picker, evaluator configuration, thresholds, execution-safety mode, and evaluation budget. A dataset belonging to another workflow or owner cannot be selected. The UI can link to existing dataset creation and eval-suite assist; it must not silently create golden labels or enable a policy with no usable cases.

Saving a policy shows its revision and the fact that changing it invalidates unpromoted checks. There is no policy-disable toggle that bypasses protection. Replacing the policy is explicit and audited. Existing live releases continue running under their accepted manifests; a policy edit does not retroactively rewrite their evidence.

### Evaluate and publish

1. The user saves the intended draft, then chooses **Run release check**. Unsaved canvas changes must be saved or explicitly excluded; the sheet shows the saved version number and graph hash prefix.
2. The server captures candidate, baseline, dataset/evaluator snapshot, policy revision, and publication generation. The sheet displays the exact case count, known/unknown cost estimate, and allowed/fixture-backed effects before the user starts paid work.
3. Progress survives navigation/reload. Show cases completed in each arm, blocked cases, judge progress, spent tokens/cost, and cancellation. Do not display an optimistic pass while work remains.
4. The completed report shows the verdict and each violated threshold, followed by per-case baseline/candidate outputs, scores, outcome, latency/cost, trace links, and the reason for any unavailable comparison.
5. **Publish evaluated version** is enabled only while the server reports `publishable=true`. Clicking it submits the check ID and expected publication generation; the server repeats the authoritative checks in the publish transaction.
6. After success, show the release ID, accepted check, version, knowledge revision pins, and deployment credential status. Existing credential-rotation behavior remains visible; publication does not pretend old invoke keys remain valid.

The version-history Publish action and CLI follow this same service. Selecting an old version is not an exception to freshness or policy rules.

### First publish and recovery

- **First publish:** no baseline exists. Run the candidate over the complete snapshot and enforce absolute candidate quality, execution, and configured latency/cost thresholds. The report says **First-publish check**, not “no regression.” Relative limits are not applicable.
- **Legacy baseline:** before the first gated release, capture the current published graph and its currently resolvable dependencies as the baseline. Label it **Legacy baseline, dependencies captured now**; do not claim to have reconstructed an old run's dependency state.
- **Recovery:** a baseline workflow error can make a content score inapplicable. A candidate may prove that execution was restored and satisfy absolute quality criteria without claiming a fictional quality delta. Section 7 defines the exact rule and required comparison population.
- **Permanently unavailable baseline:** a revoked source can make the old release unsafe to run at all. Explicit absolute requalification can evaluate a clean candidate against golden cases without reading that denied baseline; it is a new passing check, not a force-publish override. Section 7 defines the stricter policy and labeling.
- **Conflict:** if another tab saves a draft, the selected immutable candidate remains identifiable; if the user switches the selected candidate, the old check is not transferable. If another publication wins, the losing publish returns a structured conflict and requires a new baseline check.

## 4. Invariants

1. A client can request an evaluation, never author its verdict or executable manifest.
2. A release check captures all inputs before dispatch; neither dataset edits nor a restarted worker may change its cases.
3. Candidate code cannot select its own judge, change thresholds, see golden expected outputs as execution input, or turn evaluation safety off.
4. All required candidate cases run; partial runs, missing required scores, unsafe replay, cancellation, and infrastructure failures cannot authorize publication.
5. The baseline is the captured published release, not the second-newest saved version or a convenient successful historical run.
6. Evaluation mode and fixtures are scoped to evaluation runs. They never leak into the production release's execution mode or grant real approvals.
7. A manifest-backed run executes its resolved graph and pinned knowledge; it must not fall back to live prompt/preset/sub-workflow/knowledge resolution on a missing dependency.
8. Owner isolation applies to every referenced object and to the transitive dependency graph. Authorization is repeated at execution boundaries; possession of an opaque UUID is not permission.
9. Publication is one atomic state change across release, workflow pointer, deployment, schedules, and audit. A failed precondition changes none of them.
10. LLM output, live read-only tool responses, timing, and remote model aliases can vary. Evidence identifies inputs/configuration and observations; it is not an exactly-repeatable-world guarantee.

## 5. Shared immutable artifacts

### 5.1 Draft identity and version immutability

Add `workflows.draft_version_id` and `draft_revision`. Every changed graph save appends a `WorkflowVersion` and advances the pointer using a compare-and-swap on the expected draft revision. Graph-bearing version rows become append-only. An unchanged ordinary save can return the current version without a new row; explicit “save as new version” still creates a distinct version.

`WorkflowVersion` gains `graph_hash`, `version_kind` (`authoring` or `repair_candidate`), and nullable candidate/provenance identifiers. A repair candidate is a real immutable version but does not advance the draft pointer or touch schedules. Adoption is a separate draft-pointer CAS, specified in the repair document.

History keeps monotonically allocated `version_number`; it is no longer the rule for choosing a draft. Migrate create/save/import/duplicate/template, canvas loading and authoring-run defaults, sub-workflow resolution, and CLI defaults to the explicit pointer. Published resolution uses the accepted release, never the draft pointer. Remove in-place graph mutation and implicit latest-as-draft helpers after caller migration.

Expose the editable graph as `draft_version` in workflow responses and migrate repository consumers away from the ambiguous `latest_version` field. Do not keep a second authoring selector whose highest-number semantics can expose an unadopted repair candidate. Version-history ordering remains a separate query.

Ordinary authoring save becomes:

```json
{
  "graph_json": {"nodes": [], "edges": []},
  "expected_draft_revision": 12,
  "save_as_new_version": false
}
```

The graph above illustrates the envelope only; graph validation still requires a valid Trigger-to-End workflow. A stale revision returns `409 DRAFT_CHANGED`, not an automatic overwrite. Workflow and version responses include the current draft pointer/revision so existing clients can migrate without guessing.

### 5.2 ExecutionManifest

An `ExecutionManifest` is immutable server-resolved configuration for one owned stored workflow version. It includes:

- Original version ID/hash and a validated execution graph.
- Materialized prompt text plus exact prompt-version provenance; unresolved referenced prompts fail capture instead of silently selecting an inline fallback.
- Frozen inline and reusable guardrail/eval definitions with their hashes.
- Transitive sub-workflow version/manifest references, cycle detection, and the existing depth bound. A sub-workflow call cannot select a newer draft at execution time.
- Effective provider/model parameters, public endpoint configuration, tool identities/schema hashes, and credential references/generations. No secret material is embedded or hashed into the manifest.
- Knowledge revision IDs, content hashes, retrieval settings and embedding/query-rewrite/rerank configuration. Library and workflow-local knowledge use the same revision mechanism.
- A runtime fingerprint and manifest schema version.

`content_hash` is SHA-256 over canonical JSON with sorted object keys, preserved array order, UTF-8, and finite JSON numbers. UUIDs and decimals use one documented serialization; timestamps, database IDs assigned after sealing, and UI-only capture timestamps are outside content hashing. `dependency_hash` covers resolved dependency descriptors. Hashes supplement immutable IDs; a matching hash alone never crosses owners or versions.

The runtime fingerprint is computed once per process from application execution code and installed execution-library versions, excluding paths/timestamps/secrets, and exposed through an internal compatibility value. The same build and effective execution configuration must produce the same fingerprint in API and workers. A mismatched worker cannot produce passing evidence for that manifest. No per-node source hashing or shell/Git dependency is introduced.

Compile caching is keyed by manifest content/runtime fingerprint, not only a mutable version ID. Manifest-backed enrichment consumes the captured values; it does not enrich again from authoring tables.

For repair pairing, the internal manifest service resolves the current base once and derives the candidate by inheriting every unchanged dependency pin. Deliberately changed prompt/provider/library dependencies are resolved separately and included in the review diff. The public manifest API remains `{version_id}`; clients cannot inject an arbitrary pin map. An unavailable inherited dependency blocks the comparison instead of silently refreshing only one arm.

**Credential boundary:** pending checks become stale when a referenced credential's execution generation changes. Published configuration retains the credential identity and frozen public configuration, but ordinary secret rotation can supply the current authorized secret for that same binding; revoked/deleted credentials fail closed. A changed provider/endpoint/tool binding requires a new manifest. OAuth access-token refresh alone is not an execution-generation change. The guarantee covers authored configuration, not unchanged remote account contents or provider internals.

### 5.3 EvaluationSnapshot

An `EvaluationSnapshot` freezes:

- Dataset ID, dataset revision, ordered item IDs, input text, expected output, tags, and provenance.
- Explicit supplemental cases, such as a human-reviewed failure case from the repair flow, with source-run ownership checked.
- Per-case session and initial memory context. Default context is empty, never live production session history or memory fetched when an arm starts.
- Fully expanded evaluator configuration, aggregation weights, applicability rules, and evaluator/runtime versions.

A snapshot is not an executable graph. Expected outputs and judge configuration are made available only to the separate evaluator, not injected into candidate context. Historical run input may be copied only if available and authorized; redacted or truncated context is not silently reconstructed.

`datasets.revision` increments in the same transaction as every input, expected-output, tag, import, capture, feedback, or annotation change. Snapshot capture reads under that revision, copies rows, and verifies the revision before sealing. All mutation seams must use the common dataset service/revision discipline; an item edit that forgets the counter would be a release-safety bug.

### 5.4 WorkflowRelease

A `WorkflowRelease` is an immutable accepted publication: version, execution manifest, release-check ID, policy snapshot/hash, publication generation, and actor/time. `workflows.published_release_id` is the accepted release pointer; retain `published_version_id` as the public version projection, updated in the same transaction rather than independently authored.

Invoke, signed webhook, hosted chat, MCP, schedules for published workflows, queued runs, and checkpoint resumes carry the selected release/manifest ID. Already admitted runs do not switch to a newer release when another publish happens. Access revocations still apply to in-flight reads.

A new release may have the same top-level version but different deliberately refreshed dependency pins. It remains a new release: fresh evidence, CAS, schedule binding, audit, and credential revocation all apply.

## 6. Proposed storage

All UUIDs use SQLAlchemy/Alembic `Uuid`; timestamps are timezone-aware UTC. Enums are validated strings with database checks where portable. Immutable rows are sealed transactionally; ordinary mutation APIs do not update their payloads.

| Table/change | Essential fields and constraints |
|---|---|
| `workflows` | Add `draft_version_id`, `draft_revision` (nonnegative), `published_release_id`, `publication_generation` (nonnegative). Pointer targets must belong to the same workflow. |
| `workflow_versions` | Add `graph_hash`, `version_kind`, provenance; preserve unique `(workflow_id, version_number)`; stop mutating graph payloads. |
| `datasets` | Add integer `revision`; every item mutation locks/CASes its parent. |
| `credentials` | Add `execution_generation`; increment for execution-relevant binding/secret changes, not display-name or token-refresh bookkeeping. |
| `execution_manifests` | `id`, `user_id`, `workflow_id`, `workflow_version_id`, `schema_version`, `graph_hash`, `content_hash`, `dependency_hash`, `runtime_fingerprint`, `resolved_graph_json`, `dependencies_json`, `created_at`, `sealed_at`. Index owner/workflow/creation; reference active manifests restrictively. |
| `evaluation_snapshots` | `id`, `user_id`, `workflow_id`, `dataset_id`, `dataset_revision`, `evaluator_config_json`, `evaluator_hash`, `content_hash`, `item_count`, `created_at`, `sealed_at`. |
| `evaluation_snapshot_items` | `id`, `snapshot_id`, `ordinal`, nullable original `dataset_item_id`/`source_run_id`, `origin`, `input_text`, `expected_output`, `expected_output_source`, `tags_json`, `session_context_json`, `memory_context_json`, `content_hash`. Unique `(snapshot_id, ordinal)`; copied content survives ordinary item updates. |
| `release_policies` | One row per workflow: `workflow_id` unique, `user_id`, `revision`, `dataset_id`, expanded evaluator selection/config, thresholds, safety policy, budget, `max_age_seconds`, `config_hash`, actor/time. Each check stores the complete immutable policy copy it used. |
| `release_checks` | `id`, owner/workflow, candidate/baseline versions and manifests, snapshot/experiment IDs, captured publication generation/release ID, policy revision/hash/copy, status, summary, expiry, request hash/idempotency key, created/completed/published timestamps. Unique owner/workflow/idempotency key. |
| `workflow_releases` | `id`, owner/workflow, version/manifest/check IDs, policy snapshot/hash, publication generation, actor/time. Unique `(workflow_id, publication_generation)` and accepted `release_check_id`. |
| `experiments` | Add `purpose`, snapshot and candidate/baseline manifest IDs, `options_json`, `execution_safety_json`, budget, cancellation metadata; keep `summary_json` for summaries only. Add `cancelled` terminal status. Analysis experiments remain analysis, never historical release evidence. |
| `experiment_case_results` | Experiment/snapshot-item/arm/attempt, run ID, accepted-attempt marker, terminal outcome, separate execution-success result, complete output or explicit incomplete reason, per-evaluator applicability/scores, latency, token/cost coverage, error code, timings. Unique `(experiment_id, snapshot_item_id, arm, attempt)`; index experiment/case pagination. |
| `evaluation_fixture_sets` / `evaluation_fixtures` | Immutable owner/workflow-scoped reviewed sets and exact case/node/tool/schema/argument/ordinal records, response payload, source provenance, content hashes, completeness, retention/access references, creator/time. No transport secrets. |
| `workflow_runs`, `workflow_schedules`, `workflow_deployments` | Carry nullable manifest/release references as applicable; evaluation runs also carry experiment/case/arm identity as server-only state. |
| `background_jobs` | Shared additions: `lease_token`, `lease_expires_at`, `heartbeat_at`, `attempt_count`, `next_attempt_at`, `cancel_requested_at`, `idempotency_key`, `payload_hash`; index claim eligibility. |

Referenced snapshots, manifests, revisions, and attested results are retained while an active release or unfinished check uses them. Unreferenced check/evaluation payloads follow a new 90-day default evidence retention setting. Preserve minimal audit IDs/hashes after payload expiry; expired content is not replayable evidence. Existing run-retention deletion must not silently cascade away active release evidence. User/workflow deletion removes dependent private payloads; attempts to delete a still-required individual dataset/fixture/prompt dependency return a usage-aware conflict rather than leaving a live release with an undetected dangling reference. Knowledge-source denial overlays override retention, as specified in the companion document.

Evaluation setup explicitly discloses the independent retention of copied snapshots/fixtures and active-reference protection. Routine run retention clears original traces and transient diagnosis bodies without silently erasing separately approved evaluation evidence. Explicit owner data erasure overrides reference counts: traverse provenance, purge affected raw copies, retain only content-free audit identity, and mark the evidence unavailable/non-reusable. Source access permission is never extended by this retention consent. Erasing a case's private evidence does not itself change an already published executable graph, but that erased check cannot authorize another publication; source-revocation rules still block protected content reads.

Provide owner-only `DELETE /api/workflows/{workflow_id}/evaluation-snapshots/{snapshot_id}/content` and corresponding fixture-set content erasure, with a preview of affected checks/repairs/releases and explicit confirmation. These tombstone payloads and invalidate eligibility atomically; they are distinct from routine retention or deleting an in-use identity. All report/provider/fixture reads honor the tombstone before exposing copied content.

## 7. Evaluation and verdict semantics

### Evaluator contract

Reuse `evaluate_node_async`, `run_deterministic_evaluation`, provider resolution, and existing presets through a common case-evaluation service. Extend the context passed to the evaluator with separate original input, expected output, candidate output, and allowed reference context. Do not reuse a candidate's self-reported inline eval aggregate as the release verdict.

Supported evaluator types remain `llm`, `exact`, `substring`, `regex`, `embedding`, `json_schema`, and `numeric`. Each has a stable `key`, frozen configuration, and an explicit reference requirement. Missing expected output is rejected before queueing for a reference-dependent evaluator. A reference-free rubric is allowed only when selected explicitly and shown in the report. Golden expectations inferred by Assist require human approval before they enter this configuration.

Every required evaluator must return a finite valid score on applicable output. Aggregate quality is the weighted mean of its 1–5 scores with positive, normalized, frozen weights. Store component scores; do not replace them with only an average. Invalid/missing scores are not zero, not perfect, and not silently removed from the denominator. Candidate outputs and source documents remain untrusted data inside the judge prompt; they cannot select instructions, tools, or the expected output. The judge has no action tools.

A required deterministic evaluator's `passed` result must also be true; a numeric aggregate above a threshold cannot overrule failed exact/schema/numeric assertions. Judge requests evaluate one anonymized arm at a time and omit the patch rationale, arm label, competing output, and previous scores.

Initial evaluation uses one execution of each case per arm, not best-of-N. Alternate candidate/baseline dispatch order deterministically by case identity to reduce systematic ordering bias, under the same concurrency limits. Report sample size and requested/returned model IDs. Do not describe a single sampled comparison as statistically significant or deterministic.

### Execution failures and crash recovery

The engine records `execution_success` separately from content quality. A genuine terminal workflow failure produces `false`; a completed workflow produces `true`. This boolean is never blended into the 1–5 content score.

Content evaluation applicability is frozen before execution:

- Completed arm: all configured content evaluators are required.
- Genuinely failed baseline workflow: content is `not_applicable` with `baseline_workflow_failed`; record no baseline quality or quality delta for that case.
- Failed candidate: candidate-completion policy fails, regardless of another case recovering.
- Infrastructure/worker/transport failure, unsafe or mismatched fixture, cancellation, inaccessible knowledge, incomplete output, or judge failure: evidence is `incomplete`, not a genuine low-quality baseline to beat.

Compare relative quality only over cases with complete, successful outputs in both arms. Show the exact comparable/recovered/newly-failed/incomplete case counts. A new failure is a case that completed in the baseline and failed in the candidate; recovering a different case never cancels it out.

The default policy requires at least one comparable case when a baseline exists, in addition to its minimum total case count. A complete baseline crash requires **explicit recovery mode**, with `min_comparable_cases=0` and mandatory absolute candidate/per-case quality thresholds chosen before the run. Such a verdict says **Absolute-quality recovery**, not paired quality improvement. A repaired crash case plus successful normal regression cases can pass with a “focal quality delta unavailable” annotation. These rules are shared with repair validation.

**Absolute requalification for an unavailable release baseline:** to avoid making a revoked old release impossible to replace safely, an owner may configure `recovery_mode=true`, `min_comparable_cases=0`, and `allow_unavailable_baseline=true` before creating a release check. This is allowed only when preflight proves a persistent baseline-only problem such as a revoked knowledge revision or erased required baseline artifact. Candidate and evaluator dependencies must all remain authorized, every candidate case must complete, and each case must have an approved reference-grounded correctness evaluator plus the policy's absolute thresholds. A temporary outage, expired-but-renewable receipt, missing judge result, or failure discovered midway through an ordinary check cannot trigger this mode.

The check captures the old published version/release/manifest identity and safe unavailability reason without reading denied content; the baseline arm is explicitly `not_run_unavailable`, not failed, scored, or silently omitted. The report says **Absolute requalification — previous release could not be evaluated**, with no relative quality/latency/cost claim. Candidate evidence still must be fresh and complete, and publication still CASes the same old release generation. If preflight finds the baseline runnable, it uses the normal paired protocol. Repair validation does not adopt an unavailable base through this release-only exception; it remains an ordinary-authoring/release-requalification path when a repair pair cannot be formed safely.

### Policy defaults and bounds

| Field | Default / rule |
|---|---|
| `min_cases` | 10; owner-configurable from 1 to the server case cap, with the small-sample limitation shown. No empty datasets. |
| `min_comparable_cases` | 1 with a baseline; first publish is exempt. Zero requires explicit recovery mode. |
| `recovery_mode` | `false`; `true` explicitly permits an absolute-only recovery decision when the frozen comparable-case minimum is zero. It never waives candidate quality or incomplete-evidence rules. |
| `allow_unavailable_baseline` | `false`; release-check-only opt-in requiring recovery mode, zero comparable minimum, preflight-proven persistent baseline unavailability, and reference-grounded candidate checks. It never skips a runnable baseline or an incomplete candidate. |
| `min_candidate_avg_score` | 4.0 on the existing 1–5 scale; required. |
| `min_candidate_case_score` | 3.0; required, so average improvement cannot hide a badly regressing case. |
| `max_eval_drop` | 0.25 average points on comparable cases. |
| `max_case_eval_drop` | 1.0 points for every comparable case. |
| `max_candidate_failure_rate` | Fixed at 0 for protected evidence. Nonzero configurations are rejected because every candidate case requires a completed, scored output. |
| `max_new_failure_cases` | Fixed at 0; recorded separately so a newly failed case cannot be hidden by recovery elsewhere. |
| Latency limits | Optional absolute candidate p95 milliseconds and relative p95 increase percentage. Enabling a p95 limit requires at least 20 completed comparable cases, or 20 candidate cases for first-publish/absolute-only recovery. |
| Cost limits | Optional candidate mean workflow cost per case and relative increase. Every included call must be priced/accounted for if a cost gate is enabled. |
| `max_age_seconds` | 86,400 from check completion; allowed range 300–604,800. Freshness never overrides dependency/access/policy checks. |
| Case count cap | 500 including supplemental cases; Settings-owned and enforced before fan-out. |
| Input/output evidence | Respect existing 20,000-character published input limit. Store up to 64 KiB output evidence per arm; overflow is incomplete, never a silently truncated passing comparison. |

For `n` valid latency samples, empirical p95 is sorted sample number `ceil(0.95*n)`, one-indexed. Ratios use unrounded values; baseline zero and candidate positive fails a finite relative increase limit, while both zero means zero increase. Quality predicates also use stored unrounded intermediate values, with rounding only for display.

Cost and timing for the workflow exclude the post-run release judge so candidate-vs-baseline measures the workflow, not evaluation overhead. Show judge/embedding/diagnosis overhead separately and include it in the evaluation spending budget. Fixture mode reports simulated execution latency/cost separately; production tool latency and charges are unknown, so fixture-backed evidence cannot satisfy an end-to-end production latency or cost gate. Model-only measured costs can be displayed but must not be mislabeled as the total real-world workflow cost.

### Verdict and eligibility

An experiment/check execution terminates as `passed`, `failed`, `inconclusive`, or `cancelled` after `queued`/`running`. `failed` means complete evidence violated a predicate; `inconclusive` means required evidence could not be established. Neither authorizes publication.

`stale` and `expired` are current **eligibility** results layered over the historical verdict, not rewrites of an old passing observation. The report retains “passed at time X; now stale because dataset revision changed.” Successful publication is recorded separately with its accepted release ID.

## 8. Safe evaluation of real workflows

Release checks and repair validation use a common server-owned `execution_safety` policy. It is propagated through standalone nodes, ADK tools, nested workflows, loops, code execution, memory, and run recovery; a node or model cannot replace it.

### `read_only`

- Pure transformations, bounded code without I/O, model calls, revision-pinned knowledge reads, and backend-verified read-only adapters can execute.
- Reads require adapter/operator-enforced read-only capability and appropriately scoped credentials. HTTP `GET` or MCP `readOnlyHint` alone is not proof of harmlessness.
- External writes and unknown-capability tools are denied before dispatch. This includes email/Slack/database writes, arbitrary HTTP/MCP actions, and webhook notifications generated by workflow execution.
- Memory writes go to an isolated per-case overlay initialized from the snapshot; they never flush to production. Both arms start from equivalent independent memory/session context.
- Human approval cannot be auto-approved. A reached approval boundary without a reviewed fixture is incomplete evidence, not permission to wait for or notify real production approvers.

### `fixtures`

A user selects an immutable reviewed fixture set before evaluation. It records or explicitly simulates external results and approval outcomes without reissuing the real action. Match on snapshot case identity, fully qualified node/sub-workflow path, tool identity and schema hash, canonical non-secret arguments, and per-binding call ordinal. Missing, extra, reordered-incompatible, or argument/schema-mismatched calls block the case; there is no live fallback.

Fixtures can be built from an explicitly opted-in complete authoring capture or reviewed user-authored records. Existing clipped trace fields do not qualify automatically. The UI distinguishes **recorded** from **user-authored simulated** evidence and lists which actions were not exercised. A read result backed by knowledge/source access still carries its revision access checks; replay cannot resurrect revoked content.

Transport credentials are never fixture fields. Persist sensitive business content only within the owning user's data boundary; show what will be retained. If redaction destroys arguments/output needed for faithful matching, mark the record non-replayable rather than claiming an exact capture.

Fixture CRUD/capture belongs to this shared evaluation feature, not a separate repair-only runner. `POST /api/workflows/{workflow_id}/evaluation-fixture-sets` accepts reviewed records or owned complete capture IDs and returns an immutable set; `GET` provides metadata/authorized paginated records; deletion is denied while referenced by an active check/release and otherwise purges payloads. Editing creates a new set ID/hash. Complete-record validation includes schema, case binding, argument types, payload limits, and provenance.

### Budgets and cancellation

Every check has a token budget and wall-clock deadline; an optional currency budget additionally requires known prices. Count candidate, baseline, judge, query-rewrite/rerank, and embedding calls. Reuse run/node limits and provider maximum-output bounds. Stop scheduling new calls when the observed budget is exhausted and cancel outstanding work on deadline. In-flight provider calls can still incur cost; the UI states that the currency stop is not an invoice-level hard guarantee. Missing accounting blocks a passing budget claim.

Safety/infrastructure failures are not retried as if they were a low score. Explicit retry creates a new check/experiment with visible lineage. A user never gets an automatic loop that keeps trying until stochastic quality passes.

## 9. Durable execution and concurrency

Use `BackgroundJob` with job types for experiment execution and the companion features. A transaction creates the check, immutable artifacts, experiment options, and queued job together. Waking an in-process dispatcher is a latency optimization, not the durability mechanism.

Generic jobs use `queued`, `running`, `completed`, `failed`, and `cancelled`; preserve the existing `completed` value. A job being completed means its computation finished, not that the experiment/check passed quality policy. Domain verdicts remain on the Experiment/release-check records.

- Claim with a single conditional update that sets a fresh UUID lease token and a 60-second lease; heartbeat every 15 seconds. All domain-result writes and finalization verify the token and expected state.
- Store `next_attempt_at`, attempt count, cancellation time, request hash, and an idempotency key. A same-key/same-body retry returns the existing request; same key with a different body returns conflict.
- API inline mode and worker mode use the existing configured ownership split. Do not start a second run worker in the API when worker mode owns runs. The scheduler wakes eligible jobs; no new Redis/Celery service is required.
- A case result is keyed by experiment/case/arm/attempt. Reuse a completed accepted case result after recovery. Do not count two attempts or leave an old callback able to replace a newer accepted outcome.
- Losing a coordinator lease does not prove that an already-dispatched LLM/run stopped. Reattach to the known run; do not start a second live attempt until the old attempt is terminal or its bounded execution is definitively cancelled. Uncertain remote completion remains visible as incomplete evidence.
- Cancellation marks intent durably, stops dispatch, cancels owned runs, and waits for quiescence before terminal `cancelled`. A late completed run cannot turn a cancelled check into a pass. User cancellation never reverses an already committed publication.
- Bound the new experiment coordinator to two active case arms by default and share global run/model admission limits. Do not create an unbounded task per dataset row.
- New handlers define their own restart behavior. Do not blindly reset unrelated existing `running` jobs that do not have a fenced recovery contract.

## 10. API contracts

All paths below are proposed additions/changes. Every mutation requires the existing editor/owner authorization; a viewer can inspect owned reports but cannot spend on evaluations or publish. Foreign-owned IDs return 404. User input is schema-validated before queueing. Error bodies use `detail: {code, message, reasons, current}` and the typed frontend client preserves status/code rather than matching prose.

### Policy

`GET /api/workflows/{workflow_id}/release-policy` returns `{configured, revision, policy, config_hash}`. `PUT` creates/replaces the policy using `expected_revision` (0 for first creation).

```json
{
  "expected_revision": 0,
  "dataset_id": "11111111-1111-4111-8111-111111111111",
  "evaluator_config": {
    "evaluators": [
      {"key": "answer_quality", "eval_type": "llm", "builtin_preset": "support_tone", "provider": "google", "model": "gemini-2.5-flash"}
    ],
    "aggregation_weights": {"answer_quality": 1.0}
  },
  "thresholds": {
    "min_cases": 10,
    "min_comparable_cases": 1,
    "min_candidate_avg_score": 4.0,
    "min_candidate_case_score": 3.0,
    "max_eval_drop": 0.25,
    "max_case_eval_drop": 1.0,
    "max_candidate_failure_rate": 0.0,
    "max_new_failure_cases": 0,
    "recovery_mode": false
  },
  "execution_safety": {"mode": "read_only", "fixture_set_id": null},
  "budget": {"max_total_tokens": 200000, "max_total_cost_usd": 5.0, "timeout_seconds": 900},
  "max_age_seconds": 86400
}
```

The model above is an illustrative configured target, not a new provider default. An unavailable target/key fails capability validation. Bounds: positive finite budgets, timeout 30–3600 seconds, token budget up to the Settings cap; negative/non-finite thresholds and unknown evaluator keys return 422. A policy cannot weaken the server's effect/admission limits.

### Shared snapshots and manifests

`POST /api/workflows/{workflow_id}/evaluation-snapshots` accepts:

```json
{
  "dataset_id": "11111111-1111-4111-8111-111111111111",
  "expected_dataset_revision": 7,
  "evaluator_config": {
    "evaluators": [{"key": "correctness", "eval_type": "exact", "config": {}}],
    "aggregation_weights": {"correctness": 1.0}
  },
  "supplemental_cases": []
}
```

Returns 201 with `{id, content_hash, dataset_id, dataset_revision, evaluator_hash, item_count}`. Supplemental-case fields are `source_run_id`, optional explicit `input_text`, `expected_output`, `session_context`, and `expected_output_source` (`human` or `dataset`); the service supplies immutable IDs, actor, and provenance. This endpoint supports repair/analysis; release-check capture invokes the same service using only the stored release policy, never caller-supplied replacement thresholds or labels.

Deduplicate a supplemental focal case with a captured dataset item only when source-run identity and the complete input/expectation/session/memory content hash match. Then mark that snapshot item as focal without mutating the dataset. Same provenance with deliberately modified context remains a separate case, and the complete dataset still requires explicit evaluation consent. `expected_output_source="dataset"` requires an owned matching label; accepted assisted expectations record human approval plus assisted provenance. Snapshot and manifest creation accept owner-scoped idempotency keys and never trust client-supplied hashes as proof of content.

`POST /api/workflows/{workflow_id}/execution-manifests` accepts `{version_id}` and returns 201 with `{id, workflow_version_id, content_hash, dependency_hash, knowledge_revision_ids}`. It resolves a stored owned version; arbitrary executable graph JSON is not accepted here. GET-by-ID on both resources exposes owner-scoped metadata and paginated cases/dependencies, with sensitive content subject to the existing content-access boundary.

### Shared experiments

Extend `POST /api/experiments` with evidence-mode input:

```json
{
  "workflow_id": "22222222-2222-4222-8222-222222222222",
  "kind": "regression",
  "purpose": "repair_validation",
  "evaluation_snapshot_id": "33333333-3333-4333-8333-333333333333",
  "candidate_manifest_id": "44444444-4444-4444-8444-444444444444",
  "baseline_manifest_id": "55555555-5555-4555-8555-555555555555",
  "validation_policy": {
    "min_cases": 10,
    "min_comparable_cases": 1,
    "min_candidate_avg_score": 4.0,
    "min_candidate_case_score": 3.0,
    "max_eval_drop": 0.25,
    "max_case_eval_drop": 1.0,
    "max_candidate_failure_rate": 0,
    "max_new_failure_cases": 0,
    "recovery_mode": false
  },
  "execution_safety": {"mode": "read_only", "fixture_set_id": null},
  "budget": {"max_total_tokens": 200000, "timeout_seconds": 900}
}
```

The service derives existing dataset/version columns from the artifacts; conflicting free-form IDs/options and model matrices are rejected for evidence purposes. `purpose` is `analysis`, `release_check`, or `repair_validation`; only the release-check service creates `release_check` work. Existing batch/matrix analysis remains available but cannot acquire publication authority through a purpose string.

`purpose="repair_validation"` requires `validation_policy` using the threshold schema in section 7, persisted at `Experiment.options_json.validation_policy` before dispatch. Snapshots freeze evaluators; experiments freeze decision thresholds, safety, and budgets. Only the internal repair orchestration service may add `options_json.repair_focal_policy` with a server-derived focal case ID and reviewed focal target/improvement thresholds. The common reducer computes focal results separately and excludes that focal case from the repair regression mean/comparable-case minimum; all cases still run and candidate absolute/per-case safety requirements apply. Direct experiment callers cannot claim a repair association or override this focal identity. Release checks have no focal exclusion and take policy solely from the stored `ReleasePolicy`.

`GET /api/experiments/{id}` returns purpose, artifact IDs, status/progress, immutable options, coverage, measured summary, and verdict. `GET /api/experiments/{id}/items?cursor=&limit=` returns paired per-case evidence with separate arm outcomes/scores, comparison applicability, run IDs, and incomplete reasons; limit 1–100. `POST /api/experiments/{id}/cancel` is idempotent. Existing `/gate` keeps its analysis verdict role; it reports scope/purpose and must not be confused with release eligibility.

### Release checks

`POST /api/workflows/{workflow_id}/release-checks`, with required `Idempotency-Key`, accepts only:

```json
{
  "version_id": "66666666-6666-4666-8666-666666666666",
  "expected_publication_generation": 3,
  "expected_policy_revision": 2
}
```

Returns 202 with `{id, experiment_id, status, candidate_manifest_id, baseline_manifest_id, evaluation_snapshot_id, policy_revision, publication_generation, report_url}`. The baseline, dataset, evaluator, thresholds, safety policy, and budgets come from server state. Stale policy/publication or unsafe/unresolvable preflight returns a structured 409 before any paid dispatch.

Responses also include `baseline_execution` (`required`, `first_publish`, or `not_run_unavailable`) and `baseline_unavailability_code` when applicable. The latter is set only by the preflight protocol in section 7, never a client-provided explanation; a legacy baseline without a capturable manifest can retain a null baseline manifest plus its exact published version/generation and proven unavailability metadata.

`GET /api/workflows/{workflow_id}/release-checks` lists cursor-paginated owned reports. `GET /api/workflows/{workflow_id}/release-checks/{id}` returns historical verdict plus current eligibility:

```json
{
  "id": "77777777-7777-4777-8777-777777777777",
  "status": "passed",
  "eligibility": "stale",
  "publishable": false,
  "reasons": [{"code": "DATASET_CHANGED", "expected_revision": 7, "current_revision": 8}],
  "coverage": {"cases": 24, "comparable": 24, "recovered": 0, "incomplete": 0},
  "expires_at": "2026-11-06T12:00:00Z",
  "published_release_id": null
}
```

`POST /api/workflows/{workflow_id}/release-checks/{id}/cancel` delegates to the same experiment cancellation state. A completed check is never restarted in place.

### Publish

Change `POST /api/workflows/{workflow_id}/publish` to require:

```json
{
  "version_id": "66666666-6666-4666-8666-666666666666",
  "release_check_id": "77777777-7777-4777-8777-777777777777",
  "expected_publication_generation": 3
}
```

Return the existing workflow/version fields plus `{release_id, execution_manifest_id, release_check_id, publication_generation, credential_status}`. `GET /published` also includes these fields and `attestation_status` (`gated` or `legacy_unattested`). Publishing with only `version_id` no longer works; migrate every repository caller rather than retaining an unguarded route.

| HTTP/code | Meaning and UI action |
|---|---|
| 401/403 | Existing authentication/viewer restriction; no spend or mutation. |
| 404 | Owned workflow/artifact not found; do not disclose another user's existence. |
| 422 `INVALID_RELEASE_CONFIG` | Bad bounds, unsupported evaluator, contradictory IDs, missing required expectation, invalid graph, or malformed input. |
| 409 `RELEASE_POLICY_REQUIRED` | Configure a policy before the next publication. |
| 409 `CHECK_NOT_PASSED` | Failed/inconclusive/cancelled/running evidence cannot publish; open report. |
| 409 `CHECK_STALE` / `CHECK_EXPIRED` | Return exact changed dependencies/revisions or expiry; run a new check. |
| 409 `PUBLICATION_CHANGED` / `DRAFT_CHANGED` / `POLICY_CHANGED` | Optimistic concurrency failed; refresh the appropriate selection. |
| 409 `DEPENDENCY_UNAVAILABLE` / `UNSAFE_EVALUATION` | Missing/revoked/pinned dependency or unsupported effect; no fallback. |
| 409 `IDEMPOTENCY_CONFLICT` | Same key with different canonical request. |
| 429 | Existing admission/budget limits; do not create an untracked duplicate on retry. |

## 11. Atomic publication and freshness

No external API or LLM call occurs while holding the publish transaction. Dependency capture resolves/validates beforehand and uses persisted revision/ownership/access receipts during final commit.

The publish service performs these checks in a consistent lock order, with CAS predicates on SQLite as well as row locks on Postgres:

1. Authenticate owner/editor; lock workflow/publication generation and load the owned check.
2. If this exact check was already accepted and is still the current release, return that original response idempotently. If another release subsequently won, do not republish it silently.
3. Require the recorded candidate version, sealed manifest/snapshot, complete passing verdict, unexpired completion time, and the expected current publication generation/baseline.
4. Require the current policy revision/hash and live dataset revision to match the captured values. Verify candidate authoring dependencies still resolve to the recorded versions/hashes/generations. A policy/data/reference update cannot race between verification and commit: lock relevant mutation-owner rows in stable order or use explicit generation CAS predicates.
5. Check every knowledge revision required by candidate, evaluator, snapshot, fixtures, and any executed baseline through `assert_revision_allowed`, including access-generation/receipt freshness and transitive source denial. A changed active candidate revision makes an unpromoted check stale; an already published release remains pinned unless access is denied. Absolute requalification must not read a denied baseline revision merely to re-prove that it was denied.
6. Verify runtime compatibility and current authorization for all required transitive resources; reject missing or substituted records. For preflight-authorized absolute requalification, recheck its captured baseline identity, persistent unavailability reason, policy mode, and complete reference-grounded candidate evidence rather than requiring access to forbidden baseline content.
7. Insert `WorkflowRelease`, CAS the workflow pointers/generation, update deployment release/version, revoke old deployment credentials if the accepted release changed, sync published schedules to the release, write audit, and record check acceptance in the same transaction.
8. Commit once; cache invalidation/event wake-ups happen after commit. Failure rolls the whole publication back.

Dataset, policy, credential, prompt, sub-workflow, and knowledge mutations do not need to eagerly rewrite every check row. They update their generation/pointer; report and publish eligibility compute staleness from authoritative state. Optional UI invalidation is convenience, never enforcement.

Current source access must also be checked at protected knowledge reads and before returning a completed result. A network token refresh must not continually expire all checks; content/access/identity generations are separate from transport-token lifecycle. Revocation guarantees are bounded by the connector's documented detection interval, not an unsupported claim of instant remote knowledge.

## 12. Frontend and CLI integration

- `HeaderActions` opens release review; it does not publish before opening Deploy. `VersionHistory` passes the selected candidate to that same component. The shared sheet owns report/confirmation behavior so neither can bypass the other.
- `DeploySheet` accepts an optional candidate selection and includes policy, active check, historical reports, and existing deploy details. Keep deploy details usable for a legacy live release even when a new candidate is blocked.
- Add typed request/response/error models to `src/types/workflow.ts`/`src/lib/api.ts`. Do not use message substring matching for new 409 states. Existing unrelated API errors need not be reformatted.
- Add `releasePolicy(workflowId)`, `releaseChecks(workflowId, filtersHash)`, `releaseCheck(workflowId, checkId)`, `experiment(id)`, `experimentItems(id, filtersHash)`, `evaluationSnapshot(id)`, and `executionManifest(id)` to `query-keys.ts`; all new consumers use them.
- Poll only active visible jobs/checks, using TanStack Query's normal lifecycle. Reconnect by IDs; do not keep one browser tab as the coordinator. Publication invalidates published/deploy/workflow/version/check queries. Report views retain their captured case order regardless of live dataset edits.
- Show text/icon state as well as status color; keyboard navigation, focused error summary, labeled thresholds, copyable report links, reduced motion, and accessible paired-output views are required. Match warm near-black/bone chrome; reserve color for outcome/deltas.
- Extend `aegis gate` with explicit `--release` mode that creates/polls release checks using the stored policy and an exact saved candidate. It cannot override dataset, baseline, or thresholds; conflicting analysis flags are rejected. Existing analysis mode remains analysis and is labeled so. Both use the same backend evaluator, not a second CLI decision implementation.
- Release-mode exit 0 means fresh `publishable=true`, 1 means a complete policy regression, 2 means invalid/inconclusive/stale/expired/unreachable/timeout, and 130 is interruption. Timeout does not silently cancel durable work; print the check ID/report URL and allow inspection/cancellation.
- Add `aegis publish --workflow ... --version ... --release-check ... --expected-publication-generation ...`; it calls the guarded endpoint and surfaces conflicts without retrying against a new baseline. Update the existing GitHub regression-gate workflow to distinguish analysis reports from release-authorizing checks.

## 13. Security, privacy, and operational limits

Authorization must bind workflow, dataset, snapshots, fixtures, prompts, knowledge, and experiments to the owner both before capture and inside execution. Do not trust graph-supplied `_user_id`, execution-purpose flags, fixture IDs, or manifest IDs. Production invocation cannot supply authoring overrides or evaluation mode.

Treat raw inputs, expected outputs, prompt text, tool results, and knowledge excerpts as sensitive. Keep them out of audit metadata, URLs, status logs, metric labels, and error traces. Artifact downloads are authenticated; opaque hashes are identifiers, not public sharing tokens. Existing tracing content controls still apply; release evaluation must not turn on external content export.

A policy administrator can deliberately weaken their own thresholds; this product does not add approval/RBAC governance. Make revision changes visible and audited rather than claiming protection from an authorized owner. Evaluation protects against accidental bypass, stale evidence, and unreviewed candidate substitution.

Snapshot creation is bounded and database-owned; do not accept unbounded graphs/cases/configuration. Budgets and model keys use `Settings` and the existing credential/provider path. No new direct environment reads or alternate secret store. Provider errors are sanitized, with stable machine-readable reason codes.

## 14. Delivery and migration plan

1. **Immutable identity prerequisite:** append-only versions, draft pointer/CAS, dataset revision mutations, credential generations, and updated callers. Backfill current draft pointers to the previous highest version without fabricating history; hash existing rows as they exist now. Historical rows previously overwritten cannot be reconstructed and remain honestly described.
2. **Knowledge revision prerequisite:** land the companion's shared revision storage for existing manual library and workflow-local data. Drive OAuth/sync UI can follow independently; release manifests cannot claim frozen RAG while still reading mutable rows.
3. **Shared evidence runtime:** manifests/snapshots, isolated evaluation context, separate evaluators/expected outputs, complete case records, fixture safety, fenced experiment jobs, cancellation, and budgets. Keep the existing analysis and matrix paths usable on the same runner.
4. **Release enforcement:** policies/checks/releases, transactional publish, release-aware invoke/chat/MCP/schedules/recovery, credential invalidation by release, and frontend/CLI/API cutover. Ship enforcement and all publish callers together; do not expose a UI-only guard as completed safety.
5. **Repair consumer:** the companion repair workflow consumes these contracts and can be developed against them, but cannot declare validation complete before the shared runtime is available.

Alembic is the only schema owner. Allocate the next sequential revisions at implementation time; do not hard-code an assumed current migration head. Backfill in bounded batches, handle nullable legacy release references explicitly, and validate migration/model parity on SQLite and Postgres. A schema rollback cannot safely re-enable old in-place mutation while newer evidence is retained: downgrade must explicitly remove/revoke those new artifacts first, not silently point old code at them.

Implementation touchpoints: `api/platform.py`, `api/experiments.py`, `api/workflows.py`, dataset/prompt/credential mutation APIs, template/import consumers, `services/experiment_runner.py`, `executor.py`, `sub_workflow.py`, `run_authoring.py`, `invoke_runner.py`, `deployments.py`, `schedule_sync.py`, scheduler/worker job dispatch, retention, `models.py`, schemas and config; new focused manifest/snapshot/release-policy services; the frontend components/client/query keys named above; `cli/src/aegis_cli/main.py`; and user-facing invocation/CI documentation. Use existing resource/service boundaries, not a generic policy framework.

## 15. Acceptance and verification

These are implementation acceptance scenarios, **not checks executed while writing this spec**. Use deterministic local models/transports for behavior tests; a live UI/API smoke must exercise the complete release flow without requiring a paid model.

| Scenario | Required observable result |
|---|---|
| Missing/failed/pending check through direct API | No published pointer, deployment, credential, schedule, or audit-success mutation. |
| First publication | Complete absolute checks can pass without a baseline; no fabricated relative deltas. |
| Quality regression | Candidate average/per-case violation identifies exact cases and prevents publication. |
| Net failure cancellation | Candidate fixes one baseline failure but introduces a different failure; `max_new_failure_cases=0` still fails. |
| Missing judge result | One completed case with no valid required score is inconclusive, not omitted from the average. |
| Crash repair | Baseline focal workflow error plus complete normal cases and passing candidate can produce labeled recovery evidence; no invented baseline quality. |
| Entire baseline crash | Normal mode cannot pass its comparison population; explicitly configured absolute-only recovery can pass only complete candidate criteria. |
| Snapshot isolation | Edit labels/tags/input, import/capture a case, or apply annotation while queued/running; both arms use the old sealed snapshot, and the result is stale for publication. |
| Immutable candidate | Saving a draft while evaluation runs creates a different version; it cannot change the evaluated row or transfer its authorization. |
| Dependency drift | Change an unpinned prompt, child draft, policy, evaluator, credential generation, runtime, or active candidate knowledge revision; report the precise stale reason. |
| Knowledge access loss | Revoke/delete a source member or let the required access receipt expire; old pins/caches/fixtures cannot produce passing protected output. |
| Revoked baseline replacement | Normal paired checks cannot read the denied old release. Explicit preflight-approved absolute requalification can publish a fully evaluated authorized replacement with golden-case evidence and no baseline delta; transient/mid-run failures cannot be relabeled into this path. |
| Same-version refreshed release | New dependency manifest requires a new check/release; old deployment credentials are revoked even though the top-level version UUID is unchanged. |
| Race at publish | Two independently passing candidates target the same publication generation; only one commits, on both SQLite and Postgres. |
| Idempotent retry | Same check request/key/body and same accepted publish retry return the original object; a changed body or later intervening publication conflicts. |
| Wrong owner/artifact substitution | A foreign dataset/manifest/check/fixture or mismatched version cannot disclose content, execute, or publish. |
| Unsafe effects | Standalone integration, attached MCP tool, nested workflow, notification, approval, or memory flush cannot bypass evaluation safety. |
| Fixture coverage | Changed arguments/schema/ordinal block without external dispatch; reports label recorded/simulated effects and cannot claim real tool latency/cost. |
| No golden-label leakage | Candidate receives only its frozen execution input/context; only the evaluator receives expected output/rubric. |
| Worker loss/restart | Recover with the same artifacts and accepted completed results; no duplicate active attempt, stale fenced overwrite, or accidental pass. |
| Cancel/complete race | Durable cancellation wins against late callbacks unless publication was already atomically committed. |
| Unknown price or zero denominator | Unknown required cost is inconclusive; relative limits follow the explicit zero-baseline rule and never display a fabricated saving. |
| All consumption paths | API invoke, hosted chat, MCP, published cron, queued execution, and resumed runs use the accepted manifest/release, not newer live authoring references. |
| Rollback and CLI bypass | Old-version selection and CLI/API calls require the same policy/fresh evidence; analysis gate output cannot authorize release. |
| Upgrade/retention | Existing live deployment remains reachable/unattested; next publication is gated; active evidence survives ordinary run retention; user deletion purges owned payloads. |
| Actual UI smoke | From a saved workflow, configure policy, run failing then passing candidates, inspect paired evidence, publish, invoke the accepted release, refresh/reopen the report, and exercise a stale/conflicting second tab. |

Before feature delivery run affected backend tests and the full repository migration/frontend gates once after integration. Exercise the real HTTP publish/invoke path and the actual Deploy/Version History/CLI surfaces; compilation or mocked forwarding alone is not evidence of enforcement.
