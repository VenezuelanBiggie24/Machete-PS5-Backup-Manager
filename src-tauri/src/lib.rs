use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use regex::Regex;
use sysinfo::Disks;
use std::sync::LazyLock;

#[derive(Serialize, Clone)]
struct FileItem {
    name: String,
    path: String,
    ppsa: Option<String>,
    size_bytes: u64,
    is_dir: bool,
    local_title: Option<String>,
    local_icon: Option<String>,
    app_ver: Option<String>,
    sdk_ver: Option<String>,
    min_firmware: Option<String>,
    content_id: Option<String>,
    category: Option<String>,
    has_local_icon: bool,
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

static RE_FILENAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:PPSA|CUSA)[-_ ]?\d{5}").expect("valid regex")
});

static RE_TITLE_ID: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"titleId"\s*:\s*"((?:PPSA|CUSA)\d{5})""#).expect("valid regex")
});

static RE_RAW_TITLE_ID: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)(PPSA\d{5}|CUSA\d{5})"#).expect("valid regex")
});

static RE_TITLE_NAME: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"titleName"\s*:\s*"([^"]+)""#).expect("valid regex")
});

static RE_APP_VER: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"appVer"\s*:\s*"([^"]+)""#).expect("valid regex")
});

fn get_custom_meta_file(app: &tauri::AppHandle) -> std::path::PathBuf {
    let app_data = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    if !app_data.exists() {
        let _ = fs::create_dir_all(&app_data);
    }
    app_data.join("machete_custom_meta.json")
}

fn get_covers_cache_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    let app_data = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let covers_dir = app_data.join("cache").join("covers");
    if !covers_dir.exists() {
        let _ = fs::create_dir_all(&covers_dir);
    }
    covers_dir
}

fn get_cached_cover_base64(app: &tauri::AppHandle, clean_ppsa: &str) -> Option<String> {
    let cache_dir = get_covers_cache_dir(app);
    for ext in &["webp", "png", "jpg", "jpeg"] {
        let file_path = cache_dir.join(format!("{}.{}", clean_ppsa, ext));
        if file_path.exists() {
            if let Ok(mut f) = fs::File::open(&file_path) {
                let mut buffer = Vec::new();
                if f.read_to_end(&mut buffer).is_ok() && !buffer.is_empty() {
                    let mime = match *ext {
                        "webp" => "image/webp",
                        "png" => "image/png",
                        _ => "image/jpeg",
                    };
                    return Some(format!("data:{};base64,{}", mime, general_purpose::STANDARD.encode(&buffer)));
                }
            }
        }
    }
    None
}

fn save_cover_to_cache(app: &tauri::AppHandle, clean_ppsa: &str, image_bytes: &[u8], content_type: &str) {
    let cache_dir = get_covers_cache_dir(app);
    let ext = if content_type.contains("webp") {
        "webp"
    } else if content_type.contains("png") {
        "png"
    } else {
        "jpg"
    };
    let file_path = cache_dir.join(format!("{}.{}", clean_ppsa, ext));
    let _ = fs::write(file_path, image_bytes);
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
        let clean_ppsa = ppsa.to_uppercase().replace("-", "").replace("_", "").replace(" ", "");
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
        let clean_ppsa = ppsa.to_uppercase().replace("-", "").replace("_", "").replace(" ", "");
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
    let clean_ppsa = ppsa.to_uppercase().replace("-", "").replace("_", "").replace(" ", "");
    
    // Check local database first
    let db = load_custom_metadata(&app).unwrap_or_default();
    let custom_entry = db.get(&clean_ppsa).cloned();
    
    // We use tauri::async_runtime::spawn_blocking to run blocking code without blocking the async executor
    let result = tauri::async_runtime::spawn_blocking(move || {
        
        // PRIVACY/SECURITY: Create an anonymized client that doesn't leak OS/Browser data
        let client = reqwest::blocking::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)") // Generic non-identifiable UA
            .timeout(std::time::Duration::from_secs(6))
            .connect_timeout(std::time::Duration::from_secs(3))
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
                                    region_flag = Some("US".to_string());
                                } else if id_str.starts_with("EP") {
                                    region_flag = Some("EU".to_string());
                                } else if id_str.starts_with("JP") {
                                    region_flag = Some("JP".to_string());
                                } else if id_str.starts_with("HP") {
                                    region_flag = Some("ASIA".to_string()); 
                                }
                            }
                            
                            return Some((name, cover, region_flag));
                        }
                    }
                }
            }
            None
        };
        
        let mut final_name = clean_ppsa.clone();
        let mut final_cover: Option<String> = None;
        let mut final_region: Option<String> = None;

        // 1. Try original PPSA on Machete's Own Cloudflare R2 Global CDN First
        let machete_cdn_url = format!("https://pub-ff9ca9f4c73c45fca9efa3fadc7a65cf.r2.dev/{}.webp", clean_ppsa);
        if let Ok(cdn_res) = client.head(&machete_cdn_url).send() {
            if cdn_res.status().is_success() {
                final_cover = Some(machete_cdn_url);
            }
        }

        // 2. Fetch metadata & artwork from Store/SerialStation
        if let Some((name, cover, region)) = get_product_data(&clean_ppsa) {
            final_name = name;
            final_region = region; // Keep original region flag
            if final_cover.is_none() && cover.is_some() {
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
        
        // 4. Fallback to Retroforge CDN if cover is still missing
        if final_cover.is_none() {
            let cdn_url = format!("https://retroforge-cdn.pages.dev/covers/{}.png", clean_ppsa);
            if let Ok(head_res) = client.head(&cdn_url).send() {
                if head_res.status().is_success() {
                    final_cover = Some(cdn_url);
                }
            }
        }
        
        // 5. Cache the downloaded cover image locally on disk for future instant offline retrieval
        if let Some(ref cover_url) = final_cover {
            if cover_url.starts_with("http") {
                if let Ok(img_res) = client.get(cover_url).send() {
                    let content_type = img_res.headers()
                        .get(reqwest::header::CONTENT_TYPE)
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("image/jpeg")
                        .to_string();
                    if let Ok(bytes) = img_res.bytes() {
                        if !bytes.is_empty() {
                            save_cover_to_cache(&app, &clean_ppsa, &bytes, &content_type);
                        }
                    }
                }
            }
        }

        // Apply cached local cover if network is offline or cover wasn't found online
        if final_cover.is_none() {
            if let Some(cached) = get_cached_cover_base64(&app, &clean_ppsa) {
                final_cover = Some(cached);
            }
        }

        // Apply manual user overrides if they exist
        if let Some(custom) = custom_entry {
            if let Some(t) = custom.title {
                final_name = t;
            }
            if let Some(c) = custom.cover_base64 {
                final_cover = Some(c);
            }
        }
        
        // 6. Return what we have
        Ok(MetadataInfo { title: final_name, cover: final_cover, region_flag: final_region })
    }).await;
    
    result.map_err(|e| e.to_string())?
}


fn calculate_dir_size(path: &std::path::Path) -> u64 {
    let mut size = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_symlink() {
                    continue; // Skip symlinks to avoid circular recursion loops
                }
                if file_type.is_dir() {
                    size += calculate_dir_size(&entry.path());
                } else if let Ok(meta) = entry.metadata() {
                    size += meta.len();
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

struct Ps5InspectResult {
    ppsa: Option<String>,
    local_title: Option<String>,
    local_icon: Option<String>,
    app_ver: Option<String>,
    sdk_ver: Option<String>,
    min_firmware: Option<String>,
    content_id: Option<String>,
    category: Option<String>,
    has_local_icon: bool,
}

fn format_fw_version(val: &serde_json::Value) -> Option<String> {
    if let Some(s) = val.as_str() {
        if s.starts_with("0x") || s.starts_with("0X") {
            if let Ok(num) = u64::from_str_radix(&s[2..], 16) {
                let major = (num >> 24) & 0xFF;
                let minor = (num >> 16) & 0xFF;
                return Some(format!("{}.{:02}", major, minor));
            }
        }
        return Some(s.to_string());
    } else if let Some(n) = val.as_u64() {
        let major = (n >> 24) & 0xFF;
        let minor = (n >> 16) & 0xFF;
        if major > 0 {
            return Some(format!("{}.{:02}", major, minor));
        }
    }
    None
}

fn inspect_ps5_item(path_buf: &Path) -> Ps5InspectResult {
    let mut ppsa = None;
    let mut local_title = None;
    let mut local_icon = None;
    let mut app_ver = None;
    let mut sdk_ver = None;
    let mut min_firmware = None;
    let mut content_id = None;
    let mut category = None;
    let mut has_local_icon = false;

    if path_buf.is_dir() {
        // 1. Check for sce_sys/param.json or param.json
        let param_candidates = [
            path_buf.join("sce_sys").join("param.json"),
            path_buf.join("param.json"),
        ];

        for param_path in &param_candidates {
            if param_path.exists() {
                if let Ok(content) = fs::read_to_string(param_path) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(tid) = json.get("titleId").or_else(|| json.get("title_id")).and_then(|v| v.as_str()) {
                            let clean = tid.to_uppercase().replace("-", "").replace("_", "").replace(" ", "");
                            if clean.starts_with("PPSA") {
                                ppsa = Some(clean);
                            }
                        }
                        if let Some(tname) = json.get("titleName")
                            .or_else(|| json.get("title_name"))
                            .or_else(|| json.get("defaultLanguageTitle"))
                            .and_then(|v| v.as_str()) {
                            local_title = Some(tname.to_string());
                        }
                        if let Some(aver) = json.get("appVer").or_else(|| json.get("app_ver")).and_then(|v| v.as_str()) {
                            app_ver = Some(aver.to_string());
                        }
                        if let Some(sver) = json.get("sdkVersion").or_else(|| json.get("sdk_ver")) {
                            sdk_ver = format_fw_version(sver);
                        }
                        if let Some(fw) = json.get("requiredSystemSoftwareVersion").or_else(|| json.get("required_system_software_version")) {
                            min_firmware = format_fw_version(fw);
                        }
                        if let Some(cid) = json.get("contentId").or_else(|| json.get("content_id")).and_then(|v| v.as_str()) {
                            content_id = Some(cid.to_string());
                        }
                        if let Some(cat) = json.get("category").and_then(|v| v.as_str()) {
                            category = Some(cat.to_string());
                        }
                    }
                }
                break;
            }
        }

        // 2. Check for sce_sys/icon0.png or icon0.png
        let icon_candidates = [
            path_buf.join("sce_sys").join("icon0.png"),
            path_buf.join("icon0.png"),
        ];

        for icon_path in &icon_candidates {
            if icon_path.exists() {
                has_local_icon = true;
                if let Ok(mut f) = fs::File::open(icon_path) {
                    let mut buf = Vec::new();
                    if f.read_to_end(&mut buf).is_ok() && !buf.is_empty() && buf.len() <= 5 * 1024 * 1024 {
                        local_icon = Some(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&buf)));
                    }
                }
                break;
            }
        }
    } else {
        // For all ShadowMountPlus and PS5 container files (.ffpkg, .exfat, .ffpfs, .ffpfsc, .pkg, .pfs, .ufs, .img, .bin, .dump, .raw, .iso, .dat, .vhd, .vhdx, .dsk, .bak, .part)
        let ext = path_buf.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let is_known_container = matches!(
            ext.as_str(),
            "ffpkg" | "exfat" | "ffpfs" | "ffpfsc" | "pkg" | "pfs" | "ufs" | "img" | "bin" | "dump" | "raw" | "iso" | "dat" | "vhd" | "vhdx" | "dsk" | "bak" | "part" | ""
        );

        if is_known_container || path_buf.metadata().map(|m| m.len() >= 512).unwrap_or(false) {
            if let Ok(mut file) = fs::File::open(path_buf) {
                let mut buffer = vec![0u8; 1024 * 1024]; // Read 1MB header efficiently
                if let Ok(bytes_read) = file.read(&mut buffer) {
                    let slice = &buffer[..bytes_read];
                    if let Some(caps) = RE_TITLE_ID.captures(slice) {
                        if let Some(m) = caps.get(1) {
                            if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                ppsa = Some(s.to_uppercase().replace("-", "").replace("_", "").replace(" ", ""));
                            }
                        }
                    }
                    if ppsa.is_none() {
                        if let Some(caps) = RE_RAW_TITLE_ID.captures(slice) {
                            if let Some(m) = caps.get(1) {
                                if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                    ppsa = Some(s.to_uppercase().replace("-", "").replace("_", "").replace(" ", ""));
                                }
                            }
                        }
                    }
                    if let Some(caps) = RE_TITLE_NAME.captures(slice) {
                        if let Some(m) = caps.get(1) {
                            if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                local_title = Some(s.to_string());
                            }
                        }
                    }
                    if let Some(caps) = RE_APP_VER.captures(slice) {
                        if let Some(m) = caps.get(1) {
                            if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                app_ver = Some(s.to_string());
                            }
                        }
                    }
                }
            }
        }

        if category.is_none() {
            let ext = path_buf.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            category = Some(match ext.as_str() {
                "ffpkg" => "ShadowMount UFS (.ffpkg)".to_string(),
                "exfat" => "ShadowMount exFAT (.exfat)".to_string(),
                "ffpfsc" => "ShadowMount Container (.ffpfsc)".to_string(),
                "ffpfs" | "pfs" => "ShadowMount PFS (.ffpfs)".to_string(),
                "pkg" => "Package (.pkg)".to_string(),
                "iso" | "img" | "bin" => "Disc Image".to_string(),
                _ => "Container".to_string(),
            });
        }
    }

    if path_buf.is_dir() && category.is_none() {
        category = Some("Folder Dump".to_string());
    }

    Ps5InspectResult {
        ppsa,
        local_title,
        local_icon,
        app_ver,
        sdk_ver,
        min_firmware,
        content_id,
        category,
        has_local_icon,
    }
}

#[tauri::command]
async fn read_directory(path: String) -> Result<Vec<FileItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = Vec::new();
        let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
        
        for entry in entries.flatten() {
            let path_buf = entry.path();
            if let Some(file_name) = path_buf.file_name().and_then(|n| n.to_str()) {
                if file_name.starts_with('.') {
                    continue;
                }
                
                // 1. Inspect PS5 structure (sce_sys/param.json, containers)
                let inspected = inspect_ps5_item(&path_buf);
                
                // 2. Fallback to filename regex if PPSA wasn't inside the container
                let ppsa = inspected.ppsa.or_else(|| {
                    RE_FILENAME.find(file_name).map(|mat| {
                        mat.as_str().to_uppercase().replace("-", "").replace("_", "").replace(" ", "")
                    })
                });
                
                let mut size_bytes = 0;
                let is_dir = path_buf.is_dir();
                if !is_dir {
                    if let Ok(metadata) = fs::metadata(&path_buf) {
                        size_bytes = metadata.len();
                    }
                }
                
                files.push(FileItem {
                    name: file_name.to_string(),
                    path: path_buf.to_string_lossy().to_string(),
                    ppsa,
                    size_bytes,
                    is_dir,
                    local_title: inspected.local_title,
                    local_icon: inspected.local_icon,
                    app_ver: inspected.app_ver,
                    sdk_ver: inspected.sdk_ver,
                    min_firmware: inspected.min_firmware,
                    content_id: inspected.content_id,
                    category: inspected.category,
                    has_local_icon: inspected.has_local_icon,
                });
            }
        }
        
        Ok(files)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_in_file_manager(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        if !p.exists() {
            return Err("Path does not exist".into());
        }
        
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("open").arg("-R").arg(&path).spawn();
        }
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("explorer").arg(format!("/select,\"{}\"", path)).spawn();
        }
        #[cfg(target_os = "linux")]
        {
            let parent = p.parent().unwrap_or(p);
            let _ = std::process::Command::new("xdg-open").arg(parent).spawn();
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_disk_space(path: String) -> Result<DiskInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let disks = Disks::new_with_refreshed_list();
        let raw_path = PathBuf::from(&path);
        let target_path = raw_path.canonicalize().unwrap_or(raw_path);
        
        let mut best_match: Option<&sysinfo::Disk> = None;
        let mut longest_prefix = 0;

        for disk in disks.iter() {
            let mount = disk.mount_point();
            let canonical_mount = mount.canonicalize().unwrap_or_else(|_| mount.to_path_buf());
            if target_path.starts_with(&canonical_mount) {
                let prefix_len = canonical_mount.components().count();
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
        if path.trim().is_empty() || path_buf.parent().is_none() || path == "/" || path == "\\" {
            return Err("Invalid or protected root path provided for deletion".into());
        }
        if !path_buf.exists() {
            return Err("Path does not exist".into());
        }
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

#[cfg(target_os = "macos")]
fn try_macos_clone(src: &Path, dst: &Path) -> bool {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    extern "C" {
        fn clonefile(
            src: *const std::os::raw::c_char,
            dst: *const std::os::raw::c_char,
            flags: u32,
        ) -> std::os::raw::c_int;
    }

    if let (Ok(c_src), Ok(c_dst)) = (
        CString::new(src.as_os_str().as_bytes()),
        CString::new(dst.as_os_str().as_bytes()),
    ) {
        unsafe { clonefile(c_src.as_ptr(), c_dst.as_ptr(), 0) == 0 }
    } else {
        false
    }
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
        
        let target_path = Path::new(&target_dir);

        #[cfg(target_os = "macos")]
        {
            let mut all_cloned = true;
            for src_str in &sources {
                let src_path = Path::new(src_str);
                if let Some(name) = src_path.file_name() {
                    let dest_item = target_path.join(name);
                    if !dest_item.exists() && try_macos_clone(src_path, &dest_item) {
                        continue;
                    }
                }
                all_cloned = false;
                break;
            }

            if all_cloned {
                let _ = app_handle.emit("transfer-progress", TransferProgress {
                    percent: 100.0,
                    current_file: "APFS CoW Instant Clone Complete".to_string(),
                    speed_bytes_per_sec: 10_000_000_000.0,
                    eta_seconds: 0.0,
                });
                return Ok(());
            }
        }

        let mut options = fs_extra::dir::CopyOptions::new();
        options.copy_inside = true;
        options.buffer_size = 16 * 1024 * 1024; // 16MB high-throughput PCIe SSD chunk buffer
        
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
            .map(|_| ())
            .map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())??;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem};
                use tauri::Emitter;

                let check_update_item = MenuItemBuilder::with_id("check_update", "Buscar actualizaciones...").build(app)?;
                let about_item = MenuItemBuilder::with_id("open_about", "Acerca de Machete").build(app)?;
                
                let app_submenu = SubmenuBuilder::new(app, "Machete")
                    .item(&about_item)
                    .item(&check_update_item)
                    .separator()
                    .item(&PredefinedMenuItem::services(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::hide(app, None)?)
                    .item(&PredefinedMenuItem::hide_others(app, None)?)
                    .item(&PredefinedMenuItem::show_all(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::quit(app, None)?)
                    .build()?;

                // Standard Edit submenu restores Cmd+C, Cmd+V, Cmd+A, Cmd+Z in macOS WebViews
                let edit_submenu = SubmenuBuilder::new(app, "Edit")
                    .item(&PredefinedMenuItem::undo(app, None)?)
                    .item(&PredefinedMenuItem::redo(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::cut(app, None)?)
                    .item(&PredefinedMenuItem::copy(app, None)?)
                    .item(&PredefinedMenuItem::paste(app, None)?)
                    .item(&PredefinedMenuItem::select_all(app, None)?)
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .item(&app_submenu)
                    .item(&edit_submenu)
                    .build()?;

                app.set_menu(menu)?;

                let handle = app.handle().clone();
                app.on_menu_event(move |_app, event| {
                    if event.id() == "check_update" {
                        let _ = handle.emit("menu-check-update", ());
                    } else if event.id() == "open_about" {
                        let _ = handle.emit("menu-open-about", ());
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_metadata_rs,
            save_custom_title,
            save_custom_cover,
            read_directory,
            get_folder_size, 
            get_disk_space, 
            delete_file, 
            transfer_items,
            open_in_file_manager
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
