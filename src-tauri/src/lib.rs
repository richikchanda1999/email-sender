mod commands;
mod config;
mod error;
mod fsmatch;
mod gmail;
mod hash;
mod history;
mod oauth;
mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            config::config_status,
            commands::sheet::load_spreadsheet,
            commands::attachments::resolve_attachments,
            commands::auth::start_google_auth,
            commands::auth::current_user,
            commands::auth::sign_out,
            commands::send::send_one,
            commands::dedupe::check_duplicates,
            commands::log::export_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
