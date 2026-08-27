import json

with open("src-tauri/capabilities/default.json", "r") as f:
    caps = json.load(f)

if "fs:default" in caps["permissions"]:
    caps["permissions"].remove("fs:default")

with open("src-tauri/capabilities/default.json", "w") as f:
    json.dump(caps, f, indent=2)

print("Fixed capabilities.")
