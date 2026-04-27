use crate::error::Result;
use crate::gmail::history as gmail_history;
use crate::hash::{
    attachments_hash_from_paths, attachments_hash_from_pairs, normalize_body, sha256_hex,
    template_hash,
};
use crate::history;
use crate::oauth::flow;
use crate::state::AppState;
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
pub struct CheckRow {
    pub row_index: usize,
    pub recipient: String,
    pub body_html: String,
    #[serde(default)]
    pub subject_template: String,
    #[serde(default)]
    pub body_template: String,
    #[serde(default)]
    pub attachments: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct CheckArgs {
    pub rows: Vec<CheckRow>,
    pub lookback_days: u32,
    /// When true, skip the Gmail API portion of the check (useful for fast
    /// per-row pre-send checks where local history is authoritative enough).
    #[serde(default)]
    pub skip_gmail: bool,
}

#[derive(Debug, Serialize)]
pub struct DuplicateHit {
    pub row_index: usize,
    pub source: String, // "local" | "gmail"
    pub prior_sent_at: String,
    pub prior_message_id: String,
    pub prior_subject: String,
}

#[derive(Debug, Serialize)]
pub struct CheckResult {
    pub hits: Vec<DuplicateHit>,
    pub checked_rows: usize,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn check_duplicates(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    args: CheckArgs,
) -> Result<CheckResult> {
    let since = Utc::now() - Duration::days(args.lookback_days as i64);
    let since_iso = since.to_rfc3339();
    let since_epoch = since.timestamp();

    let mut hits: Vec<DuplicateHit> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    // Get access token up front; if we can't, skip the Gmail side but still do local.
    let access_token = if args.skip_gmail {
        None
    } else {
        match flow::ensure_fresh_token(&app, state.inner.clone()).await {
            Ok(t) => Some(t),
            Err(e) => {
                errors.push(format!("gmail check skipped — not signed in: {}", e));
                None
            }
        }
    };

    for row in &args.rows {
        if row.recipient.trim().is_empty() {
            continue;
        }
        let template_h = template_hash(&row.subject_template, &row.body_template);
        let attach_h = match attachments_hash_from_paths(&row.attachments) {
            Ok(h) => h,
            Err(e) => {
                errors.push(format!(
                    "row {}: could not stat attachments: {}",
                    row.row_index + 1,
                    e
                ));
                // still do the local check with an empty-set hash so a zero-attachment match still works
                sha256_hex(b"")
            }
        };

        // --- Local DB check (template-based) ---
        match history::find_local_matches_by_template(
            &app,
            &row.recipient,
            &template_h,
            &attach_h,
            &since_iso,
        ) {
            Ok(ms) => {
                for m in ms {
                    hits.push(DuplicateHit {
                        row_index: row.row_index,
                        source: "local".into(),
                        prior_sent_at: m.sent_at,
                        prior_message_id: m.gmail_message_id,
                        prior_subject: m.subject,
                    });
                }
            }
            Err(e) => errors.push(format!("row {}: local check: {}", row.row_index + 1, e)),
        }

        // --- Gmail API check ---
        if let Some(token) = &access_token {
            match gmail_history::list_sent_to(token, &row.recipient, since_epoch, 25).await {
                Ok(ids) => {
                    let target_body = normalize_body(&row.body_html);
                    for id in ids {
                        match gmail_history::fetch_message(token, &id).await {
                            Ok(msg) => {
                                // Skip if this exact message was logged locally (already reported).
                                if hits
                                    .iter()
                                    .any(|h| h.prior_message_id == msg.id && h.row_index == row.row_index)
                                {
                                    continue;
                                }
                                let gmail_attach_h =
                                    attachments_hash_from_pairs(&msg.attachments);
                                if gmail_attach_h != attach_h {
                                    continue;
                                }
                                let gmail_body_norm = if !msg.body_html.is_empty() {
                                    normalize_body(&msg.body_html)
                                } else {
                                    normalize_body(&msg.body_plain)
                                };
                                if gmail_body_norm == target_body {
                                    hits.push(DuplicateHit {
                                        row_index: row.row_index,
                                        source: "gmail".into(),
                                        prior_sent_at: msg.date_iso,
                                        prior_message_id: msg.id,
                                        prior_subject: msg.subject,
                                    });
                                }
                            }
                            Err(e) => errors.push(format!(
                                "row {}: fetch {}: {}",
                                row.row_index + 1,
                                id,
                                e
                            )),
                        }
                    }
                }
                Err(e) => {
                    errors.push(format!("row {}: gmail list: {}", row.row_index + 1, e));
                }
            }
        }
    }

    Ok(CheckResult {
        hits,
        checked_rows: args.rows.len(),
        errors,
    })
}
