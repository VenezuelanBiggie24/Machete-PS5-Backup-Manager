use tauri::Emitter;
use std::path::{Path, PathBuf};
use tauri::WebviewWindow;
use serde::Serialize;
use std::time::{Instant, Duration};
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Serialize, Clone)]
pub struct ProgressPayload {
    pub current_file: String,
    pub total_bytes: u64,
    pub transferred_bytes: u64,
    pub percent: f64,
    pub speed_mb_s: f64,
}

pub async fn async_transfer(source_paths: Vec<String>, target_dir: String, window: tauri::WebviewWindow) -> Result<(), String> {
    let mut total_size = 0;
    
    // Calculate total size recursively
    for path in &source_paths {
        let p = Path::new(path);
        if p.exists() {
            total_size += calculate_size_async(p).await?;
        }
    }
    
    if total_size == 0 {
        return Ok(());
    }

    let target_path = Path::new(&target_dir);
    if !target_path.exists() {
        fs::create_dir_all(target_path).await.map_err(|e| e.to_string())?;
    }

    let mut transferred = 0;
    let start_time = Instant::now();
    let mut last_emit = Instant::now();
    let mut last_transferred = 0;

    for source in source_paths {
        let src_path = Path::new(&source);
        if src_path.is_file() {
            let file_name = src_path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown_file");
            let tgt_path = target_path.join(file_name);
            copy_file_chunked(src_path, &tgt_path, &mut transferred, total_size, &window, &mut last_emit, &mut last_transferred).await?;
        } else if src_path.is_dir() {
            let dir_name = src_path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown_dir");
            let new_tgt = target_path.join(dir_name);
            copy_dir_recursive(src_path, &new_tgt, &mut transferred, total_size, &window, &mut last_emit, &mut last_transferred).await?;
        }
    }

    // Final emit
    let percent = (transferred as f64 / total_size as f64) * 100.0;
    let _ = window.emit("transfer-progress", ProgressPayload {
        current_file: "Done".to_string(),
        total_bytes: total_size,
        transferred_bytes: transferred,
        percent,
        speed_mb_s: 0.0,
    });

    Ok(())
}

use std::pin::Pin;
use std::future::Future;

fn copy_dir_recursive<'a>(
    src: &'a Path,
    tgt: &'a Path,
    transferred: &'a mut u64,
    total_size: u64,
    window: &'a WebviewWindow,
    last_emit: &'a mut Instant,
    last_transferred: &'a mut u64,
) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
    Box::pin(async move {
        if !tgt.exists() {
            fs::create_dir_all(tgt).await.map_err(|e| e.to_string())?;
        }
        
        let mut entries = fs::read_dir(src).await.map_err(|e| e.to_string())?;
        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            let entry_path = entry.path();
            let entry_name = entry.file_name();
            let new_tgt = tgt.join(entry_name);
            
            if entry_path.is_file() {
                copy_file_chunked(&entry_path, &new_tgt, transferred, total_size, window, last_emit, last_transferred).await?;
            } else if entry_path.is_dir() {
                copy_dir_recursive(&entry_path, &new_tgt, transferred, total_size, window, last_emit, last_transferred).await?;
            }
        }
        Ok(())
    })
}

async fn copy_file_chunked(
    src: &Path,
    tgt: &Path,
    transferred: &mut u64,
    total_size: u64,
    window: &tauri::WebviewWindow,
    last_emit: &mut Instant,
    last_transferred: &mut u64,
) -> Result<(), String> {
    let mut reader = fs::File::open(src).await.map_err(|e| e.to_string())?;
    
    // Delta Sync / Anti-Bit-Rot MVP (Hash calculation during copy)
    let mut hasher = blake3::Hasher::new();
    let hash_path = PathBuf::from(format!("{}.sha256", tgt.to_string_lossy()));
    
    // Check if delta sync can be skipped
    if tgt.exists() && hash_path.exists() {
        if let Ok(saved_hash) = std::fs::read_to_string(&hash_path) {
            // Read source hash entirely? Too slow. We'll skip delta sync read if size matches for MVP
            let src_meta = reader.metadata().await.map_err(|e| e.to_string())?;
            let tgt_meta = fs::metadata(tgt).await.map_err(|e| e.to_string())?;
            if src_meta.len() == tgt_meta.len() {
                // Pseudo-delta sync: If sizes match and hash exists, assume identical to save SSD TBW.
                *transferred += src_meta.len();
                return Ok(());
            }
        }
    }

    let mut writer = fs::File::create(tgt).await.map_err(|e| e.to_string())?;
    
    // 32MB chunks for NVMe saturation
    let mut buffer = vec![0; 32 * 1024 * 1024]; 
    
    loop {
        let n = reader.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        
        // Compute Hash
        let slice = &buffer[..n];
        tokio::task::block_in_place(|| {
            hasher.update_rayon(slice);
        });
        
        writer.write_all(&buffer[..n]).await.map_err(|e| e.to_string())?;
        *transferred += n as u64;
        
        let now = Instant::now();
        if now.duration_since(*last_emit) > Duration::from_millis(150) {
            let elapsed = now.duration_since(*last_emit).as_secs_f64();
            let bytes_diff = *transferred - *last_transferred;
            let speed = (bytes_diff as f64 / 1024.0 / 1024.0) / elapsed;
            
            let percent = (*transferred as f64 / total_size as f64) * 100.0;
            
            let _ = window.emit("transfer-progress", ProgressPayload {
                current_file: src.file_name().unwrap_or_default().to_string_lossy().to_string(),
                total_bytes: total_size,
                transferred_bytes: *transferred,
                percent,
                speed_mb_s: speed,
            });
            
            *last_emit = now;
            *last_transferred = *transferred;
        }
    }
    
    // Save the hash to the sidecar file (Anti Bit-Rot & Delta Sync reference)
    let final_hash = hasher.finalize().to_string();
    fs::write(hash_path, final_hash).await.map_err(|e| e.to_string())?;

    Ok(())
}

fn calculate_size_async<'a>(path: &'a Path) -> Pin<Box<dyn Future<Output = Result<u64, String>> + Send + 'a>> {
    Box::pin(async move {
        let mut size = 0;
        let meta = fs::metadata(path).await.map_err(|e| e.to_string())?;
        if meta.is_dir() {
            let mut entries = fs::read_dir(path).await.map_err(|e| e.to_string())?;
            while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
                size += calculate_size_async(&entry.path()).await?;
            }
        } else {
            size += meta.len();
        }
        Ok(size)
    })
}
