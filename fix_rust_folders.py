import re

with open("src-tauri/src/lib.rs", "r") as f:
    lib_rs = f.read()

# 1. Update FileItem struct
lib_rs = lib_rs.replace(
    "struct FileItem {\n    name: String,\n    path: String,\n    ppsa: Option<String>,\n    size_bytes: u64,\n}",
    "struct FileItem {\n    name: String,\n    path: String,\n    ppsa: Option<String>,\n    size_bytes: u64,\n    is_dir: bool,\n}"
)

# 2. Update read_directory loop
old_push = """                    files.push(FileItem {
                        name: file_name.to_string(),
                        path: path_buf.to_string_lossy().to_string(),
                        ppsa,
                        size_bytes,
                    });"""

new_push = """                    files.push(FileItem {
                        name: file_name.to_string(),
                        path: path_buf.to_string_lossy().to_string(),
                        ppsa,
                        size_bytes,
                        is_dir: path_buf.is_dir(),
                    });"""
lib_rs = lib_rs.replace(old_push, new_push)

# 3. Add get_folder_size command
new_cmd = """
fn calculate_dir_size(path: &std::path::Path) -> u64 {
    let mut size = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_dir() {
                    size += calculate_dir_size(&entry.path());
                } else {
                    size += metadata.len();
                }
            }
        }
    }
    size
}

#[tauri::command]
async fn get_folder_size(path: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        calculate_dir_size(std::path::Path::new(&path))
    }).await.map_err(|e| e.to_string())
}
"""
# Insert before #[tauri::command] async fn read_directory
lib_rs = lib_rs.replace("#[tauri::command]\nasync fn read_directory", new_cmd + "\n#[tauri::command]\nasync fn read_directory")

# 4. Add get_folder_size to tauri::Builder in run()
# Find the line: .invoke_handler(tauri::generate_handler![read_directory, get_disk_space, delete_file, rename_file, transfer_items, fetch_metadata_rs, save_custom_title, save_custom_cover])
lib_rs = re.sub(
    r'tauri::generate_handler\!\[(.*?)\]',
    lambda m: f"tauri::generate_handler![{m.group(1)}, get_folder_size]",
    lib_rs
)

with open("src-tauri/src/lib.rs", "w") as f:
    f.write(lib_rs)

print("Rust fixed.")
