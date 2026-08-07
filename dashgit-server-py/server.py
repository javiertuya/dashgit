#!/usr/bin/env python3
"""Run DashGit locally: static file server for dashgit-web/app plus the
OAuth exchange proxy, listening on http://127.0.0.1:8080 by default

Requires Python 3.7 or later, standard library only, no third party packages.

Usage:
    python3 server.py [port]     # default port 8080

Reads CLIENT_SECRET_<id> / TOKEN_URL_<id> pairs from shell env or .env in this
folder (same format oauth-exchange/server.js expects), see .env.example.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_APP_DIR = ROOT.parent / "dashgit-web" / "app"
ENV_FILE = ROOT / ".env"
HEADER_CONTENT_TYPE = "Content-Type"
CONTENT_TYPE_JSON = "application/json"
VERBOSE = False


def load_env_file(path):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


class ExchangeOutcome:
    """Result of preparing an /exchange request: either an error to return
    to the client (error=True, status/body set) or a forward request to make
    to the authorization server (error=False, token_url/body set)."""

    def __init__(self, error, status=None, body=None, token_url=None, log_message=""):
        self.error = error
        self.status = status
        self.body = body
        self.token_url = token_url
        self.log_message = log_message


def prepare_exchange(payload, environ):
    """Decision logic for the /exchange endpoint: given the request payload and
    an environ mapping, decide whether to forbid the request or build the body
    to forward to the authorization server."""
    grant_type = payload.get("grant_type")
    client_id = payload.get("client_id")

    client_secret = environ.get(f"CLIENT_SECRET_{client_id}")
    token_url = environ.get(f"TOKEN_URL_{client_id}")

    if not client_secret or not token_url:
        return ExchangeOutcome(
            error=True, status=403,
            body={"error": "forbidden", "error_description": "Exchange not allowed"},
            log_message="Can't find a client secret or token url for this client, returning 403 forbidden",
        )

    if grant_type == "authorization_code":
        body = {
            "client_secret": client_secret,
            "client_id": client_id,
            "grant_type": grant_type,
            "redirect_uri": payload.get("redirect_uri"),
            "code": payload.get("code"),
            "code_verifier": payload.get("code_verifier"),
        }
    elif grant_type == "refresh_token":
        body = {
            "client_secret": client_secret,
            "refresh_token": payload.get("refresh_token"),
            "client_id": client_id,
            "grant_type": grant_type,
            "redirect_uri": payload.get("redirect_uri"),
        }
    else:
        return ExchangeOutcome(
            error=True, status=403,
            body={"error": "forbidden", "error_description": "Grant type not supported"},
            log_message=f"Grant type {grant_type} is not supported, returning 403 forbidden",
        )

    return ExchangeOutcome(error=False, token_url=token_url, body=body)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_APP_DIR), **kwargs)

    def log_message(self, fmt, *args):
        if VERBOSE:
            sys.stderr.write(f"[{self.log_date_time_string()}] {fmt % args}\n")

    def do_GET(self):
        if self.path == "/healthcheck":
            self._send_json(200, "OK", as_json=False)
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/exchange":
            self._handle_exchange()
            return
        self.send_error(404)

    def _handle_exchange(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send_json(400, {"error": "bad_request", "error_description": "Invalid JSON body"})
            return

        print(f"Received exchange request: grant_type={payload.get('grant_type')}, "
              f"client_id={payload.get('client_id')}, redirect_uri={payload.get('redirect_uri')}")

        outcome = prepare_exchange(payload, os.environ)
        if outcome.error:
            print(outcome.log_message)
            self._send_json(outcome.status, outcome.body)
            return
        print(f"  Forwarding to {outcome.token_url}")

        req = urllib.request.Request(
            outcome.token_url,
            data=json.dumps(outcome.body).encode(),
            headers={HEADER_CONTENT_TYPE: CONTENT_TYPE_JSON, "Accept": CONTENT_TYPE_JSON},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
        except urllib.error.HTTPError as e:
            print(f"Response is not OK: {e}")
            data = e.read()
        except urllib.error.URLError as e:
            self._send_json(500, {"error": "server_error", "error_description": str(e)})
            return

        self.send_response(200)
        self.send_header(HEADER_CONTENT_TYPE, CONTENT_TYPE_JSON)
        self.end_headers()
        self.wfile.write(data)

    # No CORS headers added as the app and /exchange are served from this same origin. 
    def _send_json(self, status, body, as_json=True):
        self.send_response(status)
        self.send_header(HEADER_CONTENT_TYPE, CONTENT_TYPE_JSON if as_json else "text/plain")
        self.end_headers()
        self.wfile.write((json.dumps(body) if as_json else body).encode())


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description="Run DashGit locally: static file server for dashgit-web/app "
                     "plus the OAuth exchange proxy, both on one port.",
    )
    parser.add_argument(
        "port", nargs="?", type=int, default=8080,
        help="port to listen on (default: 8080, matching dashgit-web/e2e's http-server convention)",
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true",
        help="log every HTTP request (method, path, status)",
    )
    return parser.parse_args(argv)


def main():
    global VERBOSE
    args = parse_args(sys.argv[1:])
    VERBOSE = args.verbose
    load_env_file(ENV_FILE)
    port = args.port
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"DashGit running at http://127.0.0.1:{port}  (serving {WEB_APP_DIR}, exchange proxy at /exchange)")
    try:
        # Plain HTTP is intended: this is a local runner bound to 127.0.0.1,
        # TLS would only add certificate handling with nothing to protect on the loopback
        server.serve_forever()  # NOSONAR
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
