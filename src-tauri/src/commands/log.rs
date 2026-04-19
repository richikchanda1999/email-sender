use crate::error::{AppError, Result};
use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Deserialize)]
pub struct LogEntry {
    pub row_index: usize,
    pub recipient: String,
    pub subject: String,
    pub status: String,
    pub timestamp: String,
    #[serde(default)]
    pub message_id: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

#[tauri::command]
pub async fn export_log(app: AppHandle, entries: Vec<LogEntry>) -> Result<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("CSV", &["csv"])
        .set_file_name("letterpress-log.csv")
        .save_file(move |p| {
            let _ = tx.send(p);
        });
    let file_path = rx
        .await
        .map_err(|e| AppError::Other(format!("dialog channel: {}", e)))?;
    let file_path = match file_path {
        Some(p) => p,
        None => return Err(AppError::Cancelled),
    };
    let path_buf = file_path
        .into_path()
        .map_err(|e| AppError::Other(format!("dialog path: {}", e)))?;

    let mut wtr = csv::Writer::from_path(&path_buf)
        .map_err(|e| AppError::Io(format!("csv open: {}", e)))?;
    wtr.write_record(&[
        "row_index",
        "recipient",
        "subject",
        "status",
        "timestamp",
        "message_id",
        "error",
    ])
    .map_err(|e| AppError::Io(format!("csv header: {}", e)))?;
    for e in entries {
        wtr.write_record(&[
            e.row_index.to_string(),
            e.recipient,
            e.subject,
            e.status,
            e.timestamp,
            e.message_id.unwrap_or_default(),
            e.error.unwrap_or_default(),
        ])
        .map_err(|e| AppError::Io(format!("csv row: {}", e)))?;
    }
    wtr.flush().map_err(|e| AppError::Io(format!("csv flush: {}", e)))?;
    Ok(path_buf.to_string_lossy().into_owned())
}
