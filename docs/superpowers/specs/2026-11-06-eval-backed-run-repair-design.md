# Eval-backed run repair: “Fix this run”

**Status:** Proposed design; no application behavior described as new below is implemented by this document.  
**Date:** 2026-11-06
**Scope:** Human-directed diagnosis, reviewed candidate creation, paired evaluation, and explicit draft adoption. Not an autonomous fixer.

## 1. Decision and companion contracts

Add **Fix this run** to Run Detail and the canvas run-results surface. The user chooses a terminal run, reviews what may be sent to Assist, obtains a grounded explanation and proposed graph edit, explicitly creates an unpublished candidate from the **current saved draft**, evaluates that candidate and that draft on the same frozen focal case plus regression suite, and explicitly selects the candidate as the new draft. None of these actions publishes, deploys, changes an invoke key, re-pins a schedule, or changes a shared prompt version.

This feature consumes, rather than duplicates, the contracts in:

- [Quality-gated publishing](2026-11-06-quality-gated-publishing-design.md): authoritative `EvaluationSnapshot`, `ExecutionManifest`, append-only workflow versions/draft pointer, shared Experiment evidence runner, execution safety, durable jobs, and release authorization.
- [Continuously synced knowledge sources](2026-11-06-knowledge-source-sync-design.md): immutable knowledge revisions, pinned retrieval, source permissions/revocation, and content retention.

A repair Experiment is not a release check. Even a successful repair comparison cannot authorize publishing: its baseline is the current authoring draft, not necessarily the published release, and its focal case was selected because it failed. Publishing the adopted candidate requires the companion publishing workflow and a check against the release policy's independently selected snapshot and published baseline.

### Goals

1. Turn one observed failure or unsatisfactory result into a reviewable, evidence-linked change without replaying the failure merely to diagnose it.
2. Make all changes and downstream effects explicit: consent, proposal, candidate creation, paid/safe evaluation, and adoption are separate actions.
3. Measure a candidate against the current draft using the existing executor, Experiment runner, and evaluator implementations.
4. Preserve provenance, partial information, uncertainty, missing scores, and safe-execution restrictions in both API and UI.
5. Support manual edits and workflows with external side effects through validated fixtures, not by silently removing tools or repeating real actions.

### Non-goals

No autonomous diagnose/edit/evaluate loop, provider additions, arbitrary repair scripts, source-content edits, shared prompt mutation, credential repair, automatic approvals, production replay, canary rollout, or second evaluator. This does not make historical traces deterministic, certify a causal explanation, prove generalization from one example, or promise exactly-once provider calls. It does not prevent ordinary authoring outside this bounded repair flow.

## 2. Current-code evidence and the actual gaps

The following is **current behavior**, not the proposed implementation. Paths are relative to the repository root; line ranges identify the inspected source at design time.

| Evidence | Existing behavior and implication |
| --- | --- |
| `backend/app/api/assist.py:49-64,107-150` | Explain checks run ownership and accepts failed runs only; edit accepts a supplied graph and returns a proposal. Neither creates a repair session, saves a candidate, or evaluates improvement. |
| `backend/app/services/assist.py:575-622` | Explain sends bounded input/output/node-result excerpts and a compact topology to Gemini; results are cached by run ID in memory. This is not a consent-scoped immutable diagnosis bundle and does not cite trace evidence. |
| `backend/app/services/assist.py:636-753`; `backend/app/schemas/assist.py:129-157` | Edit returns `proposed_graph`, `GraphDiff`, summary, and notes after graph validation, with one correction attempt. `GraphDiff` summarizes changed nodes/edges, not field-level preconditions or authoritative attribution. |
| `frontend/src/components/canvas/AssistRail.tsx:325-377`; `WorkflowCanvas.tsx:2113-2134` | Assist proposals are reviewed; a client graph fingerprint blocks application after local edits. Apply swaps the local graph with undo history. It is not a server-side candidate/adoption transaction. Reuse this visual vocabulary, not its direct apply action for repair. |
| `frontend/src/components/runs/ExplainFailureCallout.tsx:19-85`; `RunDetailView.tsx:382-420,606-620,703-704` | Run Detail already explains failures, records feedback, queues annotations, and captures examples. These are existing entry points, not new standalone products. |
| `backend/app/services/dataset_service.py:44-92`; `services/annotation.py:1-6`; `api/annotation.py:193-211` | Capture deduplicates by source run, leaves failed/negative-feedback examples unlabeled, and retains observed output only as provenance. Annotation applies a human expectation through the same capture seam. Repair must not promote a failed output into gold. |
| `backend/app/api/experiments.py:31-40,88-173,192-249`; `services/experiment_runner.py:35-95,115-164` | Existing experiments accept mutable dataset/version IDs, run the ordinary executor, and aggregate available metrics. They read live dataset inputs at runner start, do not supply dataset expectations to a dedicated frozen evaluator plan, and launch through `schedule_task`. Missing aggregate scores already prevent a gate pass, but partial coverage and paired case outcomes need the shared evidence upgrade. |
| `backend/app/services/eval_runner.py:22-49,119-174`; `services/eval.py:50-89`; `services/eval_deterministic.py:100-136,314-338` | There are already LLM and deterministic evaluators. Judge scores use 1–5; deterministic match results map to that scale (`1 + 4 * match_score`). Extend those shared helpers to consume frozen expected output/context; do not create a repair-only scorer. |
| `frontend/src/components/canvas/ExperimentsPanel.tsx:33-95`; `components/runs/RunComparison.tsx:29-76` | Experiment and arbitrary historical-run comparison surfaces already exist. Historical A/B run comparison is descriptive and is not the controlled paired comparison needed here. |
| `backend/app/api/workflows.py:568-636`; `frontend/src/components/canvas/WorkflowCanvas.tsx:1534-1562,1668-1702` | Save mutates the latest unpublished graph unless a fork is requested; canvas run may first save dirty content; unpublished saves sync schedules. A repair branch cannot be implemented by calling this path unchanged. |
| `backend/app/services/prompt_service.py:63-125`; `services/executor.py:841-853` | Execution resolves owned `promptRef` at runtime; a resolved template overwrites inline instruction and unresolved references currently fall back. Changing only inline text under a live ref can be ineffective; evidence execution must resolve/freeze references and fail closed rather than use an invisible fallback. |
| `backend/app/services/run_authoring.py:1-13,40-62,136-173` | Pin outputs and run-from-here already seed upstream results and prune a graph for authoring. They do not validate recorded calls or constitute full-workflow regression evidence. |
| `backend/app/services/knowledge_library.py:75-82`; `services/credentials.py:80-88,108-115`; `main.py:146-174` | Owner-scoped knowledge/credential access and API-key viewer write restrictions are the authorization baseline. No new organization or permission hierarchy is needed. |
| `backend/app/services/job_queue.py:18-48,85-105`; `db/models.py:360-373` | Database jobs already claim queued work with CAS, including SQLite, but have no current lease/heartbeat/cancellation contract. Reuse the shared lease extension, not an in-memory repair task. |

Legacy run diagnosis must also account for the current mutable-version behavior: the graph now attached to an older run may not be the exact graph that executed. If no recorded manifest or graph snapshot proves historical configuration, label it **historical configuration unavailable**. Do not infer that today's graph, prompt, credential generation, or knowledge corpus was used then.

## 3. Terms and invariants

- **Source run:** the selected terminal run. It supplies diagnostic observations, not a measured baseline.
- **Current base:** the workflow's saved `draft_version_id` and `draft_revision` when a repair is opened or explicitly rebased. It can differ from the source run's version and the published version.
- **Proposal:** immutable reviewed graph content plus a server-computed diff and evidence references. It is not executable merely because Assist returned it.
- **Candidate:** an append-only `WorkflowVersion` of kind `repair_candidate`, derived from the chosen current base after user approval. It is neither the current draft nor a published version on creation.
- **Focal case:** the selected run's input and explicitly reviewed session context, with a human/dataset expectation or a declared reference-free rubric.
- **Regression cases:** every item in the selected dataset revision, frozen with the focal case in one `EvaluationSnapshot`.
- **Validation:** one existing Experiment of purpose `repair_validation`, with paired baseline/candidate runs and frozen decision thresholds. Historical observed output is displayed separately.
- **Adoption:** an explicit CAS update of the draft pointer. It never upgrades evidence or changes live release behavior.

Required invariants:

1. GET, opening a repair, source selection, and reading a report make no model/tool calls.
2. No model output directly writes a stored graph, prompt, dataset label, credential, source, deployment, or schedule.
3. Every authoritative model claim cites an allowed bundle evidence ID; unsupported claims are marked hypotheses, never converted into evidence by the UI.
4. Candidate creation checks both base graph identity and current draft revision server-side. Client diff highlighting alone is not protection.
5. Both arms execute exactly their stored manifests against the same immutable snapshot and safety contract. A live dataset, prompt default, active knowledge revision, or model override cannot change either arm partway through.
6. Expected output, evaluator rubric, repair rationale, and judge results are not placed in the candidate workflow's input/session context. Only the original input and approved execution context are.
7. All applicable required evaluator results must be present, finite, and valid for a quality pass. A genuine baseline workflow failure has explicit `NOT_APPLICABLE(baseline_workflow_failed)` content scores under the frozen applicability rule, never a numeric stand-in. A timeout, missing expectation, denied tool, absent fixture, missing completed-run output, or missing judge result is incomplete, not a success. A separate deterministic `execution_success` boolean records terminal execution without blending it into content quality.
8. Original traces and re-evaluated outputs remain separately labeled. Similar input does not establish identical execution conditions.
9. Knowledge access revocation wins over reproducibility, including copied diagnostic excerpts and fixture payloads.
10. No repair endpoint can publish. Viewer keys remain read-only even when the operation only creates a diagnosis job.

## 4. User journey and surfaces

### 4.1 Select the run and base

Add **Fix this run** next to the existing explanation action on Run Detail and in the canvas run-results action menu. Offer it on owned terminal runs with a saved executable workflow: `failed`, `completed` (including low-score or thumbs-down), and `cancelled`. Cancelled runs are labeled incomplete observations. Pending/running/awaiting-approval runs must first finish or be cancelled through existing controls; opening repair never cancels them implicitly. Ingested external traces without an executable owned graph remain explorable but cannot create a repair candidate.

Open a persistent repair workspace at `/workflows/{workflowId}/repairs/{repairId}`. The same workspace can be embedded as a full-height canvas drawer; both use the same APIs. Header shows source run, observed version/provenance confidence, current base version, published version if any, and **No live changes**. It does not label the source run “baseline.”

If opened from a dirty canvas, offer **Save current edits and use as base** or **Use saved draft; keep local edits**. Neither silently saves or discards. The existing save action gains the common draft CAS contract; a conflict must be resolved before repair. Return navigation restores local edits; adoption into a dirty canvas requires a separate save/discard choice and cannot overwrite unsaved work. The server cannot inspect local dirty state, so the client must enforce this navigation boundary in addition to server CAS.

### 4.2 Context and consent

First tab: **Context**. Show a server-produced inventory before any provider call:

- Run input, final output, status/errors, selected node outputs/events, and trace availability.
- Source version/manifest identifiers if recorded; otherwise explicit missing historical facts.
- Current-base topology and the config fields eligible for editing, with sensitive values removed.
- Optional focal expectation, manually selected session turns, and source-backed retrieved excerpts.
- Destination Assist provider/model, data categories, exact preview bytes, truncation warnings, and bounded call/cost estimate.

Default selection includes the input, terminal status, failed-node error, node IDs/types/timing, and safe editable config. Successful node payloads, chat history, tool argument bodies, retrieved document text, and existing expected output are opt-in. Credentials, headers/tokens, secrets in URLs, hidden reasoning, unrelated session turns, other dataset rows, and unowned source text are never eligible. An unavailable value appears as `unavailable` with a reason, not an invented substitute.

The user edits/redacts the preview and presses **Analyze selected context**. Consent binds the exact redacted bundle hash, provider/model, and maximum budget. Changing the selection, redactions, provider, or base invalidates that consent. A manual path (**Edit without Assist**) remains available with no model call. Permission checks/redaction run server-side even when the browser has edited the preview.

### 4.3 Diagnosis and grounded proposal

Second tab: **Diagnosis & patch**. The diagnosis contains observations, hypotheses with confidence labels (`supported`, `plausible`, `unknown`), and a minimal proposed edit. Each observation links to an existing trace event/node result, bundle field, or current config field. Links cannot point to unapproved content. Explicitly separate:

- “The recorded node returned an invalid category” (an observation).
- “Its instruction may be ambiguous” (a hypothesis).
- “Constrain the current classifier's instruction” (a proposed intervention).

Show **Why this addresses the observation**, **What might regress**, **Historical/current configuration differences**, and **What cannot be established**. Unrelated credential/provider outages can yield a useful diagnosis with no supported patch; show the actionable configuration error without manufacturing a graph edit. Users can create a manual proposal or close the session.

Reuse Assist explanation/edit prompt construction, structured-output parsing, graph validation, and diff computation behind a repair-aware service. The service receives only the approved bundle and safe base config; it does not call public Assist endpoints with unrestricted raw traces. Diagnosis and patch generation are explicitly queued operations, not a chain that automatically runs evaluation. Keep at most the existing one bounded correction attempt for malformed/invalid structured output; it consumes the same consent budget. Invalid or unsupported edits are rejected rather than silently dropping unknown nodes as the current generation converter can do.

Review shows node rings and a field-level before/after diff, including removals, added edges, prompt detachment, library changes, and dependencies that will be pinned. All edits are enabled/disabled together for candidate creation; accepting a subset creates a new server-validated manual proposal rather than executing an incomplete diff. **Create unpublished candidate** is the only operation here that saves a workflow version. **Discard** affects the proposal/session, never source run or base.

### 4.4 Validate against current base

Third tab: **Validation setup**. Select an owned dataset belonging to this workflow and its complete current revision. Deduplicate the focal case with a captured item only when source-run identity and the complete input/expectation/session/memory content hash match; mark that snapshot item `focal` and exclude it from the regression denominator without changing the dataset. Same provenance with modified context remains a separate focal case, and every dataset case still requires explicit evaluation consent. Equal input text from distinct cases is not silently deduplicated. At least one non-focal regression case is needed for a regression claim. The UI can create/edit a dataset via existing dataset controls, but cannot label a one-case evaluation “regression covered.”

Evaluation has its own explicit data preview and consent, separate from diagnosis consent: show the exact frozen execution input/history and the judge's reference/source context, with their destinations. Do not silently execute the redacted diagnostic preview as though it were the original case, and do not silently send the original unredacted input because diagnosis was approved. If the user changes input/history for privacy, submit explicit supplemental `input_text`/`session_context`, retain original source-run identity with `input_modified=true`, and label both arms as a modified focal case. Unchanged input may be copied from the owned run only after that preview is approved.

If the focal example is unlabeled, choose one of:

1. Enter a human expectation or select the already-labeled captured example.
2. Queue for human labeling through annotation; resume after an explicit new snapshot is created.
3. Select a reference-free rubric (for example valid JSON or support tone), with **No reference answer; limited correctness evidence** displayed permanently.

Never use the failed observed output as an expectation. Assist may suggest an expectation through the existing review-only eval-suite draft, but it becomes eligible only after a human explicitly reviews/edits and accepts it; record `human` plus `assisted_draft=true` provenance. Successful historical output is not automatically gold inside this flow either.

Freeze evaluator configuration and the decision policy before execution. Default policy on the existing 1–5 scale:

- Candidate focal required-score aggregate at least `4.0`; every candidate case must complete and meet the absolute required-content threshold (`min_candidate_case_score=4.0` and `min_candidate_avg_score=4.0` by default).
- If base focal score is below target and comparable, candidate focal improvement at least `0.5`.
- Regression mean aggregate drop at most `0.25` (`max_eval_drop`) and per-case aggregate drop at most `0.5` (`max_case_eval_drop`), over cases where both arms complete. All dataset cases still must be attempted and have explicit outcomes; repair defaults to `min_cases=2` (focal plus at least one regression example).
- No newly failed candidate cases, no candidate safety violations, and complete applicable required evaluation coverage in both arms.
- `min_comparable_cases=1` by default; freeze content applicability as `completed_outputs` and record a separate terminal `execution_success` per arm. Genuine baseline workflow failure is `NOT_APPLICABLE` for content scoring, not incomplete and not score 1.

The user can change score thresholds before validation within scale-valid ranges; all changes are persisted with the attempt. Safety/coverage requirements cannot be relaxed. A user may explicitly choose `recovery_mode=true` and `min_comparable_cases=0` before running when the entire base is known to fail; this requires absolute candidate thresholds on every case and produces absolute-only recovery evidence, never a paired regression-improvement claim. Ordinary `recovery_mode=false` requires at least one comparable case. For deterministic exact/numeric/schema checks, required boolean pass remains required regardless of numeric threshold. This policy and execution-outcome reduction belong to the shared Experiment engine, not a separate repair evaluator. The shared `validation_policy` uses the publishing companion's Section 7 threshold schema; repair's more conservative per-case defaults do not introduce renamed threshold fields.

Preview counts, safety preflight, source revisions, judge model, per-call token ceiling, total token/cost/time budgets, and fixture-backed limitations. Press **Run paired validation**. One click creates one durable Experiment; reload/disconnect does not launch another. Baseline and candidate run anew, in isolated sessions/memory, with the same case set. No production source run is resumed.

### 4.5 Measured review and explicit adoption

Fourth tab: **Results**. Use two panels for **Current base, re-evaluated** and **Candidate, re-evaluated**. A separate collapsed panel **Originally observed run** shows historical data without a delta arrow to the candidate. Show:

- Per-case inputs, expectation/reference-free badge, each arm's output, execution outcome, required scores, pair delta, run links, and missing/blocked reasons.
- Focal result separately from regression aggregate and a table of every regressed/newly failed case.
- Coverage (`scored applicable arms / required applicable arms`), planned/attempted arm counts, explicit baseline `NOT_APPLICABLE` count, comparable-case denominator, number of non-focal cases, safety/fixture coverage, exact manifests/snapshot, knowledge revisions, model and judge identities, elapsed time/tokens/cost, and all prior validation attempts.
- Unknown cost as unknown, not `$0`; estimated bounds distinct from billed/observed metrics.
- A model-generated diagnosis never supplies the success badge.

Result classifications: `improved` (comparable focal target/improvement and regression requirements met), `validated_recovery` (genuine focal baseline workflow failure, candidate completion/content thresholds met, and frozen comparable-case policy met), `already_satisfied` (base already meets focal target; candidate stays within regression/focal bounds), `regressed`, `target_not_met`, and `incomplete`. A recovery report says **Execution restored; focal quality delta unavailable**, shows measured candidate quality, and keeps the baseline score/delta null. Explicit recovery mode with no comparable cases additionally says **Absolute-only recovery; no paired quality comparison**. It cannot display normal regression improvement. `already_satisfied` says **Original issue not reproduced in current base**, not “Fixed.” Missing judges on completed runs, transport/worker uncertainty, safety/fixture mismatch, cancellation, or truncated evidence always remain incomplete; they cannot be relabeled baseline workflow failures to authorize recovery.

**Adopt as draft** explicitly selects the candidate, after a fresh base/dependency/permission recheck. A complete passing comparison uses this primary action. A non-passing/incomplete comparison instead offers a secondary **Use candidate as unvalidated draft**, requiring an acknowledgment that lists failure/coverage reasons and records that no successful repair has been established. This remains ordinary authoring, not a gate bypass: it cannot publish, cannot mint a release-check pass, and never hides the failed report. A candidate may also remain a branch indefinitely without adoption. Both actions show **Published version and schedules stay unchanged** and use identical CAS protection.

After adoption, open the selected draft in the canvas, preserve the source run and repair provenance, and show **Run release check** only as navigation to publishing. A later manual save produces a new version and does not inherit the repair's measured outcome. No notification states “live” or “deployed.”

### UI states and accessibility

Every step renders persistent idle/loading/error/cancelled/permission-revoked/base-stale states. Progress is derived from job/Experiment rows, not a browser timer pretending to know completion. While running, show queued/running case counts and an explicit cancel control. Reconnect polls the owner-scoped repair/Experiment query and restores the same IDs. Controls use the existing warm near-black/bone palette; color marks status, not marketing emphasis. Diffs have textual added/removed labels, keyboard focus returns to the initiating control, step changes announce via an `aria-live` region, and errors are inline as well as toasts. Dense side-by-side panels stack on narrow screens. No content is conveyed by color alone.

## 5. Supported patch surface and validation

Use existing node data keys (`frontend/src/types/workflow.ts:187-273`), not a parallel repair graph format. Store a complete proposed graph plus a normalized operation list for review/preconditions. IDs of unchanged nodes stay stable. Layout-only changes do not qualify as a behavioral repair.

| Surface | Allowed in repair | Required checks |
| --- | --- | --- |
| `agent`, `summarizer`, `translator`, `extractor` | `instruction`; `summaryStyle`, `targetLanguage`, `extractFields`, `outputSchema` where applicable; model selection from the existing provider catalog through explicit manual choice | Validate actual node type fields and JSON schema; do not accept arbitrary keys; preserve tool references and caps. Provider changes require a newly selected compatible owned credential and new manifest/cost consent; Assist cannot insert credentials or endpoints. |
| `router`, `classifier` | Instruction and routes/categories, with corresponding explicit edge edits | Every reachable route has valid targets; removed route references are rejected; preserve the rest of the topology. |
| `if`, `filter`, `switch`, `transform`, `set_fields` | Existing structured conditions/cases, `template`, `jsonPath`, and `setFields` | Parse existing expression grammar; validate references to surviving nodes/inputs; no eval/exec or additional expression language. |
| `kb_retrieve` | `kbQuery`, `kbTopK`, `kbMethod`; manual selection of an already-owned library | Existing method/range validation and permission checks; snapshot per-library settings into manifest; pin revision; no source text edits, uploads, sync, or ACL changes. |
| Graph topology | Add/remove/rewire the above supported nodes, preserving Trigger/End and mandatory control paths | Existing DAG/structural validation plus safety-path checks below; all operations visible in the diff. |
| Registry prompt binding | Explicitly select an existing owned immutable prompt version, or detach to an inline copy | Detachment is one atomic patch: remove `promptRef`, copy the resolved base template, then edit instruction. Diff names original prompt/version and states that only this candidate is detached. Never update `prompts.current_version` or a `PromptVersion`. |
| Tool/integration/code/memory/sub-workflow/loop/approval/guardrail/evaluation nodes and trigger deployment config | Preserve existing content; display read-only in repair | No code/HTTP/tool-credential/approval/guardrail/evaluator changes, schedule/webhook modifications, loop-bound increases, or tool registration through a repair patch. The sole credential-reference edit allowed elsewhere is an explicit compatible model-provider binding selected from existing owned credentials; no secret or credential object is created/changed. Use ordinary authoring for other changes; it receives no inherited repair evidence. |

Manual and assistant proposals use the same validation; manual provenance is not an authorization bypass. Existing unsupported node types may remain unchanged in the graph and execute only if the shared safety preflight can handle them. “Unsupported edit” is different from “unsupported workflow.” Safe fixtures allow an unchanged write-capable tool node to be present without executing a write.

Validation order, rerun server-side on candidate creation:

1. Owner, terminal source run, base membership/hash/revision, proposal revision, and byte/node-count limits.
2. Strict schema for every changed node/edge; reject unknown fields and hidden identity/type substitutions. Normalize only known serialization variations; never silently drop behavioral fields.
3. Existing graph validator and MCP-binding validator; validate references, branch labels, expressions, sub-workflow references, output schemas, resource ownership, and immutable prompt resolution.
4. Preserve all existing mandatory guardrail/human-approval/tool-approval controls and their ordering for surviving executable paths. Compute the reachable paths/dominators before and after; reject any new path to an existing effectful node or End that bypasses a previously mandatory control. Existing unrelated optional paths do not become mandatory by inference. Reject deleting a controlled branch's enforcement node, even if graph validity alone would pass. The safety policy still independently denies effects at runtime.
5. Recompute the full diff from authoritative base and proposed graph; compare actual changes to allowed operations. Store unsupported-edit reasons with node/path references, not raw secret content.
6. Resolve proposed dependencies through the common manifest service; unavailable/unauthorized prompt, credential, tool schema, knowledge revision, or sub-workflow is blocking. Evidence paths do not use current runtime's inline prompt fallback to conceal a missing dependency.

Proposal operations are keyed by node/edge ID rather than mutable array positions, for example `{op:"set_node_field",node_id:"classify",field:"instruction",before_hash:"…",after:"…"}`. This is an audit/review representation, not a public arbitrary JSON Patch executor. Stored `proposed_graph` is authoritative only after all checks. Server-generated edge/node diffs, not model prose, determine what changed.

## 6. Shared evaluation and execution semantics

### Immutable identity

Use the common snapshot/manifest APIs without repair-specific alternatives:

- `POST /api/workflows/{workflow_id}/evaluation-snapshots` freezes the complete dataset revision, supplemental focal case, expected outputs, origin/tags, evaluator definitions/judge configuration, and approved session context. Store hash and ordered case IDs. An annotation arriving later changes dataset revision; it cannot retroactively repair an existing result.
- `POST /api/workflows/{workflow_id}/execution-manifests` accepts only an owned stored `version_id`. Resolve executable graph and exact prompt/sub-workflow/guardrail/provider/tool/credential-generation/knowledge dependencies; never raw secrets.
- `POST /api/experiments` with `purpose="repair_validation"` consumes the two manifests, one snapshot, shared safety contract, and explicit budget. The repair orchestration endpoint calls this same internal creation service transactionally and links its Experiment; it does not run a second batch engine.
- `GET /api/experiments/{id}/items` returns paginated per-case paired evidence. `POST /api/experiments/{id}/cancel` is the cancellation authority.

At candidate creation resolve the base manifest and derive the candidate manifest with identical unchanged dependency pins. Baseline should not accidentally get yesterday's active knowledge revision while candidate gets today's. The public manifest service still resolves only stored versions; repair uses its internal resolution with an inherited base pin-set and explicit changed dependency identities. Persist this resolved pair before evaluating. If an unchanged dependency cannot retain the pin, fail preflight and explicitly refresh/review both manifests; never silently introduce dependency changes into a prompt-only comparison. An intentionally changed library/provider/prompt binding appears in the candidate dependency diff.

The shared Experiment runner retains case identity and per-arm outcomes. It calls the existing evaluator helpers on completed outputs using frozen expected values in evaluator metadata (`eval_expected`, `eval_baseline`, schema/pattern/config as appropriate), not by inserting an evaluation node into the candidate graph. Existing in-graph eval/guardrail execution still occurs unchanged and is reported separately; the candidate cannot improve its trusted score by deleting or editing the external evaluator. A frozen reference answer may be passed to the judge in a separately delimited reference field only when the selected rubric requires it. Reference-free rubrics explicitly omit it.

The common engine freezes content-evaluator applicability before dispatch: score completed outputs; a genuine terminal baseline workflow failure records `execution_success=false` and content status `NOT_APPLICABLE` with reason `baseline_workflow_failed`. It preserves the failed case in the report and attempt denominator. Transport failures, evaluator errors, worker interruption, safety/fixture blocks, cancellation, and missing/truncated evidence are `INCOMPLETE`, not recoverable baseline non-applicability. A candidate failure always fails acceptance. Candidate completion alone is insufficient: every required candidate evaluator/absolute threshold must pass, including recovered cases. Compute pair quality deltas only for both-completed cases and enforce the frozen comparable-case minimum. This supports real crash repair without inventing a judge score or building a second evaluator. Genuine workflow-failure classification is determined by executor outcome codes, never inferred from model text or an arbitrary error string.

One repetition per case/arm is supported initially by the common runner. Alternate candidate/baseline dispatch order deterministically by case identity, using the common runner's rule to reduce systematic ordering effects; record order. Provider/model outputs can still vary. Report absolute per-arm metrics and sample counts; do not claim statistical significance, deterministic replay, or a causal explanation from a single run.

### Safe tool execution and fixtures

Both arms use the same shared `execution_safety` record:

- `read_only`: only operator-classified known-safe operations can run. Network-read classification does not follow from HTTP GET or a tool's own “read only” claim alone. Unknown/code/write-capable integrations, memory writes to production, arbitrary MCP tools, notifications, and automatic approvals are denied.
- `fixtures`: calls requiring substitution must match an immutable fixture's tool identity, schema/version, canonical argument hash, and ordinal within that case's recorded call sequence. Return only a validated stored result. Unmatched, extra, reordered, or different-argument calls produce a blocked/incomplete case, with **no network fallback**. Read-only calls permitted by the policy are still recorded; fixture coverage labels remain visible.

A fixture set is a reviewed, owned artifact created through the publishing spec's shared fixture API, not a `pinned_outputs` dictionary. The user can select recorded tool results with sufficient call identity/arguments or author a result in the shared fixture editor against the tool result schema, then validate it. Scrub credentials, external identifiers that must not leave the tenant boundary, and unrelated data. Store which cases/calls each fixture covers and the source permission dependencies of its content. Fixture creation does not execute a tool to “fill missing recordings.” Missing argument/schema/ordinal evidence requires explicit fixture authoring or leaves the call unsupported; no guessed reconstruction.

Each arm starts with a distinct session ID and an isolated copy of the approved session/memory snapshot. No chat history is rehydrated from an active live session after snapshot creation. Persistent memory writes are redirected only when the shared runner has an explicitly implemented isolated evaluation namespace; otherwise preflight blocks them. Never silently downgrade them to a no-op. Human approvals require a validated fixture decision with provenance and the fixture badge; no approval requests, emails, or Slack notifications are sent to real reviewers during validation. Sub-workflows inherit the same manifest/safety/session constraints recursively.

Existing run-from-here/pins remain available for **Diagnostic preview** on the canvas. They can help inspect one node but cannot populate a full repair Experiment report, satisfy regression coverage, or become release evidence. The API rejects `pinned_outputs`, `start_node_id`, model matrix, freeform executable graph, and other authoring overrides in evidence-mode Experiment creation.

### Leakage, selection bias, and incomplete observations

The diagnosing model receives only the selected focal information; regression inputs/expectations, held-out examples, and validation outputs are excluded. If the user explicitly includes the focal expectation, mark it **used during repair**; it is a development example, not held-out evidence. A human accepting an Assist-generated expectation does not make it independent of the model; retain that provenance.

Judges see one anonymized arm at a time, original task context, permitted reference/source material, and the frozen rubric. They do not see which arm is “fixed,” the patch/rationale, the historical failure, the competing arm, or previous judge scores. Treat candidate output/tool/source text as untrusted data, delimit it, and prevent it from changing system instructions. Use deterministic checks for schema/exact conditions where appropriate; an LLM claiming compliance is not the deterministic check.

Show all completed/failed/cancelled validation attempts for the repair, with which snapshot and policy each used. A user changing a rubric after seeing results creates a new snapshot/attempt; old evidence stays visible and is not relabeled. Reusing the same regression dataset across successive repairs is disclosed as reused development data, not independent validation. Publishing still selects its own policy-bound snapshot. Do not pick only the best-scoring attempt or exclude newly failed cases from denominators.

Missing expected output blocks reference-dependent snapshot preflight with `missing_expectation`; it does not turn exact comparison into comparison against an empty string. An explicitly supplied empty-string expectation is distinct from `null`. Missing runtime scores/outputs produce null metrics plus structured reasons; only the predeclared genuine baseline workflow-failure applicability rule yields `NOT_APPLICABLE` rather than incomplete. If the candidate also fails, show both failures; equal failure counts do not constitute success. Missing session history means the user either supplies a reviewed replacement and accepts **modified input context**, or runs an explicitly context-free case with that limitation; unavailable history cannot be recovered by the model.

## 7. Persistent model and database constraints

The publishing companion owns common migrations for `workflows.draft_version_id`, `draft_revision`, append-only `workflow_versions.graph_hash`/`version_kind`/provenance, snapshot/manifest/Experiment evidence records, Dataset revision, fixtures, and BackgroundJob leases. Repair adds the following tables using `sa.Uuid`/`Uuid`, timezone-aware timestamps, the existing JSON/JSONB abstraction, and explicit status check constraints. No migration number is reserved here; assign the next sequential Alembic revision when implementing, after the common migration.

| Table | Required columns and constraints |
| --- | --- |
| `run_repairs` | `id`, `user_id`, `workflow_id` (owned workflow FK), nullable `source_run_id` (`SET NULL` on retention purge), non-null source run ID/status/version provenance copied into a redacted summary, `base_version_id`, `base_graph_hash`, `base_draft_revision`, `revision` integer CAS counter, `state`, nullable `active_context_id`, `active_proposal_id`, `candidate_version_id`, `selected_validation_id`, `adopted_at`, `adoption_mode` (`validated`/`unvalidated`), `created_at`, `updated_at`, `expires_at`. Workflow deletion cascades repair records. Base/candidate version deletion is restricted while referenced. |
| `run_repair_contexts` | `id`, `repair_id`, `ordinal`, `context_hash`, `redacted_bundle_json`, `evidence_index_json`, `omissions_json`, `source_permission_refs_json`, `provider`, `model`, `consent_json` (categories/hash/time/budget, no secrets), `created_at`, `content_expires_at`, nullable `revoked_at`. Content is immutable except explicit redaction/purge, which marks evidence unavailable and invalidates the original content hash for reuse. Unique `(repair_id, ordinal)`. |
| `run_repair_proposals` | `id`, `repair_id`, `context_id` nullable for manual edits, `ordinal`, `base_version_id`, `base_graph_hash`, `origin` (`assistant`/`manual`), `diagnosis_json`, `proposed_graph_json` nullable when diagnosis has no supported patch, `proposed_graph_hash`, `diff_json`, `evidence_refs_json`, `dependency_diff_json`, `validation_errors_json`, `created_at`. Append-only; unique `(repair_id, ordinal)`. All fields carry content bounds. |
| `run_repair_validations` | `id`, `repair_id`, `candidate_version_id`, `base_manifest_id`, `candidate_manifest_id`, `evaluation_snapshot_id`, unique `experiment_id`, `base_draft_revision`, `decision_policy_json`, `decision_policy_hash`, `focal_case_id`, `created_at`. Identity/thresholds immutable. Results and progress remain authoritative on Experiment/items; store only a deterministic reducer result/hash once complete, never a second set of evaluator outputs. |
| `run_repair_operations` | `id`, `user_id`, `repair_id` nullable for initial creation, `operation`, `idempotency_key`, `payload_hash`, `result_resource_ids_json`, `http_status`, `created_at`, `expires_at`. Unique `(user_id, operation, idempotency_key)`; no raw body/secret copy. Durable idempotency receipt committed in the same transaction as state/job/candidate/adoption mutation. |

Indexes: `(user_id, updated_at DESC)` and `(workflow_id, state, updated_at DESC)` on repairs; `(source_run_id)` for Run Detail links; `(repair_id, created_at)` on contexts/proposals/validations; `(expires_at)` for bounded retention; unique candidate provenance `(repair_id, proposal_id)` in the version provenance relation to prevent duplicate candidate materialization. Shared worker jobs reference `repair_id`, `context_id`/`proposal_id`, not full trace bodies in queue payloads. No raw model prompt or secret appears in job error/audit columns.

A repair session has one active candidate at a time; all older proposals/candidates/validation links remain browsable. Editing after candidate creation creates a new proposal and, after approval, a new candidate version; it does not alter the version under evaluation. Rebase changes the session's base only through an explicit operation, increments `revision`, clears its active candidate/validation selection, and preserves previous attempts as historical. The proposal must be regenerated or manually reapplied with a fresh diff; automatic three-way conflict resolution is not part of this release.

## 8. API contract and concrete examples

All endpoints use existing API-key/editor authorization and owner joins. Cross-owner identifiers return 404. GETs are side-effect free. Mutations require `Idempotency-Key`; state-changing operations on an existing repair require `If-Match: "repair:{id}:{revision}"`. ETags are returned on GET and all mutations. Wrong/missing preconditions return 409/428, not a best-effort write. Examples use valid UUID-shaped identifiers; hashes are returned by the server, never trusted client assertions of content validity.

### 8.1 Open a repair and inspect context

```http
POST /api/run-repairs
Idempotency-Key: repair-open-run-42
Content-Type: application/json

{
  "source_run_id": "11111111-1111-4111-8111-111111111111",
  "base_version_id": "22222222-2222-4222-8222-222222222222",
  "expected_draft_revision": 18
}
```

`201` returns `{id,workflow_id,source_run_id,base_version_id,base_graph_hash,base_draft_revision:18,revision:1,state:"context_required",context_inventory,limits}`. It reads no additional provider or tool data. The base must equal the server's current draft, not merely a version in the workflow. `GET /api/run-repairs/{id}` returns the current step, capability flags/reasons, selected resource IDs, immutable attempt list, current-base drift, privacy availability, and relevant job/Experiment links. `GET /api/run-repairs?workflow_id=...&source_run_id=...&cursor=...` lists 50 at a time, maximum 100, newest first with ID tie-break.

```http
POST /api/run-repairs/33333333-3333-4333-8333-333333333333/contexts
If-Match: "repair:33333333-3333-4333-8333-333333333333:1"
Idempotency-Key: repair-context-1
Content-Type: application/json

{
  "include": {"input": true, "final_output": true, "node_ids": ["classify"], "session_turn_ids": [], "retrieved_source_ids": []},
  "redactions": [{"evidence_id": "run.input", "start": 12, "end": 28}],
  "provider": "google",
  "model": "gemini-2.5-flash"
}
```

This creates the redacted preview with no provider call: `201 {context_id,context_hash,preview,evidence_index,omissions,token_estimate,revision:2}`. Redaction offsets apply to the inventory's immutable field revision; stale offsets return `context_changed`, never redact the wrong text. Server secret/provenance redaction runs after client selections and offsets. The provider/model must be supported by existing Assist configuration; this API does not add a provider route or arbitrary endpoint. A model name in the example is illustrative configuration, not a promise of deployment availability.

### 8.2 Consent and diagnosis

```http
POST /api/run-repairs/33333333-3333-4333-8333-333333333333/diagnoses
If-Match: "repair:33333333-3333-4333-8333-333333333333:2"
Idempotency-Key: repair-diagnose-1
Content-Type: application/json

{
  "context_id": "44444444-4444-4444-8444-444444444444",
  "context_hash": "sha256:7a265e5dfe0b14b138fe26348e5f9ed4fc06611b4c0d679f6830e82e6af67365",
  "instruction": "Explain the invalid category and propose the smallest instruction change.",
  "consent": {"send_selected_context": true, "max_total_tokens": 12000, "timeout_seconds": 90}
}
```

`202 {repair_id,job_id,state:"diagnosis_queued",revision:3}`. On completion GET returns the immutable proposal and citations, or `diagnosis_failed` with a sanitized structured reason. One diagnosis operation produces one proposal; another attempt requires another explicit POST/consent budget, not an automatic fixer loop.

Manual review/edit submits `POST /api/run-repairs/{id}/proposals` with `{base_version_id,base_graph_hash,proposed_graph,source_proposal_id?,note}`. Return `201 {proposal_id,proposed_graph_hash,diff,dependency_diff,validation_errors,revision}`. The full graph is schema-validated against the authoritative base; `source_proposal_id` only records provenance. Invalid graphs return 422 and remain local; no executable version is created.

### 8.3 Create the candidate

`POST /api/run-repairs/{id}/candidates` body:

```json
{
  "proposal_id": "55555555-5555-4555-8555-555555555555",
  "reviewed_graph_hash": "sha256:534297d04201d020796b37197a2e2f4ff6e3817f1c90d2666fbcdbadf5afc825ef",
  "expected_base_version_id": "22222222-2222-4222-8222-222222222222",
  "expected_draft_revision": 18,
  "confirm_unpublished_candidate": true
}
```

Return `201 {candidate_version_id,version_number,version_kind:"repair_candidate",base_manifest_id,candidate_manifest_id,draft_version_id,published_version_id,revision}`. Workflow row CAS, candidate insert, pair-manifest resolution, provenance, and idempotency receipt commit atomically. A base/dependency conflict rolls back all of them. Version numbering may advance while the draft pointer does not; history labels this **Repair candidate**, not **Current draft**.

### 8.4 Freeze focal and regression evaluation

```http
POST /api/workflows/66666666-6666-4666-8666-666666666666/evaluation-snapshots
Idempotency-Key: repair-snapshot-1
Content-Type: application/json

{
  "dataset_id": "77777777-7777-4777-8777-777777777777",
  "expected_dataset_revision": 7,
  "evaluator_config": {
    "evaluators": [{"key": "answer", "eval_type": "exact", "config": {}}],
    "aggregation_weights": {"answer": 1}
  },
  "supplemental_cases": [{
    "source_run_id": "11111111-1111-4111-8111-111111111111",
    "expected_output": "billing",
    "expected_output_source": "human",
    "session_context": []
  }]
}
```

Input omitted means copy the owned source run input, after the selected execution-input privacy review; absence is an error if retention removed it. Response: `201 {id,content_hash,dataset_id,dataset_revision:7,evaluator_hash,item_count}`. Get snapshot detail to obtain immutable focal case ID and verify full case/expectation coverage. `expected_output_source:"dataset"` requires a matching owned captured/annotated item; a client cannot invent dataset authority. Dataset revision changes before snapshot creation return 409. Later dataset changes never mutate the snapshot.

The shared manifest API is `POST /api/workflows/{workflow_id}/execution-manifests {"version_id":"..."}` → `201 {id,workflow_version_id,content_hash,dependency_hash,knowledge_revision_ids}`. Repair normally uses the manifest pair already created with the candidate and displays any requested refresh as a new explicit dependency comparison.

`POST /api/run-repairs/{id}/validations` accepts the exact shared evidence request, including required `validation_policy`, plus focal repair thresholds. Snapshot freezes evaluators; Experiment freezes verdict thresholds, safety, and budgets before dispatch:

```json
{
  "expected_draft_revision": 18,
  "experiment": {
    "workflow_id": "66666666-6666-4666-8666-666666666666",
    "kind": "regression",
    "purpose": "repair_validation",
    "evaluation_snapshot_id": "88888888-8888-4888-8888-888888888888",
    "candidate_manifest_id": "99999999-9999-4999-8999-999999999999",
    "baseline_manifest_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "validation_policy": {
      "min_cases": 2,
      "min_comparable_cases": 1,
      "min_candidate_avg_score": 4,
      "min_candidate_case_score": 4,
      "max_eval_drop": 0.25,
      "max_case_eval_drop": 0.5,
      "max_candidate_failure_rate": 0,
      "max_new_failure_cases": 0,
      "recovery_mode": false
    },
    "execution_safety": {"mode": "read_only", "fixture_set_id": null},
    "budget": {"max_total_tokens": 100000, "max_total_cost_usd": 5, "timeout_seconds": 900}
  },
  "focal_policy": {
    "focal_min_score": 4,
    "focal_min_improvement": 0.5
  }
}
```

Return `202 {validation_id,experiment_id,state:"validation_queued",revision}`. Derive base/candidate identity and focal case from repair/snapshot, rejecting mismatched request IDs. All score/drop thresholds must be finite and range-valid; booleans are not numbers. Validate comparable-case count as a nonnegative integer; zero requires explicit `recovery_mode=true` and mandatory absolute thresholds on all candidate cases. Content applicability is the shared fixed completed-output rule, not caller-defined arbitrary exclusions. The orchestration transaction stores the canonical request policy at `Experiment.options_json.validation_policy` and focal thresholds plus server-derived `focal_case_id` at `Experiment.options_json.repair_focal_policy`; the common report reducer consumes those frozen options. `run_repair_validations.decision_policy_json` is an immutable audit copy of both policies with a hash, never an independently editable second source of truth. The same internal Experiment service handles direct `/api/experiments` evidence requests, where `purpose="repair_validation"` requires `validation_policy`; direct callers cannot attach a repair or supply forged focal identity/options. `purpose="release_check"` is service-only and uses the stored ReleasePolicy instead of caller thresholds. No separate scoring API or evaluator is introduced.

`GET /api/experiments/{experiment_id}/items?cursor=...&limit=50` returns `{items,next_cursor}`. Each item carries immutable case ID/origin, reference availability, both manifest/run IDs, execution/evaluation outcomes including `execution_success` and content applicability, scores and aggregate (nullable), delta (nullable), safety/fixture usage, not-applicable/missing/blocked reasons, latency/tokens/cost, and content availability. Item detail content is permission-filtered independently of aggregate metadata. `GET /api/run-repairs/{id}/validations/{validation_id}` returns links, frozen policy, reduction/coverage, and adoption capability; it reads shared evidence, never judges again.

### 8.5 Cancel, rebase, and adopt

- `POST /api/run-repairs/{id}/cancel {"operation":"diagnosis"|"validation"|"all"}` records cancellation; validation delegates to the shared Experiment cancel service. Returns 202 while draining, 200 once terminal; already-terminal requests are harmless. It does not delete the candidate.
- `POST /api/run-repairs/{id}/rebase {"base_version_id":"...","expected_draft_revision":19}` selects only the current saved draft, records a new base revision, and invalidates active proposal/candidate selection. Reject while a mutation job is active until cancelled; historical attempts remain readable. No automatic model call or patch merge occurs.
- `POST /api/run-repairs/{id}/adopt` body `{candidate_version_id,validation_id,expected_draft_revision:18,mode:"validated",acknowledge_no_publish:true}` advances only the draft pointer. `mode:"unvalidated"` additionally requires `{acknowledge_reasons_hash:"server-returned-hash"}` and uses the current complete list of non-pass reasons; a changed result invalidates acknowledgment. Both return `{draft_version_id,draft_revision:19,published_version_id,adoption_mode,repair_id}`. The validated mode requires complete passing evidence bound to this candidate/base/snapshot/policy; unvalidated mode cannot alter that evidence.

### Error contract

Use `{detail:{code,message,repair_id?,current_revision?,current_draft_version_id?,current_draft_revision?,field_errors?,retryable}}` and sanitized messages. Codes/statuses:

| Status | Codes |
| --- | --- |
| 404 | `repair_not_found`, `run_not_found`, `resource_not_found` (also unowned resources) |
| 403 | `viewer_read_only`, `source_access_revoked` when an already-owned session loses access |
| 409 | `base_changed`, `repair_changed`, `context_changed`, `dataset_changed`, `dependency_changed`, `idempotency_payload_mismatch`, `operation_in_progress`, `validation_not_adoptable` |
| 410 | `context_expired`, `evidence_content_unavailable` |
| 413 | `context_too_large`, `graph_too_large`, `fixture_too_large` |
| 422 | `run_not_terminal`, `no_executable_workflow`, `unsupported_patch`, `invalid_graph`, `missing_expectation`, `missing_input`, `missing_dependency`, `unsafe_execution`, `invalid_fixture`, `invalid_budget` |
| 428 | `precondition_required` |
| 429 | `assist_rate_limited`, `repair_concurrency_limit` (with retry-after) |

Queue/provider failures are persisted job errors visible through GET; a committed asynchronous job is not represented as a synchronous 502 whose retry creates another job. External error text is sanitized before persistence.

## 9. State machine, restart, cancellation, and concurrency

Session state is a UI/workflow summary; jobs and Experiment rows remain authoritative for work. Allowed transitions:

| From | User/system event | To |
| --- | --- | --- |
| `context_required` | preview stored | `context_ready` |
| `context_ready` | explicit consent queues diagnosis | `diagnosis_queued` → `diagnosing` |
| `diagnosing` | valid result/no supported edit | `proposal_ready` / `diagnosis_only` |
| `diagnosing` | exhausted bounded call/parse/permission failure | `diagnosis_failed` |
| Any editable idle state | validated manual proposal saved | `proposal_ready` |
| `proposal_ready` | reviewed candidate creation CAS | `candidate_ready` |
| `candidate_ready` / `results_ready` | explicit validation start | `validation_queued` → `validating` |
| `validating` | Experiment reaches terminal evidence state | `results_ready` |
| Active operation | cancel request | `cancelling` → `cancelled` |
| Idle state with candidate | adopt CAS | `adopted` |
| Non-adopted idle state | explicit rebase | `context_required` |
| Non-adopted state | content permission revoked/expired | `blocked` / `expired` |

`base_stale` is a derived capability flag, not an automatic destructive state transition; a running comparison may finish against its frozen pair after a concurrent draft save but becomes historical/non-adoptable until explicitly rebased and reevaluated. Proposals can be inspected while stale. Adoption never silently merges.

Use the shared extended BackgroundJob: `lease_token` (Uuid), `lease_expires_at`, `heartbeat_at`, `attempt_count`, `next_attempt_at`, `cancel_requested_at`, `idempotency_key`, `payload_hash`; 60-second lease, 15-second heartbeat, and fenced CAS writes. Add job handlers `repair_diagnosis` and shared evidence Experiment dispatch. Do not blanket-reset all running jobs at worker startup. The API in inline mode may dispatch a durable queued job after commit; worker mode leaves claim/execution to the worker. Both use the same claim/fencing logic.

Diagnosis workers check ownership/content permissions and the consent hash immediately before the model call, then again before persisting a result. A lease loser cannot attach a late proposal or consume another operation's budget. A worker crash after a provider call but before commit can cause an uncertain billed call; do not promise exactly-once billing. Record the attempt and reserve its maximum token/cost allowance until it is resolved or conservatively charged against the budget. Do not automatically issue a replacement model call while the prior request could still be live. After its bounded deadline plus lease drain, mark the attempt interrupted; an explicit retry is allowed within a new user-approved operation/budget. A completed persisted diagnosis is reused rather than called again.

Experiment restart semantics belong to the common runner: case/arm attempt identity is durable; terminal results are reused; no overlapping live attempts after uncertain lease expiry; unmatched side effects remain denied. A restart cannot re-read a live dataset, reselect “latest,” or rerun completed arms just to rebuild an aggregate. Reduction is deterministic from committed evidence and can safely resume without model calls.

Cancellation first CAS-records intent and prevents new case/model dispatch. It then asks shared run/provider cancellation to stop in-flight work; provider cancellation may be best-effort. Late results are fenced and remain cancelled-attempt metadata, never turn cancellation into a passing validation. Already committed candidate versions remain unchanged. Repeating cancel returns the same operation state; user consent to cancel does not authorize replay. Budget/time exhaustion follows this same stop/drain path with `budget_exhausted`/`timeout` reasons.

Only one active diagnosis or validation mutation per repair. Different repairs may work concurrently, but draft CAS lets at most one adopt against a given revision. Acquire workflow and repair state in one documented order (workflow first, repair second), use conditional updates instead of relying on `FOR UPDATE` under SQLite, and verify affected-row count. Candidate creation also protects immutable proposal hash and current dependency permission/generation identities. An ordinary save that changes the draft pointer after candidate creation blocks validation start/adoption rather than selecting the repair candidate accidentally.

Idempotency receipt lookup precedes ETag/base checks: replaying a successful request with the same owner/action/key and same payload returns the original resource IDs/status even if the draft has since advanced. The same key with different payload returns 409. A fresh key cannot adopt the same candidate twice against a consumed draft revision. Receipts persist at least as long as the repair session plus the configured retry window; explicit content purge retains content-free key/hash tombstones to prevent accidental replay.

## 10. Privacy, permission invalidation, budgets, and retention

### Privacy and authorization

Run ownership is established through run → workflow version → workflow, as current Assist/capture endpoints do. Base/candidate/snapshot/dataset/fixtures/prompt/credentials/knowledge references must all belong to the same authorized user; a dataset must additionally belong to this workflow. Do not trust owner IDs supplied by clients. Viewer POST restrictions cover all new endpoints. Reads of a repair never broaden access to its source run or derived content.

Only execution workers resolve credentials, immediately before use; the diagnosing model sees neither secret values nor production credentials. Manifests store credential reference plus generation for invalidation; repair context strips those raw binding details when they are not required to explain an issue. Redact known secret fields, authentication headers, connection strings and signed URL parameters; let users remove additional sensitive values. Redaction is defense in depth, not a promise that arbitrary free text contains no PII. Consent states the actual external-model destination and selected content.

Treat source/tool/model text as untrusted; evidence references are server-assigned and resolved only against the consented bundle. Never render raw model HTML or executable links. Continue existing safe Markdown/text rendering. Audit payloads contain IDs, hashes, counts, action, actor, timestamps, and reason codes—not inputs, outputs, fixture bodies, prompts, credentials, or provider raw errors. Trace exports for repair model calls use existing content-capture policy plus the stricter selected-content consent, never an alternate full-body logger.

Knowledge source revocation/deletion invalidates all dependent copied excerpts/fixture contents as well as pinned revision retrieval. Every bundle/fixture records source permission references supplied by the sync design; recheck before rendering content, sending to Assist/judge, replaying fixtures, beginning an arm, and adopting. If source provenance cannot be established for historical retrieved text, omit it from provider context/fixtures by default and label unavailable; do not claim that run ownership restores revoked source access. On revocation, cancel dependent queued/running operations, remove derived source text under retention policy, preserve content-free provenance/status, and mark evidence non-reusable. A prior report can retain numeric metadata with **source content revoked** but cannot authorize new validated adoption/release.

Use the sync companion's exact permission reference `{revision_id,content_hash,scope_kind,scope_id,access_generation}` for every library or workflow-local knowledge dependency. `assert_revision_allowed` returns `AccessStamp {scope_kind,scope_id,revision_id,access_generation,valid_until}`; a revision has exactly one library/workflow scope. A source/document denial immediately bumps its scope's `access_generation` and denies the whole affected revision. Source-version `source_access_epoch` and `document_access_epoch` checks prevent reconnect from reviving previously denied revisions. Carry the stamp into cached snippets, diagnosis bundles, fixtures, and evidence; recheck before reuse/provider send and at completion, not merely at initial manifest resolution. Do not use expired remote permission receipts (Drive receipts are valid for at most 15 minutes); local/manual revisions have no provider deadline but still require current generation checks. If provenance cannot separate denied text from other derived text, redact the whole derived bundle rather than retain an untraceable copy.

### Limits and cost

Settings live in `Settings`, not direct environment reads. Add concrete configurable defaults: `repair_enabled=true`, `repair_context_max_bytes=65536`, `repair_context_max_nodes=50`, `repair_instruction_max_chars=4000`, `repair_active_operations_per_user=2`, `repair_context_retention_days=30`, and `repair_metadata_retention_days=90`. Reuse existing graph/request bounds and Assist rate limiter; context limits cannot raise those limits. A larger graph can still be repaired by selecting a bounded subgraph context while the full graph is validated server-side; the model is told which unchanged content is omitted.

Diagnosis consent defaults to 12,000 total tokens and 90 seconds for the whole bounded diagnosis/edit operation, including correction; requests cannot exceed operator caps. The estimator includes input, proposed graph output, reasoning tokens where exposed, and any correction call. Each provider dispatch reserves an enforceable maximum response/token allowance. If an adapter cannot enforce a required token bound, block that model for bounded repair diagnosis rather than displaying a false cap.

Validation defaults to 100,000 total tokens, 900 seconds, and a user-confirmed $5 spending stop when all selected calls have known pricing; maximums remain subject to workflow/operator limits. The common runner reserves per-dispatch allowances and accounts for both arms, judging, embedding/rerank calls, and sub-workflows. Unknown pricing blocks a configured currency budget; the user can explicitly choose token/time-only budgeting where the common policy permits it, with **Cost not guaranteed** displayed. Never silently remove a provided currency limit. In-flight calls may finish after a spending stop/cancellation, so this is not an invoice-level hard guarantee and cannot reverse remote billing. Complete quality evidence may have unknown cost only when no cost-bound acceptance condition was selected.

### Retention and deletion

Redacted repair bundles/diagnosis content expire after 30 days by default, no later than their source-content permission/retention deadlines. Metadata and content-free audit/idempotency tombstones remain 90 days. Adoption does not convert a transient diagnostic bundle into permanent source retention. A candidate graph that intentionally embeds a user-authored instruction is normal workflow content; avoid embedding raw trace excerpts/secrets into its instruction by rejecting detected secret copying and highlighting new literal data in review.

Use the common evidence retention/refcount rules for snapshots, manifests, fixture sets, and Experiment records. Evaluation setup explicitly discloses their independent retention, including active-reference protection; it cannot extend a source's access permission. Routine source-run retention clears the original trace and transient diagnosis bodies and makes source links unavailable, but does not silently delete independently approved evaluation evidence still retained under that policy.

Explicit owner erasure/redaction takes precedence over reproducibility and traverses provenance to purge the affected raw copies in bundles, snapshots, fixtures, and reports even when referenced. Preserve content-free audit identity and mark affected evidence unavailable/non-reusable; a historical result cannot become a fresh pass after its required content is gone. Deleting a repair cancels work and purges its private diagnosis/proposal content; any separately retained evaluation artifacts are identified in the deletion confirmation and can be explicitly erased through the shared evidence controls. An adopted workflow version or published graph is not silently deleted by routine repair cleanup; source-revocation rules continue to apply.

## 11. Implementation seams and migration plan

These are proposed changes, not code shipped by this document.

### Backend

| Files/callsites | Change |
| --- | --- |
| `backend/app/api/assist.py`, `services/assist.py`, `schemas/assist.py` | Extract reusable bounded explanation/edit prompt/parsing functions; add repair-aware evidence references and consent-scoped input. Preserve existing review-only Assist endpoints. Cache diagnosis by owner/bundle hash/provider/model/config/permission generation, not run ID alone; repair persistence is not a global in-memory cache. |
| New `backend/app/api/run_repairs.py`, `schemas/run_repair.py`, `services/run_repair.py` | Owner-scoped API, strict patch allowlist, repair lifecycle/CAS/idempotency, orchestration of shared services, deterministic report/adoption reduction. No model execution in GET and no second Experiment/evaluator. |
| `backend/app/services/experiment_runner.py`, `api/experiments.py`, `services/eval_runner.py`, `services/eval_deterministic.py`, `services/eval.py` | Implement the companion shared snapshot/manifest/evidence contract first; add repair purpose/origin/focal report reduction, no freeform authoring overrides, expected-output input separation, per-case arm detail/cancellation. |
| `backend/app/api/workflows.py`, `db/models.py`, workflow schema serializers | Consume the common append-only version/draft CAS contract. Candidate creation uses its version allocation service without its ordinary draft/schedule side effects. Explicit adoption changes the draft pointer only. History numbering remains independent from current draft selection. |
| `backend/app/services/prompt_service.py`, executor graph enrichment, compiler/dependency resolver | Use frozen resolved prompt versions for evidence execution, reject unavailable references, and implement inline-detachment semantics. No shared prompt write call in repair. |
| `backend/app/services/run_authoring.py`, run-create path | Preserve current pin/run-from-here authoring behavior; reject those overrides in evidence mode and label previews as diagnostic only. |
| `backend/app/services/dataset_service.py`, `services/annotation.py`, `api/annotation.py`, `api/datasets.py` | Reuse captured-case provenance and human labels; common dataset revision increments apply to every input/expectation/tag mutation. Snapshot creation never auto-applies a label. |
| `backend/app/services/job_queue.py`, `backend/worker.py`, app startup/dispatch | Consume common leases/fencing and add the repair diagnosis handler; durable enqueue and state commit together; explicit restart/cancel handlers. No ad-hoc `schedule_task` as sole durability. |
| Knowledge manifest/retrieval and shared fixture service from sync/publishing | Record/recheck source permission dependencies, pin revisions across arms, propagate revocation to derived evidence and copied fixture content. |
| `backend/app/services/retention.py`, existing audit service, `backend/app/config.py`, `backend/app/main.py` | Repair content purge/refcounts, content-free actions, Settings limits, route registration, existing authorization enforcement. |

### Frontend

| Files/callsites | Change |
| --- | --- |
| `frontend/src/components/runs/RunDetailView.tsx`, `ExplainFailureCallout.tsx` | Add repair entry alongside existing explanation/capture/annotation, retain historical observation display, source repair links and terminal-run eligibility. |
| `frontend/src/components/canvas/WorkflowCanvas.tsx`, `AssistRail.tsx`, `VersionDiffView.tsx`, `VersionHistory.tsx` | Reuse diff visuals without direct repair apply; dirty-canvas guard, saved-draft CAS, explicit candidate branch labels/selection, undo for local proposal editing, no autosave/run side effect from opening repair. |
| New repair workspace components under `frontend/src/components/runs/repair/` and route under `frontend/src/app/workflows/[id]/repairs/[repairId]/page.tsx` | Context preview/consent, evidence-linked diagnosis, patch review, evaluation setup, measured side-by-side results and explicit adoption. Components share one route/drawer state model. |
| `frontend/src/components/canvas/ExperimentsPanel.tsx`, `components/runs/RunComparison.tsx`, `DatasetExamples.tsx` | Link the shared experiment evidence view; distinguish controlled paired evidence from arbitrary historical comparison; reuse dataset/label controls. Do not recalculate trust from partial arrays in the browser. |
| `frontend/src/lib/api.ts`, `src/lib/query-keys.ts`, `src/types/workflow.ts` | Typed repair/snapshot/manifest/evidence requests and errors; centralized keys for repair detail/list/context/proposals/validation and paginated Experiment items; ETags/idempotency; invalidation of draft/history/experiments after explicit mutations. No new direct backend fetch convention. |

### Ordered delivery dependencies

1. Land the publishing companion's append-only version/draft pointer and immutable evaluator/manifest/fixture/job foundations, with all “latest is draft” consumers migrated. Existing workflows backfill draft pointer to their current latest version; existing live releases remain live/unattested, never forged passing evidence.
2. Land the knowledge companion's pinned-revision/permission/refcount seam before enabling repair on synced libraries. Without it, knowledge-backed evidence is blocked rather than using mutable live corpus contents.
3. Add the repair tables and API/service workflow, then UI entry/review/validation/adoption on those contracts. Feature enablement requires shared evidence/safety capabilities; missing services are configuration blockers, not no-op success fallbacks.
4. Extend retention and audit consumers before enabling stored diagnostic content. Add behavior tests below alongside implementation; this specification itself does not create tests or application changes.

Migrations use `sa.Uuid`, not `sa.UUID`, preserve SQLite/Postgres schema parity, and avoid relying on database-specific row locking for CAS. The repair migration adds no guessed historical proposals/manifests/consent to old runs. Old Explain results remain ordinary Assist responses. Existing saved versions may lack historical graph fidelity; that caveat is retained, not “fixed” by assigning a hash to today's graph. Downgrade must refuse while repair candidates/evidence depend on the new identities or after deployment adoption would lose provenance; do not silently collapse candidates into latest draft.

## 12. Behavior-level acceptance scenarios

These are executable implementation acceptance scenarios, not claims that tests have been run.

1. **No-effect open:** Given a failed owned run and a saved draft, opening Fix this run and previewing context issues no model calls, no workflow run, no tool request, no save, and no schedule/deployment change. Context contains only selected bounded data.
2. **Historical drift:** Given source run v3, current draft v9, and published v7, diagnosis labels all three. Candidate is derived from v9. Controlled comparison reruns v9/candidate; v3 output never becomes the baseline metric. Missing historical graph/manifest is visible.
3. **Consent integrity:** Given a context preview, altering its selections/hash/provider or a source permission before dispatch makes old consent invalid. No request containing the stale/unapproved content is sent. Redactions are verified against their inventory revision.
4. **Grounding:** Given an Assist response citing a nonexistent event or changing an unapproved field, the server rejects the citation/edit or marks the unsupported claim as a hypothesis; no candidate is created. Model prose cannot create a trace link or trusted score.
5. **Manual path:** With Assist disabled or no model key, an owner can construct a supported manual proposal, create an unpublished candidate, and run permitted evaluation. This path makes no diagnosing model call and passes identical graph/permission checks.
6. **Prompt isolation:** Given two workflows bound to prompt P version 4, repairing one through detachment removes its candidate's ref and edits a copied instruction. P/current-version/other workflow/base stay unchanged. A missing P4 blocks evidence resolution instead of falling back silently.
7. **Supported versus unsafe edits:** A classifier instruction/routes/edges change that remains valid is accepted. A hidden credential URL change, new code node, increased loop cap, tool insertion, evaluator weakening, deleted approval control, or bypass edge is rejected even if DAG validation alone passes.
8. **Candidate isolation:** Creating a candidate increments version numbering but leaves draft pointer, published pointer, deployment, invoke credentials, and all schedules unchanged—including never-published workflows. History marks the branch as candidate; ordinary canvas reload still opens the original draft.
9. **Concurrent saves:** Another editor saves after diagnosis. Candidate creation returns `base_changed` without any stored version/job side effect. Another save after candidate creation blocks validation start/adoption. A completed old comparison remains readable against its frozen pair.
10. **Snapshot stability:** A dataset item/label/tag changes after snapshot creation. Both arms still use the prior copied inputs/expectations. A change before snapshot creation conflicts on dataset revision. Annotation labeling does not alter an existing snapshot.
11. **Expectation correctness:** Failed/negative-feedback observed output is never automatic gold. Null expectation blocks exact scoring; explicitly empty human expectation remains valid. A declared reference-free rubric can run but report always says no reference answer. Assisted labels retain assisted provenance.
12. **Coverage and recovery honesty:** Focal baseline has a genuine workflow failure without output; candidate succeeds and passes its required content checks, and at least one normal regression case is comparable/passing. Report permits validated recovery with null focal baseline score/delta, explicit baseline content non-applicability, and **Execution restored; focal quality delta unavailable**. Missing one judge result on a completed arm, provider/worker uncertainty, or a blocked fixture instead makes the attempt incomplete and prevents validated adoption. When every base case crashes, default paired mode cannot pass; a new predeclared absolute-recovery attempt with zero minimum comparables and absolute candidate thresholds can pass only as absolute-only recovery. Equal failure counts cannot hide newly failed candidate case identities.
13. **Regression measured:** Focal exact match improves from 1 to 5, but one non-focal case changes from pass to fail. Report classifies regressed, identifies the case and both outputs, and offers no primary validated-adoption action. Focal success does not outweigh the regression.
14. **Not reproduced:** Base and candidate both meet focal target and regression requirements. Report says already satisfied/original issue not reproduced, not fixed; all paired measurements are visible.
15. **Safe replay:** A workflow containing email/write-capable MCP/integration tools is denied in read-only mode. A validated matching fixture permits fixture-backed paired execution without contacting those tools. Different arguments, call order, schema, or extra call blocks the case; there is no live fallback or generic fake success.
16. **Pins excluded:** A run-from-here/pinned-output preview remains useful diagnostically but is rejected as repair Experiment evidence. Candidate and base require full manifest execution under the shared policy.
17. **Session isolation:** Both arms receive identical frozen approved history but distinct live session/memory namespaces. Candidate writes cannot affect the baseline or production memory. Unsupported persistent-memory isolation blocks preflight rather than dropping writes.
18. **Revocation and privacy:** Revoking a synced source after fixture/context creation prevents rendering/sending/replaying its copied text and prevents new validated adoption. A pinned old revision does not bypass revocation. Logs/audit/manifests/provider requests never contain credential secrets.
19. **Worker crash:** Worker dies after some paired items commit. Restart reuses those rows, preserves snapshot/manifests, and does not launch overlapping uncertain attempts. A stale lease holder cannot commit a diagnosis, result, or passing reduction.
20. **Cancel and retry:** Repeated cancel returns the same state and stops new dispatch; late provider responses cannot turn it green. Repeating a successful create/candidate/adopt request with its original idempotency key returns the same IDs, while changed payload with that key returns 409.
21. **Budget visibility:** Admission rejects an unsupported dollar-bound estimate rather than claiming $0. Token/time exhaustion produces incomplete evidence and reports consumed/reserved cost accurately; correction/judge/embedding calls count toward the same approved bound.
22. **Explicit adoption:** A complete passing repair can be adopted only against unchanged draft/dependencies with an explicit click. A failed/incomplete repair can be selected only through the visibly unvalidated draft acknowledgment; neither creates a passing report. Both leave the live published version and schedules untouched. Subsequent publication requires a fresh policy-bound release check.
23. **Owner/viewer isolation:** Viewer POST is denied; cross-owner source run/base/dataset/fixture/prompt/library IDs return not found. Guessing a report item ID cannot expose outputs or source excerpts through aggregate/detail endpoints.
24. **Retention:** Routine source-run/diagnosis expiry removes original and transient bodies while independently approved active evaluation evidence follows the shared retention policy. Explicit owner erasure removes affected raw derived copies even when referenced, leaving unavailable-content markers and content-free provenance. Adopted graph/live release remain intact subject to source revocation rules; erased evidence cannot authorize a new validation or publication.
25. **Leakage and selection disclosure:** Diagnosing model never receives regression expectations; judge never receives arm identity/patch/prior score. Repeated attempts remain listed, snapshot/rubric changes remain visible, and one focal case alone never displays regression coverage or statistical certainty.

## 13. Definition of complete implementation

The feature is complete only when the full explicit journey works over the common durable evaluator/manifests, permissions and privacy hold across queued/restarted work and source revocation, candidate creation/adoption are isolated and CAS-protected, shared prompts remain unchanged, and the UI distinguishes observed history from measured candidate/current-base results. The expected downstream checks are backend behavior tests for the scenarios above, SQLite and Postgres Alembic upgrades, and frontend typecheck/lint/build. This documentation-only work does not run or claim those checks.
