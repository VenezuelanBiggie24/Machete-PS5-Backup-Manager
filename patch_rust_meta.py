import re

with open("src-tauri/src/lib.rs", "r") as f:
    lib_rs = f.read()

old_meta = """fn load_custom_metadata(app: &tauri::AppHandle) -> HashMap<String, CustomMeta> {
    let file_path = get_custom_meta_file(app);
    if let Ok(content) = fs::read_to_string(file_path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        HashMap::new()
    }
}

fn save_custom_metadata(app: &tauri::AppHandle, data: &HashMap<String, CustomMeta>) {
    let file_path = get_custom_meta_file(app);
    if let Ok(content) = serde_json::to_string_pretty(data) {
        let _ = fs::write(file_path, content);
    }
}"""

new_meta = """fn load_custom_metadata(app: &tauri::AppHandle) -> Result<HashMap<String, CustomMeta>, String> {
    let file_path = get_custom_meta_file(app);
    match fs::read_to_string(&file_path) {
        Ok(content) => {
            serde_json::from_str(&content).map_err(|e| format!("Failed to parse JSON: {}", e))
        },
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                Ok(HashMap::new())
            } else {
                Err(format!("Error reading file {}: {}", file_path.display(), e))
            }
        }
    }
}

fn save_custom_metadata(app: &tauri::AppHandle, data: &HashMap<String, CustomMeta>) -> Result<(), String> {
    let file_path = get_custom_meta_file(app);
    let content = serde_json::to_string_pretty(data).map_err(|e| format!("Failed to serialize JSON: {}", e))?;
    fs::write(&file_path, content).map_err(|e| format!("Error writing file {}: {}", file_path.display(), e))
}"""

lib_rs = lib_rs.replace(old_meta, new_meta)

lib_rs = lib_rs.replace("let mut db = load_custom_metadata(&app);", "let mut db = load_custom_metadata(&app)?;")
lib_rs = lib_rs.replace("save_custom_metadata(&app, &db);", "save_custom_metadata(&app, &db)?;")

with open("src-tauri/src/lib.rs", "w") as f:
    f.write(lib_rs)

print("Rust metadata patched")
