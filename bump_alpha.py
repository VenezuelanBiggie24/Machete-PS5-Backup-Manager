import json
import re

with open("package.json", "r") as f:
    pkg = json.load(f)
pkg["version"] = "2.0.0-alpha.1"
with open("package.json", "w") as f:
    json.dump(pkg, f, indent=2)

with open("src-tauri/tauri.conf.json", "r") as f:
    tconf = json.load(f)
tconf["version"] = "2.0.0-alpha.1"
with open("src-tauri/tauri.conf.json", "w") as f:
    json.dump(tconf, f, indent=2)

with open("src-tauri/Cargo.toml", "r") as f:
    cargo = f.read()
cargo = re.sub(r'^version = "1\.2\.2"$', 'version = "2.0.0-alpha.1"', cargo, flags=re.MULTILINE)
with open("src-tauri/Cargo.toml", "w") as f:
    f.write(cargo)
