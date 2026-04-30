use crate::error::{AppError, Result};
use crate::fsmatch::{normalize, resolve_template};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedAttachment {
    pub row_index: usize,
    pub resolved_name: String,
    pub matched_path: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UnmatchedFile {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolveResult {
    pub rows: Vec<ResolvedAttachment>,
    pub unmatched_files: Vec<UnmatchedFile>,
}

#[tauri::command]
pub async fn resolve_attachments(
    folder: String,
    pattern: String,
    rows: Vec<HashMap<String, String>>,
    case_insensitive: bool,
    fuzzy: bool,
) -> Result<ResolveResult> {
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
    let mut used: HashSet<PathBuf> = HashSet::new();
    for (i, row) in rows.iter().enumerate() {
        let resolved_name = resolve_template(&pattern, row);
        let target = normalize(&resolved_name, case_insensitive, fuzzy);

        let mut matches: Vec<&(String, String, PathBuf)> =
            entries.iter().filter(|(_, n, _)| n == &target).collect();
        matches.sort_by_key(|(n, _, _)| n.len());

        let (matched_path, note) = match matches.len() {
            0 => (None, None),
            1 => {
                used.insert(matches[0].2.clone());
                (Some(matches[0].2.to_string_lossy().into_owned()), None)
            }
            n => {
                for m in &matches {
                    used.insert(m.2.clone());
                }
                (
                    Some(matches[0].2.to_string_lossy().into_owned()),
                    Some(format!(
                        "{} files matched; picked shortest: {}",
                        n, matches[0].0
                    )),
                )
            }
        };

        out.push(ResolvedAttachment {
            row_index: i,
            resolved_name,
            matched_path,
            note,
        });
    }

    let mut unmatched_files: Vec<UnmatchedFile> = entries
        .iter()
        .filter(|(_, _, p)| !used.contains(p))
        .map(|(name, _, path)| UnmatchedFile {
            name: name.clone(),
            path: path.to_string_lossy().into_owned(),
        })
        .collect();
    unmatched_files.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(ResolveResult {
        rows: out,
        unmatched_files,
    })
}
