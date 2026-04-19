use crate::error::{AppError, Result};
use crate::fsmatch::{normalize, resolve_template};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedAttachment {
    pub row_index: usize,
    pub resolved_name: String,
    pub matched_path: Option<String>,
    pub note: Option<String>,
}

#[tauri::command]
pub async fn resolve_attachments(
    folder: String,
    pattern: String,
    rows: Vec<HashMap<String, String>>,
    case_insensitive: bool,
    fuzzy: bool,
) -> Result<Vec<ResolvedAttachment>> {
    let dir = PathBuf::from(&folder);
    if !dir.is_dir() {
        return Err(AppError::Io(format!("not a directory: {}", folder)));
    }

    let mut entries: Vec<(String, String, PathBuf)> = Vec::new();
    for e in std::fs::read_dir(&dir)? {
        let e = e?;
        if !e.file_type()?.is_file() {
            continue;
        }
        let name = e.file_name().to_string_lossy().into_owned();
        let norm = normalize(&name, case_insensitive, fuzzy);
        entries.push((name, norm, e.path()));
    }

    let mut out = Vec::with_capacity(rows.len());
    for (i, row) in rows.iter().enumerate() {
        let resolved_name = resolve_template(&pattern, row);
        let target = normalize(&resolved_name, case_insensitive, fuzzy);

        let mut matches: Vec<&(String, String, PathBuf)> =
            entries.iter().filter(|(_, n, _)| n == &target).collect();
        matches.sort_by_key(|(n, _, _)| n.len());

        let (matched_path, note) = match matches.len() {
            0 => (None, None),
            1 => (
                Some(matches[0].2.to_string_lossy().into_owned()),
                None,
            ),
            n => (
                Some(matches[0].2.to_string_lossy().into_owned()),
                Some(format!(
                    "{} files matched; picked shortest: {}",
                    n, matches[0].0
                )),
            ),
        };

        out.push(ResolvedAttachment {
            row_index: i,
            resolved_name,
            matched_path,
            note,
        });
    }

    Ok(out)
}
