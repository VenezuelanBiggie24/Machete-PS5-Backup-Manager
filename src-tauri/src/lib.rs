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
    regex::bytes::Regex::new(r#"(?i)"(?:titleName|title_name|defaultLanguageTitle)"\s*:\s*"([^"]+)""#).expect("valid regex")
});

static RE_APP_VER: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"(?:appVer|app_ver|version|masterVersion|titleVersion)"\s*:\s*"?([^",\s}]+)"?"#).expect("valid regex")
});

static RE_SDK_VER: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"(?:sdkVersion|sdk_version|sdk_ver)"\s*:\s*"?([^",\s}]+)"?"#).expect("valid regex")
});

static RE_REQ_FW: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"(?:requiredSystemSoftwareVersion|required_system_software_version|min_fw|min_firmware)"\s*:\s*"?([^",\s}]+)"?"#).expect("valid regex")
});

static RE_CONTENT_ID: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"(?:contentId|content_id)"\s*:\s*"([^"]+)""#).expect("valid regex")
});

static RE_CATEGORY: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)"category"\s*:\s*"([^"]+)""#).expect("valid regex")
});

// Binary SFO table regexes for raw container formats (.pkg, .ffpkg, .exfat, .ffpfs, .ffpfsc, .iso, .raw)
static RE_SFO_APP_VER: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)APP_VER[\x00=\s]+([0-9]+\.[0-9]+(?:\.[0-9]+)?)"#).expect("valid regex")
});

static RE_SFO_SDK_VER: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)(?:SDK_VER|sdk_ver)[\x00=\s]+(?:0x)?([0-9a-fA-F\.]+)"#).expect("valid regex")
});

static RE_SFO_TITLE: LazyLock<regex::bytes::Regex> = LazyLock::new(|| {
    regex::bytes::Regex::new(r#"(?i)TITLE[\x00=\s]+([A-Za-z0-9\s:_\-'\.]{3,64})"#).expect("valid regex")
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

fn format_ps5_sdk_version(raw: &str) -> Option<String> {
    let clean = raw.trim().trim_matches('"').trim_matches('\'');
    if clean.is_empty() || clean == "0" || clean.eq_ignore_ascii_case("null") || clean.eq_ignore_ascii_case("n/a") {
        return None;
    }

    let without_0x = clean.strip_prefix("0x").or_else(|| clean.strip_prefix("0X")).unwrap_or(clean);

    // 1. Dotted format: e.g. "09.00.00.00", "08.50.00.00", "7.61"
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

    // 2. Hex string: e.g. "09000000", "08500000", "07610000", "04030000", "0009000000000000"
    if without_0x.chars().all(|c| c.is_ascii_hexdigit()) {
        let digits = without_0x.trim_start_matches('0');
        if digits.is_empty() {
            return None;
        }

        // If 8+ hex chars (or 64-bit with 16 hex chars)
        let pad8 = if without_0x.len() >= 16 {
            &without_0x[0..8]
        } else {
            without_0x
        };
        let pad_str = format!("{:0>8}", pad8);
        if pad_str.len() >= 4 {
            let major_hex = &pad_str[0..2];
            let minor_hex = &pad_str[2..4];
            if let (Ok(maj), Ok(min)) = (u32::from_str_radix(major_hex, 16), u32::from_str_radix(minor_hex, 16)) {
                if maj > 0 || min > 0 {
                    return Some(format!("{}.{:02}", maj, min));
                }
            }
        }
    }

    // 3. Decimal integer: e.g. 150994944 (0x09000000)
    if let Ok(num) = clean.parse::<u64>() {
        let maj32 = (num >> 24) & 0xFF;
        let min32 = (num >> 16) & 0xFF;
        if maj32 > 0 {
            return Some(format!("{}.{:02}", maj32, min32));
        }
        let maj64 = (num >> 56) & 0xFF;
        let min64 = (num >> 48) & 0xFF;
        if maj64 > 0 {
            return Some(format!("{}.{:02}", maj64, min64));
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

    // 2. Hex format: e.g. "0x01000000" -> "1.00", "0x01020000" -> "1.02"
    if without_0x.chars().all(|c| c.is_ascii_hexdigit()) {
        let pad_str = format!("{:0>8}", without_0x);
        if pad_str.len() >= 4 {
            let major_hex = &pad_str[0..2];
            let minor_hex = &pad_str[2..4];
            if let (Ok(maj), Ok(min)) = (u32::from_str_radix(major_hex, 16), u32::from_str_radix(minor_hex, 16)) {
                if maj > 0 || min > 0 {
                    return Some(format!("{}.{:02}", maj, min));
                }
            }
        }
    }

    // 3. Decimal integer: e.g. 16777216 -> 1.00
    if let Ok(num) = clean.parse::<u64>() {
        let maj = (num >> 24) & 0xFF;
        let min = (num >> 16) & 0xFF;
        if maj > 0 {
            return Some(format!("{}.{:02}", maj, min));
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
    if at9_bytes.len() < 52 || &at9_bytes[0..4] != b"RIFF" || &at9_bytes[8..12] != b"WAVE" {
        return None;
    }

    let mut pos = 12;
    let mut fmt_data = None;
    let mut audio_data = None;

    while pos + 8 <= at9_bytes.len() {
        let chunk_id = &at9_bytes[pos..pos + 4];
        let chunk_size = u32::from_le_bytes(at9_bytes[pos + 4..pos + 8].try_into().unwrap_or([0; 4])) as usize;
        let chunk_end = (pos + 8 + chunk_size).min(at9_bytes.len());

        if chunk_id == b"fmt " {
            fmt_data = Some(&at9_bytes[pos + 8..chunk_end]);
        } else if chunk_id == b"data" {
            audio_data = Some(&at9_bytes[pos + 8..chunk_end]);
        }

        pos = chunk_end;
        if chunk_size % 2 != 0 {
            pos += 1;
        }
    }

    let fmt = fmt_data?;
    let data = audio_data?;

    let mut decoder_opt = None;
    if fmt.len() >= 4 {
        let preferred_offsets = [44, 40, 36, 48, fmt.len().saturating_sub(4)];
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
    if depth > 3 {
        return None;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        let mut subdirs = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            let name_lower = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
            if path.is_file() {
                if name_lower.contains("snd0") || name_lower.contains("bgm") || name_lower.contains("theme") || name_lower.starts_with("sound") {
                    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
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
            let sub_name = sub.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
            if sub_name.contains("sce_sys") || sub_name.contains("sys") || sub_name.contains("sound") || sub_name.contains("audio") || sub_name.contains("game") || sub_name.contains("ps5") || sub_name.contains("content") {
                if let Some(res) = find_game_audio_file(&sub, depth + 1) {
                    return Some(res);
                }
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
            if let Ok(mut file) = fs::File::open(p) {
                let mut buffer = vec![0u8; 16 * 1024 * 1024];
                if let Ok(n) = file.read(&mut buffer) {
                    let slice = &buffer[..n];
                    for i in 0..slice.len().saturating_sub(64) {
                        if &slice[i..i+4] == b"RIFF" && i + 12 <= slice.len() && &slice[i+8..i+12] == b"WAVE" {
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
                                .and_then(|v| v.as_str()) {
                                local_title = Some(tname.to_string());
                            }
                            if let Some(aver) = json.get("appVer").or_else(|| json.get("app_ver")).or_else(|| json.get("version")).or_else(|| json.get("masterVersion")).or_else(|| json.get("titleVersion")) {
                                app_ver = format_json_val_app(aver);
                            }
                            if let Some(sver) = json.get("sdkVersion").or_else(|| json.get("sdk_ver")).or_else(|| json.get("sdk_version")) {
                                sdk_ver = format_json_val_sdk(sver);
                            }
                            if let Some(fw) = json.get("requiredSystemSoftwareVersion").or_else(|| json.get("required_system_software_version")).or_else(|| json.get("min_fw")) {
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
                } else if p.is_dir() && name_lower.contains("sce_sys") {
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
                                    .and_then(|v| v.as_str()) {
                                    local_title = Some(tname.to_string());
                                }
                                if let Some(aver) = json.get("appVer").or_else(|| json.get("app_ver")).or_else(|| json.get("version")).or_else(|| json.get("masterVersion")).or_else(|| json.get("titleVersion")) {
                                    app_ver = format_json_val_app(aver);
                                }
                                if let Some(sver) = json.get("sdkVersion").or_else(|| json.get("sdk_ver")).or_else(|| json.get("sdk_version")) {
                                    sdk_ver = format_json_val_sdk(sver);
                                }
                                if let Some(fw) = json.get("requiredSystemSoftwareVersion").or_else(|| json.get("required_system_software_version")).or_else(|| json.get("min_fw")) {
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
                let mut buffer = vec![0u8; 16 * 1024 * 1024]; // Read 16MB header probe for deep parameter discovery
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
                    if local_title.is_none() {
                        if let Some(caps) = RE_SFO_TITLE.captures(slice) {
                            if let Some(m) = caps.get(1) {
                                if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                    local_title = Some(s.trim().to_string());
                                }
                            }
                        }
                    }
                    if let Some(caps) = RE_APP_VER.captures(slice) {
                        if let Some(m) = caps.get(1) {
                            if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                app_ver = format_ps5_app_version(s);
                            }
                        }
                    }
                    if app_ver.is_none() {
                        if let Some(caps) = RE_SFO_APP_VER.captures(slice) {
                            if let Some(m) = caps.get(1) {
                                if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                    app_ver = format_ps5_app_version(s);
                                }
                            }
                        }
                    }
                    if let Some(caps) = RE_SDK_VER.captures(slice) {
                        if let Some(m) = caps.get(1) {
                            if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                sdk_ver = format_ps5_sdk_version(s);
                            }
                        }
                    }
                    if sdk_ver.is_none() {
                        if let Some(caps) = RE_SFO_SDK_VER.captures(slice) {
                            if let Some(m) = caps.get(1) {
                                if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                    sdk_ver = format_ps5_sdk_version(s);
                                }
                            }
                        }
                    }
                    if let Some(caps) = RE_REQ_FW.captures(slice) {
                        if let Some(m) = caps.get(1) {
                            if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                min_firmware = format_ps5_sdk_version(s);
                            }
                        }
                    }
                    if let Some(caps) = RE_CONTENT_ID.captures(slice) {
                        if let Some(m) = caps.get(1) {
                            if let Ok(s) = std::str::from_utf8(m.as_bytes()) {
                                content_id = Some(s.to_string());
                            }
                        }
                    }
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
fn force_make_writable_recursive_unix(p: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = fs::symlink_metadata(p) {
        if !meta.file_type().is_symlink() {
            let mut perms = meta.permissions();
            let mode = perms.mode();
            if mode & 0o200 == 0 {
                perms.set_mode(mode | 0o700);
                let _ = fs::set_permissions(p, perms);
            }
            if p.is_dir() {
                if let Ok(entries) = fs::read_dir(p) {
                    for entry in entries.flatten() {
                        force_make_writable_recursive_unix(&entry.path());
                    }
                }
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
        let target = if p.exists() { p } else { Path::new("/") };

        #[cfg(unix)]
        {
            use std::ffi::CString;
            use std::os::unix::ffi::OsStrExt;
            use std::mem::MaybeUninit;

            if let Ok(c_path) = CString::new(target.as_os_str().as_bytes()) {
                let mut stat: MaybeUninit<libc::statvfs> = MaybeUninit::uninit();
                if unsafe { libc::statvfs(c_path.as_ptr(), stat.as_mut_ptr()) } == 0 {
                    let stat = unsafe { stat.assume_init() };
                    let block_size = if stat.f_frsize > 0 { stat.f_frsize as u64 } else { stat.f_bsize as u64 };
                    let total = stat.f_blocks as u64 * block_size;
                    let free = stat.f_bavail as u64 * block_size;
                    if total > 0 {
                        return Ok(DiskInfo { total, free });
                    }
                }
            }
        }

        // Sysinfo fallback (Windows & Unix fallback)
        let disks = Disks::new_with_refreshed_list();
        let clean_path = path.trim_start_matches(r"\\?\").replace('/', r"\");
        let normalized_input = clean_path.to_uppercase();

        let mut best_match: Option<&sysinfo::Disk> = None;
        let mut longest_len = 0;

        for disk in disks.iter() {
            let mount_str = disk.mount_point().to_string_lossy();
            let clean_mount = mount_str.trim_start_matches(r"\\?\").replace('/', r"\").to_uppercase();
            
            if normalized_input.starts_with(&clean_mount) && clean_mount.len() > longest_len {
                longest_len = clean_mount.len();
                best_match = Some(disk);
            }
        }

        if let Some(disk) = best_match {
            Ok(DiskInfo {
                total: disk.total_space(),
                free: disk.available_space(),
            })
        } else {
            // Fallback by drive letter on Windows
            let drive_char = normalized_input.chars().next().unwrap_or('C');
            for disk in disks.iter() {
                let mount = disk.mount_point().to_string_lossy().to_uppercase();
                if mount.starts_with(drive_char) {
                    return Ok(DiskInfo {
                        total: disk.total_space(),
                        free: disk.available_space(),
                    });
                }
            }
            Err("Could not determine disk space for path".into())
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_file(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_path = path.trim().trim_start_matches(r"\\?\").replace('/', r"\");
        let path_buf = Path::new(&clean_path);
        
        let is_win_drive_root = clean_path.len() <= 3 && clean_path.chars().nth(1) == Some(':');
        if clean_path.is_empty() || is_win_drive_root || path_buf.parent().is_none() || clean_path == "/" || clean_path == "\\" {
            return Err("Invalid or protected root path provided for deletion".into());
        }
        if !path_buf.exists() {
            return Err("Path does not exist".into());
        }

        #[cfg(target_os = "windows")]
        make_writable_recursively_win(path_buf);

        let remove_res = if path_buf.is_dir() {
            fs::remove_dir_all(path_buf)
        } else {
            fs::remove_file(path_buf)
        };

        match remove_res {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
                #[cfg(unix)]
                {
                    force_make_writable_recursive_unix(path_buf);
                    if path_buf.is_dir() {
                        fs::remove_dir_all(path_buf).map_err(|err| err.to_string())
                    } else {
                        fs::remove_file(path_buf).map_err(|err| err.to_string())
                    }
                }
                #[cfg(not(unix))]
                Err(e.to_string())
            }
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

#[cfg(target_os = "macos")]
fn update_macos_dock_badge(percent: f64) {
    use std::ffi::CString;
    extern "C" {
        fn objc_getClass(name: *const std::os::raw::c_char) -> *mut std::os::raw::c_void;
        fn sel_registerName(name: *const std::os::raw::c_char) -> *mut std::os::raw::c_void;
        fn objc_msgSend(receiver: *mut std::os::raw::c_void, op: *mut std::os::raw::c_void, ...) -> *mut std::os::raw::c_void;
    }

    unsafe {
        let nsapp_cls_name = CString::new("NSApplication").unwrap();
        let nsapp_cls = objc_getClass(nsapp_cls_name.as_ptr());
        if nsapp_cls.is_null() { return; }
        let shared_app_sel = sel_registerName(CString::new("sharedApplication").unwrap().as_ptr());
        let app = objc_msgSend(nsapp_cls, shared_app_sel);
        if app.is_null() { return; }

        let dock_tile_sel = sel_registerName(CString::new("dockTile").unwrap().as_ptr());
        let dock_tile = objc_msgSend(app, dock_tile_sel);
        if dock_tile.is_null() { return; }

        let set_badge_sel = sel_registerName(CString::new("setBadgeLabel:").unwrap().as_ptr());
        let nsstring_cls = objc_getClass(CString::new("NSString").unwrap().as_ptr());
        let str_with_utf8_sel = sel_registerName(CString::new("stringWithUTF8String:").unwrap().as_ptr());

        if percent >= 100.0 || percent <= 0.0 {
            let null_ptr: *mut std::os::raw::c_void = std::ptr::null_mut();
            objc_msgSend(dock_tile, set_badge_sel, null_ptr);
        } else {
            let badge_text = format!("{:.0}%", percent);
            if let Ok(c_str) = CString::new(badge_text) {
                let ns_str = objc_msgSend(nsstring_cls, str_with_utf8_sel, c_str.as_ptr());
                objc_msgSend(dock_tile, set_badge_sel, ns_str);
            }
        }

        let display_sel = sel_registerName(CString::new("display").unwrap().as_ptr());
        objc_msgSend(dock_tile, display_sel);
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
                
                #[cfg(target_os = "macos")]
                update_macos_dock_badge(percent);

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

        #[cfg(target_os = "macos")]
        update_macos_dock_badge(100.0);

        copy_res.map(|_| ()).map_err(|e| e.to_string())
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
