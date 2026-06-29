WORKFLOW_TEMPLATES: list[dict] = [
    {
        "id": "research-agent",
        "name": "Research Agent",
        "description": "Search the web, synthesize findings, and evaluate response quality.",
        "graph_json": {
            "nodes": [
                {
                    "id": "n1",
                    "position": {"x": 80, "y": 120},
                    "data": {
                        "label": "Web Search",
                        "nodeType": "tool",
                        "toolType": "search",
                        "searchProvider": "google",
                    },
                },
                {
                    "id": "n2",
                    "position": {"x": 340, "y": 120},
                    "data": {
                        "label": "Research Agent",
                        "nodeType": "agent",
                        "instruction": (
                            "Synthesize the search results into a clear, factual summary. "
                            "Cite key findings and note any uncertainties."
                        ),
                    },
                },
                {
                    "id": "n3",
                    "position": {"x": 600, "y": 120},
                    "data": {
                        "label": "RAG Evaluation",
                        "nodeType": "evaluation",
                        "evalPreset": "rag_quality",
                        "criteria": "faithfulness, helpfulness, relevance, and toxicity",
                    },
                },
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n3"},
            ],
        },
    },
    {
        "id": "calculator-chain",
        "name": "Calculator Chain",
        "description": "Agent interprets a math problem, calculator solves it, guardrail validates output.",
        "graph_json": {
            "nodes": [
                {
                    "id": "n1",
                    "position": {"x": 80, "y": 120},
                    "data": {
                        "label": "Math Agent",
                        "nodeType": "agent",
                        "instruction": (
                            "Convert the user's question into a single math expression "
                            "that can be evaluated. Return only the expression, e.g. 15 * 7."
                        ),
                    },
                },
                {
                    "id": "n2",
                    "position": {"x": 340, "y": 120},
                    "data": {"label": "Calculator", "nodeType": "tool", "toolType": "calculator"},
                },
                {
                    "id": "n3",
                    "position": {"x": 600, "y": 120},
                    "data": {
                        "label": "Output Guardrail",
                        "nodeType": "guardrail",
                        "rules": {
                            "pattern": r"^-?\d+(\.\d+)?$",
                            "fail_behavior": "block",
                            "mode": "output",
                        },
                    },
                },
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n3"},
            ],
        },
    },
    {
        "id": "support-bot",
        "name": "Support Bot",
        "description": "Validate input, generate a support response, and evaluate tone.",
        "graph_json": {
            "nodes": [
                {
                    "id": "n1",
                    "position": {"x": 80, "y": 120},
                    "data": {
                        "label": "Input Guardrail",
                        "nodeType": "guardrail",
                        "rules": {
                            "blocked_keywords": ["spam", "hack"],
                            "detect_pii": True,
                            "fail_behavior": "block",
                            "mode": "input",
                        },
                    },
                },
                {
                    "id": "n2",
                    "position": {"x": 340, "y": 120},
                    "data": {
                        "label": "Support Agent",
                        "nodeType": "agent",
                        "instruction": (
                            "You are a professional customer support agent. "
                            "Respond empathetically and provide a clear resolution."
                        ),
                    },
                },
                {
                    "id": "n3",
                    "position": {"x": 600, "y": 120},
                    "data": {
                        "label": "Tone Evaluation",
                        "nodeType": "evaluation",
                        "evalPreset": "support_tone",
                        "criteria": "professional support tone and helpfulness",
                    },
                },
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n3"},
            ],
        },
    },
]