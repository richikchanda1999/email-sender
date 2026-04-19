use crate::error::{AppError, Result};
use base64::engine::general_purpose::URL_SAFE;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::Deserialize;

const BASE: &str = "https://gmail.googleapis.com/gmail/v1/users/me";

#[derive(Debug, Clone)]
pub struct FetchedMessage {
    pub id: String,
    pub subject: String,
    pub date_iso: String,
    pub body_html: String,
    pub body_plain: String,
    pub attachments: Vec<(String, u64)>, // (filename, size_bytes)
}

#[derive(Debug, Deserialize)]
struct ListResponse {
    #[serde(default)]
    messages: Vec<IdOnly>,
    #[serde(default, rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IdOnly {
    id: String,
}

#[derive(Debug, Deserialize)]
struct FullMessage {
    id: String,
    #[serde(rename = "internalDate")]
    internal_date: Option<String>,
    payload: Option<Payload>,
}

#[derive(Debug, Deserialize)]
struct Payload {
    #[serde(default)]
    headers: Vec<Header>,
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
    filename: Option<String>,
    body: Option<Body>,
    #[serde(default)]
    parts: Vec<Payload>,
}

#[derive(Debug, Deserialize)]
struct Header {
    name: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct Body {
    #[serde(default)]
    size: u64,
    #[serde(default)]
    data: Option<String>,
}

/// List message IDs in the Sent folder that were sent TO `recipient_email` AFTER `after_epoch_secs`.
pub async fn list_sent_to(
    access_token: &str,
    recipient_email: &str,
    after_epoch_secs: i64,
    max_results: u32,
) -> Result<Vec<String>> {
    let q = format!("to:{} after:{} in:sent", recipient_email, after_epoch_secs);
    let mut ids = Vec::new();
    let mut page_token: Option<String> = None;
    let client = reqwest::Client::new();
    loop {
        let mut url = reqwest::Url::parse(&format!("{}/messages", BASE))
            .map_err(|e| AppError::Other(format!("url parse: {}", e)))?;
        {
            let mut qp = url.query_pairs_mut();
            qp.append_pair("q", &q);
            qp.append_pair("maxResults", &max_results.to_string());
            if let Some(pt) = &page_token {
                qp.append_pair("pageToken", pt);
            }
        }
        let resp = client
            .get(url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| AppError::Gmail(format!("list: {}", e)))?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Gmail(format!("list {}: {}", status, body)));
        }
        let parsed: ListResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Gmail(format!("list parse: {}", e)))?;
        for m in parsed.messages {
            ids.push(m.id);
            if ids.len() >= max_results as usize {
                return Ok(ids);
            }
        }
        match parsed.next_page_token {
            Some(tok) => page_token = Some(tok),
            None => break,
        }
    }
    Ok(ids)
}

pub async fn fetch_message(access_token: &str, id: &str) -> Result<FetchedMessage> {
    let url = format!("{}/messages/{}?format=full", BASE, id);
    let resp = reqwest::Client::new()
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| AppError::Gmail(format!("fetch: {}", e)))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Gmail(format!("fetch {}: {}", status, body)));
    }
    let parsed: FullMessage = resp
        .json()
        .await
        .map_err(|e| AppError::Gmail(format!("fetch parse: {}", e)))?;

    let mut subject = String::new();
    let mut body_html = String::new();
    let mut body_plain = String::new();
    let mut attachments: Vec<(String, u64)> = Vec::new();

    if let Some(payload) = &parsed.payload {
        for h in &payload.headers {
            if h.name.eq_ignore_ascii_case("Subject") {
                subject = h.value.clone();
            }
        }
        walk(payload, &mut body_html, &mut body_plain, &mut attachments);
    }

    let date_iso = parsed
        .internal_date
        .as_deref()
        .and_then(|s| s.parse::<i64>().ok())
        .map(|ms| {
            let secs = ms / 1000;
            chrono::DateTime::from_timestamp(secs, 0)
                .map(|d| d.to_rfc3339())
                .unwrap_or_default()
        })
        .unwrap_or_default();

    Ok(FetchedMessage {
        id: parsed.id,
        subject,
        date_iso,
        body_html,
        body_plain,
        attachments,
    })
}

fn walk(
    p: &Payload,
    body_html: &mut String,
    body_plain: &mut String,
    attachments: &mut Vec<(String, u64)>,
) {
    let mime = p.mime_type.as_deref().unwrap_or("");
    let filename = p.filename.as_deref().unwrap_or("");
    if !filename.is_empty() {
        if let Some(body) = &p.body {
            attachments.push((filename.to_string(), body.size));
        }
    }
    if let Some(body) = &p.body {
        if let Some(data) = &body.data {
            if mime == "text/html" && body_html.is_empty() {
                if let Some(decoded) = decode_b64url(data) {
                    *body_html = decoded;
                }
            } else if mime == "text/plain" && body_plain.is_empty() {
                if let Some(decoded) = decode_b64url(data) {
                    *body_plain = decoded;
                }
            }
        }
    }
    for child in &p.parts {
        walk(child, body_html, body_plain, attachments);
    }
}

fn decode_b64url(data: &str) -> Option<String> {
    // Gmail sends URL-safe base64, sometimes with padding, sometimes without.
    let attempts = [
        URL_SAFE.decode(data).ok(),
        URL_SAFE_NO_PAD.decode(data).ok(),
    ];
    for a in attempts.into_iter().flatten() {
        if let Ok(s) = String::from_utf8(a) {
            return Some(s);
        }
    }
    None
}
