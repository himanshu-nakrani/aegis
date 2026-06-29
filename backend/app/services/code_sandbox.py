"""Restricted Python execution for the Code node (n8n-style)."""

from __future__ import annotations

import ast
import json
from typing import Any

MAX_CODE_LENGTH = 4000

FORBIDDEN_NAMES = frozenset(
    {
        "open",
        "exec",
        "eval",
        "compile",
        "__import__",
        "getattr",
        "setattr",
        "delattr",
        "globals",
        "locals",
        "vars",
        "dir",
        "help",
        "breakpoint",
        "memoryview",
        "bytearray",
    }
)

SAFE_BUILTINS: dict[str, Any] = {
    "abs": abs,
    "min": min,
    "max": max,
    "len": len,
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
    "list": list,
    "dict": dict,
    "tuple": tuple,
    "set": set,
    "round": round,
    "sum": sum,
    "sorted": sorted,
    "enumerate": enumerate,
    "zip": zip,
    "range": range,
    "any": any,
    "all": all,
    "isinstance": isinstance,
    "True": True,
    "False": False,
    "None": None,
}


class _SafetyVisitor(ast.NodeVisitor):
    def visit_Import(self, node: ast.Import) -> None:
        raise ValueError("import statements are not allowed")

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        raise ValueError("import statements are not allowed")

    def visit_Call(self, node: ast.Call) -> None:
        if isinstance(node.func, ast.Name) and node.func.id in FORBIDDEN_NAMES:
            raise ValueError(f"'{node.func.id}' is not allowed in code nodes")
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if node.attr.startswith("__"):
            raise ValueError("dunder attribute access is not allowed")
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        if node.id in FORBIDDEN_NAMES:
            raise ValueError(f"'{node.id}' is not allowed in code nodes")
        self.generic_visit(node)


def validate_code_safety(code: str) -> None:
    if len(code) > MAX_CODE_LENGTH:
        raise ValueError(f"code exceeds {MAX_CODE_LENGTH} characters")
    tree = ast.parse(code, mode="exec")
    _SafetyVisitor().visit(tree)


def run_sandboxed_code(code: str, context: dict[str, Any], node_input: str) -> str:
    validate_code_safety(code)
    local_vars: dict[str, Any] = {
        "input": context.get("input", {}),
        "steps": context.get("steps", {}),
        "last_output": context.get("last_output", node_input),
        "memory": context.get("memory", {}),
        "result": None,
    }
    exec(
        code,
        {"__builtins__": SAFE_BUILTINS, "json": json},
        local_vars,
    )
    result = local_vars.get("result")
    if result is None:
        return str(node_input)
    if isinstance(result, (dict, list)):
        return json.dumps(result, ensure_ascii=False)
    return str(result)