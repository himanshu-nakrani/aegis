"""Standalone trusted Wasmtime runner; never import Aegis application modules.

Native Python handles only JSON and the trusted, precompiled WASI interpreter.
Every invocation gets a new VM/store; untrusted Python executes only in that VM.
"""

from __future__ import annotations

import errno
import json
import math
import os
import sys
import tempfile
import threading
from typing import Any


_GUEST_SOURCE = """
import builtins
import json
import sys

class SafeJsonNamespace:
    @staticmethod
    def loads(value, *args, **kwargs):
        return json.loads(value, *args, **kwargs)

    @staticmethod
    def dumps(value, *args, **kwargs):
        return json.dumps(value, *args, **kwargs)

payload = json.load(sys.stdin)
local_vars = payload["locals"]
safe_builtins = {name: getattr(builtins, name) for name in payload["builtins"]}
try:
    exec(payload["code"], {"__builtins__": safe_builtins, "json": SafeJsonNamespace()}, local_vars)
    result = local_vars.get("result")
    if result is None:
        output = payload["node_input"]
    elif isinstance(result, (dict, list)):
        output = json.dumps(result, ensure_ascii=False)
    else:
        output = str(result)
    response = {"status": "ok", "output": output}
except Exception as exc:
    response = {"status": "err", "error": type(exc).__name__ + ": " + str(exc)}
print(json.dumps(response, ensure_ascii=False))
"""


def _configure_process(timeout: float) -> None:
    # CPython may synthesize LC_CTYPE on startup even with execve(env={}).
    os.environ.clear()
    if os.name != "posix":
        return
    import resource

    limits = (
        (resource.RLIMIT_CPU, max(1, math.ceil(timeout) + 1)),
        (resource.RLIMIT_CORE, 0),
        (resource.RLIMIT_FSIZE, 64 * 1024 * 1024),
    )
    for kind, maximum in limits:
        _, hard = resource.getrlimit(kind)
        if hard != resource.RLIM_INFINITY:
            maximum = min(maximum, hard)
        resource.setrlimit(kind, (maximum, maximum))


def _run_wasi(
    module_path: str,
    stdlib_dir: str,
    source: str,
    stdin: str,
    *,
    timeout: float,
    memory_bytes: int,
    fuel: int,
    output_limit: int = 1024 * 1024,
) -> str:
    from wasmtime import Config, Engine, ExitTrap, Linker, Module, Store, Trap, TrapCode, WasiConfig, WasmtimeError

    config = Config()
    config.consume_fuel = True
    config.epoch_interruption = True
    config.parallel_compilation = False
    engine = Engine(config)
    linker = Linker(engine)
    linker.define_wasi()
    store = Store(engine)
    store.set_fuel(fuel)
    store.set_limits(memory_size=memory_bytes, instances=1, memories=1)
    store.set_epoch_deadline(1)

    stdout = bytearray()
    stderr = bytearray()
    exceeded_output = False

    def capture(target: bytearray, chunk: bytes) -> int:
        nonlocal exceeded_output
        if len(stdout) + len(stderr) + len(chunk) > output_limit:
            exceeded_output = True
            engine.increment_epoch()
            return -errno.EFBIG
        target.extend(chunk)
        return len(chunk)

    # TemporaryFile is kernel-cleaned even when the parent hard-kills the worker.
    with tempfile.TemporaryFile(prefix="aegis-code-input-", mode="w+b") as input_file:
        input_file.write(stdin.encode("utf-8"))
        input_file.seek(0)
        wasi = WasiConfig()
        # PYTHONHOME bootstraps the read-only stdlib, then is removed before user
        # source. No host env, argv, stdio or directories are inherited by WASI.
        wasi.env = [("PYTHONHOME", "/")]
        wasi.argv = ["/python.wasm", "-B", "-S", "-c", "import os\nos.environ.clear()\n" + source]
        wasi.stdin_file = f"/dev/fd/{input_file.fileno()}" if os.name == "posix" else input_file.name
        wasi.stdout_custom = lambda chunk: capture(stdout, chunk)
        wasi.stderr_custom = lambda chunk: capture(stderr, chunk)
        wasi.preopen_dir(stdlib_dir, "/lib", fs_mutable=False)
        store.set_wasi(wasi)
        # Serialized modules contain native machine code. This path is supplied
        # only by offline provisioning of the pinned interpreter, never a node.
        module = Module.deserialize_file(engine, module_path)
        watchdog = threading.Timer(timeout, engine.increment_epoch)
        watchdog.daemon = True
        watchdog.start()
        try:
            instance = linker.instantiate(store, module)
            instance.exports(store)["_start"](store)
        except ExitTrap as exc:
            if exc.code != 0:
                error = stderr.decode("utf-8", errors="replace").strip()
                raise ValueError(error or f"Code execution exited with status {exc.code}") from exc
        except Trap as exc:
            if exceeded_output:
                raise ValueError(f"Code output exceeds {output_limit} bytes") from exc
            if exc.trap_code == TrapCode.INTERRUPT:
                raise ValueError(f"Code execution timed out after {timeout:g} seconds") from exc
            if exc.trap_code == TrapCode.OUT_OF_FUEL:
                raise ValueError("Code execution exceeded the CPU budget") from exc
            raise ValueError("Code execution trapped inside the WASI sandbox") from exc
        except WasmtimeError as exc:
            raise ValueError(f"Code sandbox execution failed: {exc}") from exc
        finally:
            watchdog.cancel()
    if exceeded_output:
        raise ValueError(f"Code output exceeds {output_limit} bytes")
    return stdout.decode("utf-8")


def _main() -> None:
    # -I -S omits site-packages. The parent supplies just the installed Wasmtime
    # package directory; no Python path or executable is accepted from nodes.
    sys.path.append(sys.argv[1])
    payload: dict[str, Any] = json.load(sys.stdin)
    try:
        _configure_process(float(payload["timeout"]))
        output = _run_wasi(
            sys.argv[2], sys.argv[3], _GUEST_SOURCE,
            json.dumps(payload, ensure_ascii=False),
            timeout=float(payload["timeout"]),
            memory_bytes=int(payload["memory_bytes"]),
            fuel=int(payload["fuel"]),
            output_limit=int(payload["output_limit"]),
        )
        response = json.loads(output)
    except Exception as exc:
        response = {"status": "err", "error": f"{type(exc).__name__}: {exc}"}
    # ASCII JSON avoids depending on the native interpreter's empty-env locale.
    sys.stdout.write(json.dumps(response, ensure_ascii=True))


if __name__ == "__main__":
    _main()
