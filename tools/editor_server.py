#!/usr/bin/env python3
"""HORDES dev-editor saver backend (slice 2 + slices 7-8 + slice 11) — stdlib only.

Applies exact-string replacements (old/new pairs) to WHITELISTED tuning
files only (the set in tools/tuning_map.md section 7). Everything else 403.

Every write takes a timestamped backup under tools/.backups/ (git-ignored),
then syntax-checks the new bytes with the node module parser
(`node --input-type=module --check` over stdin — plain `node --check`
on .js is vacuous in this tree); on syntax failure the backup
is restored and the request fails 500.

Endpoints:
  GET  /health      -> {"ok": true, ...}
  GET  /rev         -> {"ok": true, "rev": <full SHA>, "dirty": bool,
                        "game_rev": "<sha>:clean|dirty"} (slice 7: read live
                        from git at request time; 500 when git is unavailable)
  POST /save        -> {"ok": true, "file": ..., "backup": ..., "replacements": N}
  POST /snapshot    -> {"ok": true, "lines": N} (slices 7-9: validates the
                        dev snapshot schema — schema_v must be 2 (slice 8
                        adds the `speed` field to the slice-7 keys; slice 9
                        adds OPTIONAL choices/mode/modifiers, ignored when
                        absent), all required keys present with the documented
                        types — then appends ONE JSON line to
                        tools/.snapshots/runs.jsonl, append-only, never
                        overwritten; the dir is git-ignored)
  GET  /editor.html -> the dev-editor page (static, read-only)
   GET  /src/<name>  -> raw source text of a WHITELISTED file (read-only; the
                         editor fetches this to build exact old/new strings)
   GET  /snapshots   -> {"ok": true, "mtime": <log ISO UTC or null>,
                         "count": N, "raw": "<exact runs.jsonl bytes>"}
                         (slice 11: read-only whole-log read for the main-menu
                         download-all + the editor log viewer; missing log =
                         empty; never writes)

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
# SLICE 7: append-only dev snapshot log (git-ignored; history never deleted).
SNAPSHOT_DIR = os.path.join(REPO_ROOT, "tools", ".snapshots")
SNAPSHOT_FILE = os.path.join(SNAPSHOT_DIR, "runs.jsonl")

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
MAX_SNAPSHOT_BODY = 64 * 1024  # snapshots are small single-run records
MAX_LOG_READ = 8 * 1024 * 1024  # GET /snapshots refuses past 8 MiB (414)


# ---------- SLICE 7-9: snapshot schema + live game_rev --------------------------
# Mirrors src/dev_telemetry.js (the game validates client-side first; the
# server re-validates so a corrupt or hand-made line can never enter the log).
# Slice 8 bumped schema_v to 2 for the `speed` field (dev-run speed control);
# the server accepts ONLY the current version — history lives in the log file
# itself, which is never re-validated. Slice 9 adds OPTIONAL top-level fields
# (choices/mode/modifiers — the choice audit + live mode stamps) with NO
# version bump: validate_snapshot requires the slice-8 keys and IGNORES extra
# keys (same forward-compat rule as the game reader), so old and new writers
# both append cleanly and the version gate still owns compat.
SNAPSHOT_SCHEMA_V = 2
SNAPSHOT_KEYS = ("schema_v", "game_rev", "seed", "upgrades", "shrines",
                 "items", "gold_earned", "gold_spent", "damage", "wave", "test",
                 "speed")


def validate_snapshot(obj):
    """Return (ok, error). Refuses unknown schema_v; requires every key with
    the documented type; ignores extra keys (same forward-compat rule as the
    game reader)."""
    if not isinstance(obj, dict):
        return False, "snapshot is not an object"
    if obj.get("schema_v") != SNAPSHOT_SCHEMA_V:
        return False, "unknown schema_v: %r" % (obj.get("schema_v"),)
    need = {"game_rev": str, "seed": (int, float), "upgrades": dict,
            "shrines": dict, "items": list, "gold_earned": (int, float),
            "gold_spent": (int, float), "damage": (int, float),
            "wave": (int, float), "test": bool, "speed": (int, float)}
    for key, types in need.items():
        if key not in obj:
            return False, "missing key: %s" % key
        val = obj[key]
        # bool is a subclass of int — a bool where a number belongs is a bug.
        if types == bool:
            if not isinstance(val, bool):
                return False, "bad type for %s: %s" % (key, type(val).__name__)
        else:
            if isinstance(val, bool) or not isinstance(val, types):
                return False, "bad type for %s: %s" % (key, type(val).__name__)
    for key in ("seed", "gold_earned", "gold_spent", "damage", "wave", "speed"):
        val = obj[key]
        if isinstance(val, float) and (val != val or val in (float("inf"), float("-inf"))):
            return False, "non-finite number for %s" % key
    if not obj["game_rev"]:
        return False, "empty game_rev"
    return True, ""


def read_game_rev():
    """Live (sha, dirty) from git at request time. Raises on failure."""
    sha = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True,
        text=True, timeout=10)
    if sha.returncode != 0:
        raise RuntimeError("git rev-parse failed: %s" % (sha.stderr or "").strip()[:200])
    status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=REPO_ROOT, capture_output=True,
        text=True, timeout=10)
    if status.returncode != 0:
        raise RuntimeError("git status failed: %s" % (status.stderr or "").strip()[:200])
    clean_sha = sha.stdout.strip().lower()
    dirty = len(status.stdout.strip()) > 0
    return clean_sha, dirty


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
        if path == "/rev":
            try:
                sha, dirty = read_game_rev()
            except Exception as exc:
                self._send_json(500, {"ok": False,
                                      "error": "cannot read game_rev: %s" % exc})
                return
            self._send_json(200, {"ok": True, "rev": sha, "dirty": dirty,
                                  "game_rev": "%s:%s" % (sha, "dirty" if dirty else "clean")})
            return
        # SLICE 11: read-only whole-log read (fixed path — no file
        # parameter, so there is nothing to whitelist-bypass; never writes,
        # so no backup/syntax discipline applies, but the read is capped).
        if path == "/snapshots":
            try:
                if not os.path.isfile(SNAPSHOT_FILE):
                    self._send_json(200, {"ok": True, "mtime": None,
                                          "count": 0, "raw": ""})
                    return
                if os.path.getsize(SNAPSHOT_FILE) > MAX_LOG_READ:
                    self._send_json(413, {"ok": False,
                                          "error": "snapshot log exceeds read cap"})
                    return
                with open(SNAPSHOT_FILE, "r", encoding="utf-8") as fh:
                    raw = fh.read()
                mtime = datetime.datetime.fromtimestamp(
                    os.path.getmtime(SNAPSHOT_FILE),
                    tz=datetime.timezone.utc).isoformat()
                self._send_json(200, {"ok": True, "mtime": mtime,
                                      "count": raw.count("\n"), "raw": raw})
            except OSError as exc:
                self._send_json(500, {"ok": False,
                                      "error": "cannot read snapshot log: %s" % exc})
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
        if path == "/snapshot":
            self._handle_snapshot()
            return
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

    def _handle_snapshot(self):
        """Append one validated dev snapshot line (slice 7). Append-only: the
        log is never overwritten, rewritten or deleted by this endpoint."""
        length = self.headers.get("Content-Length")
        try:
            nbytes = int(length or 0)
        except ValueError:
            nbytes = 0
        if nbytes <= 0 or nbytes > MAX_SNAPSHOT_BODY:
            self._send_json(400, {"ok": False, "error": "bad Content-Length"})
            return
        try:
            payload = json.loads(self.rfile.read(nbytes).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._send_json(400, {"ok": False, "error": "body is not valid JSON"})
            return
        ok, err = validate_snapshot(payload)
        if not ok:
            self._send_json(400, {"ok": False, "error": "invalid snapshot: %s" % err})
            return
        try:
            os.makedirs(SNAPSHOT_DIR, exist_ok=True)
            line = json.dumps(payload, sort_keys=True)
            with open(SNAPSHOT_FILE, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
            with open(SNAPSHOT_FILE, "r", encoding="utf-8") as fh:
                lines = sum(1 for _ in fh)
        except OSError as exc:
            self._send_json(500, {"ok": False,
                                  "error": "cannot append snapshot: %s" % exc})
            return
        self._send_json(200, {"ok": True, "lines": lines})


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
