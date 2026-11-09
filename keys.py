"""Create an API key.  python keys.py new <name>
Prints the key ONCE (give it to the user) and the `name:hash` entry to add to API_KEYS on Render.
Only the hash is stored on the server, so a leaked env var does not leak usable keys."""
import hashlib
import secrets
import sys

if len(sys.argv) == 3 and sys.argv[1] == "new" and sys.argv[2].replace("-", "").replace("_", "").isalnum():
    key = "s2m_" + secrets.token_urlsafe(32)
    print(f"API key (share with the user, shown once):\n  {key}\n\nAdd to API_KEYS (comma-separated list):\n  "
          f"{sys.argv[2]}:{hashlib.sha256(key.encode()).hexdigest()}")
else:
    sys.exit(__doc__)
