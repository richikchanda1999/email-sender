use crate::error::{AppError, Result};
use calamine::{open_workbook_auto, Data, Reader};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct Sheet {
    pub path: String,
    pub sheet_name: String,
    pub available_sheets: Vec<String>,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

fn cell_to_string(c: &Data) -> String {
    match c {
        Data::Empty => String::new(),
        Data::String(s) => s.clone(),
        Data::Float(f) => {
            if f.fract() == 0.0 && f.is_finite() && f.abs() < 1e16 {
                format!("{}", *f as i64)
            } else {
                format!("{}", f)
            }
        }
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::DateTime(dt) => dt
            .as_datetime()
            .map(|d| d.format("%Y-%m-%dT%H:%M:%S").to_string())
            .unwrap_or_else(|| dt.to_string()),
        Data::DateTimeIso(s) => s.clone(),
        Data::DurationIso(s) => s.clone(),
        Data::Error(e) => format!("{:?}", e),
    }
}

#[tauri::command]
pub async fn load_spreadsheet(path: String, sheet_name: Option<String>) -> Result<Sheet> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(AppError::Spreadsheet(format!("file not found: {}", path)));
    }
    let mut workbook = open_workbook_auto(p)
        .map_err(|e| AppError::Spreadsheet(format!("open: {}", e)))?;
    let sheet_names = workbook.sheet_names();
    if sheet_names.is_empty() {
        return Err(AppError::Spreadsheet("no sheets found".into()));
    }
    let chosen = match sheet_name {
        Some(requested) => {
            if !sheet_names.iter().any(|n| n == &requested) {
                return Err(AppError::Spreadsheet(format!(
                    "sheet '{}' not found; available: {}",
                    requested,
                    sheet_names.join(", ")
                )));
            }
            requested
        }
        None => sheet_names
            .iter()
            .find(|n| {
                workbook
                    .worksheet_range(n)
                    .map(|r| r.rows().any(|row| row.iter().any(|c| !matches!(c, Data::Empty))))
                    .unwrap_or(false)
            })
            .cloned()
            .unwrap_or_else(|| sheet_names[0].clone()),
    };

    let range = workbook
        .worksheet_range(&chosen)
        .map_err(|e| AppError::Spreadsheet(format!("reading {}: {}", chosen, e)))?;

    let mut iter = range.rows();
    let header_row = iter
        .next()
        .ok_or_else(|| AppError::Spreadsheet("empty sheet".into()))?;
    let mut columns: Vec<String> = header_row.iter().map(cell_to_string).collect();
    while columns.last().map(|s| s.trim().is_empty()).unwrap_or(false) {
        columns.pop();
    }
    if columns.is_empty() {
        return Err(AppError::Spreadsheet("no header row".into()));
    }
    let mut seen = std::collections::HashSet::new();
    for (i, c) in columns.iter_mut().enumerate() {
        *c = c.trim().to_string();
        if c.is_empty() {
            return Err(AppError::Spreadsheet(format!(
                "empty header cell at column {}",
                i + 1
            )));
        }
        if !seen.insert(c.clone()) {
            return Err(AppError::Spreadsheet(format!("duplicate header: {}", c)));
        }
    }

    let col_count = columns.len();
    let mut rows: Vec<Vec<String>> = Vec::new();
    for row in iter {
        let values: Vec<String> = (0..col_count)
            .map(|i| row.get(i).map(cell_to_string).unwrap_or_default())
            .collect();
        if values.iter().all(|v| v.trim().is_empty()) {
            continue;
        }
        rows.push(values);
    }

    Ok(Sheet {
        path,
        sheet_name: chosen,
        available_sheets: sheet_names,
        columns,
        rows,
    })
}
