"""robots.txt gate: a tool only runs on a URL the site allows automated clients to read.
The fetch happens from OUR server, so it only talks to public addresses (no redirects into private networks)."""
import ipaddress
import socket
import urllib.request
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import tf

UA = "site-to-mcp"
MAX_CACHE = 500
_rp: dict[str, RobotFileParser | None] = {}


def _public(host: str) -> bool:
    """True when every address the host resolves to is a public one."""
    try:
        return all(ipaddress.ip_address(i[4][0]).is_global for i in socket.getaddrinfo(host, None))
    except (OSError, ValueError):
        return False


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlsplit(newurl).scheme not in ("http", "https") or not _public(urlsplit(newurl).hostname or ""):
            raise OSError("redirect to a non-public address")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_open = urllib.request.build_opener(_SafeRedirect).open


def _load(origin: str) -> RobotFileParser | None:
    """Parsed robots.txt, or None when the site has none / it can't be fetched (treated as 'no rules')."""
    if origin not in _rp:
        if len(_rp) >= MAX_CACHE:
            _rp.pop(next(iter(_rp)))  # oldest out: the cache cannot grow without bound
        rp = RobotFileParser()
        try:
            with _open(urllib.request.Request(origin + "/robots.txt", headers={"User-Agent": UA}), timeout=10) as r:
                rp.parse(r.read(512_000).decode("utf-8", "replace").splitlines())
            _rp[origin] = rp
        except Exception:
            _rp[origin] = None
    return _rp[origin]


def check(url: str) -> tuple[bool, str]:
    """(allowed, reason). Unknown robots.txt = allowed, but the reason says so."""
    u = urlsplit(url)
    if not _public(u.hostname or ""):
        return False, "host does not resolve to a public address"
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
