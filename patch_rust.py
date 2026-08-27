import re

with open("src-tauri/src/lib.rs", "r") as f:
    lib_rs = f.read()

# 1. Remove tauri_plugin_fs::init()
lib_rs = lib_rs.replace(".plugin(tauri_plugin_fs::init())\n", "")

# 2. Fix Directory Size bottleneck
old_dir_size = """                    let mut size_bytes = 0;
                    if path_buf.is_dir() {
                        if let Ok(size) = fs_extra::dir::get_size(&path_buf) {
                            size_bytes = size;
                        }
                    } else if let Ok(metadata) = fs::metadata(&path_buf) {
                        size_bytes = metadata.len();
                    }"""

new_dir_size = """                    let mut size_bytes = 0;
                    if !path_buf.is_dir() {
                        if let Ok(metadata) = fs::metadata(&path_buf) {
                            size_bytes = metadata.len();
                        }
                    }"""
lib_rs = lib_rs.replace(old_dir_size, new_dir_size)

# 3. Fix Transfer Speed calculation
old_transfer = """        let mut last_emit = Instant::now();
        let start_time = Instant::now();
        
        let handler = |process_info: fs_extra::TransitProcess| {
            let now = Instant::now();
            // Emit progress every 100ms
            if now.duration_since(last_emit).as_millis() > 100 {
                let percent = if process_info.total_bytes > 0 {
                    (process_info.copied_bytes as f64 / process_info.total_bytes as f64) * 100.0
                } else {
                    0.0
                };
                
                let elapsed = start_time.elapsed().as_secs_f64();
                let speed = if elapsed > 0.0 {
                    process_info.copied_bytes as f64 / elapsed
                } else {
                    0.0
                };"""

new_transfer = """        let mut last_emit = Instant::now();
        let mut last_copied_bytes = 0u64;
        let mut last_time = Instant::now();
        
        let handler = |process_info: fs_extra::TransitProcess| {
            let now = Instant::now();
            // Emit progress every 100ms
            if now.duration_since(last_emit).as_millis() > 100 {
                let percent = if process_info.total_bytes > 0 {
                    (process_info.copied_bytes as f64 / process_info.total_bytes as f64) * 100.0
                } else {
                    0.0
                };
                
                let elapsed_since_last = now.duration_since(last_time).as_secs_f64();
                let bytes_since_last = process_info.copied_bytes.saturating_sub(last_copied_bytes) as f64;
                let speed = if elapsed_since_last > 0.0 {
                    bytes_since_last / elapsed_since_last
                } else {
                    0.0
                };
                last_copied_bytes = process_info.copied_bytes;
                last_time = now;"""
lib_rs = lib_rs.replace(old_transfer, new_transfer)

# 4. Fix load_custom_metadata to bubble errors except NotFound
old_load = """    let file_path = get_metadata_file_path(app_handle)?;
    if let Ok(content) = fs::read_to_string(file_path) {
        if let Ok(data) = serde_json::from_str(&content) {
            return Ok(data);
        }
    }
    Ok(HashMap::new())"""

new_load = """    let file_path = get_metadata_file_path(app_handle)?;
    match fs::read_to_string(&file_path) {
        Ok(content) => {
            if let Ok(data) = serde_json::from_str(&content) {
                return Ok(data);
            }
            Ok(HashMap::new())
        },
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                Ok(HashMap::new())
            } else {
                Err(format!("Error reading metadata database: {}", e))
            }
        }
    }"""
lib_rs = lib_rs.replace(old_load, new_load)

# 5. Fix save_custom_metadata silent failure
old_save = """    if let Ok(json) = serde_json::to_string_pretty(&data) {
        let _ = fs::write(file_path, json);
    }
    Ok(())"""

new_save = """    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(file_path, json).map_err(|e| format!("Error saving metadata: {}", e))?;
    Ok(())"""
lib_rs = lib_rs.replace(old_save, new_save)


# 6. Windows Disk Space casing fix
old_starts = "if path.starts_with(mount) {"
new_starts = """let path_str = path.to_string_lossy().to_lowercase();
            let mount_str = mount.to_string_lossy().to_lowercase();
            if path_str.starts_with(&mount_str) {"""
lib_rs = lib_rs.replace(old_starts, new_starts)

with open("src-tauri/src/lib.rs", "w") as f:
    f.write(lib_rs)

print("Rust code patched successfully.")
