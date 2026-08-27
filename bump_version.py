import json
import re

# package.json
with open("package.json", "r") as f:
    pkg = json.load(f)
pkg["version"] = "1.2.1"
with open("package.json", "w") as f:
    json.dump(pkg, f, indent=2)

# tauri.conf.json
with open("src-tauri/tauri.conf.json", "r") as f:
    tconf = json.load(f)
tconf["version"] = "1.2.1"
with open("src-tauri/tauri.conf.json", "w") as f:
    json.dump(tconf, f, indent=2)

# Cargo.toml
with open("src-tauri/Cargo.toml", "r") as f:
    cargo = f.read()
cargo = re.sub(r'^version = "1\.2\.0"$', 'version = "1.2.1"', cargo, flags=re.MULTILINE)
with open("src-tauri/Cargo.toml", "w") as f:
    f.write(cargo)

print("Version bumped to 1.2.1")
