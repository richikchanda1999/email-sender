use crate::error::{AppError, Result};
use crate::gmail::mime::html_to_plain;
use sha2::{Digest, Sha256};
use std::path::Path;

/// Normalize the email body for dedup-comparison purposes:
/// - Convert HTML → plain text (strip tags, decode common entities)
/// - Collapse all runs of whitespace (including newlines) into a single space
/// - Trim
pub fn normalize_body(html: &str) -> String {
    let plain = html_to_plain(html);
    let mut out = String::with_capacity(plain.len());
    let mut in_ws = false;
    for ch in plain.chars() {
        if ch.is_whitespace() {
            if !in_ws && !out.is_empty() {
                out.push(' ');
                in_ws = true;
            }
        } else {
            out.push(ch);
            in_ws = false;
        }
    }
    out.trim().to_string()
}

pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let out = hasher.finalize();
    let mut s = String::with_capacity(64);
    for b in out.iter() {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

pub fn body_hash(html: &str) -> String {
    sha256_hex(normalize_body(html).as_bytes())
}

/// Fingerprint of the raw, un-substituted template so a re-send catches
/// duplicates even when a variable like {{Today}} resolves differently.
/// Subject + body share one hash so a subject edit still counts as new.
pub fn template_hash(subject_template: &str, body_template: &str) -> String {
    let s: String = subject_template.split_whitespace().collect::<Vec<_>>().join(" ");
    let b = normalize_body(body_template);
    sha256_hex(format!("{}\n\n{}", s, b).as_bytes())
}

/// Build a stable fingerprint of an attachment set from local filesystem paths.
/// For each file we record (basename_lowercase, size_bytes). Returns the hex digest
/// of the sorted, newline-joined fingerprints.
pub fn attachments_hash_from_paths(paths: &[String]) -> Result<String> {
    let mut parts: Vec<String> = Vec::with_capacity(paths.len());
    for p in paths {
        let path = Path::new(p);
        let name = path
            .file_name()
            .map(|s| s.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        let size = std::fs::metadata(path)
            .map_err(|e| AppError::Io(format!("stat {}: {}", p, e)))?
            .len();
        parts.push(format!("{}:{}", name, size));
    }
    parts.sort();
    Ok(sha256_hex(parts.join("\n").as_bytes()))
}

/// Build an attachment fingerprint from pre-computed (name, size) pairs, used for
/// comparing a local set to a Gmail-API-retrieved message's attachment list.
pub fn attachments_hash_from_pairs(pairs: &[(String, u64)]) -> String {
    let mut parts: Vec<String> = pairs
        .iter()
        .map(|(name, size)| format!("{}:{}", name.to_ascii_lowercase(), size))
        .collect();
    parts.sort();
    sha256_hex(parts.join("\n").as_bytes())
}
