with open("src-tauri/src/lib.rs", "r") as f:
    lib_rs = f.read()

lib_rs = lib_rs.replace(
    "read_directory,",
    "read_directory,\n            get_folder_size,"
)

with open("src-tauri/src/lib.rs", "w") as f:
    f.write(lib_rs)

print("Handler fixed.")
