use tauri::State;
use std::sync::atomic::Ordering;
use crate::AudioState;
use reqwest::blocking::Client;
use serde_json::Value;

fn get_preview_url(client: &Client, title: &str) -> Option<String> {
    
    // Limpieza agresiva del título para mejores búsquedas
    let mut clean_title = title.to_string();
    let stopwords = [
        "PS4 & PS5", "PS4", "PS5", "Deluxe Edition", "Standard Edition", 
        "Digital Deluxe Edition", "Premium Edition", "Gold Edition",
        "Ultimate Edition", "Game of the Year Edition", "GOTY",
        "Director's Cut", "Remastered", "Remake", "Upgrade",
        "Bundle", "Collection", "Season Pass", "DLC", "Expansion",
        "In Tanta We Trust", "Hocus Pocus Pack"
    ];
    for word in stopwords.iter() {
        if let Some(idx) = clean_title.find(word) {
            clean_title = clean_title[..idx].to_string();
        }
    }
    // Remover todo después de " - ", " : ", etc si es muy largo
    if let Some(idx) = clean_title.find(" - ") {
        clean_title = clean_title[..idx].to_string();
    }
    if let Some(idx) = clean_title.find(": ") {
        clean_title = clean_title[..idx].to_string();
    }
    clean_title = clean_title.replace("Starring Mickey and Friends", "").trim().to_string();

            let query = format!("{} soundtrack", clean_title);
    let encoded_query = urlencoding::encode(&query);
    // USO DE DEEZER API - PÚBLICAMENTE DECLARADO, NADA DE ITUNES.
    let url = format!("https://api.deezer.com/search?q={}", encoded_query);
    
    println!("Buscando audio en Deezer (Público): {}", title);
    if let Ok(res) = client.get(&url).send() {
        if let Ok(json) = res.json::<Value>() {
            if let Some(data) = json.get("data").and_then(|r| r.as_array()) {
                if let Some(first) = data.first() {
                    if let Some(preview_url) = first.get("preview").and_then(|u| u.as_str()) {
                        return Some(preview_url.to_string());
                    }
                }
            }
        }
    }
    None
}

fn clean_title(title: &str) -> String {
    let mut cleaned = title.to_string();
    
    if let Some(idx) = cleaned.find(':') { cleaned.truncate(idx); }
    if let Some(idx) = cleaned.find('-') { cleaned.truncate(idx); }
    
    let remove_words = ["Edition", "Costume Set", "DLC", "Bonus", "Digital", "Deluxe", "PS5", "PS4", "Update"];
    for word in remove_words.iter() {
        cleaned = cleaned.replace(word, "");
    }
    
    cleaned.trim().to_string()
}

#[tauri::command]
pub async fn play_internet_soundtrack(title: String, source: String, state: State<'_, AudioState>) -> Result<bool, String> {
    let (request_id, token) = {
        let player = state.inner();
        let id = player.latest_request.fetch_add(1, Ordering::SeqCst) + 1;
        (id, std::sync::Arc::clone(&player.latest_request))
    };

    state.inner().stop();
    if token.load(Ordering::SeqCst) != request_id { return Ok(false); }
    
    let token_clone = std::sync::Arc::clone(&token);
    let player = state.inner().clone();
    
    
    if source == "archive" {
        tauri::async_runtime::spawn(async move {
            let client = reqwest::Client::new();
            
            // Limpieza agresiva del título
            let mut clean_title = title.to_string();
            let stopwords = [
                "PS4 & PS5", "PS4", "PS5", "Deluxe Edition", "Standard Edition", 
                "Digital Deluxe Edition", "Premium Edition", "Gold Edition",
                "Ultimate Edition", "Game of the Year Edition", "GOTY",
                "Director's Cut", "Remastered", "Remake", "Upgrade",
                "Bundle", "Collection", "Season Pass", "DLC", "Expansion",
                "In Tanta We Trust", "Hocus Pocus Pack"
            ];
            for word in stopwords.iter() {
                if let Some(idx) = clean_title.find(word) {
                    clean_title = clean_title[..idx].to_string();
                }
            }
            if let Some(idx) = clean_title.find(" - ") {
                clean_title = clean_title[..idx].to_string();
            }
            if let Some(idx) = clean_title.find(": ") {
                clean_title = clean_title[..idx].to_string();
            }
            clean_title = clean_title.replace("Starring Mickey and Friends", "").trim().to_string();

            println!("Buscando audio en Archive.org: {}", clean_title);
            let search_url = format!(
                "https://archive.org/advancedsearch.php?q=title:({} soundtrack) AND mediatype:audio&fl[]=identifier&output=json&rows=1",
                urlencoding::encode(&clean_title)
            );

            let res = match client.get(&search_url).send().await {
                Ok(r) => r,
                Err(_) => return Ok(false),
            };

            let json: serde_json::Value = match res.json().await {
                Ok(j) => j,
                Err(_) => return Ok(false),
            };

            let identifier = match json["response"]["docs"][0]["identifier"].as_str() {
                Some(id) => id.to_string(),
                None => {
                    println!("No se encontro en archive.org");
                    return Ok(false);
                }
            };

            let meta_url = format!("https://archive.org/metadata/{}", identifier);
            let meta_res = match client.get(&meta_url).send().await {
                Ok(r) => r,
                Err(_) => return Ok(false),
            };

            let meta_json: serde_json::Value = match meta_res.json().await {
                Ok(j) => j,
                Err(_) => return Ok(false),
            };

            let files = match meta_json["files"].as_array() {
                Some(f) => f,
                None => return Ok(false),
            };

            let mut mp3_name = None;
            for file in files {
                if let Some(name) = file["name"].as_str() {
                    if name.ends_with(".mp3") || name.ends_with(".ogg") || name.ends_with(".m4a") {
                        mp3_name = Some(name.to_string());
                        break;
                    }
                }
            }

            let mp3_name = match mp3_name {
                Some(n) => n,
                None => return Ok(false),
            };

            let download_url = format!("https://archive.org/download/{}/{}", identifier, urlencoding::encode(&mp3_name));
            println!("Descargando desde Archive.org: {}", download_url);

            if token_clone.load(Ordering::SeqCst) != request_id { return Ok(false); }

            // Download to temp file
            use tokio::io::AsyncWriteExt;
            use std::time::{SystemTime, UNIX_EPOCH};
            let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
            let temp_file = std::env::temp_dir().join(format!("machete_archive_audio_{}.mp3", ts));
            
            let mut file = match tokio::fs::File::create(&temp_file).await {
                Ok(f) => f,
                Err(_) => return Ok(false),
            };

            let mut stream_res = match client.get(&download_url).send().await {
                Ok(r) => r,
                Err(_) => return Ok(false),
            };

            let mut total_bytes = 0;
            while let Ok(Some(chunk)) = stream_res.chunk().await {
                if token_clone.load(Ordering::SeqCst) != request_id { return Ok(false); }
                if file.write_all(&chunk).await.is_err() { break; }
                total_bytes += chunk.len();
                if total_bytes > 50_000_000 { break; }
            }

            println!("Reproduciendo audio de Archive.org ({} bytes)", total_bytes);
            player.stop();
            let vol_str = format!("{:.2}", 0.65_f32.clamp(0.0, 1.0));
            #[cfg(target_os = "macos")]
            let mut cmd = {
                let mut c = std::process::Command::new("sh");
                c.arg("-c").arg(format!("while true; do /usr/bin/afplay -v {} '{}' 2>/dev/null; sleep 0.05; done", vol_str, temp_file.display()));
                c
            };
            #[cfg(target_os = "windows")]
            let mut cmd = {
                let mut c = std::process::Command::new("powershell");
                c.arg("-c").arg(format!("(New-Object Media.SoundPlayer '{}').PlaySync()", temp_file.display()));
                c
            };
            #[cfg(target_os = "linux")]
            let mut cmd = {
                let mut c = std::process::Command::new("aplay");
                c.arg(temp_file.clone());
                c
            };
            if let Ok(child) = cmd.spawn() {
                *player.current_process.lock().unwrap() = Some(child);
            }

            Ok::<bool, String>(true)
        });
        return Ok(true);
    }

    if source == "youtube" {
        tauri::async_runtime::spawn(async move {
            use rusty_ytdl::search::YouTube;
            use rusty_ytdl::{Video, VideoOptions, VideoQuality, VideoSearchOptions};

            let yt = match YouTube::new() {
                Ok(yt) => yt,
                Err(_) => return Ok(false),
            };

            
    // Limpieza agresiva del título para mejores búsquedas
    let mut clean_title = title.to_string();
    let stopwords = [
        "PS4 & PS5", "PS4", "PS5", "Deluxe Edition", "Standard Edition", 
        "Digital Deluxe Edition", "Premium Edition", "Gold Edition",
        "Ultimate Edition", "Game of the Year Edition", "GOTY",
        "Director's Cut", "Remastered", "Remake", "Upgrade",
        "Bundle", "Collection", "Season Pass", "DLC", "Expansion",
        "In Tanta We Trust", "Hocus Pocus Pack"
    ];
    for word in stopwords.iter() {
        if let Some(idx) = clean_title.find(word) {
            clean_title = clean_title[..idx].to_string();
        }
    }
    // Remover todo después de " - ", " : ", etc si es muy largo
    if let Some(idx) = clean_title.find(" - ") {
        clean_title = clean_title[..idx].to_string();
    }
    if let Some(idx) = clean_title.find(": ") {
        clean_title = clean_title[..idx].to_string();
    }
    clean_title = clean_title.replace("Starring Mickey and Friends", "").trim().to_string();

            let query = format!("{} soundtrack", clean_title);
            println!("Buscando audio en YouTube: {}", query);
            
            let res = match yt.search_one(&query, None).await {
                Ok(Some(r)) => r,
                _ => return Ok(false),
            };

            let url = match res {
                rusty_ytdl::search::SearchResult::Video(v) => v.url,
                _ => return Ok(false),
            };

            if token_clone.load(Ordering::SeqCst) != request_id { return Ok(false); }
            
            let video_options = VideoOptions {
                quality: VideoQuality::HighestAudio,
                filter: VideoSearchOptions::Audio,
                ..Default::default()
            };

            let video = match Video::new_with_options(&url, video_options) {
                Ok(v) => v,
                Err(_) => return Ok(false),
            };

            println!("Descargando audio de YouTube...");
            let stream_res = video.stream().await;
            if let Ok(stream) = stream_res {
                use tokio::io::AsyncWriteExt;
                use std::time::{SystemTime, UNIX_EPOCH};
                let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
                let temp_file = std::env::temp_dir().join(format!("machete_preview_audio_{}.m4a", ts));
                let mut file = match tokio::fs::File::create(&temp_file).await {
                    Ok(f) => f,
                    Err(_) => return Ok(false),
                };

                let mut total_bytes = 0;
                while let Ok(Some(chunk)) = stream.chunk().await {
                    if token_clone.load(Ordering::SeqCst) != request_id { return Ok(false); }
                    if file.write_all(&chunk).await.is_err() { break; }
                    total_bytes += chunk.len();
                    // Optional: stop after 50MB to prevent disk fill for 10-hour videos
                    if total_bytes > 50_000_000 { break; }
                }

                if token_clone.load(Ordering::SeqCst) != request_id { return Ok(false); }
                println!("Reproduciendo audio de YouTube ({} bytes) desde disco", total_bytes);
                
                player.stop();
                let vol_str = format!("{:.2}", 0.65_f32.clamp(0.0, 1.0));
                #[cfg(target_os = "macos")]
                let mut cmd = {
                    let mut c = std::process::Command::new("sh");
                    c.arg("-c").arg(format!("while true; do /usr/bin/afplay -v {} '{}' 2>/dev/null; sleep 0.05; done", vol_str, temp_file.display()));
                    c
                };
                #[cfg(target_os = "windows")]
                let mut cmd = {
                    let mut c = std::process::Command::new("powershell");
                    c.arg("-c").arg(format!("(New-Object Media.SoundPlayer '{}').PlaySync()", temp_file.display()));
                    c
                };
                #[cfg(target_os = "linux")]
                let mut cmd = {
                    let mut c = std::process::Command::new("aplay");
                    c.arg(temp_file.clone());
                    c
                };
                if let Ok(child) = cmd.spawn() {
                    *player.current_process.lock().unwrap() = Some(child);
                }
                return Ok(true);
            }
            
            Ok(false)
        }).await.map_err(|e| e.to_string())?
    } else {
        tauri::async_runtime::spawn_blocking(move || -> Result<bool, String> {
            let client = Client::builder().user_agent("Mozilla/5.0 Machete/2.5.0").build().map_err(|e| e.to_string())?;
            
            let mut preview_url = get_preview_url(&client, &title);
            
            if preview_url.is_none() {
                let cleaned = clean_title(&title);
                if cleaned != title && !cleaned.is_empty() {
                    println!("Intento fallback con titulo limpio: {}", cleaned);
                    preview_url = get_preview_url(&client, &cleaned);
                }
            }
            
            if let Some(url) = preview_url {
                if token_clone.load(Ordering::SeqCst) != request_id { return Ok(false); }
                println!("Descargando preview MP3 de Deezer...");
                let audio_bytes = client.get(&url).send().map_err(|e| e.to_string())?.bytes().map_err(|e| e.to_string())?;
                
                if token_clone.load(Ordering::SeqCst) != request_id { return Ok(false); }
                println!("Reproduciendo audio ({} bytes)", audio_bytes.len());
                // Deezer usa formato MP3, así que le pasamos "mp3" a afplay
                player.play_buffer(&audio_bytes, "mp3", 0.65)?;
                return Ok(true);
            } else {
                println!("No se encontró preview en Deezer para: {}", title);
            }
            
            Ok(false)
        }).await.map_err(|e| e.to_string())?
    }
}
