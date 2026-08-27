import re

with open("src-tauri/src/lib.rs", "r") as f:
    lib = f.read()

# Replace the real transfer_items
old_func = re.search(r'#\[tauri::command\]\s*async fn transfer_items[\s\S]*?Ok\(\(\)\)\s*\}\)\.await\.map_err\(\|e\| e\.to_string\(\)\)\?\s*\}', lib).group(0)

new_func = """#[tauri::command]
async fn transfer_items(app_handle: tauri::AppHandle, sources: Vec<String>, target_dir: String) -> Result<(), String> {
    use tauri::Manager;
    let window = app_handle.get_webview_window("main").unwrap();
    transfer::async_transfer(sources, target_dir, window).await
}"""

lib = lib.replace(old_func, new_func)

with open("src-tauri/src/lib.rs", "w") as f:
    f.write(lib)

print("transfer_items replaced.")
