use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("config missing: {0}")]
    ConfigMissing(String),
    #[error("spreadsheet error: {0}")]
    Spreadsheet(String),
    #[error("oauth error: {0}")]
    Oauth(String),
    #[error("keychain error: {0}")]
    Keychain(String),
    #[error("gmail api error: {0}")]
    Gmail(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("not signed in")]
    NotSignedIn,
    #[error("user cancelled")]
    Cancelled,
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Gmail(e.to_string())
    }
}

impl From<keyring::Error> for AppError {
    fn from(e: keyring::Error) -> Self {
        AppError::Keychain(e.to_string())
    }
}

impl From<calamine::Error> for AppError {
    fn from(e: calamine::Error) -> Self {
        AppError::Spreadsheet(e.to_string())
    }
}

impl From<calamine::XlsxError> for AppError {
    fn from(e: calamine::XlsxError) -> Self {
        AppError::Spreadsheet(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
