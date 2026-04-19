use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub google_oauth: GoogleOAuth,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GoogleOAuth {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConfigStatus {
    pub present: bool,
    pub path: String,
}

pub fn resolve_config_path(app: &AppHandle) -> PathBuf {
    if let Ok(p) = std::env::var("LETTERPRESS_CONFIG") {
        return PathBuf::from(p);
    }
    let app_data = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    app_data.join("letterpress.toml")
}

pub fn load_config(app: &AppHandle) -> Result<Config> {
    let primary = resolve_config_path(app);
    let cwd_fallback = PathBuf::from("letterpress.toml");
    let path = if primary.exists() {
        primary
    } else if cwd_fallback.exists() {
        cwd_fallback
    } else {
        return Err(AppError::ConfigMissing(primary.to_string_lossy().into()));
    };
    let text = std::fs::read_to_string(&path)
        .map_err(|e| AppError::ConfigMissing(format!("{}: {}", path.display(), e)))?;
    let cfg: Config = toml::from_str(&text)
        .map_err(|e| AppError::Other(format!("parsing {}: {}", path.display(), e)))?;
    Ok(cfg)
}

#[tauri::command]
pub async fn config_status(app: AppHandle) -> Result<ConfigStatus> {
    let path = resolve_config_path(&app);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let present = path.exists() || PathBuf::from("letterpress.toml").exists();
    Ok(ConfigStatus {
        present,
        path: path.to_string_lossy().into_owned(),
    })
}
