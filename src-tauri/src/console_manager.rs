use std::path::{Path, PathBuf};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const DEFAULT_CONNECT_TIMEOUT_SECS: u64 = 5;
const DEFAULT_PAYLOAD_TIMEOUT_SECS: u64 = 15;
const STATUS_TIMEOUT_SECS: u64 = 5;
const SCAN_TIMEOUT_SECS: u64 = 300;
const DELETE_TIMEOUT_SECS: u64 = 10;
const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024; // 16 MB

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ConsoleGame {
    #[serde(default, alias = "titleId")]
    pub title_id: Option<String>,
    #[serde(default, alias = "name", alias = "titleName")]
    pub title: String,
    pub path: String,
    #[serde(default, alias = "storageLabel", alias = "label")]
    pub storage_label: String, // ej: "/data/games", "/mnt/ext0/games"
    #[serde(default, alias = "storageDevice", alias = "device")]
    pub storage_device: String, // ej: "Interno", "M.2 SSD", "USB 0"
    #[serde(default, alias = "size_bytes")]
    pub size: u64,
    #[serde(default)]
    pub format: String,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ScanResultWrapper {
    Direct(Vec<ConsoleGame>),
    Enveloped {
        #[serde(default)]
        status: Option<String>,
        #[serde(default)]
        games: Option<Vec<ConsoleGame>>,
        #[serde(default)]
        message: Option<String>,
        #[serde(default)]
        error: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
struct GenericDaemonResponse {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

fn resolve_payload_path(custom_payload_path: Option<&str>) -> Result<PathBuf, String> {
    if let Some(custom_path) = custom_payload_path {
        let trimmed = custom_path.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if path.is_file() {
                return Ok(path);
            } else {
                return Err(format!("Custom payload file not found: {}", trimmed));
            }
        }
    }

    let candidate_paths = [
        "src-tauri/payload/machete_daemon.elf",
        "payload/machete_daemon.elf",
        "/Users/thebigmike/.gemini/antigravity/scratch/machete/payload/machete_daemon.elf",
    ];

    for candidate in candidate_paths {
        let p = Path::new(candidate);
        if p.is_file() {
            return Ok(p.to_path_buf());
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            for relative in ["payload/machete_daemon.elf", "machete_daemon.elf"] {
                let p = exe_dir.join(relative);
                if p.is_file() {
                    return Ok(p);
                }
            }
        }
    }

    Err(format!(
        "Payload ELF not found. Searched default locations: {}",
        candidate_paths.join(", ")
    ))
}

async fn read_json_response<R: AsyncReadExt + Unpin>(
    reader: &mut R,
    max_bytes: usize,
) -> Result<String, String> {
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 4096];
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escaped = false;
    let mut started = false;

    loop {
        let bytes_read = reader
            .read(&mut chunk)
            .await
            .map_err(|e| format!("Network read error: {}", e))?;

        if bytes_read == 0 {
            break;
        }

        for &b in &chunk[..bytes_read] {
            buffer.push(b);
            if buffer.len() > max_bytes {
                return Err(format!(
                    "Daemon response exceeded maximum size limit of {} bytes",
                    max_bytes
                ));
            }

            if !in_string {
                if b == b'"' {
                    in_string = true;
                } else if b == b'{' || b == b'[' {
                    started = true;
                    depth += 1;
                } else if b == b'}' || b == b']' {
                    if depth > 0 {
                        depth -= 1;
                    }
                }
            } else if escaped {
                escaped = false;
            } else if b == b'\\' {
                escaped = true;
            } else if b == b'"' {
                in_string = false;
            }
        }

        if started && depth == 0 && !in_string {
            if let Ok(text) = std::str::from_utf8(&buffer) {
                let trimmed = text.trim();
                if (trimmed.starts_with('{') && trimmed.ends_with('}'))
                    || (trimmed.starts_with('[') && trimmed.ends_with(']'))
                {
                    return Ok(trimmed.to_string());
                }
            }
        }

        if (!started || depth == 0) && buffer.ends_with(b"\n") {
            if let Ok(text) = std::str::from_utf8(&buffer) {
                let trimmed = text.trim();
                if !trimmed.is_empty() && (!started || serde_json::from_str::<serde_json::Value>(trimmed).is_ok()) {
                    return Ok(trimmed.to_string());
                }
            }
        }
    }

    let text = String::from_utf8(buffer)
        .map_err(|e| format!("Invalid UTF-8 sequence in daemon response: {}", e))?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Daemon returned an empty response".to_string());
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
pub async fn send_console_payload(
    ip: String,
    port: u16,
    custom_payload_path: Option<String>,
) -> Result<String, String> {
    let payload_path = resolve_payload_path(custom_payload_path.as_deref())?;
    let payload_bytes = tokio::fs::read(&payload_path)
        .await
        .map_err(|e| format!("Failed to read payload file '{}': {}", payload_path.display(), e))?;

    if payload_bytes.is_empty() {
        return Err(format!("Payload file '{}' is empty", payload_path.display()));
    }

    // Strict validation: Verify ELF header magic (0x7F, 'E', 'L', 'F')
    if payload_bytes.len() < 4
        || payload_bytes[0] != 0x7F
        || payload_bytes[1] != b'E'
        || payload_bytes[2] != b'L'
        || payload_bytes[3] != b'F'
    {
        return Err("File is not a valid ELF executable (missing 0x7F ELF magic)".to_string());
    }

    let addr = format!("{}:{}", ip, port);
    let connect_future = TcpStream::connect(&addr);
    let mut stream = tokio::time::timeout(
        Duration::from_secs(DEFAULT_CONNECT_TIMEOUT_SECS),
        connect_future,
    )
    .await
    .map_err(|_| format!("Connection timeout to {} after {}s", addr, DEFAULT_CONNECT_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to connect to {}: {}", addr, e))?;

    let send_future = async {
        stream.write_all(&payload_bytes).await?;
        stream.flush().await?;
        // CRITICAL: Shut down the write half to cleanly transmit TCP FIN (EOF to elfldr)
        let _ = stream.shutdown().await;

        // Drain any response or wait for EOF with a 3-second grace period
        let mut drain_buf = [0u8; 512];
        let _ = tokio::time::timeout(Duration::from_secs(3), stream.read(&mut drain_buf)).await;

        Ok::<(), std::io::Error>(())
    };

    tokio::time::timeout(Duration::from_secs(DEFAULT_PAYLOAD_TIMEOUT_SECS), send_future)
        .await
        .map_err(|_| format!("Transmission timed out after {}s sending payload to {}", DEFAULT_PAYLOAD_TIMEOUT_SECS, addr))?
        .map_err(|e| format!("Transmission error sending payload to {}: {}", addr, e))?;

    Ok(format!(
        "Payload successfully sent to {} ({} bytes)",
        addr,
        payload_bytes.len()
    ))
}

#[tauri::command]
pub async fn check_console_status(ip: String, port: u16) -> Result<bool, String> {
    let addr = format!("{}:{}", ip, port);

    let connect_result = tokio::time::timeout(
        Duration::from_secs(STATUS_TIMEOUT_SECS),
        TcpStream::connect(&addr),
    )
    .await;

    let mut stream = match connect_result {
        Ok(Ok(stream)) => stream,
        _ => return Ok(false),
    };

    let query_result = tokio::time::timeout(Duration::from_secs(STATUS_TIMEOUT_SECS), async {
        stream.write_all(b"PING\n").await?;
        stream.flush().await?;
        let resp = read_json_response(&mut stream, 64 * 1024).await.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        // Politely tell daemon to close session
        let _ = stream.write_all(b"QUIT\n").await;
        let _ = stream.flush().await;
        let _ = stream.shutdown().await;
        Ok::<String, std::io::Error>(resp)
    })
    .await;

    let response_text = match query_result {
        Ok(Ok(resp)) => resp,
        _ => return Ok(false),
    };

    if let Ok(parsed) = serde_json::from_str::<GenericDaemonResponse>(&response_text) {
        if parsed.status.as_deref() == Some("ok") {
            return Ok(true);
        }
    }

    if response_text.contains(r#""status":"ok""#) || response_text.contains(r#""status": "ok""#) {
        return Ok(true);
    }

    Ok(false)
}

#[tauri::command]
pub async fn scan_console_games(ip: String, port: u16) -> Result<Vec<ConsoleGame>, String> {
    let addr = format!("{}:{}", ip, port);

    let mut stream = tokio::time::timeout(
        Duration::from_secs(DEFAULT_CONNECT_TIMEOUT_SECS),
        TcpStream::connect(&addr),
    )
    .await
    .map_err(|_| format!("Connection timeout to {} after {}s", addr, DEFAULT_CONNECT_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to connect to {}: {}", addr, e))?;

    let scan_operation = async {
        stream.write_all(b"SCAN\n").await?;
        stream.flush().await?;
        let resp = read_json_response(&mut stream, MAX_RESPONSE_BYTES).await.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        // Politely tell daemon to close session
        let _ = stream.write_all(b"QUIT\n").await;
        let _ = stream.flush().await;
        let _ = stream.shutdown().await;
        Ok::<String, std::io::Error>(resp)
    };

    let response_str = tokio::time::timeout(Duration::from_secs(SCAN_TIMEOUT_SECS), scan_operation)
        .await
        .map_err(|_| format!("Scan operation timed out after {}s on {}", SCAN_TIMEOUT_SECS, addr))?
        .map_err(|e| format!("Communication failure during scan with {}: {}", addr, e))?;

    match serde_json::from_str::<ScanResultWrapper>(&response_str) {
        Ok(ScanResultWrapper::Direct(games)) => Ok(games),
        Ok(ScanResultWrapper::Enveloped {
            status,
            games,
            message,
            error,
        }) => {
            if status.as_deref() == Some("error") {
                let err_detail = error.or(message).unwrap_or_else(|| "Unknown daemon error".to_string());
                return Err(format!("Daemon returned scan error: {}", err_detail));
            }
            Ok(games.unwrap_or_default())
        }
        Err(e) => Err(format!(
            "Failed to parse console scan response: {}. Raw response: {}",
            e, response_str
        )),
    }
}

#[tauri::command]
pub async fn delete_console_game(
    ip: String,
    port: u16,
    game_path: String,
) -> Result<String, String> {
    let addr = format!("{}:{}", ip, port);

    let mut stream = tokio::time::timeout(
        Duration::from_secs(DEFAULT_CONNECT_TIMEOUT_SECS),
        TcpStream::connect(&addr),
    )
    .await
    .map_err(|_| format!("Connection timeout to {} after {}s", addr, DEFAULT_CONNECT_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to connect to {}: {}", addr, e))?;

    let command_payload = format!("DELETE {}\n", game_path);

    let delete_operation = async {
        stream.write_all(command_payload.as_bytes()).await?;
        stream.flush().await?;
        let resp = read_json_response(&mut stream, 64 * 1024).await.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let _ = stream.write_all(b"QUIT\n").await;
        let _ = stream.flush().await;
        let _ = stream.shutdown().await;
        Ok::<String, std::io::Error>(resp)
    };

    let response_str = tokio::time::timeout(Duration::from_secs(DELETE_TIMEOUT_SECS), delete_operation)
        .await
        .map_err(|_| format!("Delete operation timed out after {}s on {}", DELETE_TIMEOUT_SECS, addr))?
        .map_err(|e| format!("Communication failure during delete with {}: {}", addr, e))?;

    if let Ok(parsed) = serde_json::from_str::<GenericDaemonResponse>(&response_str) {
        if parsed.status.as_deref() == Some("ok") {
            let msg = parsed.message.unwrap_or_else(|| format!("Successfully deleted {}", game_path));
            return Ok(msg);
        } else {
            let err_detail = parsed.error.or(parsed.message).unwrap_or_else(|| "Operation failed".to_string());
            return Err(format!("Daemon delete error: {}", err_detail));
        }
    }

    if response_str.trim().eq_ignore_ascii_case("ok") {
        return Ok(format!("Successfully deleted {}", game_path));
    }

    Err(format!(
        "Unexpected daemon response for delete: {}",
        response_str
    ))
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct DiscoveredConsole {
    pub ip: String,
    pub port: u16,
    pub status: String,
    pub is_daemon: bool,
}

#[tauri::command]
pub async fn discover_ps5_consoles() -> Result<Vec<DiscoveredConsole>, String> {
    // -------------------------------------------------------------------------
    // Phase 1: High-Speed Non-Intrusive UDP Broadcast Discovery (Ports 9038, 9039, 9040)
    // -------------------------------------------------------------------------
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        let _ = socket.set_broadcast(true);
        let _ = socket.set_read_timeout(Some(Duration::from_millis(600)));

        for port in [9038, 9039, 9040] {
            let _ = socket.send_to(b"MACHETE_DISCOVER", format!("255.255.255.255:{}", port));
        }

        let mut buf = [0u8; 128];
        let mut udp_discovered = Vec::new();

        while let Ok((bytes, src_addr)) = socket.recv_from(&mut buf) {
            let resp = String::from_utf8_lossy(&buf[..bytes]);
            let parts: Vec<&str> = resp.split('|').collect();
            if parts.len() >= 2 && parts[0] == "MACHETE" {
                if let Ok(reported_port) = parts[1].parse::<u16>() {
                    let version = parts.get(2).unwrap_or(&"1.5.0");
                    udp_discovered.push(DiscoveredConsole {
                        ip: src_addr.ip().to_string(),
                        port: reported_port,
                        status: format!("Machete Daemon activo v{} (Puerto {})", version, reported_port),
                        is_daemon: true,
                    });
                }
            }
        }

        if !udp_discovered.is_empty() {
            // Sort so canonical port 9038 takes first priority
            udp_discovered.sort_by(|a, b| {
                if a.port == 9038 {
                    std::cmp::Ordering::Less
                } else if b.port == 9038 {
                    std::cmp::Ordering::Greater
                } else {
                    b.port.cmp(&a.port)
                }
            });
            return Ok(udp_discovered);
        }
    }

    // -------------------------------------------------------------------------
    // Phase 2: Gentle Subnet Scan with Strict Concurrency & Proper Handshake
    // NEVER probe port 9021 with connect-and-drop to avoid elfldr socket faults!
    // -------------------------------------------------------------------------
    let local_ip = match std::net::UdpSocket::bind("0.0.0.0:0") {
        Ok(s) => match s.connect("8.8.8.8:80") {
            Ok(_) => s.local_addr().map(|a| a.ip()).ok(),
            Err(_) => None,
        },
        Err(_) => None,
    };

    let local_ipv4 = match local_ip {
        Some(std::net::IpAddr::V4(v4)) if !v4.is_loopback() && !v4.is_unspecified() => v4,
        _ => {
            let mut resolved = std::net::Ipv4Addr::new(192, 168, 86, 1);
            for probe in &["192.168.1.1:80", "192.168.0.1:80", "192.168.86.1:80", "10.0.0.1:80", "172.16.0.1:80"] {
                if let Ok(s) = std::net::UdpSocket::bind("0.0.0.0:0") {
                    if s.connect(probe).is_ok() {
                        if let Ok(addr) = s.local_addr() {
                            if let std::net::IpAddr::V4(v4) = addr.ip() {
                                if !v4.is_loopback() && !v4.is_unspecified() {
                                    resolved = v4;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            resolved
        }
    };

    let octets = local_ipv4.octets();
    let prefix = format!("{}.{}.{}", octets[0], octets[1], octets[2]);

    // Bounded concurrency (12 tasks max to protect Wi-Fi from saturation)
    let mut tasks = Vec::with_capacity(254);
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(12));

    for i in 1..=254 {
        if i == octets[3] {
            continue;
        }
        let target_ip = format!("{}.{}", prefix, i);
        let sem = semaphore.clone();

        tasks.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.ok()?;

            // Polite probe on daemon ports (9038, 9039, 9040) with PING handshake
            for daemon_p in [9038, 9039, 9040] {
                if let Ok(Ok(mut stream)) = tokio::time::timeout(
                    Duration::from_millis(600),
                    TcpStream::connect(format!("{}:{}", target_ip, daemon_p)),
                ).await {
                    let probe = async {
                        stream.write_all(b"PING\n").await?;
                        stream.flush().await?;
                        let mut resp = [0u8; 128];
                        let n = stream.read(&mut resp).await?;
                        let _ = stream.write_all(b"QUIT\n").await;
                        let _ = stream.flush().await;
                        let _ = stream.shutdown().await;
                        Ok::<usize, std::io::Error>(n)
                    };

                    if let Ok(Ok(n)) = tokio::time::timeout(Duration::from_millis(600), probe).await {
                        if n > 0 {
                            return Some(DiscoveredConsole {
                                ip: target_ip,
                                port: daemon_p,
                                status: format!("Machete Daemon activo ({})", daemon_p),
                                is_daemon: true,
                            });
                        }
                    }
                }
            }

            None
        }));
    }

    let mut found = Vec::new();
    for t in tasks {
        if let Ok(Some(console)) = t.await {
            found.push(console);
        }
    }

    found.sort_by(|a, b| match (a.port, b.port) {
        (9038, _) => std::cmp::Ordering::Less,
        (_, 9038) => std::cmp::Ordering::Greater,
        (p1, p2) => p1.cmp(&p2),
    });

    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    #[test]
    fn test_console_game_deserialization_direct() {
        let raw_json = r#"[
            {
                "title_id": "PPSA01234",
                "title": "Demon's Souls",
                "path": "/data/games/PPSA01234",
                "storage_label": "/data/games",
                "storage_device": "Interno",
                "size": 32000000000,
                "format": "Folder"
            }
        ]"#;

        let parsed: ScanResultWrapper = serde_json::from_str(raw_json).expect("valid json");
        match parsed {
            ScanResultWrapper::Direct(games) => {
                assert_eq!(games.len(), 1);
                assert_eq!(games[0].title_id, Some("PPSA01234".to_string()));
                assert_eq!(games[0].title, "Demon's Souls");
                assert_eq!(games[0].path, "/data/games/PPSA01234");
                assert_eq!(games[0].storage_label, "/data/games");
                assert_eq!(games[0].storage_device, "Interno");
                assert_eq!(games[0].size, 32000000000);
                assert_eq!(games[0].format, "Folder");
            }
            _ => panic!("Expected direct game list"),
        }
    }

    #[test]
    fn test_console_game_deserialization_enveloped() {
        let raw_json = r#"{
            "status": "ok",
            "games": [
                {
                    "titleId": "CUSA00123",
                    "title": "Bloodborne",
                    "path": "/mnt/ext0/games/CUSA00123",
                    "storageLabel": "/mnt/ext0/games",
                    "storageDevice": "USB 0",
                    "size_bytes": 28000000000,
                    "format": "PKG"
                }
            ]
        }"#;

        let parsed: ScanResultWrapper = serde_json::from_str(raw_json).expect("valid json");
        match parsed {
            ScanResultWrapper::Enveloped { status, games, .. } => {
                assert_eq!(status, Some("ok".to_string()));
                let list = games.expect("games list");
                assert_eq!(list.len(), 1);
                assert_eq!(list[0].title_id, Some("CUSA00123".to_string()));
                assert_eq!(list[0].title, "Bloodborne");
                assert_eq!(list[0].path, "/mnt/ext0/games/CUSA00123");
                assert_eq!(list[0].storage_label, "/mnt/ext0/games");
                assert_eq!(list[0].storage_device, "USB 0");
                assert_eq!(list[0].size, 28000000000);
                assert_eq!(list[0].format, "PKG");
            }
            _ => panic!("Expected enveloped response"),
        }
    }

    #[tokio::test]
    async fn test_mock_check_console_status() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buf = [0u8; 128];
                let n = socket.read(&mut buf).await.unwrap();
                let msg = String::from_utf8_lossy(&buf[..n]);
                if msg.contains("PING") {
                    socket.write_all(b"{\"status\":\"ok\"}\n").await.unwrap();
                }
            }
        });

        let status = check_console_status("127.0.0.1".to_string(), addr.port()).await.unwrap();
        assert!(status);
    }

    #[tokio::test]
    async fn test_mock_delete_console_game() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buf = [0u8; 256];
                let n = socket.read(&mut buf).await.unwrap();
                let msg = String::from_utf8_lossy(&buf[..n]);
                if msg.starts_with("DELETE /data/games/TEST") {
                    socket.write_all(b"{\"status\":\"ok\",\"message\":\"Deleted\"}\n").await.unwrap();
                }
            }
        });

        let res = delete_console_game("127.0.0.1".to_string(), addr.port(), "/data/games/TEST".to_string()).await.unwrap();
        assert_eq!(res, "Deleted");
    }

    #[tokio::test]
    async fn test_mock_scan_console_games() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buf = [0u8; 128];
                let n = socket.read(&mut buf).await.unwrap();
                let msg = String::from_utf8_lossy(&buf[..n]);
                if msg.contains("SCAN") {
                    let resp = r#"[{"title_id":"PPSA00001","title":"Astro Playroom","path":"/data/games/PPSA00001","storage_label":"/data/games","storage_device":"Interno","size":12000000000,"format":"Folder"}]"#;
                    socket.write_all(resp.as_bytes()).await.unwrap();
                }
            }
        });

        let games = scan_console_games("127.0.0.1".to_string(), addr.port()).await.unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].title, "Astro Playroom");
    }
}
