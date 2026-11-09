"""Turns sites/*.yaml into typed MCP tools. A spec = one site; each tool = url template + goal + output shape."""
import datetime
import importlib
import inspect
import json
import re
from pathlib import Path
from typing import Callable
from urllib.parse import quote_plus

import yaml
from pydantic import ValidationError, create_model

import robots
import tf
from tf import BadInputError, NotFoundError, SiteChangedError

TYPES = {"string": str, "integer": int, "number": float, "boolean": bool, "date": datetime.date}  # date = ISO yyyy-mm-dd, validated
MODES = {"agent", "fetch", "code"}
RUN_CACHE_TTL = 600  # default seconds an agent tool result is reused


def _py(name: str, v):
    """Spec shape -> python type. 'string' | 'string?' | [shape] | {field: shape}."""
    if isinstance(v, str):
        t = v.rstrip("?")
        if t not in TYPES:
            raise ValueError(f"unknown type {v!r}")
        return (TYPES[t] | None) if v.endswith("?") else TYPES[t]
    if isinstance(v, list):
        return list[_py(name, v[0])]
    return create_model(name, **{k: (_py(name + k.title(), t), None if str(t).endswith("?") else ...)
                                 for k, t in v.items()})


def _json(v) -> dict:
    if isinstance(v, str):
        t = v.rstrip("?")
        return {"type": "string", "format": "date"} if t == "date" else {"type": t}
    if isinstance(v, list):
        return {"type": "array", "items": _json(v[0])}
    return {"type": "object", "properties": {k: _json(t) for k, t in v.items()},
            "required": [k for k, t in v.items() if not str(t).endswith("?")]}


def _render(tpl: str, args: dict, url=False) -> str:
    """{name}, {name|before:.} and {name|lower} / {name|raw} (unquoted) placeholders; values are url-quoted inside urls."""
    def sub(m):
        val = str(args[m.group(1)])
        if m.group(2) == "lower":
            val = val.lower()
        elif m.group(2) == "raw":
            return val
        elif m.group(2):
            val = val.split(m.group(2)[7:])[0]
        return quote_plus(val) if url else val
    return re.sub(r"\{(\w+)(?:\|(lower|raw|before:.))?\}", sub, tpl)


def _collect(data, path: list[str]) -> list:
    if not path:
        return data if isinstance(data, list) else [data]
    if isinstance(data, list):
        return [x for i in data for x in _collect(i, path)]
    return _collect(data.get(path[0]), path[1:]) if isinstance(data, dict) else []


def check(data: dict, expect: list[str]) -> None:
    """Health expectations: 'items>=1' (list length) or 'items.title~algorithm' (any value contains)."""
    for e in expect:
        if ">=" in e:
            p, n = e.split(">=")
            got = _collect(data, p.split("."))
            if len(got) < int(n):
                raise SiteChangedError(f"expected {e}, got {len(got)}")
        else:
            p, s = e.split("~", 1)
            if not any(s.lower() in str(v).lower() for v in _collect(data, p.split("."))):
                raise SiteChangedError(f"expected {p} to contain {s!r}")


class Tool:
    def __init__(self, site: str, t: dict):
        for k in ("name", "description", "url", "mode", "output"):
            if k not in t:
                raise ValueError(f"{site}: tool missing {k!r}: {t.get('name')}")
        if t["mode"] not in MODES:
            raise ValueError(f"{site}.{t['name']}: mode must be one of {MODES}")
        if t["mode"] == "agent" and "goal" not in t:
            raise ValueError(f"{site}.{t['name']}: agent tool needs a goal")
        if t["mode"] == "fetch" and "parser" not in t:
            raise ValueError(f"{site}.{t['name']}: fetch tool needs parser 'module:function'")
        if t["mode"] == "code" and "handler" not in t:
            raise ValueError(f"{site}.{t['name']}: code tool needs handler 'module:function'")
        self.site, self.t, self.name = site, t, t["name"]
        self.inputs = t.get("inputs", {})
        self.model = create_model(
            self.name.title().replace("_", ""),
            source_url=(str, ...), **{k: (_py(k.title(), v), None if str(v).endswith("?") else ...)
                                      for k, v in t["output"].items()})
        self.schema = _json(t["output"])
        if t.get("found_field"):
            self.schema["properties"][t["found_field"]] = {"type": "boolean"}
            self.schema["required"] = [t["found_field"]]
        self.health = t.get("health")

    def run(self, **args):
        self._validate_inputs(args)
        if self.t["mode"] != "agent":
            return self._run(**args)
        return tf.with_retries(lambda: self._run(**args))  # agent output is non-deterministic: retry, then fail loudly

    def _validate_inputs(self, args: dict) -> None:
        for k, v in self.inputs.items():
            pat = v.get("pattern") if isinstance(v, dict) else None
            if pat and not re.fullmatch(pat, str(args.get(k, v.get("default", "")))):
                raise BadInputError(f"{self.name}: {k}={args.get(k)!r} must match /{pat}/")

    def _extract(self, url: str, args: dict) -> dict:
        t, name = self.t, self.name
        if t.get("precheck"):  # cheap credit-free Fetch: unknown page -> NotFoundError before any agent run
            try:
                tf.fetch_page(url)
            except SiteChangedError:
                pass
        if t["mode"] == "agent":
            data = tf.agent_json(name, url, _render(t["goal"], args), self.schema)
        elif t["mode"] == "fetch":
            mod, fn = t["parser"].split(":")
            data = getattr(importlib.import_module(mod), fn)(tf.fetch_text(url, t.get("page_ttl", 0)), args)
        else:
            mod, fn = t["handler"].split(":")
            data = getattr(importlib.import_module(mod), fn)(args)
        ff = t.get("found_field")
        if ff:
            data = dict(data)
            found = data.pop(ff, None)
            if found is None:  # the 'found' flag itself is missing -> output shape broke, not "no such thing"
                raise SiteChangedError(f"{name}: result has no '{ff}' flag; page layout may have changed")
            if not found:
                raise NotFoundError(f"{name}: nothing found for {args}")
        return data

    def _run(self, **args):
        t, name = self.t, self.name
        url = _render(t["url"], args, url=True)
        if t.get("respect_robots", True):
            robots.require(url)
        ttl = t.get("cache_ttl", RUN_CACHE_TTL if t["mode"] == "agent" else 0)
        data = tf.cached(f"run|{name}|{json.dumps(args, sort_keys=True, default=str)}", ttl,
                         lambda: self._extract(url, args))
        if "limit" in args:
            data = {k: v[:args["limit"]] if isinstance(v, list) else v for k, v in data.items()}
        try:
            out = self.model.model_validate({**data, "source_url": url})
        except ValidationError as e:
            raise SiteChangedError(f"{name}: result no longer matches expected shape ({e.error_count()} errors) at {url}") from e
        dump = out.model_dump()
        for f in t.get("nonempty", []):
            if not dump.get(f):
                raise NotFoundError(f"{name}: '{f}' came back empty for {args}; the page is missing or has changed")
        lists = [v for v in dump.values() if isinstance(v, list)]
        if lists and not any(lists) and not t.get("allow_empty"):
            raise SiteChangedError(f"{name}: empty result at {url}; page layout may have changed")
        return out

    def as_function(self) -> Callable:
        def order(kv):  # params with defaults last
            return isinstance(kv[1], dict) and "default" in kv[1]
        params = []
        for k, v in sorted(self.inputs.items(), key=order):
            typ = v["type"] if isinstance(v, dict) else v
            default = v["default"] if isinstance(v, dict) and "default" in v else inspect.Parameter.empty
            params.append(inspect.Parameter(k, inspect.Parameter.POSITIONAL_OR_KEYWORD,
                                            default=default, annotation=_py(k, typ)))

        def fn(**kw):
            return self.run(**kw)
        fn.__name__, fn.__doc__ = self.name, self.t["description"]
        fn.__signature__ = inspect.Signature(params, return_annotation=self.model)
        fn.__annotations__ = {p.name: p.annotation for p in params} | {"return": self.model}
        return fn


def load_tools(directory: str | Path) -> list[Tool]:
    tools: list[Tool] = []
    for f in sorted(Path(directory).glob("*.yaml")):
        spec = yaml.safe_load(f.read_text(encoding="utf-8"))
        tools += [Tool(spec["site"], t) for t in spec["tools"]]
    names = [t.name for t in tools]
    if len(set(names)) != len(names):
        raise ValueError(f"duplicate tool names: {sorted({n for n in names if names.count(n) > 1})}")
    if not tools:
        raise ValueError(f"no tools found in {directory}")
    return tools
