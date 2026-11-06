"""Code node validation and CPython/WASI execution.

AST restrictions are defense in depth, not an isolation boundary. User code
runs inside Wasmtime in a secret-free, short-lived subprocess using JSON-only
IPC. The guest receives only its input and a read-only Python standard library.
"""

from __future__ import annotations

import ast
import importlib.util
import json
import os
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any

from app.config import settings
from app.services.code_runtime import runtime_paths

MAX_CODE_LENGTH = 4000
CODE_TIMEOUT_SECONDS = 5.0
CODE_MEMORY_BYTES = 256 * 1024 * 1024
CODE_FUEL = 50_000_000_000
CODE_MAX_OUTPUT_BYTES = 1024 * 1024
_SANDBOX_MAX_WORKERS = settings.code_sandbox_max_workers
# Slots are local to each API/worker process and released after the child exits.
_sandbox_slots = threading.BoundedSemaphore(_SANDBOX_MAX_WORKERS)

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

_SAFE_BUILTIN_NAMES = (
    "abs", "min", "max", "len", "str", "int", "float", "bool",
    "list", "dict", "tuple", "set", "round", "sum", "sorted",
    "enumerate", "zip", "range", "any", "all", "isinstance",
)


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
        if node.attr.startswith(("gi_", "cr_", "ag_", "f_", "tb_", "co_")) or node.attr == "mro":
            raise ValueError("interpreter attribute access is not allowed in code nodes")
        if node.attr in ("format", "format_map"):
            # str.format/format_map replacement fields traverse attributes
            # and module globals at runtime past the AST (e.g.
            # "{0.__globals__[os].environ}".format(json.loads)). Rejecting the
            # attribute itself also closes the alias hop (f = "...".format;
            # f(payload)), which a Call-site check cannot see.
            raise ValueError("'str.format'/'str.format_map' is not allowed in code nodes")
        if isinstance(node.value, ast.Name) and node.value.id == "json":
            if node.attr not in {"loads", "dumps"}:
                raise ValueError("only json.loads and json.dumps are allowed")
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

    # Reject immediately when the pool is saturated rather than queueing forever.
    acquired = _sandbox_slots.acquire(blocking=False)
    if not acquired:
        raise ValueError(
            f"Code sandbox is at capacity ({_SANDBOX_MAX_WORKERS} concurrent); "
            "retry after other Code nodes finish."
        )

    try:
        module_path, stdlib_dir = runtime_paths()
        spec = importlib.util.find_spec("wasmtime")
        if spec is None or spec.origin is None:
            raise ValueError("Code sandbox requires the wasmtime dependency")
        package_dir = str(Path(spec.origin).parent.parent)
        payload = json.dumps(
            {
                "code": code,
                "locals": local_vars,
                "node_input": str(node_input),
                "builtins": _SAFE_BUILTIN_NAMES,
                "timeout": CODE_TIMEOUT_SECONDS,
                "memory_bytes": CODE_MEMORY_BYTES,
                "fuel": CODE_FUEL,
                "output_limit": CODE_MAX_OUTPUT_BYTES,
            },
            ensure_ascii=False,
        ).encode("utf-8")
        identity: dict[str, Any] = {}
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            import pwd

            nobody = pwd.getpwnam("nobody")
            identity = {"user": nobody.pw_uid, "group": nobody.pw_gid, "extra_groups": []}
        # -I -S skips user paths, site hooks and PYTHON* environment configuration.
        # The standalone runner loads only the explicitly named Wasmtime package;
        # it never imports app settings, database handles or workflow objects.
        with subprocess.Popen(
            [
                sys.executable, "-I", "-S",
                str(Path(__file__).with_name("code_sandbox_worker.py")),
                package_dir, str(module_path), str(stdlib_dir),
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={},
            cwd=module_path.parent,
            close_fds=True,
            **identity,
        ) as proc:
            try:
                stdout, stderr = proc.communicate(payload, timeout=CODE_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired as exc:
                proc.kill()
                proc.communicate()
                raise ValueError(
                    f"Code execution timed out after {CODE_TIMEOUT_SECONDS:g} seconds"
                ) from exc
            if proc.returncode != 0:
                error = stderr.decode("utf-8", errors="replace").strip()
                raise ValueError(error or "Code execution produced no result")
        try:
            response = json.loads(stdout)
        except (ValueError, UnicodeError) as exc:
            raise ValueError("Code execution produced an invalid result") from exc
        if not isinstance(response, dict):
            raise ValueError("Code execution produced an invalid result")
        if response.get("status") != "ok":
            raise ValueError(str(response.get("error", "Code execution failed")))
        output = response.get("output")
        if not isinstance(output, str):
            raise ValueError("Code execution produced an invalid result")
        return output
    finally:
        _sandbox_slots.release()
