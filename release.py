#!/usr/bin/env python3
"""
Machete PS5 Backup Manager - Release Automation Script
Automatically bumps version, updates changelogs, commits, tags, and pushes.

Usage:
  python3 release.py <new_version> <changelog_title_en> <changelog_title_es>
"""
import sys
import os
import json
import re
import subprocess
from datetime import datetime

if len(sys.argv) < 4:
    print("Usage: python3 release.py <new_version> <changelog_title_en> <changelog_title_es>")
    print("Example: python3 release.py 1.2.6 'v1.2.6 - Bug fixes' 'v1.2.6 - Corrección de errores'")
    sys.exit(1)

new_version = sys.argv[1].replace('v', '') # strip 'v' if provided
title_en = sys.argv[2]
title_es = sys.argv[3]

version_key = new_version.replace('.', '')

print(f"🚀 Starting release process for v{new_version}...")

# 1. Bump package.json
print("📦 Bumping package.json...")
with open("package.json", "r", encoding="utf-8") as f:
    pkg = json.load(f)
pkg["version"] = new_version
with open("package.json", "w", encoding="utf-8") as f:
    json.dump(pkg, f, indent=2)
    f.write("\n")

# 2. Bump tauri.conf.json
print("📦 Bumping tauri.conf.json...")
with open("src-tauri/tauri.conf.json", "r", encoding="utf-8") as f:
    tauri_conf = json.load(f)
tauri_conf["version"] = new_version
with open("src-tauri/tauri.conf.json", "w", encoding="utf-8") as f:
    json.dump(tauri_conf, f, indent=2)
    f.write("\n")

# 3. Bump Cargo.toml
print("📦 Bumping Cargo.toml...")
cargo_path = "src-tauri/Cargo.toml"
with open(cargo_path, "r", encoding="utf-8") as f:
    cargo_content = f.read()
cargo_content = re.sub(r'version = "[0-9\.]+"', f'version = "{new_version}"', cargo_content, count=1)
with open(cargo_path, "w", encoding="utf-8") as f:
    f.write(cargo_content)

# 4. Read changelog items from standard input
print("\n📝 Enter changelog items in ENGLISH (one per line). Press Enter on an empty line to finish:")
items_en = []
while True:
    line = input("> ").strip()
    if not line: break
    items_en.append(line)

print("\n📝 Enter changelog items in SPANISH (one per line). Press Enter on an empty line to finish:")
items_es = []
while True:
    line = input("> ").strip()
    if not line: break
    items_es.append(line)

if not items_en or not items_es:
    print("❌ Changelog items cannot be empty!")
    sys.exit(1)

# 5. Inject into locales
print("\n🌍 Injecting changelogs into locales...")
locales_dir = "src/locales"
for filename in os.listdir(locales_dir):
    if not filename.endswith(".json"): continue
    
    lang = filename.replace(".json", "")
    filepath = os.path.join(locales_dir, filename)
    
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    if lang in ("es", "es_ve"):
        data[f"changelog_v{version_key}_title"] = title_es
        data[f"changelog_v{version_key}_items"] = items_es
    else:
        data[f"changelog_v{version_key}_title"] = title_en
        data[f"changelog_v{version_key}_items"] = items_en
        
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

# 6. Update App.tsx
print("⚛️ Updating App.tsx changelog UI...")
app_tsx_path = "src/App.tsx"
with open(app_tsx_path, "r", encoding="utf-8") as f:
    app_content = f.read()

# Find the start of the changelog container
marker = '<div className="bg-black/50 rounded-lg p-3 h-40 overflow-y-auto text-xs text-slate-300 space-y-3 font-mono border border-cyan-500/10 custom-scrollbar">\n                <div>'

new_changelog_block = f"""<div className="bg-black/50 rounded-lg p-3 h-40 overflow-y-auto text-xs text-slate-300 space-y-3 font-mono border border-cyan-500/10 custom-scrollbar">
                <div>
                  <div className="text-cyan-300 font-bold">{{t("changelog_v{version_key}_title")}}</div>
                  <ul className="list-disc pl-4 mt-1 opacity-80">
                    {{renderChangelogItems(t("changelog_v{version_key}_items", {{ returnObjects: true }}))}}
                  </ul>
                </div>
                <div>"""

if marker in app_content:
    app_content = app_content.replace(marker, new_changelog_block)
    with open(app_tsx_path, "w", encoding="utf-8") as f:
        f.write(app_content)
else:
    print("⚠️ Warning: Could not auto-inject into App.tsx. Please update it manually.")

# 7. Git Commit & Push
print("\n🚀 Committing and Pushing...")
try:
    subprocess.run(["git", "add", "-A"], check=True)
    subprocess.run(["git", "commit", "-m", f"release: v{new_version} - {title_en}"], check=True)
    subprocess.run(["git", "tag", f"v{new_version}"], check=True)
    subprocess.run(["git", "push", "origin", "HEAD", "--tags"], check=True)
    print(f"\n✅ Successfully released v{new_version}!")
except subprocess.CalledProcessError as e:
    print(f"\n❌ Error during git operations: {e}")
    sys.exit(1)
