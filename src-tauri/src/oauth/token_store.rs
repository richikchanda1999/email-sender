use crate::error::{AppError, Result};
use keyring::Entry;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const KEYCHAIN_SERVICE: &str = "com.marchettistudio.letterpress";

pub fn last_account_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("app_data_dir: {}", e)))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError::Io(format!("mkdir app_data_dir: {}", e)))?;
    Ok(dir.join("last_account.txt"))
}

pub fn save_refresh_token(email: &str, refresh_token: &str) -> Result<()> {
    let entry = Entry::new(KEYCHAIN_SERVICE, email)?;
    entry.set_password(refresh_token)?;
    Ok(())
}

pub fn load_refresh_token(email: &str) -> Result<String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, email)?;
    let t = entry.get_password()?;
    Ok(t)
}

pub fn delete_refresh_token(email: &str) -> Result<()> {
    let entry = Entry::new(KEYCHAIN_SERVICE, email)?;
    let _ = entry.delete_credential();
    Ok(())
}

pub fn write_last_account(app: &AppHandle, email: &str) -> Result<()> {
    let p = last_account_path(app)?;
    std::fs::write(&p, email).map_err(|e| AppError::Io(format!("write last_account: {}", e)))?;
    Ok(())
}

pub fn read_last_account(app: &AppHandle) -> Result<Option<String>> {
    let p = last_account_path(app)?;
    if !p.exists() {
        return Ok(None);
    }
    let s = std::fs::read_to_string(&p)
        .map_err(|e| AppError::Io(format!("read last_account: {}", e)))?;
    let s = s.trim().to_string();
    if s.is_empty() {
        Ok(None)
    } else {
        Ok(Some(s))
    }
}

pub fn delete_last_account(app: &AppHandle) -> Result<()> {
    let p = last_account_path(app)?;
    if p.exists() {
        std::fs::remove_file(&p).map_err(|e| AppError::Io(format!("rm last_account: {}", e)))?;
    }
    Ok(())
}
