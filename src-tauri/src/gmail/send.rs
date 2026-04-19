use crate::error::{AppError, Result};
use base64::engine::general_purpose::URL_SAFE;
use base64::Engine;
use serde::Deserialize;

const SEND_URL: &str = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

#[derive(Debug, Deserialize)]
struct SendResponse {
    id: String,
    #[serde(rename = "threadId")]
    thread_id: String,
}

/// Returns (messageId, threadId).
pub async fn send_raw(access_token: &str, mime_bytes: &[u8]) -> Result<(String, String)> {
    let raw = URL_SAFE.encode(mime_bytes);
    let body = serde_json::json!({ "raw": raw });
    let resp = reqwest::Client::new()
        .post(SEND_URL)
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Gmail(format!("{}: {}", status, body)));
    }
    let parsed: SendResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Gmail(format!("parse response: {}", e)))?;
    Ok((parsed.id, parsed.thread_id))
}
