"""A/B experiment: grounded-prompt v5 vs the ungrounded v4 baseline.

v4 (49dae469): "Synthesize the search results … Cite key findings and note any
uncertainties." — measured faithfulness ≈0.44: the agent asserted true facts
that weren't in the retrieved context (hallucination-by-omission of grounding).

v5 (43040bb6): same graph + "Use ONLY facts present in the search results …
If the results do not answer the question, say so instead of guessing."

For each dataset row: v4's stored output is replayed from node_results/run
rows (already executed — no re-invocation), v5 runs fresh against the same
query, both are logged as targets, scored per-target, and a LangWatch judge
compares them pairwise (`experiment.compare` → decided/tie/inconclusive).

Usage:
  LANGWATCH_API_KEY=… LANGWATCH_PROJECT_ID=… python experiments/compare_grounding.py
"""

import os
import sqlite3
import sys

import langwatch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from research_agent_experiment import DATASET, DB_PATH, JUDGE, invoke  # noqa: E402

V4_VERSION_ID = "49dae469-8939-4aa3-8d7a-c9751d00ce28"
V5_VERSION_ID = "43040bb6-c674-44a5-8a24-46ed63837654"


def fetch_v4_outputs() -> dict[str, dict]:
    """Latest completed v4 run per input, with its n1 search context."""
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro&timeout=30", uri=True)
    try:
        rows = con.execute(
            """select r.id, r.input_text, r.final_output from workflow_runs r
               where r.workflow_version_id=? and r.status='completed'
               order by r.created_at desc""",
            (V4_VERSION_ID.replace("-", ""),),
        ).fetchall()
        out = {}
        for rid, inp, output in rows:
            if inp in out:
                continue
            n1 = con.execute(
                "select output from node_results where run_id=? and node_id='n1'",
                (rid.replace("-", ""),),
            ).fetchone()
            out[inp] = {"output": output or "", "contexts": [n1[0]] if n1 and n1[0] else []}
        return out
    finally:
        con.close()


def main() -> int:
    v4 = fetch_v4_outputs()
    print(f"[compare] {len(v4)} v4 baseline outputs replayed; running v5 on {len(DATASET)} rows")

    experiment = langwatch.experiment.init("research-agent-grounding-ab")

    for index, row in experiment.loop(list(enumerate(DATASET)), threads=1):
        query, expected = row["input"], row["expected_output"]

        # Candidate A: stored v4 baseline (no new LLM spend).
        with experiment.target("v4-ungrounded"):
            v4_rec = v4.get(query)
            if v4_rec:
                experiment.log_response(v4_rec["output"])
                experiment.evaluate(
                    "ragas/faithfulness", index=index,
                    data={"input": query, "output": v4_rec["output"], "contexts": v4_rec["contexts"]},
                    settings={"model": JUDGE, "max_tokens": 2048},
                )
                experiment.evaluate(
                    "langevals/llm_answer_match", index=index,
                    data={"input": query, "output": v4_rec["output"], "expected_output": expected},
                    settings={"model": JUDGE, "max_tokens": 2048},
                )

        # Candidate B: fresh v5 (grounded instruction).
        rec = invoke(query, version_id=V5_VERSION_ID)
        if rec["status"] != "completed":
            print(f"  [{index}] v5 run {rec['status']}: {rec['output'][:100]}")
            continue
        with experiment.target("v5-grounded"):
            experiment.log_response(rec["output"])
            experiment.evaluate(
                "ragas/faithfulness", index=index,
                data={"input": query, "output": rec["output"], "contexts": rec["contexts"]},
                settings={"model": JUDGE, "max_tokens": 2048},
            )
            experiment.evaluate(
                "langevals/llm_answer_match", index=index,
                data={"input": query, "output": rec["output"], "expected_output": expected},
                settings={"model": JUDGE, "max_tokens": 2048},
            )

        verdict = experiment.compare(index, input=query, model=JUDGE)
        print(f"  [{index}] verdict={verdict.status} winner={getattr(verdict, 'winner', None)}")

    print("[compare] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
