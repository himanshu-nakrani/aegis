"""LangWatch experiment for the Aegis "Research Agent" workflow.

Agent under test: workflow `Research Agent` (d94b0a1c…), version-pinned by
AEGIS_VERSION_ID. The published version targets Gemini; when that key is out
of credits, experiment versions retarget the agent node to Featherless and
search to Exa (see git history / docs on how these versions were created).

Requires:
  - Backend running: uvicorn app.main:app --reload --port 8000 (in backend/)
  - LANGWATCH_API_KEY + LANGWATCH_PROJECT_ID in env (or `langwatch login`)
  - A judge model reachable via a LangWatch model provider — the default below
    assumes a `custom` provider configured with Featherless base URL + key.

Flow: POST /api/runs (version-pinned) → poll to terminal → pull the search
node's output from `node_results` (SQLite, read-only) as RAG `contexts` →
score with ragas/faithfulness + langevals/llm_answer_match on LangWatch.

Env:
  AEGIS_BASE_URL   default http://127.0.0.1:8000
  AEGIS_DB         default backend/aegis.db relative to repo root
  AEGIS_VERSION_ID default 43040bb6-… (v5, grounded instruction)
  JUDGE_MODEL      default custom/meta-llama/Llama-3.3-70B-Instruct
"""

import json
import os
import sqlite3
import sys
import time
import urllib.request

import pandas as pd
import langwatch

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AEGIS = os.environ.get("AEGIS_BASE_URL", "http://127.0.0.1:8000")
WORKFLOW_ID = os.environ.get("AEGIS_WORKFLOW_ID", "d94b0a1cab80448fb511753fc2bdc925")
VERSION_ID = os.environ.get("AEGIS_VERSION_ID", "43040bb6-c674-44a5-8a24-46ed63837654")
DB_PATH = os.environ.get("AEGIS_DB", os.path.join(REPO_ROOT, "backend", "aegis.db"))
JUDGE = os.environ.get("JUDGE_MODEL", "custom/meta-llama/Llama-3.3-70B-Instruct")

# Domain dataset: queries the Research Agent is actually for — grounded,
# current-events research questions plus a few honest-edge cases (obscure,
# multi-part, ambiguous). expected_output = what a correct grounded answer
# covers, used by llm_answer_match.
DATASET = [
    {
        "input": "What are the latest developments in small modular nuclear reactors approved in 2025?",
        "expected_output": "NRC approval of NuScale's uprated SMR design, DOE selection of TVA and Holtec for SMR deployment, and GE Vernova Hitachi's BWRX-300 progress.",
    },
    {
        "input": "Summarize the current state of EU AI Act enforcement and which provisions took effect in 2025.",
        "expected_output": "GPAI model obligations and governance provisions applied from August 2025; prohibited practices banned from February 2025; full high-risk obligations phase in 2026-2027.",
    },
    {
        "input": "What is the latest evidence on GLP-1 drugs like semaglutide for cardiovascular outcomes?",
        "expected_output": "SELECT trial showed ~20% reduction in major adverse cardiovascular events for semaglutide 2.4mg in overweight/obese non-diabetic patients; FDA approved a CV indication for Wegovy in 2024.",
    },
    {
        "input": "Explain how Apple's M-series unified memory architecture differs from discrete GPU memory and why it matters for local LLM inference.",
        "expected_output": "Unified memory lets CPU and GPU share one pool, so large models avoid PCIe transfer bottlenecks and memory duplication; bandwidth is lower than top discrete GPUs but capacity flexibility is higher.",
    },
    {
        "input": "What were the main findings of the most recent IPCC assessment report on climate attribution?",
        "expected_output": "AR6 concluded human influence has unequivocally warmed the climate, attributed extreme weather events to human-caused warming, and projected warming thresholds depend on cumulative CO2 emissions.",
    },
    {
        "input": "Compare the safety profiles of molnupiravir and Paxlovid for outpatient COVID-19 treatment based on published trial data.",
        "expected_output": "Paxlovid (nirmatrelvir/ritonavir) showed ~89% reduction in hospitalization/death in EPIC-HR but has drug interactions; molnupiravir showed ~30% and was less effective, with mutagenesis concerns debated.",
    },
    {
        "input": "What is the status of the Vera C. Rubin Observatory's first images and early science results?",
        "expected_output": "Rubin Observatory released first images in June 2025 showing millions of galaxies and thousands of asteroids; full LSST survey operations began late 2025.",
    },
    {
        "input": "Describe the mechanism of CRISPR prime editing and how it differs from base editing for treating genetic diseases.",
        "expected_output": "Prime editing uses a Cas9 nickase fused to reverse transcriptase with a pegRNA to install small edits without double-strand breaks; base editing chemically converts one base to another but cannot do insertions/deletions.",
    },
    {
        "input": "What are the known supply constraints for TSMC's 2nm process node as of late 2025?",
        "expected_output": "TSMC 2nm (N2) entered volume production in late 2025 with initial capacity fully booked by major customers; yield and capacity ramp constraints reported, with higher pricing than N3.",
    },
    {
        "input": "asdg qwerty zzz",
        "expected_output": "The agent should note that no relevant information was found and not fabricate a factual answer.",
    },
]


def post_run(query: str, version_id: str = VERSION_ID) -> str:
    body = json.dumps(
        {
            "workflow_id": WORKFLOW_ID,
            "version_id": version_id,
            "input_text": query,
        }
    ).encode()
    req = urllib.request.Request(
        f"{AEGIS}/api/runs",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    resp = json.loads(urllib.request.urlopen(req, timeout=30).read())
    return resp["id"]


def poll_run(run_id: str, timeout: float = 180.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        req = urllib.request.Request(f"{AEGIS}/api/runs/{run_id}")
        d = json.loads(urllib.request.urlopen(req, timeout=15).read())
        if d["status"] in ("completed", "failed", "cancelled"):
            return d
        time.sleep(3)
    return {"status": "timeout", "final_output": None}


def search_contexts(run_id: str, node_id: str = "n1") -> list[str]:
    """Pull a node output (the exa search result) as RAG contexts."""
    rid = run_id.replace("-", "")
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro&timeout=30", uri=True)
    try:
        row = con.execute(
            "select output from node_results where run_id=? and node_id=?",
            (rid, node_id),
        ).fetchone()
    finally:
        con.close()
    if not row or not row[0]:
        return []
    return [row[0]]


def invoke(query: str, version_id: str = VERSION_ID) -> dict:
    """Run the workflow once; returns {status, output, contexts, run_id}."""
    run_id = post_run(query, version_id)
    result = poll_run(run_id)
    return {
        "run_id": run_id,
        "status": result.get("status"),
        "output": result.get("final_output") or "",
        "contexts": search_contexts(run_id),
    }


def main() -> int:
    df = pd.DataFrame(DATASET)
    experiment = langwatch.experiment.init("research-agent-regression")

    print(f"[experiment] {len(df)} rows against {AEGIS} workflow={WORKFLOW_ID} version={VERSION_ID}")

    for index, row in experiment.loop(df.iterrows(), threads=2):
        query = row["input"]
        rec = invoke(query)
        if rec["status"] != "completed":
            print(f"  [{index}] run {rec['status']}: {rec['output'][:120]}")
            continue

        with experiment.target(f"research-agent-v{VERSION_ID[:8]}"):
            experiment.log_response(rec["output"])

        experiment.evaluate(
            "ragas/faithfulness",
            index=index,
            data={"input": query, "output": rec["output"], "contexts": rec["contexts"]},
            settings={"model": JUDGE, "max_tokens": 2048},
        )
        experiment.evaluate(
            "langevals/llm_answer_match",
            index=index,
            data={"input": query, "output": rec["output"], "expected_output": row["expected_output"]},
            settings={"model": JUDGE, "max_tokens": 2048},
        )
        print(f"  [{index}] run completed ({len(rec['output'])} chars, {len(rec['contexts'])} ctx)")

    print("[experiment] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
