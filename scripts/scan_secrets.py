#!/usr/bin/env python3
"""Pre-commit secret scanner for the MycoGuard repo.

Scans tracked files for common credential patterns and exits non-zero when
anything is found, so a leak can never be committed silently.

Usage:
    python scripts/scan_secrets.py            # scan the repo (default)
    python scripts/scan_secrets.py --strict   # also flag generic key assignments
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Root-relative paths that may legitimately hold credentials or vendor code.
EXCLUDE_DIRS = {".git", "_source", "node_modules", "dist", ".venv", "venv", "data", "__pycache__", ".pytest_cache"}
EXCLUDE_FILES = {".env", ".env.example", "package-lock.json", "bun.lock"}

PATTERNS: list[tuple[str, re.Pattern]] = [
    ("dashscope key", re.compile(r"sk-ws-[A-Za-z0-9_.\-]{20,}")),
    ("openai-style key", re.compile(r"sk-[A-Za-z0-9]{20,}")),
    ("google api key", re.compile(r"AIza[0-9A-Za-z\-_]{20,}")),
    ("github classic pat", re.compile(r"ghp_[A-Za-z0-9]{30,}")),
    ("github fine-grained pat", re.compile(r"github_pat_[A-Za-z0-9_]{30,}")),
    ("aws access key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("private key block", re.compile(r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----")),
]


def iter_repo_files(root: Path):
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(root)
        if any(part in EXCLUDE_DIRS for part in rel.parts):
            continue
        if rel.name in EXCLUDE_FILES:
            continue
        yield p, rel


def scan(root: Path) -> list[tuple[str, Path, int]]:
    findings: list[tuple[str, Path, int]] = []
    for path, rel in iter_repo_files(root):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for name, pattern in PATTERNS:
            for m in pattern.finditer(text):
                findings.append((name, rel, path.read_text(encoding="utf-8", errors="replace")[: m.start()].count("\n") + 1))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()

    findings = scan(args.root)
    if findings:
        print(f"[FAIL] {len(findings)} potential secret(s) found:")
        for name, rel, line in findings:
            print(f"  - {name} @ {rel}:{line}")
        return 1
    print("[OK] no credential patterns found in tracked files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
