# Deploy: Render (API) + Vercel (website). No Docker.

```
Claude / Cursor / ChatGPT / curl / s2m CLI  --Bearer key-->  Render: python server.py --http  --TinyFish key (server only)-->  TinyFish
Browser  -->  Vercel: static site (web/)  --Test connection, CORS allow-list-->  Render
```

## 1. Create keys (once)
```bash
python keys.py new alice          # prints the key ONCE and a  alice:<sha256>  line
```
Give `s2m_...` to the user. Put the `name:hash` line in Render's `API_KEYS` (comma-separate several). Revoke a key by deleting its entry and redeploying. Only hashes live on the server.

## 2. Render (API)
1. Push this folder to GitHub. Render > **New > Blueprint** > pick the repo (`render.yaml` is picked up), or New > Web Service with: runtime **Python**, build `pip install -r requirements.txt`, start `python server.py --http`, health check `/api/health`.
2. Environment variables (dashboard, never in git):

| Variable | Value |
|---|---|
| `TINYFISH_API_KEY` | your TinyFish key (secret, server side only) |
| `API_KEYS` | `alice:<sha256>,bob:<sha256>` |
| `ALLOWED_ORIGINS` | your Vercel URL, e.g. `https://site-to-mcp.vercel.app` (no trailing slash) |
| `ALLOWED_HOSTS` | your Render hostname, e.g. `site-to-mcp.onrender.com` (DNS-rebinding protection) |
| `PUBLIC_URL` | optional: `https://site-to-mcp.onrender.com`, used in `/api/openapi.json` |
| `RATE_PER_MINUTE`, `RATE_PER_DAY` | per-key limits (default 30 / 300) |

The server refuses to start with no `API_KEYS`. Free plans sleep and cold-start, so use a paid instance for a real product. Rate-limit counters are in memory, so run one instance (or add a shared store before scaling out).

## 3. Vercel (website)
1. New Project > import the repo, **Root Directory: `web`** (framework Vite is detected; `vercel.json` adds SPA routing and security headers).
2. Environment variables: `VITE_API_URL` = your Render URL, `VITE_CONTACT_EMAIL` (shown on the privacy, terms and security pages), optional `VITE_OPERATOR_NAME`, `VITE_REPO_URL`.
3. If your API is not on `*.onrender.com`, edit `connect-src` in `web/vercel.json`.

## 4. Check it
```bash
curl https://YOUR.onrender.com/api/health
curl -s https://YOUR.onrender.com/api/tools/list_python_events -H "Authorization: Bearer s2m_..." -H "Content-Type: application/json" -d '{"limit":2}'
```
Then open the website > Setup, enter the URL and key, press **Test connection**.

## Connect clients
| Client | How |
|---|---|
| Claude Code | `claude mcp add --transport http site-to-mcp https://YOUR.onrender.com/mcp --header "Authorization: Bearer s2m_..."` |
| Claude Desktop | `mcp-remote` bridge in `claude_desktop_config.json` (the Setup page generates it) |
| Cursor | `.cursor/mcp.json` with `url` + `headers` |
| ChatGPT | custom GPT Action, import `https://YOUR.onrender.com/api/openapi.json`, auth: API key, Bearer |
| Terminal | `curl`, or `s2m` (`cli.py`, standard library only) with `S2M_URL` and `S2M_KEY` |

## What stays server-side
TinyFish key; API key list (hashed); rate limiting; robots.txt enforcement; request validation; the result cache. The website holds no secrets: a key typed into Setup lives in page memory only.
