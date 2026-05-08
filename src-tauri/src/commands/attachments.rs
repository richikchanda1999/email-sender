use crate::commands::sheet::read_rows_as_records;
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
    pub matched_sheet: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolveResult {
    pub rows: Vec<ResolvedAttachment>,
    pub unmatched_files: Vec<UnmatchedFile>,
}

type Entry = (String, String, PathBuf);

/// Match the file `entries` against the templated `pattern` resolved over each
/// row in `rows`. Returns the set of file paths that matched at least one row.
/// No per-row metadata — used for the secondary cross-sheet pass where we only
/// care whether a file has a home in another sheet.
fn match_entries_against_rows(
    entries: &[Entry],
    rows: &[HashMap<String, String>],
    pattern: &str,
    case_insensitive: bool,
    fuzzy: bool,
) -> HashSet<PathBuf> {
    let mut matched: HashSet<PathBuf> = HashSet::new();
    for row in rows {
        let resolved_name = resolve_template(pattern, row);
        let target = normalize(&resolved_name, case_insensitive, fuzzy);
        for (_, n, path) in entries {
            if n == &target {
                matched.insert(path.clone());
            }
        }
    }
    matched
}

#[tauri::command]
pub async fn resolve_attachments(
    folder: String,
    pattern: String,
    rows: Vec<HashMap<String, String>>,
    case_insensitive: bool,
    fuzzy: bool,
    workbook_path: Option<String>,
    other_sheet_names: Option<Vec<String>>,
) -> Result<ResolveResult> {
    let dir = PathBuf::from(&folder);
    if !dir.is_dir() {
        return Err(AppError::Io(format!("not a directory: {}", folder)));
    }

    let mut entries: Vec<Entry> = Vec::new();
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

        let mut matches: Vec<&Entry> = entries.iter().filter(|(_, n, _)| n == &target).collect();
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
            matched_sheet: None,
        })
        .collect();
    unmatched_files.sort_by(|a, b| a.name.cmp(&b.name));

    // --- Cross-sheet hint pass ---
    // For each unmatched file, scan the other sheets in the workbook to see if
    // the file would have matched a row there. First match wins. Errors are
    // non-fatal so a malformed sheet doesn't sink the whole resolve.
    if let (Some(wb_path), Some(other_sheets)) = (workbook_path, other_sheet_names) {
        for sheet_name in &other_sheets {
            if unmatched_files.iter().all(|f| f.matched_sheet.is_some()) {
                break;
            }
            let secondary_rows = match read_rows_as_records(&wb_path, sheet_name) {
                Ok(rs) => rs,
                Err(e) => {
                    tracing::warn!(
                        sheet = %sheet_name,
                        error = %e,
                        "cross-sheet match: could not read sheet"
                    );
                    continue;
                }
            };
            if secondary_rows.is_empty() {
                continue;
            }
            let matched_in_secondary = match_entries_against_rows(
                &entries,
                &secondary_rows,
                &pattern,
                case_insensitive,
                fuzzy,
            );
            for f in unmatched_files.iter_mut() {
                if f.matched_sheet.is_some() {
                    continue;
                }
                if matched_in_secondary.contains(&PathBuf::from(&f.path)) {
                    f.matched_sheet = Some(sheet_name.clone());
                }
            }
        }
    }

    Ok(ResolveResult {
        rows: out,
        unmatched_files,
    })
}
