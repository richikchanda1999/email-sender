use crate::error::{AppError, Result};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn db_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("app_data_dir: {}", e)))?;
    std::fs::create_dir_all(&dir).map_err(|e| AppError::Io(format!("mkdir: {}", e)))?;
    Ok(dir.join("history.db"))
}

fn open_conn(app: &AppHandle) -> Result<Connection> {
    let path = db_path(app)?;
    let conn = Connection::open(&path).map_err(|e| AppError::Io(format!("open db: {}", e)))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sent (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            sent_at           TEXT NOT NULL,
            sender_email      TEXT NOT NULL,
            recipient_email   TEXT NOT NULL,
            subject           TEXT NOT NULL,
            body_hash         TEXT NOT NULL,
            attachments_hash  TEXT NOT NULL,
            attachments_json  TEXT NOT NULL,
            gmail_message_id  TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_sent_recipient ON sent(recipient_email);
         CREATE INDEX IF NOT EXISTS idx_sent_hashes ON sent(recipient_email, body_hash, attachments_hash);
         CREATE INDEX IF NOT EXISTS idx_sent_at ON sent(sent_at);",
    )
    .map_err(|e| AppError::Io(format!("init schema: {}", e)))?;
    Ok(conn)
}

pub struct NewSend<'a> {
    pub sent_at: &'a str,
    pub sender_email: &'a str,
    pub recipient_email: &'a str,
    pub subject: &'a str,
    pub body_hash: &'a str,
    pub attachments_hash: &'a str,
    pub attachments: &'a [String],
    pub gmail_message_id: &'a str,
}

pub fn record_sent(app: &AppHandle, rec: NewSend) -> Result<()> {
    let conn = open_conn(app)?;
    let attachments_json =
        serde_json::to_string(rec.attachments).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT INTO sent (sent_at, sender_email, recipient_email, subject,
                           body_hash, attachments_hash, attachments_json, gmail_message_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            rec.sent_at,
            rec.sender_email,
            rec.recipient_email,
            rec.subject,
            rec.body_hash,
            rec.attachments_hash,
            attachments_json,
            rec.gmail_message_id,
        ],
    )
    .map_err(|e| AppError::Io(format!("insert sent: {}", e)))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct Match {
    pub sent_at: String,
    pub subject: String,
    pub gmail_message_id: String,
}

/// Find prior local sends to `recipient_email` with matching body + attachments,
/// within the lookback window. `since_iso` should be an ISO-8601 date-time string.
pub fn find_local_matches(
    app: &AppHandle,
    recipient_email: &str,
    body_hash: &str,
    attachments_hash: &str,
    since_iso: &str,
) -> Result<Vec<Match>> {
    let conn = open_conn(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT sent_at, subject, gmail_message_id
             FROM sent
             WHERE recipient_email = ?1
               AND body_hash = ?2
               AND attachments_hash = ?3
               AND sent_at >= ?4
             ORDER BY sent_at DESC",
        )
        .map_err(|e| AppError::Io(format!("prepare: {}", e)))?;
    let rows = stmt
        .query_map(
            params![recipient_email, body_hash, attachments_hash, since_iso],
            |row| {
                Ok(Match {
                    sent_at: row.get(0)?,
                    subject: row.get(1)?,
                    gmail_message_id: row.get(2)?,
                })
            },
        )
        .map_err(|e| AppError::Io(format!("query: {}", e)))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| AppError::Io(format!("row: {}", e)))?);
    }
    Ok(out)
}
