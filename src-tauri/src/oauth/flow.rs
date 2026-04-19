use crate::config::load_config;
use crate::error::{AppError, Result};
use crate::gmail::userinfo;
use crate::oauth::loopback;
use crate::oauth::token_store;
use crate::state::{GoogleUser, Inner};
use oauth2::basic::BasicClient;
use oauth2::reqwest::async_http_client;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, RefreshToken, Scope, TokenResponse, TokenUrl,
};
use rand::RngCore;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::net::TcpListener;
use tokio::sync::Mutex;

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const SCOPES: &[&str] = &[
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
];

fn build_client(client_id: String, client_secret: String, redirect: String) -> Result<BasicClient> {
    let auth_url = AuthUrl::new(AUTH_URL.into())
        .map_err(|e| AppError::Oauth(format!("auth url: {}", e)))?;
    let token_url = TokenUrl::new(TOKEN_URL.into())
        .map_err(|e| AppError::Oauth(format!("token url: {}", e)))?;
    let redirect_url = RedirectUrl::new(redirect)
        .map_err(|e| AppError::Oauth(format!("redirect url: {}", e)))?;
    Ok(BasicClient::new(
        ClientId::new(client_id),
        Some(ClientSecret::new(client_secret)),
        auth_url,
        Some(token_url),
    )
    .set_redirect_uri(redirect_url))
}

fn random_state_hex() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub async fn start_flow(app: &AppHandle, inner: Arc<Mutex<Inner>>) -> Result<GoogleUser> {
    let cfg = load_config(app)?;

    // 1. Bind loopback on random free port
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| AppError::Oauth(format!("bind loopback: {}", e)))?;
    let port = listener
        .local_addr()
        .map_err(|e| AppError::Oauth(format!("local_addr: {}", e)))?
        .port();
    let redirect = format!("http://127.0.0.1:{}/", port);

    // 2. Build OAuth client + PKCE
    let client = build_client(
        cfg.google_oauth.client_id.clone(),
        cfg.google_oauth.client_secret.clone(),
        redirect,
    )?;
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    let state = random_state_hex();

    // 3. Build authorization URL
    let mut req = client
        .authorize_url(|| CsrfToken::new(state.clone()))
        .set_pkce_challenge(pkce_challenge);
    for s in SCOPES {
        req = req.add_scope(Scope::new((*s).to_string()));
    }
    let (auth_url, _csrf) = req
        .add_extra_param("access_type", "offline")
        .add_extra_param("prompt", "consent")
        .url();

    // 4. Open in default browser
    app.opener()
        .open_url(auth_url.as_str(), None::<&str>)
        .map_err(|e| AppError::Oauth(format!("open browser: {}", e)))?;

    // 5. Wait for redirect
    let redirect_result = loopback::wait_for_redirect(listener, &state, Duration::from_secs(180)).await?;

    // 6. Exchange code
    let token_response = client
        .exchange_code(AuthorizationCode::new(redirect_result.code))
        .set_pkce_verifier(PkceCodeVerifier::new(pkce_verifier.secret().clone()))
        .request_async(async_http_client)
        .await
        .map_err(|e| AppError::Oauth(format!("token exchange: {}", e)))?;

    let access_token = token_response.access_token().secret().clone();
    let refresh_token = token_response
        .refresh_token()
        .map(|t| t.secret().clone())
        .ok_or_else(|| {
            AppError::Oauth(
                "no refresh_token returned — try revoking consent and retrying with prompt=consent".into(),
            )
        })?;
    let expires_at = Instant::now()
        + token_response
            .expires_in()
            .unwrap_or(Duration::from_secs(3600));

    // 7. Fetch userinfo
    let user = userinfo::fetch(&access_token).await?;

    // 8. Persist
    token_store::save_refresh_token(&user.email, &refresh_token)?;
    token_store::write_last_account(app, &user.email)?;

    // 9. Cache in AppState
    {
        let mut guard = inner.lock().await;
        guard.user = Some(user.clone());
        guard.access_token = Some(access_token);
        guard.access_expires_at = Some(expires_at);
        guard.refresh_token = Some(refresh_token);
    }

    Ok(user)
}

pub async fn rehydrate(app: &AppHandle, inner: Arc<Mutex<Inner>>) -> Result<GoogleUser> {
    let email = token_store::read_last_account(app)?
        .ok_or_else(|| AppError::NotSignedIn)?;
    let refresh_token = token_store::load_refresh_token(&email)?;
    let cfg = load_config(app)?;

    // refresh immediately
    let client = build_client(
        cfg.google_oauth.client_id.clone(),
        cfg.google_oauth.client_secret.clone(),
        "http://127.0.0.1/".into(),
    )?;
    let token_response = client
        .exchange_refresh_token(&RefreshToken::new(refresh_token.clone()))
        .request_async(async_http_client)
        .await
        .map_err(|e| AppError::Oauth(format!("refresh: {}", e)))?;
    let access_token = token_response.access_token().secret().clone();
    let expires_at = Instant::now()
        + token_response
            .expires_in()
            .unwrap_or(Duration::from_secs(3600));
    let user = userinfo::fetch(&access_token).await?;

    {
        let mut guard = inner.lock().await;
        guard.user = Some(user.clone());
        guard.access_token = Some(access_token);
        guard.access_expires_at = Some(expires_at);
        guard.refresh_token = Some(refresh_token);
    }
    Ok(user)
}

pub async fn ensure_fresh_token(app: &AppHandle, inner: Arc<Mutex<Inner>>) -> Result<String> {
    {
        let guard = inner.lock().await;
        if let (Some(tok), Some(exp)) = (&guard.access_token, guard.access_expires_at) {
            if exp > Instant::now() + Duration::from_secs(60) {
                return Ok(tok.clone());
            }
        }
    }
    let refresh_token = {
        let guard = inner.lock().await;
        guard.refresh_token.clone()
    };
    let refresh_token = refresh_token.ok_or(AppError::NotSignedIn)?;
    let cfg = load_config(app)?;
    let client = build_client(
        cfg.google_oauth.client_id.clone(),
        cfg.google_oauth.client_secret.clone(),
        "http://127.0.0.1/".into(),
    )?;
    let token_response = match client
        .exchange_refresh_token(&RefreshToken::new(refresh_token))
        .request_async(async_http_client)
        .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(error = %e, "refresh token exchange failed; clearing session");
            let email = {
                let mut guard = inner.lock().await;
                let em = guard.user.as_ref().map(|u| u.email.clone());
                guard.user = None;
                guard.access_token = None;
                guard.access_expires_at = None;
                guard.refresh_token = None;
                em
            };
            if let Some(em) = email {
                let _ = crate::oauth::token_store::delete_refresh_token(&em);
            }
            let _ = crate::oauth::token_store::delete_last_account(app);
            return Err(AppError::NotSignedIn);
        }
    };
    let access_token = token_response.access_token().secret().clone();
    let expires_at = Instant::now()
        + token_response
            .expires_in()
            .unwrap_or(Duration::from_secs(3600));
    {
        let mut guard = inner.lock().await;
        guard.access_token = Some(access_token.clone());
        guard.access_expires_at = Some(expires_at);
    }
    Ok(access_token)
}

pub async fn sign_out(app: &AppHandle, inner: Arc<Mutex<Inner>>) -> Result<()> {
    let (email, refresh) = {
        let guard = inner.lock().await;
        (
            guard.user.as_ref().map(|u| u.email.clone()),
            guard.refresh_token.clone(),
        )
    };
    if let Some(rt) = refresh {
        // best-effort revoke
        let _ = reqwest::Client::new()
            .post(REVOKE_URL)
            .form(&[("token", rt)])
            .send()
            .await;
    }
    if let Some(e) = email {
        let _ = token_store::delete_refresh_token(&e);
    }
    let _ = token_store::delete_last_account(app);
    let mut guard = inner.lock().await;
    guard.user = None;
    guard.access_token = None;
    guard.access_expires_at = None;
    guard.refresh_token = None;
    Ok(())
}
