use crate::error::{AppError, Result};
use crate::state::GoogleUser;
use serde::Deserialize;

const USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v3/userinfo";

#[derive(Debug, Deserialize)]
struct RawUserInfo {
    email: Option<String>,
    name: Option<String>,
    picture: Option<String>,
    given_name: Option<String>,
}

pub async fn fetch(access_token: &str) -> Result<GoogleUser> {
    let resp = reqwest::Client::new()
        .get(USERINFO_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| AppError::Oauth(format!("userinfo request: {}", e)))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Oauth(format!(
            "userinfo {}: {}",
            status, body
        )));
    }
    let raw: RawUserInfo = resp
        .json()
        .await
        .map_err(|e| AppError::Oauth(format!("userinfo parse: {}", e)))?;
    let email = raw.email.ok_or_else(|| AppError::Oauth("no email in userinfo".into()))?;
    let name = raw
        .name
        .or(raw.given_name)
        .unwrap_or_else(|| email.clone());
    Ok(GoogleUser {
        email,
        name,
        picture: raw.picture,
    })
}
