"""robots.txt gate: a tool only runs on a URL the site allows automated clients to read."""
import urllib.request
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import tf

UA = "site-to-mcp"
_rp: dict[str, RobotFileParser | None] = {}


def _load(origin: str) -> RobotFileParser | None:
    """Parsed robots.txt, or None when the site has none / it can't be fetched (treated as 'no rules')."""
    if origin not in _rp:
        rp = RobotFileParser()
        try:
            with urllib.request.urlopen(urllib.request.Request(origin + "/robots.txt", headers={"User-Agent": UA}), timeout=10) as r:
                rp.parse(r.read().decode("utf-8", "replace").splitlines())
            _rp[origin] = rp
        except Exception:
            _rp[origin] = None
    return _rp[origin]


def check(url: str) -> tuple[bool, str]:
    """(allowed, reason). Unknown robots.txt = allowed, but the reason says so."""
    u = urlsplit(url)
    origin = f"{u.scheme}://{u.netloc}"
    rp = _load(origin)
    if rp is None:
        return True, "no robots.txt reachable (no rules published)"
    path = u.path + (f"?{u.query}" if u.query else "")
    ok = rp.can_fetch(UA, url) and rp.can_fetch("*", url)
    delay = rp.crawl_delay(UA) or rp.crawl_delay("*")
    return ok, f"robots.txt {'allows' if ok else 'DISALLOWS'} {path or '/'}" + (f" (crawl-delay {delay}s)" if delay else "")


def require(url: str) -> None:
    ok, why = check(url)
    if not ok:
        raise tf.BlockedError(f"{url}: {why}. Set `respect_robots: false` on the tool only if you have the site owner's permission.")
