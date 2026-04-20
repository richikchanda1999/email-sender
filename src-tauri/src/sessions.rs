use crate::error::{AppError, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMeta {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SessionIndex {
    #[serde(default)]
    sessions: Vec<SessionMeta>,
    #[serde(default)]
    trash: Vec<SessionMeta>,
}

fn sessions_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("app_data_dir: {}", e)))?
        .join("sessions");
    std::fs::create_dir_all(&dir).map_err(|e| AppError::Io(format!("mkdir sessions: {}", e)))?;
    Ok(dir)
}

fn trash_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = sessions_dir(app)?.join("trash");
    std::fs::create_dir_all(&dir).map_err(|e| AppError::Io(format!("mkdir trash: {}", e)))?;
    Ok(dir)
}

fn index_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(sessions_dir(app)?.join("index.json"))
}

fn read_index(app: &AppHandle) -> Result<SessionIndex> {
    let path = index_path(app)?;
    if !path.exists() {
        return Ok(SessionIndex::default());
    }
    let text = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Io(format!("read index: {}", e)))?;
    serde_json::from_str(&text).map_err(|e| AppError::Other(format!("parse index: {}", e)))
}

fn write_index(app: &AppHandle, idx: &SessionIndex) -> Result<()> {
    let path = index_path(app)?;
    let text = serde_json::to_string_pretty(idx)
        .map_err(|e| AppError::Other(format!("serialize index: {}", e)))?;
    std::fs::write(&path, text).map_err(|e| AppError::Io(format!("write index: {}", e)))?;
    Ok(())
}

fn session_file_path(app: &AppHandle, id: &str) -> Result<PathBuf> {
    // guard against path traversal — id must be a safe token
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(AppError::Other(format!("bad session id: {}", id)));
    }
    Ok(sessions_dir(app)?.join(format!("{}.json", id)))
}

fn trash_file_path(app: &AppHandle, id: &str) -> Result<PathBuf> {
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(AppError::Other(format!("bad session id: {}", id)));
    }
    Ok(trash_dir(app)?.join(format!("{}.json", id)))
}

fn gen_id() -> String {
    // UUID-ish from system randomness without the uuid crate
    use rand::RngCore;
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[tauri::command]
pub async fn list_sessions(app: AppHandle) -> Result<Vec<SessionMeta>> {
    let idx = read_index(&app)?;
    Ok(idx.sessions)
}

#[tauri::command]
pub async fn list_trash(app: AppHandle) -> Result<Vec<SessionMeta>> {
    let idx = read_index(&app)?;
    Ok(idx.trash)
}

#[tauri::command]
pub async fn load_session(app: AppHandle, id: String) -> Result<serde_json::Value> {
    let path = session_file_path(&app, &id)?;
    if !path.exists() {
        return Err(AppError::Other(format!("session not found: {}", id)));
    }
    let text = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Io(format!("read session: {}", e)))?;
    serde_json::from_str(&text).map_err(|e| AppError::Other(format!("parse session: {}", e)))
}

#[tauri::command]
pub async fn save_session(
    app: AppHandle,
    id: String,
    doc: serde_json::Value,
) -> Result<SessionMeta> {
    let path = session_file_path(&app, &id)?;

    // Ensure schema_version + id are baked into the file for forward-compat.
    let mut doc = doc;
    if let Some(map) = doc.as_object_mut() {
        map.insert("schema_version".into(), serde_json::json!(SCHEMA_VERSION));
        map.insert("id".into(), serde_json::json!(id));
    }
    let text = serde_json::to_string_pretty(&doc)
        .map_err(|e| AppError::Other(format!("serialize session: {}", e)))?;
    std::fs::write(&path, text).map_err(|e| AppError::Io(format!("write session: {}", e)))?;

    // Update the index timestamp + name (pulled out of the doc if present).
    let mut idx = read_index(&app)?;
    let now = Utc::now().to_rfc3339();
    let name_from_doc = doc
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let meta = if let Some(m) = idx.sessions.iter_mut().find(|m| m.id == id) {
        if let Some(n) = name_from_doc.clone() {
            m.name = n;
        }
        m.updated_at = now.clone();
        m.clone()
    } else {
        let m = SessionMeta {
            id: id.clone(),
            name: name_from_doc.unwrap_or_else(|| "Untitled campaign".into()),
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        idx.sessions.push(m.clone());
        m
    };
    write_index(&app, &idx)?;
    Ok(meta)
}

#[tauri::command]
pub async fn create_session(app: AppHandle, name: String) -> Result<SessionMeta> {
    let id = gen_id();
    let now = Utc::now().to_rfc3339();
    let meta = SessionMeta {
        id: id.clone(),
        name: if name.trim().is_empty() {
            "Untitled campaign".into()
        } else {
            name
        },
        created_at: now.clone(),
        updated_at: now,
    };
    // Seed an empty doc so load_session works right after create.
    let empty_doc = serde_json::json!({
        "schema_version": SCHEMA_VERSION,
        "id": id,
        "name": meta.name,
    });
    std::fs::write(
        session_file_path(&app, &id)?,
        serde_json::to_string_pretty(&empty_doc)
            .map_err(|e| AppError::Other(format!("serialize: {}", e)))?,
    )
    .map_err(|e| AppError::Io(format!("write session: {}", e)))?;
    let mut idx = read_index(&app)?;
    idx.sessions.push(meta.clone());
    write_index(&app, &idx)?;
    Ok(meta)
}

#[tauri::command]
pub async fn rename_session(app: AppHandle, id: String, name: String) -> Result<()> {
    let mut idx = read_index(&app)?;
    let m = idx
        .sessions
        .iter_mut()
        .find(|m| m.id == id)
        .ok_or_else(|| AppError::Other(format!("session not found: {}", id)))?;
    m.name = name.clone();
    m.updated_at = Utc::now().to_rfc3339();
    write_index(&app, &idx)?;
    // Also patch the stored doc so it matches.
    let path = session_file_path(&app, &id)?;
    if path.exists() {
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(map) = v.as_object_mut() {
                    map.insert("name".into(), serde_json::json!(name));
                    let _ = std::fs::write(
                        &path,
                        serde_json::to_string_pretty(&v).unwrap_or(text),
                    );
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_session(app: AppHandle, id: String) -> Result<()> {
    // Move file to trash + shuffle index entry
    let mut idx = read_index(&app)?;
    let pos = idx
        .sessions
        .iter()
        .position(|m| m.id == id)
        .ok_or_else(|| AppError::Other(format!("session not found: {}", id)))?;
    let mut meta = idx.sessions.remove(pos);
    meta.updated_at = Utc::now().to_rfc3339();
    let src = session_file_path(&app, &id)?;
    let dst = trash_file_path(&app, &id)?;
    if src.exists() {
        std::fs::rename(&src, &dst)
            .map_err(|e| AppError::Io(format!("move to trash: {}", e)))?;
    }
    idx.trash.push(meta);
    write_index(&app, &idx)?;
    Ok(())
}

#[tauri::command]
pub async fn restore_session(app: AppHandle, id: String) -> Result<()> {
    let mut idx = read_index(&app)?;
    let pos = idx
        .trash
        .iter()
        .position(|m| m.id == id)
        .ok_or_else(|| AppError::Other(format!("not in trash: {}", id)))?;
    let mut meta = idx.trash.remove(pos);
    meta.updated_at = Utc::now().to_rfc3339();
    let src = trash_file_path(&app, &id)?;
    let dst = session_file_path(&app, &id)?;
    if src.exists() {
        std::fs::rename(&src, &dst)
            .map_err(|e| AppError::Io(format!("restore: {}", e)))?;
    }
    idx.sessions.push(meta);
    write_index(&app, &idx)?;
    Ok(())
}

#[tauri::command]
pub async fn purge_session(app: AppHandle, id: String) -> Result<()> {
    let mut idx = read_index(&app)?;
    let pos = idx.trash.iter().position(|m| m.id == id);
    if let Some(p) = pos {
        idx.trash.remove(p);
    }
    let path = trash_file_path(&app, &id)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| AppError::Io(format!("purge: {}", e)))?;
    }
    write_index(&app, &idx)?;
    Ok(())
}
