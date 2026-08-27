with open("src-tauri/src/lib.rs", "r") as f:
    lines = f.readlines()

start = -1
end = -1
for i, line in enumerate(lines):
    if "#[tauri::command]" in line and "async fn transfer_items(" in lines[i+1]:
        start = i
    if start != -1 and i > start and "Ok(())" in line and "}" in lines[i+1]:
        end = i + 1
        break

if start != -1 and end != -1:
    new_func = """#[tauri::command]
async fn transfer_items(app_handle: tauri::AppHandle, sources: Vec<String>, target_dir: String) -> Result<(), String> {
    use tauri::Manager;
    let window = app_handle.get_webview_window("main").unwrap();
    transfer::async_transfer(sources, target_dir, window).await
}\n"""
    lines[start:end+1] = [new_func]

with open("src-tauri/src/lib.rs", "w") as f:
    f.writelines(lines)

print("transfer_items patched.")
