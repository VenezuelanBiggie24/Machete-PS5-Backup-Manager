use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use regex::Regex;
use sysinfo::Disks;
use reqwest::blocking::get;
use serde_json::Value;

#[derive(Serialize)]
struct FileItem {
    name: String,
    path: String,
    ppsa: Option<String>,
    size_bytes: u64,
}

#[derive(Serialize)]
struct DiskInfo {
    total: u64,
    free: u64,
}

#[derive(Serialize)]
struct MetadataInfo {
    title: String,
    cover: Option<String>,
    region_flag: Option<String>,
}

use tauri::Manager;
use base64::{Engine as _, engine::general_purpose};
use std::io::Read;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Default, Clone)]
struct CustomMeta {
    title: Option<String>,
    cover_base64: Option<String>, // Store image as base64 string directly to avoid path issues
}

fn get_custom_meta_file(app: &tauri::AppHandle) -> std::path::PathBuf {
    let app_data = app.path().app_data_dir().unwrap();
    if !app_data.exists() {
        let _ = fs::create_dir_all(&app_data);
    }
    app_data.join("machete_custom_meta.json")
}

fn load_custom_metadata(app: &tauri::AppHandle) -> Result<HashMap<String, CustomMeta>, String> {
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
}

#[tauri::command]
async fn save_custom_title(app: tauri::AppHandle, ppsa: String, title: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_ppsa = ppsa.replace("-", "").replace("_", "").replace(" ", "");
        let mut db = load_custom_metadata(&app)?;
        let entry = db.entry(clean_ppsa).or_default();
        entry.title = Some(title);
        save_custom_metadata(&app, &db)?;
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_custom_cover(app: tauri::AppHandle, ppsa: String, image_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_ppsa = ppsa.replace("-", "").replace("_", "").replace(" ", "");
        // Read image file and convert to base64
        let mut file = fs::File::open(&image_path).map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        
        let ext = std::path::Path::new(&image_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpeg")
            .to_lowercase();
            
        let mime_type = match ext.as_str() {
            "png" => "image/png",
            "webp" => "image/webp",
            "gif" => "image/gif",
            _ => "image/jpeg",
        };
        
        let base64_img = format!("data:{};base64,{}", mime_type, general_purpose::STANDARD.encode(&buffer));
        
        let mut db = load_custom_metadata(&app)?;
        let entry = db.entry(clean_ppsa).or_default();
        entry.cover_base64 = Some(base64_img.clone());
        save_custom_metadata(&app, &db)?;
        
        Ok(base64_img)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn fetch_metadata_rs(app: tauri::AppHandle, ppsa: String) -> Result<MetadataInfo, String> {
    let clean_ppsa = ppsa.replace("-", "").replace("_", "").replace(" ", "");
    
    // Check local database first
    let db = load_custom_metadata(&app).unwrap_or_default();
    let custom_entry = db.get(&clean_ppsa).cloned();
    
    // We use tauri::async_runtime::spawn_blocking to run blocking code without blocking the async executor
    let result = tauri::async_runtime::spawn_blocking(move || {
        
        // PRIVACY/SECURITY: Create an anonymized client that doesn't leak OS/Browser data
        let client = reqwest::blocking::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)") // Generic non-identifiable UA
            .build()
            .unwrap_or_default();
            
        // Helper function to query a specific PPSA for metadata
        let get_product_data = |target_ppsa: &str| -> Option<(String, Option<String>, Option<String>)> {
            let url = format!("https://api.serialstation.com/v1/store/products?title_id_search={}", target_ppsa);
            if let Ok(response) = client.get(&url).send() {
                if let Ok(json) = response.json::<serde_json::Value>() {
                    if let Some(items) = json.get("items").and_then(|i| i.as_array()) {
                        if !items.is_empty() {
                            let item = &items[0];
                            let name = item.get("name_en")
                                .and_then(|n| n.as_str())
                                .or_else(|| {
                                    item.get("localization")
                                        .and_then(|l| l.get("name"))
                                        .and_then(|n| n.as_str())
                                })
                                .unwrap_or(target_ppsa)
                                .to_string();
                            
                            let mut cover = None;
                            if let Some(images) = item.get("localization").and_then(|l| l.get("images")).and_then(|i| i.as_array()) {
                                for img in images {
                                    if img.get("type").and_then(|t| t.as_str()) == Some("PORTRAIT_BANNER") {
                                        cover = img.get("url").and_then(|u| u.as_str()).map(|s| s.to_string());
                                        break;
                                    }
                                }
                                if cover.is_none() {
                                    for img in images {
                                        if img.get("type").and_then(|t| t.as_str()) == Some("GAMEHUB_COVER_ART") {
                                            cover = img.get("url").and_then(|u| u.as_str()).map(|s| s.to_string());
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            let mut region_flag = None;
                            if let Some(id_str) = item.get("id").and_then(|id| id.as_str()) {
                                if id_str.starts_with("UP") {
                                    region_flag = Some("🇺🇸".to_string());
                                } else if id_str.starts_with("EP") {
                                    region_flag = Some("🇪🇺".to_string());
                                } else if id_str.starts_with("JP") {
                                    region_flag = Some("🇯🇵".to_string());
                                } else if id_str.starts_with("HP") {
                                    region_flag = Some("🌏".to_string()); 
                                }
                            }
                            
                            return Some((name, cover, region_flag));
                        }
                    }
                }
            }
            None
        };
        
        // 1. Try original PPSA first
        let mut final_name = clean_ppsa.clone();
        let mut final_cover: Option<String> = None;
        let mut final_region: Option<String> = None;
        
        if let Some((name, cover, region)) = get_product_data(&clean_ppsa) {
            final_name = name;
            final_region = region; // Keep original region flag
            if cover.is_some() {
                final_cover = cover;
            }
        }
        
        // 2. If cover missing or empty, hit title-ids to get the game uuid (and real name)
        if final_cover.is_none() {
            let title_url = format!("https://api.serialstation.com/v1/title-ids/{}", clean_ppsa);
            if let Ok(fallback_res) = client.get(&title_url).send() {
                if let Ok(fallback_json) = fallback_res.json::<serde_json::Value>() {
                    if final_name == clean_ppsa {
                        if let Some(name) = fallback_json.get("name").and_then(|n| n.as_str()) {
                            final_name = name.to_string();
                        }
                    }
                    
                    // 3. Get the Game Object to find cross-region alternative PPSA IDs
                    if let Some(games) = fallback_json.get("games").and_then(|g| g.as_array()) {
                        if !games.is_empty() {
                            if let Some(game_id) = games[0].get("id").and_then(|id| id.as_str()) {
                                let game_url = format!("https://api.serialstation.com/v1/games/{}", game_id);
                                if let Ok(game_res) = client.get(&game_url).send() {
                                    if let Ok(game_json) = game_res.json::<serde_json::Value>() {
                                        if let Some(title_ids) = game_json.get("title_ids").and_then(|t| t.as_array()) {
                                            for t_id in title_ids {
                                                if let Some(alt_ppsa) = t_id.as_str() {
                                                    // Only try other PS5 (PPSA) codes
                                                    if alt_ppsa.starts_with("PPSA") && alt_ppsa != clean_ppsa {
                                                        // 4. Query alternative PPSA just for the image
                                                        if let Some((_, alt_cover, _)) = get_product_data(alt_ppsa) {
                                                            if alt_cover.is_some() {
                                                                final_cover = alt_cover;
                                                                break;
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Apply manual overrides if they exist
        if let Some(custom) = custom_entry {
            if let Some(t) = custom.title {
                final_name = t;
            }
            if let Some(c) = custom.cover_base64 {
                final_cover = Some(c);
            }
        }
        
        // 5. Return what we have
        Ok(MetadataInfo { title: final_name, cover: final_cover, region_flag: final_region })
    }).await;
    
    result.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_directory(path: String) -> Result<Vec<FileItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = Vec::new();
        let re = Regex::new(r"(?i)PPSA[-_ ]?\d{5}").unwrap();

        let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
        
        for entry in entries {
            if let Ok(entry) = entry {
                let path_buf = entry.path();
                if let Some(file_name) = path_buf.file_name().and_then(|n| n.to_str()) {
                    if file_name.starts_with('.') {
                        continue;
                    }
                    
                    let mut ppsa = None;
                    if let Some(mat) = re.find(file_name) {
                        let cleaned_ppsa = mat.as_str().to_uppercase().replace("-", "").replace("_", "").replace(" ", "");
                        ppsa = Some(cleaned_ppsa);
                    }
                    
                    let mut size_bytes = 0;
                    if !path_buf.is_dir() {
                        if let Ok(metadata) = fs::metadata(&path_buf) {
                            size_bytes = metadata.len();
                        }
                    }
                    
                    files.push(FileItem {
                        name: file_name.to_string(),
                        path: path_buf.to_string_lossy().to_string(),
                        ppsa,
                        size_bytes,
                    });
                }
            }
        }
        
        Ok(files)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_disk_space(path: String) -> Result<DiskInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let disks = Disks::new_with_refreshed_list();
        let path = Path::new(&path);
        
        let mut best_match: Option<&sysinfo::Disk> = None;
        let mut longest_prefix = 0;

        for disk in disks.iter() {
            let mount = disk.mount_point();
            let path_str = path.to_string_lossy().to_lowercase();
            let mount_str = mount.to_string_lossy().to_lowercase();
            if path_str.starts_with(&mount_str) {
                let prefix_len = mount.components().count();
                if prefix_len > longest_prefix {
                    longest_prefix = prefix_len;
                    best_match = Some(disk);
                }
            }
        }

        if let Some(disk) = best_match {
            Ok(DiskInfo {
                total: disk.total_space(),
                free: disk.available_space(),
            })
        } else {
            Err("Could not determine disk for the given path".into())
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_file(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path_buf = Path::new(&path);
        if path_buf.is_dir() {
            fs::remove_dir_all(path_buf).map_err(|e| e.to_string())
        } else {
            fs::remove_file(path_buf).map_err(|e| e.to_string())
        }
    }).await.map_err(|e| e.to_string())?
}

#[derive(Clone, serde::Serialize)]
struct TransferProgress {
    percent: f64,
    current_file: String,
    speed_bytes_per_sec: f64,
    eta_seconds: f64,
}

#[tauri::command]
async fn transfer_items(
    app_handle: tauri::AppHandle,
    sources: Vec<String>, 
    target_dir: String
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Emitter;
        use std::time::Instant;
        
        let mut options = fs_extra::dir::CopyOptions::new();
        options.copy_inside = true;
        
        let mut last_emit = Instant::now();
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
                last_time = now;
                
                let remaining_bytes = process_info.total_bytes.saturating_sub(process_info.copied_bytes) as f64;
                let eta = if speed > 0.0 {
                    remaining_bytes / speed
                } else {
                    0.0
                };
                
                let _ = app_handle.emit("transfer-progress", TransferProgress {
                    percent,
                    current_file: process_info.file_name.clone(),
                    speed_bytes_per_sec: speed,
                    eta_seconds: eta,
                });
                
                last_emit = now;
            }
            fs_extra::dir::TransitProcessResult::ContinueOrAbort
        };

        fs_extra::copy_items_with_progress(&sources, &target_dir, &options, handler)
            .map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())??;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
                .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_metadata_rs,
            save_custom_title,
            save_custom_cover,
            read_directory, 
            get_disk_space, 
            delete_file, 
            transfer_items
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
