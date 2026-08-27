import re
with open("src-tauri/Cargo.toml", "r") as f:
    cargo = f.read()

cargo = cargo.replace('fs_extra = "1.3.0"', 'tokio = { version = "1.32.0", features = ["fs", "rt-multi-thread"] }\nblake3 = "1.5.0"\nfutures = "0.3.28"\nfs_extra = "1.3.0"')

with open("src-tauri/Cargo.toml", "w") as f:
    f.write(cargo)
