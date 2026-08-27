import json
import re
import os

# 1. Update Cargo.toml
with open("src-tauri/Cargo.toml", "r") as f:
    cargo = f.read()

if "[profile.release]" not in cargo:
    cargo += """\n
[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
"""

# Remove tauri-plugin-fs from cargo if it exists
cargo = re.sub(r'tauri-plugin-fs\s*=\s*"[^"]+"\n?', '', cargo)

with open("src-tauri/Cargo.toml", "w") as f:
    f.write(cargo)


# 2. Update tauri.conf.json
with open("src-tauri/tauri.conf.json", "r") as f:
    tauri_conf = json.load(f)

# Add icon.png to bundle icons
if "icons/icon.png" not in tauri_conf["bundle"]["icon"]:
    tauri_conf["bundle"]["icon"].append("icons/icon.png")

# Fix CSP
tauri_conf["app"]["security"]["csp"] = "default-src 'self'; img-src 'self' asset: https: data:; style-src 'self' 'unsafe-inline';"

with open("src-tauri/tauri.conf.json", "w") as f:
    json.dump(tauri_conf, f, indent=2)


# 3. Update release.yml
with open(".github/workflows/release.yml", "r") as f:
    workflow = f.read()

# Fix macos args
workflow = workflow.replace("          - platform: 'macos-latest'\n            args: ''", "          - platform: 'macos-latest'\n            args: '--target universal-apple-darwin'")
# Fix linux deps
workflow = workflow.replace("libappindicator3-dev", "libayatana-appindicator3-dev")

with open(".github/workflows/release.yml", "w") as f:
    f.write(workflow)


# 4. Remove plugin-fs from package.json
try:
    with open("package.json", "r") as f:
        pkg = json.load(f)
    if "@tauri-apps/plugin-fs" in pkg.get("dependencies", {}):
        del pkg["dependencies"]["@tauri-apps/plugin-fs"]
    with open("package.json", "w") as f:
        json.dump(pkg, f, indent=2)
except Exception as e:
    print(e)

print("Configs patched successfully.")
