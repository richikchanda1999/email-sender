use crate::error::Result;
use crate::oauth::flow;
use crate::state::{AppState, GoogleUser};
use tauri::AppHandle;

#[tauri::command]
pub async fn start_google_auth(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<GoogleUser> {
    flow::start_flow(&app, state.inner.clone()).await
}

#[tauri::command]
pub async fn current_user(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<GoogleUser>> {
    match flow::rehydrate(&app, state.inner.clone()).await {
        Ok(u) => Ok(Some(u)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn sign_out(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    flow::sign_out(&app, state.inner.clone()).await
}
