import re

with open("src-tauri/src/lib.rs", "r") as f:
    lib = f.read()

lib = "mod transfer;\n" + lib

old_transfer = """#[tauri::command]
async fn transfer_items(source_paths: Vec<String>, target_dir: String, window: tauri::Window) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut total_size = 0;
        for path in &source_paths {
            let p = Path::new(path);
            if p.exists() {
                if p.is_dir() {
                    total_size += fs_extra::dir::get_size(p).unwrap_or(0);
                } else {
                    total_size += fs::metadata(p).map(|m| m.len()).unwrap_or(0);
                }
            }
        }
        
        if total_size == 0 {
            return Ok(());
        }

        let mut transferred = 0;
        let mut last_emit = std::time::Instant::now();
        let mut last_transferred = 0;

        let options = fs_extra::dir::CopyOptions {
            overwrite: true,
            skip_exist: false,
            buffer_size: 1024 * 1024,
            copy_inside: true,
            content_only: false,
            depth: 0,
        };

        for source in source_paths {
            let src_path = Path::new(&source);
            
            let progress_handler = |process_info: fs_extra::dir::TransitProcess| {
                transferred += process_info.copied_bytes;
                
                let now = std::time::Instant::now();
                if now.duration_since(last_emit).as_millis() > 100 {
                    let elapsed = now.duration_since(last_emit).as_secs_f64();
                    let bytes_diff = transferred - last_transferred;
                    let speed = (bytes_diff as f64 / 1024.0 / 1024.0) / elapsed;

                    let percent = (transferred as f64 / total_size as f64) * 100.0;
                    
                    let _ = window.emit("transfer-progress", ProgressPayload {
                        current_file: process_info.file_name,
                        total_bytes: total_size,
                        transferred_bytes: transferred,
                        percent,
                        speed_mb_s: speed,
                    });
                    
                    last_emit = now;
                    last_transferred = transferred;
                }
                fs_extra::dir::TransitProcessResult::ContinueOrAbort
            };

            if src_path.is_file() {
                let file_options = fs_extra::file::CopyOptions {
                    overwrite: true,
                    skip_exist: false,
                    buffer_size: 1024 * 1024,
                };
                let target_path = Path::new(&target_dir).join(src_path.file_name().unwrap());
                fs_extra::file::copy_with_progress(source, target_path, &file_options, |info| {
                    progress_handler(fs_extra::dir::TransitProcess {
                        copied_bytes: info.copied_bytes,
                        total_bytes: info.total_bytes,
                        file_name: info.file_name,
                    })
                }).map_err(|e| e.to_string())?;
            } else {
                fs_extra::dir::copy_with_progress(source, &target_dir, &options, progress_handler).map_err(|e| e.to_string())?;
            }
        }
        
        Ok(())
    }).await.map_err(|e| e.to_string())?
}"""

# Remove old ProgressPayload struct too
lib = re.sub(r'#\[derive\(Clone, serde::Serialize\)\]\s*struct ProgressPayload \{[^}]*\}\s*', '', lib)

new_transfer = """#[tauri::command]
async fn transfer_items(source_paths: Vec<String>, target_dir: String, window: tauri::Window) -> Result<(), String> {
    transfer::async_transfer(source_paths, target_dir, window).await
}"""

lib = lib.replace(old_transfer, new_transfer)

with open("src-tauri/src/lib.rs", "w") as f:
    f.write(lib)
