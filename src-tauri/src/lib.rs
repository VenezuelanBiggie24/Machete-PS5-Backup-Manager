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
    regex::bytes::Regex::new(r#"(?i)"(?:titleId|title_id)"\s*:\s*"((?:PPSA|CUSA)\d{5})""#).expect("valid regex")
});

static RE_RAW_TITLE_ID: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)(PPSA\d{5}|CUSA\d{5})"#).expect("valid regex")
});

static RE_TITLE_NAME: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"(?:titleName|title_name|defaultLanguageTitle|title)"\s*:\s*"([^"]+)""#).expect("valid regex")
});

static RE_APP_VER: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"(?:appVer|app_ver|appVersion|app_version|version|masterVersion|master_version|titleVersion|title_version)"\s*:\s*"?([^",\s}]+)"?"#).expect("valid regex")
});

static RE_SDK_VER: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"(?:sdkVersion|sdk_version|sdk_ver|sdkVer|systemVersion|system_version|systemVer|system_ver)"\s*:\s*"?([^",\s}]+)"?"#).expect("valid regex")
});

static RE_REQ_FW: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"(?:requiredSystemSoftwareVersion|required_system_software_version|min_fw|min_firmware|system_ver|systemVersion)"\s*:\s*"?([^",\s}]+)"?"#).expect("valid regex")
});

static RE_CONTENT_ID: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"(?:contentId|content_id)"\s*:\s*"([^"]+)""#).expect("valid regex")
});

static RE_CATEGORY: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"category"\s*:\s*"([^"]+)""#).expect("valid regex")
});

#[derive(Default, Debug, Clone)]
struct SfoData {
    title_id: Option<String>,
    title: Option<String>,
    app_ver: Option<String>,
    sdk_ver: Option<String>,
    min_fw: Option<String>,
    content_id: Option<String>,
    category: Option<String>,
}

fn parse_binary_sfo(buffer: &[u8]) -> Option<SfoData> {
    for i in 0..buffer.len().saturating_sub(20) {
        if &buffer[i..i+4] == b"\x00PSF" {
            let sfo_slice = &buffer[i..];
            if sfo_slice.len() < 20 { continue; }
            let key_table_offset = u32::from_le_bytes(sfo_slice[8..12].try_into().unwrap_or([0;4])) as usize;
            let data_table_offset = u32::from_le_bytes(sfo_slice[12..16].try_into().unwrap_or([0;4])) as usize;
            let entries_count = u32::from_le_bytes(sfo_slice[16..20].try_into().unwrap_or([0;4])) as usize;

            if key_table_offset >= sfo_slice.len() || data_table_offset >= sfo_slice.len() || entries_count > 256 {
                continue;
            }

            let mut res = SfoData::default();
            for e in 0..entries_count {
                let entry_pos = 20 + e * 16;
                if entry_pos + 16 > key_table_offset || entry_pos + 16 > sfo_slice.len() {
                    break;
                }
                let key_offset = u16::from_le_bytes(sfo_slice[entry_pos..entry_pos+2].try_into().unwrap_or([0;2])) as usize;
                let data_fmt = u16::from_le_bytes(sfo_slice[entry_pos+2..entry_pos+4].try_into().unwrap_or([0;2]));
                let data_len = u32::from_le_bytes(sfo_slice[entry_pos+4..entry_pos+8].try_into().unwrap_or([0;4])) as usize;
                let data_offset = u32::from_le_bytes(sfo_slice[entry_pos+12..entry_pos+16].try_into().unwrap_or([0;4])) as usize;

                let abs_key_start = key_table_offset + key_offset;
                if abs_key_start >= sfo_slice.len() { continue; }
                let key_bytes = &sfo_slice[abs_key_start..];
                let key_end = key_bytes.iter().position(|&b| b == 0).unwrap_or(key_bytes.len().min(64));
                let key_name = std::str::from_utf8(&key_bytes[..key_end]).unwrap_or("");

                let abs_data_start = data_table_offset + data_offset;
                if abs_data_start + data_len > sfo_slice.len() { continue; }
                let val_bytes = &sfo_slice[abs_data_start..abs_data_start + data_len];

                if data_fmt == 0x0204 || data_fmt == 0x0004 {
                    let str_end = val_bytes.iter().position(|&b| b == 0).unwrap_or(val_bytes.len());
                    if let Ok(val_str) = std::str::from_utf8(&val_bytes[..str_end]) {
                        let clean_val = val_str.trim();
                        match key_name {
                            "TITLE_ID" => res.title_id = Some(clean_val.to_uppercase().replace("-", "").replace("_", "")),
                            "TITLE" => res.title = Some(clean_val.to_string()),
                            "APP_VER" | "VERSION" => res.app_ver = format_ps5_app_version(clean_val),
                            "SDK_VER" => res.sdk_ver = format_ps5_sdk_version(clean_val),
                            "SYSTEM_VER" | "MIN_FW" => res.min_fw = format_ps5_sdk_version(clean_val),
                            "CONTENT_ID" => res.content_id = Some(clean_val.to_string()),
                            "CATEGORY" => res.category = Some(clean_val.to_string()),
                            _ => {}
                        }
                    }
                } else if data_fmt == 0x0404 && data_len >= 4 {
                    let int_val = u32::from_le_bytes(val_bytes[0..4].try_into().unwrap_or([0;4]));
                    let hex_val = format!("{:08x}", int_val);
                    match key_name {
                        "SYSTEM_VER" | "MIN_FW" => res.min_fw = format_ps5_sdk_version(&hex_val),
                        "SDK_VER" => res.sdk_ver = format_ps5_sdk_version(&hex_val),
                        "APP_VER" | "VERSION" => res.app_ver = format_ps5_app_version(&hex_val),
                        _ => {}
                    }
                }
            }

            if res.title_id.is_some() || res.title.is_some() || res.app_ver.is_some() {
                return Some(res);
            }
        }
    }
    None
}

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

fn format_ps5_sdk_version(raw: &str) -> Option<String> {
    let clean = raw.trim().trim_matches('"').trim_matches('\'');
    if clean.is_empty() || clean == "0" || clean == "0x0" || clean.eq_ignore_ascii_case("null") || clean.eq_ignore_ascii_case("n/a") {
        return None;
    }

    let without_0x = clean.strip_prefix("0x").or_else(|| clean.strip_prefix("0X")).unwrap_or(clean);

    // 1. Dotted format: e.g. "10.01.00.00", "09.00.00.00", "08.50.00.00", "7.61"
    if without_0x.contains('.') {
        let parts: Vec<&str> = without_0x.split('.').collect();
        if parts.len() >= 2 {
            let major = parts[0].trim_start_matches('0');
            let major_str = if major.is_empty() { "0" } else { major };
            let minor = parts[1];
            return Some(format!("{}.{}", major_str, minor));
        }
        return Some(without_0x.to_string());
    }

    // 2. Check if clean is a pure decimal integer from JSON value (e.g. 268500992 -> 0x10010000)
    let hex_candidate = if clean.chars().all(|c| c.is_ascii_digit()) && clean.len() >= 8 {
        if let Ok(num) = clean.parse::<u64>() {
            if num > 0xFFFFFFFF {
                format!("{:016x}", num)
            } else {
                format!("{:08x}", num)
            }
        } else {
            without_0x.to_string()
        }
    } else {
        without_0x.to_string()
    };

    let hex = hex_candidate.as_str();

    // 3. Hex / BCD parsing (PS5/PS4 SDK versions are BCD hex encoded: 0x09000000 -> 9.00, 0x10010000 -> 10.01)
    if hex.chars().all(|c| c.is_ascii_hexdigit()) {
        let pad = if hex.len() >= 16 {
            if hex.starts_with("00") {
                &hex[2..10]
            } else {
                &hex[0..8]
            }
        } else {
            hex
        };

        let pad_str = format!("{:0>8}", pad);
        if pad_str.len() >= 4 {
            let maj_str = &pad_str[0..2];
            let min_str = &pad_str[2..4];
            let maj_clean = maj_str.trim_start_matches('0');
            let maj_final = if maj_clean.is_empty() { "0" } else { maj_clean };

            if maj_final != "0" || min_str != "00" {
                return Some(format!("{}.{}", maj_final, min_str));
            }
        }
    }

    None
}

fn format_ps5_app_version(raw: &str) -> Option<String> {
    let clean = raw.trim().trim_matches('"').trim_matches('\'');
    if clean.is_empty() || clean == "0" || clean.eq_ignore_ascii_case("null") || clean.eq_ignore_ascii_case("n/a") {
        return None;
    }

    let without_0x = clean.strip_prefix("0x").or_else(|| clean.strip_prefix("0X")).unwrap_or(clean);

    // 1. Dotted format: "01.000.000" or "01.020.000" or "01.00" or "1.00"
    if without_0x.contains('.') {
        let parts: Vec<&str> = without_0x.split('.').collect();
        if parts.len() >= 2 {
            let major = parts[0].trim_start_matches('0');
            let major_str = if major.is_empty() { "1" } else { major };
            let minor = parts[1];
            let minor_str = if minor == "000" || minor == "00" {
                "00"
            } else if minor.len() == 3 && minor.ends_with("00") {
                &minor[0..1]
            } else if minor.len() == 3 && minor.ends_with('0') {
                &minor[0..2]
            } else {
                minor
            };
            return Some(format!("{}.{}", major_str, minor_str));
        }
        return Some(without_0x.to_string());
    }

    // 2. Hex / BCD format: e.g. "0x01000000" -> "1.00", "0x01020000" -> "1.02"
    let hex_candidate = if clean.chars().all(|c| c.is_ascii_digit()) && clean.len() >= 8 {
        if let Ok(num) = clean.parse::<u64>() {
            format!("{:08x}", num)
        } else {
            without_0x.to_string()
        }
    } else {
        without_0x.to_string()
    };

    if hex_candidate.chars().all(|c| c.is_ascii_hexdigit()) {
        let pad_str = format!("{:0>8}", hex_candidate);
        if pad_str.len() >= 4 {
            let major_str = pad_str[0..2].trim_start_matches('0');
            let major_final = if major_str.is_empty() { "1" } else { major_str };
            let minor_str = &pad_str[2..4];
            return Some(format!("{}.{}", major_final, minor_str));
        }
    }

    Some(clean.to_string())
}

fn format_json_val_sdk(val: &serde_json::Value) -> Option<String> {
    if let Some(s) = val.as_str() {
        format_ps5_sdk_version(s)
    } else if let Some(n) = val.as_u64() {
        format_ps5_sdk_version(&n.to_string())
    } else {
        None
    }
}

fn format_json_val_app(val: &serde_json::Value) -> Option<String> {
    if let Some(s) = val.as_str() {
        format_ps5_app_version(s)
    } else if let Some(n) = val.as_u64() {
        format_ps5_app_version(&n.to_string())
    } else {
        None
    }
}

fn decode_at9_to_wav(at9_bytes: &[u8]) -> Option<Vec<u8>> {
    if at9_bytes.len() < 44 || &at9_bytes[0..4] != b"RIFF" {
        return None;
    }
    let format_id = &at9_bytes[8..12];
    if format_id != b"WAVE" && format_id != b"AT9 " {
        return None;
    }

    let mut pos = 12;
    let mut fmt_data = None;
    let mut fact_data = None;
    let mut audio_data = None;

    while pos + 8 <= at9_bytes.len() {
        let chunk_id = &at9_bytes[pos..pos + 4];
        let chunk_size = u32::from_le_bytes(at9_bytes[pos + 4..pos + 8].try_into().unwrap_or([0; 4])) as usize;
        let chunk_end = (pos + 8 + chunk_size).min(at9_bytes.len());

        if chunk_id == b"fmt " {
            fmt_data = Some(&at9_bytes[pos + 8..chunk_end]);
        } else if chunk_id == b"fact" {
            fact_data = Some(&at9_bytes[pos + 8..chunk_end]);
        } else if chunk_id == b"data" {
            audio_data = Some(&at9_bytes[pos + 8..chunk_end]);
        }

        pos = chunk_end;
        if chunk_size % 2 != 0 {
            pos += 1;
        }
    }

    let fmt = fmt_data?;

    // Check if it's already a standard uncompressed PCM WAV (format tag 1)
    if fmt.len() >= 2 {
        let format_tag = u16::from_le_bytes(fmt[0..2].try_into().unwrap_or([0; 2]));
        if format_tag == 1 {
            return Some(at9_bytes.to_vec());
        }
    }

    let data = audio_data?;

    let mut decoder_opt = None;
    if fmt.len() >= 4 {
        let preferred_offsets = [40, fmt.len().saturating_sub(4), 44, 36, 48, 32, 28, 24, 16, 20];
        for &off in &preferred_offsets {
            if off + 4 <= fmt.len() {
                if let Ok(config_bytes) = fmt[off..off + 4].try_into() {
                    if let Ok(dec) = atrac9dec::Atrac9Decoder::new(&config_bytes) {
                        if dec.config().frame_bytes > 0 && dec.config().channel_count > 0 {
                            decoder_opt = Some(dec);
                            break;
                        }
                    }
                }
            }
        }
        if decoder_opt.is_none() {
            if let Some(fact) = fact_data {
                for off in [0, 4, 8, 12] {
                    if off + 4 <= fact.len() {
                        if let Ok(config_bytes) = fact[off..off + 4].try_into() {
                            if let Ok(dec) = atrac9dec::Atrac9Decoder::new(&config_bytes) {
                                if dec.config().frame_bytes > 0 && dec.config().channel_count > 0 {
                                    decoder_opt = Some(dec);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        if decoder_opt.is_none() {
            for off in 0..fmt.len().saturating_sub(4) {
                if let Ok(config_bytes) = fmt[off..off + 4].try_into() {
                    if let Ok(dec) = atrac9dec::Atrac9Decoder::new(&config_bytes) {
                        if dec.config().frame_bytes > 0 && dec.config().channel_count > 0 {
                            decoder_opt = Some(dec);
                            break;
                        }
                    }
                }
            }
        }
    }

    let mut decoder = decoder_opt?;
    let frame_bytes = decoder.config().frame_bytes as usize;
    let frame_samples = decoder.config().frame_samples as usize;
    let channels = decoder.config().channel_count as usize;
    let sample_rate = decoder.config().sample_rate as u32;

    if frame_bytes == 0 || channels == 0 || frame_samples == 0 || data.is_empty() {
        return None;
    }

    let mut all_pcm: Vec<i16> = Vec::new();
    let mut frame_pcm = vec![0i16; frame_samples * channels];
    let mut offset = 0;

    let max_frames = (sample_rate as usize * 30) / frame_samples;
    let mut frames_decoded = 0;

    while offset + frame_bytes <= data.len() && frames_decoded < max_frames {
        let frame_slice = &data[offset..offset + frame_bytes];
        if decoder.decode(frame_slice, &mut frame_pcm).is_ok() {
            all_pcm.extend_from_slice(&frame_pcm);
            frames_decoded += 1;
        }
        offset += frame_bytes;
    }

    if all_pcm.is_empty() {
        return None;
    }

    let pcm_bytes_len = (all_pcm.len() * 2) as u32;
    let mut wav = Vec::with_capacity(44 + pcm_bytes_len as usize);

    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + pcm_bytes_len).to_le_bytes());
    wav.extend_from_slice(b"WAVE");

    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&(channels as u16).to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    let byte_rate = sample_rate * (channels as u32) * 2;
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    let block_align = (channels as u16) * 2;
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());

    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&pcm_bytes_len.to_le_bytes());
    for s in all_pcm {
        wav.extend_from_slice(&s.to_le_bytes());
    }

    Some(wav)
}

fn find_game_audio_file(dir: &Path, depth: u32) -> Option<(PathBuf, String)> {
    if depth > 6 {
        return None;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        let mut subdirs = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            let name_lower = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
            if name_lower.starts_with('.') {
                continue;
            }
            if path.is_file() {
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                if ext == "at9" || name_lower.contains("snd0") || name_lower.contains("bgm") || name_lower.contains("theme") || name_lower.contains("sound") || name_lower.contains("audio") {
                    match ext.as_str() {
                        "at9" => return Some((path, "at9".to_string())),
                        "wav" => return Some((path, "wav".to_string())),
                        "mp3" => return Some((path, "mp3".to_string())),
                        "ogg" => return Some((path, "ogg".to_string())),
                        "flac" => return Some((path, "flac".to_string())),
                        _ => {}
                    }
                }
            } else if path.is_dir() {
                subdirs.push(path);
            }
        }
        for sub in subdirs {
            if let Some(res) = find_game_audio_file(&sub, depth + 1) {
                return Some(res);
            }
        }
    }
    None
}

#[tauri::command]
async fn get_game_audio(path: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        if !p.exists() {
            return Ok(None);
        }

        if p.is_dir() {
            if let Some((audio_path, kind)) = find_game_audio_file(p, 0) {
                if let Ok(mut f) = fs::File::open(&audio_path) {
                    let mut buf = Vec::new();
                    if f.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
                        if kind == "at9" {
                            if let Some(wav_bytes) = decode_at9_to_wav(&buf) {
                                let b64 = general_purpose::STANDARD.encode(&wav_bytes);
                                return Ok(Some(format!("data:audio/wav;base64,{}", b64)));
                            }
                        } else {
                            let mime = match kind.as_str() {
                                "wav" => "audio/wav",
                                "mp3" => "audio/mpeg",
                                "ogg" => "audio/ogg",
                                "flac" => "audio/flac",
                                _ => "audio/wav",
                            };
                            let b64 = general_purpose::STANDARD.encode(&buf);
                            return Ok(Some(format!("data:{};base64,{}", mime, b64)));
                        }
                    }
                }
            }
        } else {
            if let Ok(file) = fs::File::open(p) {
                let mut buffer = Vec::new();
                let mut reader = file.take(64 * 1024 * 1024); // Complete 64MB read in a loop
                if reader.read_to_end(&mut buffer).is_ok() && buffer.len() > 64 {
                    let slice = &buffer[..];
                    for i in 0..slice.len().saturating_sub(64) {
                        if &slice[i..i+4] == b"RIFF" && i + 12 <= slice.len() {
                            let format_id = &slice[i+8..i+12];
                            if format_id == b"WAVE" || format_id == b"AT9 " {
                                let riff_size = u32::from_le_bytes(slice[i+4..i+8].try_into().unwrap_or([0;4])) as usize + 8;
                                let at9_slice = if i + riff_size <= slice.len() {
                                    &slice[i..i + riff_size]
                                } else {
                                    &slice[i..]
                                };
                                if let Some(wav_bytes) = decode_at9_to_wav(at9_slice) {
                                    let b64 = general_purpose::STANDARD.encode(&wav_bytes);
                                    return Ok(Some(format!("data:audio/wav;base64,{}", b64)));
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(None)
    }).await.map_err(|e| e.to_string())?
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
        // 1. Check for sce_sys/param.json, param.json or case-insensitive subdirectories
        if let Ok(entries) = fs::read_dir(path_buf) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name_lower = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                if p.is_file() && name_lower == "param.json" {
                    if let Ok(content) = fs::read_to_string(&p) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(tid) = json.get("titleId").or_else(|| json.get("title_id")).and_then(|v| v.as_str()) {
                                let clean = tid.to_uppercase().replace("-", "").replace("_", "").replace(" ", "");
                                if clean.starts_with("PPSA") || clean.starts_with("CUSA") {
                                    ppsa = Some(clean);
                                }
                            }
                            if let Some(tname) = json.get("titleName")
                                .or_else(|| json.get("title_name"))
                                .or_else(|| json.get("defaultLanguageTitle"))
                                .or_else(|| json.get("title"))
                                .and_then(|v| v.as_str()) {
                                local_title = Some(tname.to_string());
                            }
                            if let Some(aver) = json.get("appVer").or_else(|| json.get("app_ver")).or_else(|| json.get("appVersion")).or_else(|| json.get("version")).or_else(|| json.get("masterVersion")).or_else(|| json.get("titleVersion")) {
                                app_ver = format_json_val_app(aver);
                            }
                            if let Some(sver) = json.get("sdkVersion").or_else(|| json.get("sdk_ver")).or_else(|| json.get("sdk_version")).or_else(|| json.get("systemVersion")).or_else(|| json.get("system_ver")) {
                                sdk_ver = format_json_val_sdk(sver);
                            }
                            if let Some(fw) = json.get("requiredSystemSoftwareVersion").or_else(|| json.get("required_system_software_version")).or_else(|| json.get("min_fw")).or_else(|| json.get("min_firmware")) {
                                min_firmware = format_json_val_sdk(fw);
                            }
                            if let Some(cid) = json.get("contentId").or_else(|| json.get("content_id")).and_then(|v| v.as_str()) {
                                content_id = Some(cid.to_string());
                            }
                            if let Some(cat) = json.get("category").and_then(|v| v.as_str()) {
                                category = Some(cat.to_string());
                            }
                        }
                    }
                } else if p.is_dir() && (name_lower.contains("sce_sys") || name_lower.contains("sys")) {
                    let sub_param = p.join("param.json");
                    if sub_param.exists() {
                        if let Ok(content) = fs::read_to_string(&sub_param) {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                                if let Some(tid) = json.get("titleId").or_else(|| json.get("title_id")).and_then(|v| v.as_str()) {
                                    let clean = tid.to_uppercase().replace("-", "").replace("_", "").replace(" ", "");
                                    if clean.starts_with("PPSA") || clean.starts_with("CUSA") {
                                        ppsa = Some(clean);
                                    }
                                }
                                if let Some(tname) = json.get("titleName")
                                    .or_else(|| json.get("title_name"))
                                    .or_else(|| json.get("defaultLanguageTitle"))
                                    .or_else(|| json.get("title"))
                                    .and_then(|v| v.as_str()) {
                                    local_title = Some(tname.to_string());
                                }
                                if let Some(aver) = json.get("appVer").or_else(|| json.get("app_ver")).or_else(|| json.get("appVersion")).or_else(|| json.get("version")).or_else(|| json.get("masterVersion")).or_else(|| json.get("titleVersion")) {
                                    app_ver = format_json_val_app(aver);
                                }
                                if let Some(sver) = json.get("sdkVersion").or_else(|| json.get("sdk_ver")).or_else(|| json.get("sdk_version")).or_else(|| json.get("systemVersion")).or_else(|| json.get("system_ver")) {
                                    sdk_ver = format_json_val_sdk(sver);
                                }
                                if let Some(fw) = json.get("requiredSystemSoftwareVersion").or_else(|| json.get("required_system_software_version")).or_else(|| json.get("min_fw")).or_else(|| json.get("min_firmware")) {
                                    min_firmware = format_json_val_sdk(fw);
                                }
                                if let Some(cid) = json.get("contentId").or_else(|| json.get("content_id")).and_then(|v| v.as_str()) {
                                    content_id = Some(cid.to_string());
                                }
                                if let Some(cat) = json.get("category").and_then(|v| v.as_str()) {
                                    category = Some(cat.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. Check for sce_sys/icon0.png or icon0.png
        let icon_candidates = [
            path_buf.join("sce_sys").join("icon0.png"),
            path_buf.join("SCE_SYS").join("icon0.png"),
            path_buf.join("sce_sys").join("ICON0.PNG"),
            path_buf.join("SCE_SYS").join("ICON0.PNG"),
            path_buf.join("icon0.png"),
            path_buf.join("ICON0.PNG"),
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
            if let Ok(file) = fs::File::open(path_buf) {
                let mut buffer = Vec::new();
                let mut reader = file.take(2 * 1024 * 1024); // Ultra-fast 2MB header probe (instant directory scanning)
                if reader.read_to_end(&mut buffer).is_ok() && buffer.len() > 64 {
                    let slice = &buffer[..];

                    // 1. Try binary SFO parser first
                    if let Some(sfo) = parse_binary_sfo(slice) {
                        if sfo.title_id.is_some() { ppsa = sfo.title_id; }
                        if sfo.title.is_some() { local_title = sfo.title; }
                        if sfo.app_ver.is_some() { app_ver = sfo.app_ver; }
                        if sfo.sdk_ver.is_some() { sdk_ver = sfo.sdk_ver; }
                        if sfo.min_fw.is_some() { min_firmware = sfo.min_fw; }
                        if sfo.content_id.is_some() { content_id = sfo.content_id; }
                        if sfo.category.is_some() { category = sfo.category; }
                    }

                    // 2. Scan for JSON parameter objects inside container
                    if ppsa.is_none() {
                        if let Some(caps) = RE_TITLE_ID.captures(slice) {
                            if let Some(m) = caps.get(1) {
                                if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                    ppsa = Some(s.to_uppercase().replace("-", "").replace("_", "").replace(" ", ""));
                                }
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
                    if local_title.is_none() {
                        if let Some(caps) = RE_TITLE_NAME.captures(slice) {
                            if let Some(m) = caps.get(1) {
                                if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                    local_title = Some(s.to_string());
                                }
                            }
                        }
                    }
                    if app_ver.is_none() {
                        if let Some(caps) = RE_APP_VER.captures(slice) {
                            if let Some(m) = caps.get(1) {
                                if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                    app_ver = format_ps5_app_version(s);
                                }
                            }
                        }
                    }
                    if sdk_ver.is_none() {
                        if let Some(caps) = RE_SDK_VER.captures(slice) {
                            if let Some(m) = caps.get(1) {
                                if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                    sdk_ver = format_ps5_sdk_version(s);
                                }
                            }
                        }
                    }
                    if min_firmware.is_none() {
                        if let Some(caps) = RE_REQ_FW.captures(slice) {
                            if let Some(m) = caps.get(1) {
                                if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                    min_firmware = format_ps5_sdk_version(s);
                                }
                            }
                        }
                    }
                    if content_id.is_none() {
                        if let Some(caps) = RE_CONTENT_ID.captures(slice) {
                            if let Some(m) = caps.get(1) {
                                if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                    content_id = Some(s.to_string());
                                }
                            }
                        }
                    }
                    if category.is_none() {
                        if let Some(caps) = RE_CATEGORY.captures(slice) {
                            if let Some(m) = caps.get(1) {
                                if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                    category = Some(s.to_string());
                                }
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

    // Smart fallback for SDK / Minimum Firmware if not parsed from JSON
    if sdk_ver.is_none() && min_firmware.is_some() {
        sdk_ver = min_firmware.clone();
    } else if min_firmware.is_none() && sdk_ver.is_some() {
        min_firmware = sdk_ver.clone();
    }

    // Default App Version format if missing: 1.00
    if app_ver.is_none() {
        app_ver = Some("1.00".to_string());
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
        
        // Sort alphabetically by filename
        files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        
        Ok(files)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(target_os = "windows")]
fn make_writable_recursively_win(path: &Path) {
    if let Ok(metadata) = fs::metadata(path) {
        let mut permissions = metadata.permissions();
        if permissions.readonly() {
            permissions.set_readonly(false);
            let _ = fs::set_permissions(path, permissions);
        }
    }
    if path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                make_writable_recursively_win(&entry.path());
            }
        }
    }
}

#[cfg(unix)]
fn force_make_writable_recursive_unix(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(metadata) = fs::metadata(path) {
        let mut perms = metadata.permissions();
        perms.set_mode(perms.mode() | 0o700);
        let _ = fs::set_permissions(path, perms);
    }
    if path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                force_make_writable_recursive_unix(&entry.path());
            }
        }
    }
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
            let clean_path = path.trim_start_matches(r"\\?\").replace('/', r"\");
            let _ = std::process::Command::new("explorer")
                .arg(format!("/select,{}", clean_path))
                .spawn();
        }
        #[cfg(target_os = "linux")]
        {
            let canonical_path = p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
            let uri = format!("file://{}", canonical_path.to_string_lossy());

            // 1. FreeDesktop D-Bus ShowItems (GNOME, KDE Plasma, SteamOS, Nemo)
            let dbus_res = std::process::Command::new("dbus-send")
                .args([
                    "--session",
                    "--dest=org.freedesktop.FileManager1",
                    "--type=method_call",
                    "/org/freedesktop/FileManager1",
                    "org.freedesktop.FileManager1.ShowItems",
                    &format!("array:string:\"{}\"", uri),
                    "string:\"\""
                ])
                .status();

            if dbus_res.map(|s| s.success()).unwrap_or(false) {
                return Ok(());
            }

            // 2. Desktop-specific direct select handlers
            if std::process::Command::new("dolphin").arg("--select").arg(&canonical_path).spawn().is_ok() {
                return Ok(());
            }
            if std::process::Command::new("nautilus").arg("--select").arg(&canonical_path).spawn().is_ok() {
                return Ok(());
            }

            // 3. Fallback: xdg-open parent
            let parent = p.parent().unwrap_or(p);
            let _ = std::process::Command::new("xdg-open").arg(parent).spawn();
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_disk_space(path: String) -> Result<DiskInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        let target = if p.is_file() {
            p.parent().unwrap_or(p)
        } else {
            p
        };

        // 1. Direct POSIX statvfs syscall on macOS & Linux for guaranteed accurate filesystem metrics
        #[cfg(unix)]
        {
            use std::ffi::CString;
            use std::os::unix::ffi::OsStrExt;
            let target_os = target.as_os_str().as_bytes();
            if let Ok(c_path) = CString::new(target_os) {
                let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
                if unsafe { libc::statvfs(c_path.as_ptr(), &mut stat) } == 0 {
                    let block_size = if stat.f_frsize > 0 { stat.f_frsize as u64 } else { stat.f_bsize as u64 };
                    let total = (stat.f_blocks as u64) * block_size;
                    let free = (stat.f_bavail as u64) * block_size;
                    if total > 0 {
                        return Ok(DiskInfo { total, free });
                    }
                }
            }
        }

        // 2. Sysinfo fallback for Windows and other systems
        let disks = Disks::new_with_refreshed_list();

        let mut best_match: Option<&sysinfo::Disk> = None;
        let mut best_len = 0;

        let target_str = target.to_string_lossy().to_lowercase();

        for disk in disks.list() {
            let mount_str = disk.mount_point().to_string_lossy().to_lowercase();
            if target_str.starts_with(&mount_str) && mount_str.len() > best_len {
                best_match = Some(disk);
                best_len = mount_str.len();
            }
        }

        #[cfg(target_os = "windows")]
        if best_match.is_none() {
            if let Some(target_prefix) = target_str.chars().next() {
                for disk in disks.list() {
                    let mount = disk.mount_point().to_string_lossy().to_lowercase();
                    if mount.starts_with(target_prefix) {
                        best_match = Some(disk);
                        break;
                    }
                }
            }
        }

        if let Some(disk) = best_match {
            Ok(DiskInfo {
                total: disk.total_space(),
                free: disk.available_space(),
            })
        } else if let Some(first) = disks.list().first() {
            Ok(DiskInfo {
                total: first.total_space(),
                free: first.available_space(),
            })
        } else {
            Ok(DiskInfo { total: 0, free: 0 })
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_file(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path_buf = Path::new(&path);
        if !path_buf.exists() {
            return Ok(());
        }

        let clean_path = path_buf.to_string_lossy().replace('\\', "/");
        if clean_path == "/" || clean_path == "c:/" || clean_path == "d:/" || clean_path == "e:/" {
            return Err("Protection: Refusing to delete root drive directory".to_string());
        }

        #[cfg(unix)]
        force_make_writable_recursive_unix(path_buf);

        #[cfg(target_os = "windows")]
        make_writable_recursively_win(path_buf);

        let remove_res = if path_buf.is_dir() {
            fs::remove_dir_all(path_buf)
        } else {
            fs::remove_file(path_buf)
        };

        match remove_res {
            Ok(_) => Ok(()),
            Err(e) => Err(e.to_string()),
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

        let copy_res = fs_extra::copy_items_with_progress(&sources, &target_dir, &options, handler);

        // Final completion event
        let _ = app_handle.emit("transfer-progress", TransferProgress {
            percent: 100.0,
            current_file: "Transfer complete".to_string(),
            speed_bytes_per_sec: 0.0,
            eta_seconds: 0.0,
        });

        copy_res.map(|_| ()).map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
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

                let about_item = MenuItemBuilder::with_id("open_about", "About Machete PS5 Backup Manager").build(app)?;
                let check_update_item = MenuItemBuilder::with_id("check_update", "Check for Updates...").build(app)?;
                let settings_item = MenuItemBuilder::with_id("open_settings", "Settings...").accelerator("CmdOrCtrl+,").build(app)?;
                
                let app_submenu = SubmenuBuilder::new(app, "Machete")
                    .item(&about_item)
                    .item(&check_update_item)
                    .separator()
                    .item(&settings_item)
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
                    } else if event.id() == "open_settings" {
                        let _ = handle.emit("menu-open-settings", ());
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
            open_in_file_manager,
            get_game_audio
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
