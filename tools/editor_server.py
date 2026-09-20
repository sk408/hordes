#!/usr/bin/env python3
"""HORDES dev-editor saver backend (slice 2) — stdlib only.

Applies exact-string replacements (old/new pairs) to WHITELISTED tuning
files only (the set in tools/tuning_map.md section 7). Everything else 403.

Every write takes a timestamped backup under tools/.backups/ (git-ignored),
then syntax-checks the new bytes with the node module parser
(`node --input-type=module --check` over stdin — plain `node --check`
on .js is vacuous in this tree); on syntax failure the backup
is restored and the request fails 500.

Endpoints:
  GET  /health      -> {"ok": true, ...}
  POST /save        -> {"ok": true, "file": ..., "backup": ..., "replacements": N}
  GET  /editor.html -> the dev-editor page (static, read-only)
  GET  /src/<name>  -> raw source text of a WHITELISTED file (read-only; the
                       editor fetches this to build exact old/new strings)

Invoke (from the repo root):
  python3 tools/editor_server.py [port]
Port: argv[1], else $EDITOR_PORT, else 8901. Binds 127.0.0.1 only.

No /tmp anywhere: backups and all scratch live in-tree.
"""

import datetime
import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP_DIR = os.path.join(REPO_ROOT, "tools", ".backups")

# Whitelist: the tuning files in tools/tuning_map.md section 7, repo-relative.
WHITELIST = frozenset([
    "src/meta.js",
    "src/config.js",
    "src/weapons.js",
    "src/enemy_types.js",
    "src/bosses.js",
    "src/stages.js",
    "src/loot.js",
    "src/chests.js",
    "src/skills.js",
    "src/heal.js",
    "src/rewrites.js",
    "src/evolutions.js",
    "src/elite_mods.js",
    "src/encounters.js",
])

MAX_BODY = 512 * 1024  # 512 KiB is plenty for old/new pair payloads


def utc_stamp():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S")


def resolve_whitelisted(rel):
    """Return the absolute path if rel is a whitelisted repo file, else None."""
    if not isinstance(rel, str) or not rel:
        return None
    if os.path.isabs(rel) or ".." in rel.split("/"):
        return None
    norm = os.path.normpath(rel).replace(os.sep, "/")
    if norm not in WHITELIST:
        return None
    abs_path = os.path.join(REPO_ROOT, norm)
    if not os.path.isfile(abs_path):
        return None
    return abs_path


class Handler(BaseHTTPRequestHandler):
    server_version = "HordesEditorSaver/2"

    def log_message(self, fmt, *args):  # one-line access log on stdout
        sys.stdout.write("%s %s\n" % (self.address_string(), fmt % args))
        sys.stdout.flush()

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, code, text, ctype="text/plain; charset=utf-8"):
        body = text.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self._send_json(200, {"ok": True, "service": "hordes-editor-saver",
                                  "root": REPO_ROOT,
                                  "whitelist": sorted(WHITELIST)})
            return
        if path in ("/editor.html", "/editor"):
            target = os.path.join(REPO_ROOT, "editor.html")
            if not os.path.isfile(target):
                self._send_json(404, {"ok": False, "error": "editor.html not present"})
                return
            with open(target, "r", encoding="utf-8") as fh:
                self._send_text(200, fh.read(), "text/html; charset=utf-8")
            return
        if path.startswith("/src/"):
            rel = path.lstrip("/")
            abs_path = resolve_whitelisted(rel)
            if abs_path is None:
                self._send_json(403, {"ok": False,
                                      "error": "not a whitelisted file: %s" % rel})
                return
            with open(abs_path, "r", encoding="utf-8") as fh:
                self._send_text(200, fh.read(),
                                "text/javascript; charset=utf-8"
                                if rel.endswith(".js") else "text/plain; charset=utf-8")
            return
        self._send_json(404, {"ok": False, "error": "unknown endpoint: %s" % path})

    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/save":
            self._send_json(404, {"ok": False, "error": "unknown endpoint: %s" % path})
            return
        length = self.headers.get("Content-Length")
        try:
            nbytes = int(length or 0)
        except ValueError:
            nbytes = 0
        if nbytes <= 0 or nbytes > MAX_BODY:
            self._send_json(400, {"ok": False, "error": "bad Content-Length"})
            return
        try:
            payload = json.loads(self.rfile.read(nbytes).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._send_json(400, {"ok": False, "error": "body is not valid JSON"})
            return

        rel = payload.get("file")
        reps = payload.get("replacements", payload.get("edits"))
        abs_path = resolve_whitelisted(rel)
        if abs_path is None:
            self._send_json(403, {"ok": False,
                                  "error": "not a whitelisted file: %r" % (rel,)})
            return
        if not isinstance(reps, list) or not reps:
            self._send_json(400, {"ok": False,
                                  "error": "replacements must be a non-empty list"})
            return
        for i, rep in enumerate(reps):
            if (not isinstance(rep, dict)
                    or not isinstance(rep.get("old"), str)
                    or not isinstance(rep.get("new"), str)
                    or not rep["old"]
                    or rep["old"] == rep["new"]):
                self._send_json(400, {"ok": False,
                                      "error": "replacement %d needs distinct non-empty "
                                               "old/new strings" % i})
                return

        with open(abs_path, "r", encoding="utf-8") as fh:
            content = fh.read()

        # Validate ALL pairs before touching disk: each old must occur exactly
        # once, so an ambiguous or stale pair fails the whole request.
        for i, rep in enumerate(reps):
            count = content.count(rep["old"])
            if count != 1:
                self._send_json(409, {"ok": False,
                                      "error": "replacement %d: old string occurs %d "
                                               "times (need exactly 1); no changes "
                                               "written" % (i, count)})
                return

        new_content = content
        for rep in reps:
            new_content = new_content.replace(rep["old"], rep["new"], 1)

        os.makedirs(BACKUP_DIR, exist_ok=True)
        backup_name = "%s.%s.bak" % (os.path.basename(abs_path), utc_stamp())
        backup_path = os.path.join(BACKUP_DIR, backup_name)
        with open(backup_path, "w", encoding="utf-8") as fh:
            fh.write(content)

        with open(abs_path, "w", encoding="utf-8") as fh:
            fh.write(new_content)

        # Syntax gate: roll back + 500 on failure.
        # NOTE: plain `node --check file.js` is VACUOUS in this tree (no
        # package.json type field, so .js checks exit 0 even on garbage —
        # verified 2026-09-20). Pipe the bytes through the module parser
        # instead; no temp files, nothing outside the worktree.
        if abs_path.endswith((".js", ".mjs")):
            try:
                proc = subprocess.run(
                    ["node", "--input-type=module", "--check"],
                    input=new_content, capture_output=True, text=True, timeout=60)
            except (OSError, subprocess.SubprocessError) as exc:
                proc = None
                check_err = "node syntax check could not run: %s" % exc
            else:
                check_err = (proc.stderr or proc.stdout or "").strip()
            if proc is None or proc.returncode != 0:
                with open(abs_path, "w", encoding="utf-8") as fh:
                    fh.write(content)  # roll back; backup stays for forensics
                self._send_json(500, {"ok": False,
                                      "error": "syntax check failed; rolled back",
                                      "detail": check_err[:2000],
                                      "backup": backup_name})
                return

        self._send_json(200, {"ok": True, "file": os.path.normpath(rel),
                              "backup": backup_name,
                              "replacements": len(reps)})


def main(argv):
    port = int(argv[1]) if len(argv) > 1 else int(os.environ.get("EDITOR_PORT", "8901"))
    server = HTTPServer(("127.0.0.1", port), Handler)
    print("hordes-editor-saver serving %s on http://127.0.0.1:%d" % (REPO_ROOT, port),
          flush=True)
    print("whitelist: %d files; backups: tools/.backups/" % len(WHITELIST), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main(sys.argv)
