#!/usr/bin/env python3
"""Review/integration aid for the H1 candidate. Do not commit this file."""

from pathlib import Path
import shutil

repo = Path.cwd()
candidate = Path(__file__).resolve().parent

server = repo / "server.ts"
lock = repo / "package-lock.json"
bun = repo / "bun.lock"

server_text = server.read_text(encoding="utf-8")
if "(req as any).user" not in server_text:
    raise SystemExit("H1 F03 precondition failed: no canonical user casts found")
if "(req as any).requestId" not in server_text:
    raise SystemExit("H1 F03 precondition failed: canonical requestId cast not found")

server_text = server_text.replace("(req as any).user", "req.user")
server_text = server_text.replace("(req as any).requestId", "req.requestId")
if "(req as any).user" in server_text or "(req as any).requestId" in server_text:
    raise SystemExit("H1 F03 postcondition failed")
server.write_text(server_text, encoding="utf-8")

lock_text = lock.read_text(encoding="utf-8")
if lock_text.count('"name": "react-example"') != 2:
    raise SystemExit("H1 F04 precondition failed: unexpected package-lock workspace-name count")
lock_text = lock_text.replace('"name": "react-example"', '"name": "agent-workspace"')

vite_line = '        "vite": "^6.2.3",\n'
first_vite = lock_text.find(vite_line)
if first_vite < 0:
    raise SystemExit("H1 F05 precondition failed: root dependency Vite line not found")
lock_text = lock_text[:first_vite] + lock_text[first_vite + len(vite_line):]
lock.write_text(lock_text, encoding="utf-8")

shutil.copyfile(candidate / "package.json", repo / "package.json")
shutil.copyfile(candidate / "README.md", repo / "README.md")
(repo / "server/types").mkdir(parents=True, exist_ok=True)
shutil.copyfile(candidate / "server/types/express.d.ts", repo / "server/types/express.d.ts")
declaration = (repo / "server/types/express.d.ts").read_text(encoding="utf-8")
if "user?: UserContext;" not in declaration or "user: UserContext;" in declaration:
    raise SystemExit("H1 F03 postcondition failed: Express Request.user must remain optional")

if not bun.exists():
    raise SystemExit("H1 F06 precondition failed: bun.lock already absent")
bun.unlink()

print("H1 candidate operations applied. Run checker-prescribed verification separately.")
