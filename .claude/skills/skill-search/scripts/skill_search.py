#!/usr/bin/env python3
"""Search GitHub for Claude / agent skills, ranked by stars, freshness and relevance.

Usage:
  skill_search.py search "youtube video transcript"
  skill_search.py search "ui design" --sort updated --limit 15
  skill_search.py show owner/repo path/to/skill
  skill_search.py install owner/repo path/to/skill [--dest ~/.claude/skills]

A GitHub token (GITHUB_TOKEN / GH_TOKEN env var, or a logged-in `gh` CLI) unlocks
SKILL.md file search, which finds individual skills inside large collections.
Without one, only repository search runs (10 requests/minute limit).

Standard library only; Python 3.8+.
"""

import argparse
import base64
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://api.github.com"
RAW = "https://raw.githubusercontent.com"

# Topics people tag skill repos with. Each becomes its own repo query because
# GitHub search does not OR topic qualifiers together.
SKILL_TOPICS = ["claude-skills", "agent-skills", "claude-code-skills", "claude-skill", "anthropic-skills"]
SKILL_WORDS = re.compile(r"\b(skill|skills|SKILL\.md|claude|agent|mcp)\b", re.I)


# --------------------------------------------------------------------------- http

def get_token():
    for var in ("GITHUB_TOKEN", "GH_TOKEN"):
        if os.environ.get(var):
            return os.environ[var]
    if shutil.which("gh"):
        try:
            out = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=10)
            if out.returncode == 0 and out.stdout.strip():
                return out.stdout.strip()
        except (OSError, subprocess.SubprocessError):
            pass
    return None


class GitHub:
    def __init__(self, token=None, verbose=False):
        self.token = token
        self.verbose = verbose
        self._repo_cache = {}

    def _request(self, url, accept="application/vnd.github+json", raw=False):
        headers = {"Accept": accept, "User-Agent": "skill-search", "X-GitHub-Api-Version": "2022-11-28"}
        if self.token and url.startswith(API):
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(url, headers=headers)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=20) as resp:
                    body = resp.read()
                    return body.decode("utf-8", "replace") if raw else json.loads(body)
            except urllib.error.HTTPError as e:
                msg = e.read().decode("utf-8", "replace")
                remaining = e.headers.get("X-RateLimit-Remaining")
                if e.code in (403, 429) and remaining == "0":
                    reset = int(e.headers.get("X-RateLimit-Reset", time.time() + 60))
                    wait = max(1, reset - int(time.time()))
                    if wait <= 65 and attempt < 2:
                        self._log(f"rate limited, waiting {wait}s")
                        time.sleep(wait)
                        continue
                    raise RuntimeError(
                        "GitHub rate limit reached. Set GITHUB_TOKEN (or run `gh auth login`) for higher limits."
                    )
                if e.code == 401:
                    raise RuntimeError("GitHub rejected the token (401). Check GITHUB_TOKEN.")
                if e.code == 404:
                    return None
                raise RuntimeError(f"GitHub API {e.code} for {url}: {msg[:200]}")
            except urllib.error.URLError as e:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise RuntimeError(f"Network error reaching GitHub: {e.reason}")
        return None

    def _log(self, msg):
        if self.verbose:
            print(f"[skill-search] {msg}", file=sys.stderr)

    def search_repos(self, q, per_page=30):
        self._log(f"repo search: {q}")
        url = f"{API}/search/repositories?" + urllib.parse.urlencode({"q": q, "per_page": per_page, "sort": "stars"})
        data = self._request(url)
        return (data or {}).get("items", [])

    def search_code(self, q, per_page=50):
        self._log(f"code search: {q}")
        url = f"{API}/search/code?" + urllib.parse.urlencode({"q": q, "per_page": per_page})
        data = self._request(url, accept="application/vnd.github.text-match+json")
        return (data or {}).get("items", [])

    def repo(self, full_name):
        if full_name not in self._repo_cache:
            self._repo_cache[full_name] = self._request(f"{API}/repos/{full_name}")
        return self._repo_cache[full_name]

    def raw_file(self, full_name, ref, path):
        url = f"{RAW}/{full_name}/{ref}/{urllib.parse.quote(path)}"
        try:
            return self._request(url, accept="text/plain", raw=True)
        except RuntimeError:
            return None

    def contents(self, full_name, path, ref=None):
        url = f"{API}/repos/{full_name}/contents/{urllib.parse.quote(path)}"
        if ref:
            url += "?" + urllib.parse.urlencode({"ref": ref})
        return self._request(url)


# ------------------------------------------------------------------------ parsing

def parse_frontmatter(text):
    """Return {name, description} from a SKILL.md YAML frontmatter block."""
    out = {}
    if not text:
        return out
    m = re.match(r"^﻿?---\s*\n(.*?)\n---", text, re.S)
    if not m:
        return out
    lines = m.group(1).splitlines()
    i = 0
    while i < len(lines):
        km = re.match(r"^(name|description):\s*(.*)$", lines[i])
        if km:
            key, val = km.group(1), km.group(2).strip()
            if val in ("|", ">", "|-", ">-", ""):
                block = []
                i += 1
                while i < len(lines) and (lines[i].startswith((" ", "\t")) or not lines[i].strip()):
                    block.append(lines[i].strip())
                    i += 1
                val = " ".join(b for b in block if b)
                out[key] = val.strip("\"'")
                continue
            out[key] = val.strip("\"'")
        i += 1
    return out


def days_since(iso):
    if not iso:
        return 9999
    dt = datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    return max(0, (datetime.now(timezone.utc) - dt).days)


def relevance(terms, *fields):
    hay = " ".join(f or "" for f in fields).lower()
    if not terms:
        return 0.0
    hits = sum(1 for t in terms if t in hay)
    return hits / len(terms)


def score(stars, updated_days, rel):
    # Stars dominate on a log scale; freshness halves every ~180 days; relevance multiplies.
    popularity = math.log10(stars + 1)
    freshness = 0.5 ** (updated_days / 180)
    return round((popularity + 1.5 * freshness) * (0.4 + rel), 3)


def query_terms(query):
    stop = {"a", "an", "the", "to", "for", "and", "or", "of", "with", "that", "allows", "claude", "skill", "skills", "lets", "me", "i", "want", "can", "new"}
    return [t for t in re.findall(r"[a-z0-9+#.-]+", query.lower()) if t not in stop and len(t) > 1]


# ------------------------------------------------------------------------- search

def search(gh, query, limit=10, sort="best", min_stars=0, updated_within=None, fetch_details=True):
    terms = query_terms(query) or [query.lower()]
    keyword = " ".join(terms)
    results = {}

    def add(key, item):
        if key in results:
            # Keep the more specific (SKILL.md-level) hit, merge sources.
            results[key]["sources"] |= item["sources"]
            return
        results[key] = item

    # 1. SKILL.md files (needs auth) — finds individual skills inside collections.
    if gh.token:
        try:
            hits = gh.search_code(f"{keyword} filename:SKILL.md")
            if len(hits) < 5 and len(terms) > 1:
                # Loosen: any term, best-effort.
                for t in terms[:3]:
                    hits += gh.search_code(f"{t} filename:SKILL.md", per_page=20)
            for h in hits:
                repo = h["repository"]["full_name"]
                skill_dir = os.path.dirname(h["path"]) or "."
                frag = " ".join(m.get("fragment", "") for m in h.get("text_matches", []) or [])
                add((repo, skill_dir), {
                    "kind": "skill",
                    "repo": repo,
                    "path": skill_dir,
                    "skill_file": h["path"],
                    "name": os.path.basename(skill_dir) if skill_dir != "." else h["repository"]["name"],
                    "description": "",
                    "fragment": frag,
                    "url": h["html_url"],
                    "sources": {"SKILL.md"},
                })
        except RuntimeError as e:
            gh._log(f"code search skipped: {e}")

    # 2. Repositories that look like skills.
    repo_queries = [f"{keyword} claude skill in:name,description,readme"]
    repo_queries += [f"{keyword} topic:{t}" for t in SKILL_TOPICS[:3]]
    if not gh.token:
        repo_queries = repo_queries[:3]  # stay well under the anonymous 10 req/min
    seen_repo_items = {}
    for q in repo_queries:
        if min_stars:
            q += f" stars:>={min_stars}"
        try:
            for r in gh.search_repos(q):
                seen_repo_items[r["full_name"]] = r
        except RuntimeError as e:
            print(f"warning: {e}", file=sys.stderr)
            break

    for full, r in seen_repo_items.items():
        text = f"{r.get('name')} {r.get('description') or ''} {' '.join(r.get('topics') or [])}"
        if not SKILL_WORDS.search(text):
            continue
        gh._repo_cache[full] = r
        add((full, "."), {
            "kind": "repo",
            "repo": full,
            "path": ".",
            "skill_file": None,
            "name": r["name"],
            "description": r.get("description") or "",
            "fragment": "",
            "url": r["html_url"],
            "sources": {"repo"},
        })

    # 3. Enrich with stars / dates, then rank.
    items = list(results.values())
    for it in items:
        meta = gh._repo_cache.get(it["repo"])
        if meta is None:
            try:
                meta = gh.repo(it["repo"])
            except RuntimeError as e:
                gh._log(f"no metadata for {it['repo']}: {e}")
        meta = meta or {}
        it["stars"] = meta.get("stargazers_count", 0)
        it["forks"] = meta.get("forks_count", 0)
        it["pushed_at"] = meta.get("pushed_at") or meta.get("updated_at")
        it["default_branch"] = meta.get("default_branch", "main")
        it["archived"] = meta.get("archived", False)
        it["license"] = (meta.get("license") or {}).get("spdx_id")
        it["repo_description"] = meta.get("description") or ""
        it["updated_days"] = days_since(it["pushed_at"])

    items = [i for i in items if i["stars"] >= min_stars and not i["archived"]]
    if updated_within:
        items = [i for i in items if i["updated_days"] <= updated_within]

    for it in items:
        rel = relevance(terms, it["name"], it["path"], it["description"], it["fragment"], it["repo_description"])
        if it["kind"] == "skill":
            rel += 0.25  # an actual SKILL.md is what the user wants
        it["relevance"] = round(rel, 2)
        it["score"] = score(it["stars"], it["updated_days"], rel)

    key = {
        "best": lambda i: -i["score"],
        "stars": lambda i: (-i["stars"], i["updated_days"]),
        "updated": lambda i: (i["updated_days"], -i["stars"]),
    }[sort]
    items.sort(key=key)
    items = items[:limit]

    # 4. Pull SKILL.md frontmatter for the finalists (raw.githubusercontent.com, no API quota).
    if fetch_details:
        for it in items:
            if it["kind"] == "skill" and not it["description"]:
                fm = parse_frontmatter(gh.raw_file(it["repo"], it["default_branch"], it["skill_file"]))
                it["name"] = fm.get("name") or it["name"]
                it["description"] = fm.get("description", "")
            elif it["kind"] == "repo" and not it.get("skill_file"):
                fm = parse_frontmatter(gh.raw_file(it["repo"], it["default_branch"], "SKILL.md"))
                if fm:
                    it["skill_file"] = "SKILL.md"
                    it["description"] = fm.get("description") or it["description"]

    for it in items:
        it["sources"] = sorted(it["sources"])
    return items


# ------------------------------------------------------------------------- output

def fmt_age(days):
    if days >= 9999:
        return "?"
    if days < 1:
        return "today"
    if days < 60:
        return f"{days}d ago"
    if days < 730:
        return f"{days // 30}mo ago"
    return f"{days // 365}y ago"


def truncate(s, n):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def print_table(items, query):
    if not items:
        print(f"No skills found for “{query}”. Try broader or different words.")
        return
    width = shutil.get_terminal_size((100, 20)).columns
    print(f"\nTop {len(items)} skills for “{query}”\n")
    for n, it in enumerate(items, 1):
        where = it["repo"] if it["path"] == "." else f"{it['repo']}/{it['path']}"
        tag = "SKILL" if it["kind"] == "skill" or it.get("skill_file") else "repo "
        print(f"{n:>2}. [{tag}] {it['name']}  ★ {it['stars']:,}  · updated {fmt_age(it['updated_days'])}  · score {it['score']}")
        print(f"    {where}")
        desc = it["description"] or it["repo_description"]
        if desc:
            print(f"    {truncate(desc, max(40, width - 6))}")
        print(f"    {it['url']}")
        if it["kind"] == "skill" or it.get("skill_file"):
            print(f"    install: skill_search.py install {it['repo']} {it['path']}")
        print()


def print_markdown(items, query):
    print(f"## Skills for “{query}”\n")
    print("| # | Skill | Stars | Updated | Description |")
    print("|---|---|---|---|---|")
    for n, it in enumerate(items, 1):
        desc = truncate(it["description"] or it["repo_description"], 140).replace("|", "\\|")
        print(f"| {n} | [{it['name']}]({it['url']}) | {it['stars']:,} | {fmt_age(it['updated_days'])} | {desc} |")


# ------------------------------------------------------------------- show/install

def list_tree(gh, repo, path, ref):
    entries = gh.contents(repo, path, ref)
    if entries is None:
        raise RuntimeError(f"{repo}/{path} not found")
    if isinstance(entries, dict):
        entries = [entries]
    for e in entries:
        if e["type"] == "dir":
            yield from list_tree(gh, repo, e["path"], ref)
        elif e["type"] == "file":
            yield e


def cmd_show(gh, args):
    meta = gh.repo(args.repo) or {}
    ref = args.ref or meta.get("default_branch", "main")
    skill_file = args.path.rstrip("/")
    if not skill_file.endswith("SKILL.md"):
        skill_file = "SKILL.md" if skill_file in ("", ".") else f"{skill_file}/SKILL.md"
    text = gh.raw_file(args.repo, ref, skill_file)
    if text is None:
        sys.exit(f"No SKILL.md at {args.repo}/{skill_file} (ref {ref})")
    print(text)


def cmd_install(gh, args):
    meta = gh.repo(args.repo) or {}
    ref = args.ref or meta.get("default_branch", "main")
    src = args.path.strip("/")
    src = "" if src == "." else src
    if src.endswith("SKILL.md"):
        src = os.path.dirname(src)

    files = list(list_tree(gh, args.repo, src, ref))
    if not any(os.path.basename(f["path"]) == "SKILL.md" for f in files):
        sys.exit(f"{args.repo}/{src or '.'} has no SKILL.md — not a skill folder.")

    skill_md = gh.raw_file(args.repo, ref, f"{src}/SKILL.md" if src else "SKILL.md") or ""
    fm = parse_frontmatter(skill_md)
    name = re.sub(r"[^a-zA-Z0-9_-]+", "-", args.name or fm.get("name") or os.path.basename(src) or meta.get("name", "skill")).strip("-")
    dest = Path(os.path.expanduser(args.dest)) / name

    scripts = [f["path"] for f in files if re.search(r"\.(py|sh|js|ts|mjs|rb|ps1|bat)$", f["path"])]
    print(f"Skill:   {fm.get('name', name)}")
    print(f"Source:  https://github.com/{args.repo}/tree/{ref}/{src}")
    print(f"Stars:   {meta.get('stargazers_count', '?')}   License: {(meta.get('license') or {}).get('spdx_id', 'none')}")
    print(f"Files:   {len(files)}" + (f"  (includes {len(scripts)} executable script(s): {', '.join(os.path.basename(s) for s in scripts[:5])})" if scripts else ""))
    print(f"Target:  {dest}")
    print("\n--- SKILL.md " + "-" * 50)
    print(skill_md[:3000] + ("\n… (truncated)" if len(skill_md) > 3000 else ""))
    print("-" * 63)
    print("Skills are instructions Claude will follow (and scripts it may run). Read them before installing.")

    if dest.exists() and not args.force:
        sys.exit(f"{dest} already exists. Re-run with --force to overwrite.")
    if not args.yes:
        if not sys.stdin.isatty():
            sys.exit("Not a terminal: re-run with --yes to confirm the install.")
        if input("Install this skill? [y/N] ").strip().lower() not in ("y", "yes"):
            sys.exit("Cancelled.")

    if dest.exists():
        shutil.rmtree(dest)
    for f in files:
        rel = os.path.relpath(f["path"], src) if src else f["path"]
        if rel.startswith(".."):
            continue
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        data = None
        if f.get("download_url"):
            req = urllib.request.Request(f["download_url"], headers={"User-Agent": "skill-search"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
        else:
            blob = gh.contents(args.repo, f["path"], ref) or {}
            data = base64.b64decode(blob.get("content", ""))
        target.write_bytes(data)
    print(f"\nInstalled {len(files)} file(s) to {dest}")
    print("Restart Claude Code (or start a new session) to pick it up.")


# --------------------------------------------------------------------------- main

def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] not in ("search", "show", "install", "-h", "--help"):
        argv.insert(0, "search")

    p = argparse.ArgumentParser(prog="skill_search.py", description="Find Claude / agent skills on GitHub.")
    p.add_argument("-v", "--verbose", action="store_true", help="log API calls to stderr")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("search", help="search for skills")
    s.add_argument("query", nargs="+", help="what you want the skill to do, e.g. 'watch youtube videos'")
    s.add_argument("-n", "--limit", type=int, default=10)
    s.add_argument("-s", "--sort", choices=["best", "stars", "updated"], default="best",
                   help="best = stars + freshness + relevance (default)")
    s.add_argument("--min-stars", type=int, default=0)
    s.add_argument("--updated-within", type=int, metavar="DAYS", help="only skills pushed in the last N days")
    s.add_argument("--json", action="store_true", help="machine-readable output")
    s.add_argument("--markdown", action="store_true", help="markdown table output")
    s.add_argument("--no-details", action="store_true", help="skip fetching SKILL.md descriptions (faster)")

    sh = sub.add_parser("show", help="print a skill's SKILL.md")
    sh.add_argument("repo", help="owner/repo")
    sh.add_argument("path", nargs="?", default=".", help="folder containing SKILL.md")
    sh.add_argument("--ref")

    i = sub.add_parser("install", help="download a skill folder into your skills directory")
    i.add_argument("repo", help="owner/repo")
    i.add_argument("path", nargs="?", default=".", help="folder containing SKILL.md")
    i.add_argument("--dest", default="~/.claude/skills", help="default: ~/.claude/skills (use .claude/skills for this project only)")
    i.add_argument("--name", help="folder name to install as")
    i.add_argument("--ref", help="branch, tag or commit")
    i.add_argument("-y", "--yes", action="store_true", help="skip the confirmation prompt")
    i.add_argument("--force", action="store_true", help="overwrite an existing install")

    args = p.parse_args(argv)
    gh = GitHub(get_token(), verbose=args.verbose)

    try:
        if args.cmd == "search":
            query = " ".join(args.query)
            if not gh.token and not args.json:
                print("note: no GitHub token found — searching repositories only. "
                      "Set GITHUB_TOKEN or run `gh auth login` to also search individual SKILL.md files.",
                      file=sys.stderr)
            items = search(gh, query, args.limit, args.sort, args.min_stars, args.updated_within, not args.no_details)
            if args.json:
                print(json.dumps({"query": query, "authenticated": bool(gh.token), "results": items}, indent=2))
            elif args.markdown:
                print_markdown(items, query)
            else:
                print_table(items, query)
        elif args.cmd == "show":
            cmd_show(gh, args)
        elif args.cmd == "install":
            cmd_install(gh, args)
    except RuntimeError as e:
        sys.exit(f"error: {e}")
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
