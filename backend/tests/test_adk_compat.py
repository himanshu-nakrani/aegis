"""ADK public-contract tests (2.11 upgrade).

Guards the parts of google-adk Aegis actually depends on:
- public workflow exports (no private ``_base_node``/``_graph`` imports)
- ``FunctionTool`` construction + ``_get_declaration`` for custom schemas
- ``Runner`` still accepting the legacy constructor (``plugins=`` deprecated, functional)
- ``auto_create_session=True`` still honored on every constructor site
- ``BaseNode.name`` requiring ``str.isidentifier()``
"""

from __future__ import annotations

import inspect

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import FunctionTool
from google.adk.workflow import BaseNode, DEFAULT_ROUTE, Edge, JoinNode, START, Workflow


def test_public_workflow_exports():
    """BaseNode/DEFAULT_ROUTE resolve from the public package, not privates."""
    assert DEFAULT_ROUTE == "__DEFAULT__"
    # START is a sentinel node; Edge/JoinNode/Workflow construct.
    assert isinstance(START, BaseNode)


def test_base_node_name_rejects_non_identifiers():
    """ADK validates BaseNode.name with isidentifier().

    Note: the validator accepts keywords ('class' IS an identifier), but our
    generated names are always ``{prefix}_{safe}`` — 'tool_class' is not a
    keyword — so keywords are unreachable. The breaking risk is the reverse:
    if ADK tightens the validator (e.g. isidentifier + not keyword), names we
    emit today could be rejected. This test documents both sides.
    """
    import keyword

    class _Probe(BaseNode):
        pass

    _Probe(name="class", description="")  # accepted: isidentifier() only
    _Probe(name="tool_class", description="")
    try:
        _Probe(name="123abc", description="")
    except Exception:
        pass
    else:
        raise AssertionError("BaseNode accepted '123abc' — validator changed")

    from app.services.compiler import _safe_adk_name

    for node_id in ["class", "if", "def", "123", "my-node!", ""]:
        for prefix in ["tool", "calc", "transform"]:
            name = _safe_adk_name(node_id, prefix)
            assert name.isidentifier(), name
            assert not keyword.iskeyword(name), name


def test_function_tool_declaration_contract():
    """FunctionTool + custom _get_declaration override still works."""
    from google.genai import types

    from app.services.agent_tools import AgentFunctionTool, AgentToolState

    state = AgentToolState(
        node_id="n1", context={}, max_iterations=3, token_budget=1000
    )
    schema = {
        "type": "object",
        "properties": {"input": {"type": "string"}},
        "required": ["input"],
        "additionalProperties": False,
    }

    async def _invoke(args, tool_context):
        return "ok"

    tool = AgentFunctionTool("n1_tool", "desc", schema, _invoke, state)
    decl = tool._get_declaration()
    assert isinstance(decl, types.FunctionDeclaration)
    assert decl.name == "n1_tool"
    sig = inspect.signature(tool.run_async)
    params = list(sig.parameters)
    assert params == ["args", "tool_context"]
    assert sig.parameters["args"].kind is inspect.Parameter.KEYWORD_ONLY


def test_runner_legacy_constructor_accepted():
    """2.11 still accepts app_name/node/plugins/auto_create_session (deprecated plugins= OK)."""
    sig = inspect.signature(Runner.__init__)
    params = sig.parameters
    assert "plugins" in params, "plugins= removed — App migration now required"
    assert "auto_create_session" in params
    assert params["auto_create_session"].default is False, (
        "default flipped to False — every Runner( site must pass True explicitly"
    )
    workflow = Workflow(name="probe", edges=[])
    runner = Runner(
        app_name="probe",
        node=workflow,
        session_service=InMemorySessionService(),
        auto_create_session=True,
        plugins=[],
    )
    assert runner.app_name == "probe"
