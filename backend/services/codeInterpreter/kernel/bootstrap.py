#!/usr/bin/env python3
"""
VANI Code Interpreter — restricted Python kernel.

Protocol (newline-delimited JSON over stdin/stdout):
  → {"cmd":"execute","id":"...","code":"...","timeout_ms":30000}
  → {"cmd":"ping","id":"..."}
  → {"cmd":"shutdown","id":"..."}
  ← {"type":"stdout"|"stderr"|"result"|"plot"|"file"|"error"|"done","id":"...","data":...}

Security:
  - Blocks networking (socket / urllib / requests / http.client)
  - Blocks subprocess / os.system / pty / ctypes / multiprocessing spawn
  - Restricts filesystem to WORKSPACE
  - Applies CPU / memory rlimits when available
  - Matplotlib uses Agg; plots auto-saved under plots/
"""

from __future__ import annotations

import ast
import base64
import builtins
import io
import json
import os
import signal
import sys
import time
import traceback
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any, Dict, Optional

WORKSPACE = Path(os.environ.get("VANI_CI_WORKSPACE", os.getcwd())).resolve()
MEMORY_MB = int(os.environ.get("VANI_CI_MEMORY_MB", "512"))
CPU_SECONDS = int(os.environ.get("VANI_CI_CPU_SECONDS", "30"))
MAX_OUTPUT = int(os.environ.get("VANI_CI_MAX_OUTPUT_CHARS", "200000"))
MAX_PLOTS = int(os.environ.get("VANI_CI_MAX_PLOTS", "20"))

INPUTS = WORKSPACE / "inputs"
OUTPUTS = WORKSPACE / "outputs"
PLOTS = WORKSPACE / "plots"

for d in (INPUTS, OUTPUTS, PLOTS):
    d.mkdir(parents=True, exist_ok=True)

os.chdir(WORKSPACE)

# ---------------------------------------------------------------------------
# Resource limits
# ---------------------------------------------------------------------------
try:
    import resource

    soft_mem = MEMORY_MB * 1024 * 1024
    try:
        resource.setrlimit(resource.RLIMIT_AS, (soft_mem, soft_mem))
    except (ValueError, OSError):
        pass
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (CPU_SECONDS, CPU_SECONDS + 5))
    except (ValueError, OSError):
        pass
    try:
        resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
    except (ValueError, OSError, AttributeError):
        pass
    try:
        # No core dumps
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    except (ValueError, OSError):
        pass
except ImportError:
    resource = None  # type: ignore


# ---------------------------------------------------------------------------
# Network / shell lockdown
# ---------------------------------------------------------------------------
_BLOCKED_MODULES = frozenset(
    {
        "socket",
        "ssl",
        "_socket",
        "http",
        "http.client",
        "http.server",
        "urllib",
        "urllib.request",
        "urllib.error",
        "urllib3",
        "requests",
        "aiohttp",
        "httpx",
        "ftplib",
        "smtplib",
        "telnetlib",
        "xmlrpc",
        "multiprocessing",
        "subprocess",
        "pty",
        "ctypes",
        "cffi",
        "pickle",
        "shelve",
        "pathlib._local",  # not always present; harmless
    }
)


class _BlockedModule:
    def __init__(self, name: str):
        self.__name__ = name

    def __getattr__(self, item: str):
        raise RuntimeError(f"Networking / dangerous module '{self.__name__}' is disabled in the sandbox")


_real_import = builtins.__import__


def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):  # noqa: A002
    root = name.split(".")[0]
    if name in _BLOCKED_MODULES or root in {
        "socket",
        "ssl",
        "subprocess",
        "pty",
        "ctypes",
        "multiprocessing",
        "requests",
        "urllib3",
        "aiohttp",
        "httpx",
        "ftplib",
        "smtplib",
    }:
        raise ImportError(f"Import of '{name}' is blocked in the VANI sandbox")
    return _real_import(name, globals, locals, fromlist, level)


builtins.__import__ = _safe_import  # type: ignore


# Neutralize common escape hatches after import
import os as _os

_os.system = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("os.system is disabled"))  # type: ignore
_os.popen = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("os.popen is disabled"))  # type: ignore
_os.execv = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("os.exec* is disabled"))  # type: ignore
_os.execve = _os.execv  # type: ignore
_os.execl = _os.execv  # type: ignore
_os.execle = _os.execv  # type: ignore
_os.execlp = _os.execv  # type: ignore
_os.execvp = _os.execv  # type: ignore
_os.execvpe = _os.execv  # type: ignore
_os.fork = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("os.fork is disabled"))  # type: ignore
_os.forkpty = _os.fork  # type: ignore
_os.spawn = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("os.spawn is disabled"))  # type: ignore
_os.spawnl = _os.spawn  # type: ignore
_os.spawnle = _os.spawn  # type: ignore
_os.spawnlp = _os.spawn  # type: ignore
_os.spawnlpe = _os.spawn  # type: ignore
_os.spawnv = _os.spawn  # type: ignore
_os.spawnve = _os.spawn  # type: ignore
_os.spawnvp = _os.spawn  # type: ignore
_os.spawnvpe = _os.spawn  # type: ignore


def _guard_path(path: Any) -> str:
    p = Path(str(path)).resolve()
    try:
        p.relative_to(WORKSPACE)
    except ValueError as exc:
        raise PermissionError(f"Path outside sandbox workspace: {path}") from exc
    return str(p)


# Soft-wrap open()
_real_open = builtins.open


def _safe_open(file, *args, **kwargs):
    if isinstance(file, (str, bytes, os.PathLike)):
        file = _guard_path(file)
    return _real_open(file, *args, **kwargs)


builtins.open = _safe_open  # type: ignore


# ---------------------------------------------------------------------------
# Display / plotting helpers
# ---------------------------------------------------------------------------
_plot_counter = 0
_USER_NS: Dict[str, Any] = {"__name__": "__main__"}


def _setup_matplotlib():
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        def _autosave_show(*args, **kwargs):
            global _plot_counter
            if _plot_counter >= MAX_PLOTS:
                plt.clf()
                return
            _plot_counter += 1
            name = f"plot_{_plot_counter}.png"
            dest = PLOTS / name
            fig = plt.gcf()
            fig.savefig(dest, bbox_inches="tight", dpi=120)
            plt.clf()
            _emit(
                {
                    "type": "plot",
                    "path": f"plots/{name}",
                    "mimeType": "image/png",
                    "name": name,
                }
            )

        plt.show = _autosave_show  # type: ignore
        _USER_NS["plt"] = plt
        _USER_NS["matplotlib"] = matplotlib
    except Exception:
        pass


def _preload_libs():
    try:
        import numpy as np

        _USER_NS["np"] = np
        _USER_NS["numpy"] = np
    except Exception:
        pass
    try:
        import pandas as pd

        _USER_NS["pd"] = pd
        _USER_NS["pandas"] = pd
    except Exception:
        pass
    try:
        import openpyxl  # noqa: F401

        _USER_NS["openpyxl"] = openpyxl
    except Exception:
        pass
    try:
        from reportlab.pdfgen import canvas as rl_canvas  # noqa: F401

        _USER_NS["reportlab_canvas"] = rl_canvas
    except Exception:
        pass
    try:
        from PIL import Image

        _USER_NS["Image"] = Image
    except Exception:
        pass
    _setup_matplotlib()
    _USER_NS["WORKSPACE"] = str(WORKSPACE)
    _USER_NS["INPUTS"] = str(INPUTS)
    _USER_NS["OUTPUTS"] = str(OUTPUTS)
    _USER_NS["PLOTS"] = str(PLOTS)


_preload_libs()


# ---------------------------------------------------------------------------
# Protocol helpers
# ---------------------------------------------------------------------------
_current_id: Optional[str] = None
_out_lock_writes = True


def _emit(payload: Dict[str, Any]) -> None:
    if _current_id and "id" not in payload:
        payload["id"] = _current_id
    sys.__stdout__.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.__stdout__.flush()


class _Stream(io.TextIOBase):
    def __init__(self, kind: str):
        self.kind = kind
        self._buf = ""

    def write(self, s: str) -> int:  # type: ignore[override]
        if not s:
            return 0
        self._buf += s
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            data = (line + "\n")[:MAX_OUTPUT]
            _emit({"type": self.kind, "data": data})
        return len(s)

    def flush(self) -> None:
        if self._buf:
            _emit({"type": self.kind, "data": self._buf[:MAX_OUTPUT]})
            self._buf = ""


def _truncate(s: str) -> str:
    if len(s) <= MAX_OUTPUT:
        return s
    return s[: MAX_OUTPUT - 32] + "\n...[truncated]..."


def _last_expr_value(code: str, ns: Dict[str, Any]) -> Optional[str]:
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None
    if not tree.body:
        return None
    last = tree.body[-1]
    if not isinstance(last, ast.Expr):
        return None
    # Re-exec as expression to capture display value
    expr = ast.Expression(last.value)
    try:
        value = eval(compile(expr, "<cell>", "eval"), ns, ns)  # noqa: S307
    except Exception:
        return None
    if value is None:
        return None
    try:
        return _truncate(repr(value))
    except Exception:
        return "<unreprable>"


_alarm_fired = False


def _on_alarm(signum, frame):  # noqa: ARG001
    global _alarm_fired
    _alarm_fired = True
    raise TimeoutError("Execution timed out")


def execute_code(code: str, timeout_ms: int) -> None:
    global _alarm_fired
    _alarm_fired = False
    stdout = _Stream("stdout")
    stderr = _Stream("stderr")

    # Soft wall-clock timeout via SIGALRM when available
    use_alarm = hasattr(signal, "SIGALRM") and timeout_ms > 0
    if use_alarm:
        signal.signal(signal.SIGALRM, _on_alarm)
        signal.setitimer(signal.ITIMER_REAL, max(0.05, timeout_ms / 1000.0))

    try:
        with redirect_stdout(stdout), redirect_stderr(stderr):
            compiled = compile(code, "<cell>", "exec")
            exec(compiled, _USER_NS, _USER_NS)  # noqa: S102
            preview = _last_expr_value(code, _USER_NS)
            if preview is not None:
                _emit({"type": "result", "data": preview})
    except TimeoutError as exc:
        _emit({"type": "error", "data": str(exc)})
    except Exception:
        _emit({"type": "error", "data": _truncate(traceback.format_exc())})
    finally:
        if use_alarm:
            signal.setitimer(signal.ITIMER_REAL, 0)
        stdout.flush()
        stderr.flush()
        # Capture any unsaved matplotlib figures
        try:
            import matplotlib.pyplot as plt

            if plt.get_fignums():
                plt.show()
        except Exception:
            pass


def main() -> None:
    global _current_id
    _emit({"type": "ready", "data": "kernel_ready", "workspace": str(WORKSPACE)})

    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            _emit({"type": "error", "data": "invalid_json"})
            continue

        cmd = msg.get("cmd")
        _current_id = msg.get("id")

        if cmd == "ping":
            _emit({"type": "pong", "data": "ok"})
            continue

        if cmd == "shutdown":
            _emit({"type": "done", "data": "shutdown"})
            break

        if cmd == "reset":
            _USER_NS.clear()
            _USER_NS["__name__"] = "__main__"
            _preload_libs()
            _emit({"type": "done", "data": "reset"})
            continue

        if cmd == "execute":
            code = msg.get("code") or ""
            timeout_ms = int(msg.get("timeout_ms") or 30_000)
            if not isinstance(code, str) or not code.strip():
                _emit({"type": "error", "data": "empty_code"})
                _emit({"type": "done", "data": "failed"})
                continue
            t0 = time.time()
            execute_code(code, timeout_ms)
            _emit(
                {
                    "type": "done",
                    "data": "ok",
                    "duration_ms": int((time.time() - t0) * 1000),
                }
            )
            continue

        _emit({"type": "error", "data": f"unknown_cmd:{cmd}"})

    sys.exit(0)


if __name__ == "__main__":
    main()
