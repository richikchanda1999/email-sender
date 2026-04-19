use crate::error::{AppError, Result};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub struct RedirectResult {
    pub code: String,
}

const RESPONSE_HTML: &str = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Letterpress</title>\
<style>body{font-family:system-ui;background:#FBF5EA;color:#2D2A26;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}\
.card{background:#fff;padding:40px 48px;border-radius:12px;box-shadow:0 2px 18px rgba(0,0,0,.06);text-align:center}\
h1{color:#C4623F;margin:0 0 8px;font-size:22px}p{margin:0;color:#6B6560}</style></head>\
<body><div class=\"card\"><h1>Signed in to Letterpress</h1><p>You can close this tab and return to the app.</p></div></body></html>";

pub async fn wait_for_redirect(
    listener: TcpListener,
    expected_state: &str,
    timeout: Duration,
) -> Result<RedirectResult> {
    let accept = async {
        loop {
            let (mut socket, _) = listener
                .accept()
                .await
                .map_err(|e| AppError::Oauth(format!("accept: {}", e)))?;
            let mut buf = [0u8; 4096];
            let mut total = Vec::new();
            loop {
                let n = socket
                    .read(&mut buf)
                    .await
                    .map_err(|e| AppError::Oauth(format!("read: {}", e)))?;
                if n == 0 {
                    break;
                }
                total.extend_from_slice(&buf[..n]);
                if total.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
                if total.len() > 16 * 1024 {
                    return Err(AppError::Oauth("request too large".into()));
                }
            }
            let head = String::from_utf8_lossy(&total);
            let first_line = head.lines().next().unwrap_or("");
            // "GET /?code=...&state=... HTTP/1.1"
            let mut parts = first_line.split_whitespace();
            let _method = parts.next();
            let target = parts.next().unwrap_or("/");

            let write_response = |code: u16, body: &str| {
                let status_text = if code == 200 { "OK" } else { "Bad Request" };
                format!(
                    "HTTP/1.1 {} {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    code,
                    status_text,
                    body.len(),
                    body
                )
            };

            let (code_opt, state_opt) = parse_code_state(target);
            if let (Some(code), Some(state)) = (code_opt, state_opt) {
                if state != expected_state {
                    let _ = socket
                        .write_all(write_response(400, "state mismatch").as_bytes())
                        .await;
                    return Err(AppError::Oauth("state mismatch".into()));
                }
                let _ = socket.write_all(write_response(200, RESPONSE_HTML).as_bytes()).await;
                let _ = socket.shutdown().await;
                return Ok(RedirectResult { code });
            } else {
                // could be a favicon request — respond 404 and keep listening
                let _ = socket
                    .write_all(write_response(404, "not found").as_bytes())
                    .await;
                let _ = socket.shutdown().await;
                continue;
            }
        }
    };

    tokio::time::timeout(timeout, accept)
        .await
        .map_err(|_| AppError::Oauth("timed out waiting for redirect".into()))?
}

fn parse_code_state(target: &str) -> (Option<String>, Option<String>) {
    let query_start = match target.find('?') {
        Some(i) => i + 1,
        None => return (None, None),
    };
    let query = &target[query_start..];
    let mut code = None;
    let mut state = None;
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        let k = kv.next().unwrap_or("");
        let v = kv.next().unwrap_or("");
        let decoded = url_decode(v);
        match k {
            "code" => code = Some(decoded),
            "state" => state = Some(decoded),
            _ => {}
        }
    }
    (code, state)
}

fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hi = (bytes[i + 1] as char).to_digit(16);
                let lo = (bytes[i + 2] as char).to_digit(16);
                if let (Some(hi), Some(lo)) = (hi, lo) {
                    out.push(((hi << 4) | lo) as u8);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}
