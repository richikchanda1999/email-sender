use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct GoogleUser {
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
}

#[derive(Default)]
pub struct Inner {
    pub user: Option<GoogleUser>,
    pub access_token: Option<String>,
    pub access_expires_at: Option<Instant>,
    pub refresh_token: Option<String>,
}

#[derive(Clone, Default)]
pub struct AppState {
    pub inner: Arc<Mutex<Inner>>,
}
