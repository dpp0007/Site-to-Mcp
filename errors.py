"""One error contract for every tool: the message an agent sees always STARTS with a machine-readable [CODE].

FastMCP validates arguments before our code runs and prefixes failures with "Error executing tool X:", so a bad date used
to surface as raw pydantic text. `install()` wraps the FastMCP tool runner so that
  - bad arguments            -> [BAD_INPUT] <tool>: <field>: what is wrong; expected <hint> (got <value>)
  - our own ToolErrors       -> unchanged, [CODE] first (no "Error executing tool" prefix)
  - anything unexpected      -> [TOOL_ERROR] <tool>: unexpected <Type>; the real detail is logged server side
"""
import logging
import re

from mcp.server.fastmcp.exceptions import ToolError as McpToolError
from mcp.server.fastmcp.tools import base as _base
from pydantic import ValidationError

import tf

log = logging.getLogger("s2m")
_PREFIX = re.compile(r"^Error executing tool \S+:\s*")


def _hint(err: dict) -> str:
    t, ctx = err.get("type", ""), err.get("ctx") or {}
    if t.startswith("date") or "date" in t:
        return "a date as YYYY-MM-DD, e.g. 2026-11-21"
    if t == "missing":
        return "this argument is required"
    if t.startswith("int"):
        return "a whole number"
    if t.startswith("float") or t.startswith("number"):
        return "a number"
    if t.startswith("bool"):
        return "true or false"
    if t.startswith("string") or t.startswith("str"):
        return "text"
    if "ge" in ctx or "le" in ctx or "gt" in ctx or "lt" in ctx:
        return "a number within the allowed range"
    return err.get("msg", "a valid value")


def bad_input_message(tool: str, e: ValidationError) -> str:
    """[BAD_INPUT] naming each bad argument, what was expected and (shortened) what was received."""
    parts = []
    for err in e.errors():
        field = ".".join(str(x) for x in err.get("loc", ())) or "arguments"
        if err.get("type") == "missing":
            parts.append(f"{field} is required")
            continue
        got = repr(err.get("input"))
        got = got if len(got) <= 60 else got[:57] + "..."
        parts.append(f"{field}: expected {_hint(err)} (got {got})")
    return f"[BAD_INPUT] {tool}: " + "; ".join(parts)


def coded(tool: str, exc: Exception) -> str:
    """The client-facing message for an exception raised while running `tool`."""
    cause = exc.__cause__ or exc
    if isinstance(cause, tf.ToolError):
        return str(cause)
    if isinstance(cause, ValidationError) and cause.title.endswith("Arguments"):
        return bad_input_message(tool, cause)
    if isinstance(cause, McpToolError) and str(cause).lstrip().startswith("["):
        return str(cause)
    log.warning("tool %s failed unexpectedly: %r", tool, cause, exc_info=cause)
    return f"[TOOL_ERROR] {tool}: unexpected {type(cause).__name__}; this is a server bug, not your input. Retry once, then report it"


_installed = False


def install() -> None:
    """Idempotent: wrap FastMCP's Tool.run once."""
    global _installed
    if _installed:
        return
    original = _base.Tool.run

    async def run(self, arguments, context=None, convert_result=False):
        try:
            return await original(self, arguments, context, convert_result)
        except McpToolError as e:
            raise McpToolError(_PREFIX.sub("", coded(self.name, e))) from e.__cause__

    _base.Tool.run = run
    _installed = True
