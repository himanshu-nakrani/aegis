# Migrate from OpenAI Agent Builder to Aegis

## Deadline and supported path

OpenAI's [deprecation notice](https://developers.openai.com/api/docs/deprecations#2026-06-03-agent-builder) schedules **Agent Builder shutdown for November 30, 2026**. This migration guidance covers the implemented Phase 0/1 runtime and is time-boxed by that date: export and inventory each workflow, recreate only supported behavior, and compare representative runs before the shutdown. ChatKit remains available; do not confuse its availability with continued Agent Builder hosting.

The official [migration guide](https://developers.openai.com/api/docs/guides/agent-builder/migrate-from-agent-builder) documents **Code → Agents SDK → Python or TypeScript**. It does not document a stable graph-JSON export contract, and explicitly says the process does not convert the workflow graph or guarantee unchanged behavior. **Aegis does not import that SDK code or an OpenAI-native graph export.** There is no automatic conversion promise here. Retain the complete code export as your migration reference, including instructions, tools, model configuration, conditions, state, approvals, permissions, and expected outputs.

Aegis supports its own `aegis-workflow-v1` JSON export and partial payloads containing `graph_json`. This is an **Aegis format**, not an official OpenAI schema. The safe path is manual reconstruction in the Aegis canvas or deliberate conversion into that format, followed by import and runtime review. If a workflow requires unsupported semantics, keep the exported Agents SDK implementation as the runnable migration path described by OpenAI rather than omitting those semantics to force an Aegis import.

## Node-by-node manual mapping

OpenAI's [node reference](https://developers.openai.com/api/docs/guides/node-reference) defines the source semantics. These mappings describe the current Aegis runtime, not equivalent behavior in every case. Config names below live under each Aegis node's `data` object.

| Agent Builder node | Current Aegis node | Required review and limitations |
| --- | --- | --- |
| **Start** | `trigger`; optionally followed by `input_schema` | Use one Trigger and one End. Aegis receives `input_text`; template `{{input.text}}` is the original text before field remapping. JSON-object inputs also expose fields under `input`. Configure `inputFields` for required fields and defaults; this handler does not enforce declared value types. OpenAI Start appends to conversation history and exposes `input_as_text`; these are not automatically recreated. Session grouping is not a substitute for replaying conversation history. Recreate initial state explicitly. |
| **Agent** | `agent` | Copy `instruction`, select `provider`/`model`, and rebind credentials. Phase 1 adds a native ADK tool-selection loop using `tools` references, `maxToolIterations` (default 8 tool-call response batches), and `tokenBudget` (default 8192 reported tokens). Builtin Tool nodes attached to agents must be disconnected declarations; MCP references use an owned, discovered credential ID plus tool name. `requireApproval` gates each invocation. `outputSchema` constrains the final answer to one JSON object (scalar fields, scalar arrays, and one nested object); the run repairs the answer once. Invoked runs and Slack thread events that share a `session_id` rehydrate prior turns. Handoffs and attached evals still need individual review. Use separate `evaluation` nodes where appropriate. |
| **File Search** | `kb_retrieve` | Set `kbQuery`, `kbTopK`, `kbSource` (`inline`, `workflow`, or `library`), and `kbMethod` (`keyword`, `bm25`, `tfidf`, `embedding`, `hybrid`, or `library` to follow the library's saved method). Inline documents live on the node. Workflow documents live in the canvas Data tab. Libraries live on the Knowledge page: paste, file (PDF, DOCX, Markdown, text), or a public URL, with sentence, paragraph, or fixed chunking. Hybrid retrieval fuses BM25 and embeddings with reciprocal rank fusion, and a library can rewrite the query or rerank with an LLM. Results include citations (rank, source, character span, score). OpenAI vector-store IDs are not Aegis document IDs. Move permitted content into a workflow knowledge base or a Knowledge library and verify retrieval. |
| **Guardrails** | `guardrail` | Rebuild supported checks in `rules`, select input/output `mode`, and explicitly choose `fail_behavior` (`block`, `warn`, `mask`, `rewrite`, `fallback`, or `route`). Route mode requires pass/failure edges matching `pass_route`/`failure_route`; mask/rewrite/fallback alter the downstream content. OpenAI PII, jailbreak, hallucination, and other monitors are not interchangeable classifiers or thresholds. Configure and test judge credentials, missing-judge behavior, and failure paths. Aegis's DAG cannot reproduce a failure path that cycles back to an earlier node. |
| **If/else** | `if`; `switch` for value-based multiway cases | Rewrite CEL expressions into `ifCondition` with `left`, `operator`, and `right`; wire edges with `data.route` equal to `true` and `false`. Supported comparisons are `eq`, `neq`, `contains`, `not_contains`, `empty`, `not_empty`, `gt`, and `lt`. Operands are rendered strings; `gt`/`lt` compare numerically when both values parse as numbers, otherwise lexicographically. This is not a CEL interpreter or CEL type semantics. Complex expressions require a reviewed supported rewrite, not copied CEL. |
| **Human approval** | `human_approval` | Use `approvalReview` for review text. The gate waits for Aegis approval; denial or timeout fails the run by default, or takes an explicitly configured generic error edge. This is not an arbitrary approval/rejection widget contract. The wait is a row in `approval_requests`. `/approve` is a compare-and-swap on that row, and the executor polls it (Postgres NOTIFY only wakes the waiter). A restart re-queues orphaned `awaiting_approval` runs for checkpoint resume, including when a worker process owns execution. Configure the timeout and verify any notification destination. |
| **Transform** | `transform`; optionally `json_parse`, `set_fields`, or `code` | `transform` renders a string `template`, such as `Hello {{input.text}}`. It does not enforce OpenAI object/array schemas or perform arbitrary typed reshaping. `json_parse` can extract JSON; `set_fields` can map input fields. More complex conversions need bounded sandboxed Python and explicit output validation. Never copy a source transform expression into a template and assume equivalent evaluation. |
| **Set state** | `set_fields`; `memory_store` / `memory_retrieve` for named state | `setFields` renders string values into the run's `input` fields, consumed through `{{input.field}}`; it is not a general typed OpenAI global-state namespace. Memory nodes use `memoryNamespace`, `memoryKey`, and `memoryValue` and store rendered strings. Run memory is local to the run by default; persistent memory is opt-in via `memoryPersistent` and has different storage/lifecycle semantics. Rewrite reads and writes consistently and review branch ordering when several paths update state. |
| **MCP** | MCP credential attached through `agent.tools`, and `/mcp` for published workflows | Register a trusted stdio or Streamable HTTP server in Settings, discover its tools, and attach exact names to an agent. Stdio requires deployment opt-in; private HTTP targets require an exact administrator allowlist, and secrets are rebound separately. Cached descriptors and live schemas are validated; remote regex schemas use a bounded supported subset. Published workflows are also exposed as `invoke_*` tools on the `/mcp` Streamable HTTP server under deployment-key auth. Recheck tool permissions, arguments, outputs, and approval policy. |
| **While** | `loop` | Repeats a template or a sub-workflow while `loopCondition` is true, then stops. `maxIterations` is required and capped at 25, so the canvas graph stays acyclic. `{{iteration}}` is 1-based and `{{last_output}}` is the previous body result. `iteration` is still a list map and is a different control flow. The bounded agent tool loop is also separate. Map a While onto `loop` and verify the cap and the exit condition. |

Aegis template paths include `{{input.field}}`, `{{last_output}}`, `{{steps.node_id.output}}`, and `{{memory.namespace.key}}`. Missing paths render as empty text, so audit every variable reference during conversion. A successful import proves structural validity, not semantic equivalence, configured credentials, tool access, or safety.

## What JSON import accepts and rejects

- `POST /api/workflows/import` creates a new workflow from an Aegis export or a partial `graph_json` payload. Exported workflow/version IDs do not reuse the source identity.
- `POST /api/workflows/{id}/import` imports into an existing workflow. `save_as_new_version: true` is the safe default. A pinned published version is forked even when replacement is requested.
- `GET /api/workflows/{id}/export` produces the round-trip Aegis format.
- Imports require `nodes` and `edges` arrays, distinct non-empty string node IDs, node `data` objects, supported `data.nodeType` values, and valid edge endpoints. An omitted `nodeType` defaults to `agent`, matching existing exports. Agent `tools` accept only stable node/MCP references; missing, connected, malformed, or unauthorized declarations are rejected rather than dropped. `calculator`, `http`, and `search` Tool kinds are supported; MCP is a credential reference, not a `toolType`. Attached Tool declarations remain disconnected and are excluded from the executable DAG. Visual `note` and `group` annotations are accepted but are not executable.
- Existing runtime graph validation still runs: exactly one Trigger → … → End, no cycles, reachable executable nodes, complete branch routes, and the existing numeric/error-branch constraints. Invalid imports return HTTP 400 before creating a workflow or replacing a stored graph; request-schema errors return HTTP 422.
- This is not a complete type checker for node configuration or a code parser. Unknown extra configuration does not create new runtime capabilities. Review supported config against the canvas and test the actual behavior before publishing.

The implementation is in `backend/app/services/workflow_import.py`, with the supported node catalog in `node_registry.py`, structural validation in `graph_validation.py`, and execution fields in `compiler.py` / `node_handlers.py`.

## Executable safe Aegis import example

With a migrated, running backend at `http://127.0.0.1:8000` (see the repository setup instructions), run this from a terminal with Python 3. It creates a new **Aegis** Trigger → Transform → End workflow, executes it, and checks the output. It uses no LLM or external tool node and does not demonstrate a native OpenAI import. Use a local development backend with inline execution; the normal server configuration and authentication still apply. Set `AEGIS_API_URL` if needed and `AEGIS_API_KEY` when API-key auth is enabled.

```bash
python3 - <<'PY'
import json
import os
import time
import urllib.request

base = os.environ.get("AEGIS_API_URL", "http://127.0.0.1:8000").rstrip("/")
headers = {"Content-Type": "application/json"}
if os.environ.get("AEGIS_API_KEY"):
    headers["X-Aegis-API-Key"] = os.environ["AEGIS_API_KEY"]

def request(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.load(response)

payload = {
    "format": "aegis-workflow-v1",
    "name": "Manual migration smoke",
    "description": "Aegis-native deterministic mapping example, not an OpenAI export",
    "graph_json": {
        "nodes": [
            {"id": "start", "position": {"x": 0, "y": 0},
             "data": {"label": "Start", "nodeType": "trigger", "triggerType": "manual"}},
            {"id": "greet", "position": {"x": 240, "y": 0},
             "data": {"label": "Transform", "nodeType": "transform",
                      "template": "Hello {{input.text}}"}},
            {"id": "end", "position": {"x": 480, "y": 0},
             "data": {"label": "End", "nodeType": "end"}},
        ],
        "edges": [
            {"id": "start-greet", "source": "start", "target": "greet"},
            {"id": "greet-end", "source": "greet", "target": "end"},
        ],
    },
}
workflow = request("POST", "/api/workflows/import", payload)
run = request("POST", "/api/runs", {
    "workflow_id": workflow["id"], "input_text": "migration"
})
deadline = time.monotonic() + 30
while run["status"] in {"pending", "running"} and time.monotonic() < deadline:
    time.sleep(0.2)
    run = request("GET", "/api/runs/" + run["id"])
assert run["status"] == "completed", run
assert run["final_output"] == "Hello migration", run
print(json.dumps({"workflow_id": workflow["id"], "run_id": run["id"],
                  "status": run["status"], "output": run["final_output"]}, indent=2))
PY
```

For an actual migration, retain the original SDK export and replay a reviewed dataset of normal, rejected, ambiguous, and tool/approval-failure inputs. Check both branches, state references, retrieved documents, denied/timed-out approvals, guardrail failures, and final outputs. Rebind secrets and permissions in Aegis; do not embed them in workflow JSON. Publish only after those comparisons pass. Test tool bounds, per-call approval identity, and MCP schema compatibility explicitly. Map While onto the bounded `loop` node and keep the graph acyclic. Approval waits are durable rows. Slack events that carry a channel and thread reuse `session_id` with the same history hosted chat uses; other channels still need their own session key.
