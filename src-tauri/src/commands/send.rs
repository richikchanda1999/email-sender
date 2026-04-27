use crate::error::Result;
use crate::gmail;
use crate::hash::{attachments_hash_from_paths, body_hash, template_hash};
use crate::history;
use crate::oauth::flow;
use crate::state::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
pub struct SendOneArgs {
    pub to_email: String,
    pub to_name: Option<String>,
    #[serde(default)]
    pub cc: Vec<String>,
    pub subject: String,
    /// HTML body (already token-resolved on the frontend).
    pub body_html: String,
    /// Raw subject template before token substitution; used for template-based dedup.
    #[serde(default)]
    pub subject_template: String,
    /// Raw body template before token substitution; used for template-based dedup.
    #[serde(default)]
    pub body_template: String,
    #[serde(default)]
    pub attachments: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct SendOneResult {
    pub gmail_message_id: String,
    pub thread_id: String,
}

#[tauri::command]
pub async fn send_one(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    args: SendOneArgs,
) -> Result<SendOneResult> {
    let token = flow::ensure_fresh_token(&app, state.inner.clone()).await?;
    let user = {
        let guard = state.inner.lock().await;
        guard.user.clone()
    };
    let user = user.ok_or(crate::error::AppError::NotSignedIn)?;

    let body_text = gmail::mime::html_to_plain(&args.body_html);

    let mime_bytes = gmail::mime::build_mime(
        &user.email,
        Some(&user.name),
        &args.to_email,
        args.to_name.as_deref(),
        &args.cc,
        &args.subject,
        &body_text,
        Some(&args.body_html),
        &args
            .attachments
            .iter()
            .map(std::path::PathBuf::from)
            .collect::<Vec<_>>(),
    )?;
    let (id, thread_id) = gmail::send::send_raw(&token, &mime_bytes).await?;

    // Log to local history for future dedup checks. Best-effort; don't fail the send.
    let bh = body_hash(&args.body_html);
    let th = template_hash(&args.subject_template, &args.body_template);
    let ah = attachments_hash_from_paths(&args.attachments).unwrap_or_default();
    let sent_at = Utc::now().to_rfc3339();
    if let Err(e) = history::record_sent(
        &app,
        history::NewSend {
            sent_at: &sent_at,
            sender_email: &user.email,
            recipient_email: &args.to_email,
            subject: &args.subject,
            body_hash: &bh,
            template_hash: &th,
            attachments_hash: &ah,
            attachments: &args.attachments,
            gmail_message_id: &id,
        },
    ) {
        tracing::warn!(error = %e, "could not record send to history db");
    }

    Ok(SendOneResult {
        gmail_message_id: id,
        thread_id: thread_id,
    })
}
