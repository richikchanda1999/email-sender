use crate::error::{AppError, Result};
use mail_builder::MessageBuilder;
use std::path::{Path, PathBuf};

fn mime_for(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
}

/// Very simple HTML → plain-text fallback. Walks the HTML, inserting newlines at
/// common block boundaries and <br>, strips all tags, decodes a handful of entities,
/// and collapses excess blank lines.
pub fn html_to_plain(html: &str) -> String {
    let bytes = html.as_bytes();
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'<' {
            // Find end of tag
            let mut j = i + 1;
            while j < bytes.len() && bytes[j] != b'>' {
                j += 1;
            }
            if j >= bytes.len() {
                break;
            }
            let tag = &html[i + 1..j].to_ascii_lowercase();
            let tag_name: String = tag
                .trim_start_matches('/')
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric())
                .collect();
            let is_close = tag.starts_with('/');
            let is_br = tag_name == "br";
            let is_block = matches!(
                tag_name.as_str(),
                "p" | "div"
                    | "h1"
                    | "h2"
                    | "h3"
                    | "h4"
                    | "h5"
                    | "h6"
                    | "li"
                    | "tr"
                    | "blockquote"
                    | "section"
                    | "article"
            );
            if is_br || (is_close && is_block) {
                out.push('\n');
            }
            i = j + 1;
            continue;
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    let decoded = out
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");

    // Collapse 3+ newlines into 2
    let mut collapsed = String::with_capacity(decoded.len());
    let mut nl = 0;
    for ch in decoded.chars() {
        if ch == '\n' {
            nl += 1;
            if nl <= 2 {
                collapsed.push(ch);
            }
        } else {
            nl = 0;
            collapsed.push(ch);
        }
    }
    collapsed.trim().to_string()
}

pub fn build_mime(
    from_email: &str,
    from_name: Option<&str>,
    to_email: &str,
    to_name: Option<&str>,
    cc: &[String],
    subject: &str,
    body_text: &str,
    body_html: Option<&str>,
    attachments: &[PathBuf],
) -> Result<Vec<u8>> {
    let mut msg = MessageBuilder::new()
        .from((from_name.unwrap_or(""), from_email))
        .to((to_name.unwrap_or(""), to_email))
        .subject(subject)
        .text_body(body_text);

    if let Some(html) = body_html {
        msg = msg.html_body(html);
    }

    if !cc.is_empty() {
        let cc_addrs: Vec<(&str, &str)> = cc.iter().map(|e| ("", e.as_str())).collect();
        msg = msg.cc(cc_addrs);
    }

    for path in attachments {
        let bytes = std::fs::read(path)
            .map_err(|e| AppError::Io(format!("read attachment {}: {}", path.display(), e)))?;
        let filename = path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "attachment".to_string());
        let mime = mime_for(path);
        msg = msg.attachment(mime, filename, bytes);
    }

    msg.write_to_vec()
        .map_err(|e| AppError::Gmail(format!("mime build: {}", e)))
}
