use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::io::BufRead;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum LogLevel {
    Info,
    Warning,
    Error,
    Fatal,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LogEntry {
    pub timestamp: u64,
    pub level: LogLevel,
    pub message: String,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum WineError {
    MissingDLL { dll_name: String },
    DirectXError { error_code: String },
    SteamHelperCrash { reason: Option<String> },
    AccessViolation { address: String },
    MemoryError,
    RegistryError { key: String },
    Unknown { message: String },
}

pub struct LogParser {
    logs: Arc<Mutex<VecDeque<LogEntry>>>,
}

impl LogParser {
    pub fn new() -> Self {
        Self {
            logs: Arc::new(Mutex::new(VecDeque::with_capacity(1000))),
        }
    }

    pub fn parse_line(&self, line: &str) -> Option<LogEntry> {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Basic Wine log format: 010c:fixme:d3d:wined3d_check_device_format_conversion ...
        // or: 0024:err:module:import_dll Library foo.dll ...
        
        let level = if line.contains(":err:") {
            LogLevel::Error
        } else if line.contains(":fixme:") {
            LogLevel::Warning
        } else {
            LogLevel::Info
        };

        let entry = LogEntry {
            timestamp,
            level,
            message: line.to_string(),
            source: "wine".to_string(),
        };

        // Store in memory buffer (circular)
        if let Ok(mut logs) = self.logs.lock() {
            if logs.len() >= 1000 {
                logs.pop_front();
            }
            logs.push_back(entry.clone());
        }

        Some(entry)
    }

    pub fn analyze_error(line: &str) -> Option<WineError> {
        if line.contains("err:module:import_dll Library") {
            // Format: ... Library foo.dll (which is needed by ...
            let parts: Vec<&str> = line.split("Library ").collect();
            if parts.len() > 1 {
                let dll_part = parts[1].split(' ').next().unwrap_or("unknown");
                return Some(WineError::MissingDLL { dll_name: dll_part.to_string() });
            }
        } else if line.contains("SteamHelper.exe") && line.contains("page fault") {
            return Some(WineError::SteamHelperCrash { reason: Some("CEF Crash".to_string()) });
        } else if line.contains("0xc0000005") {
            return Some(WineError::AccessViolation { address: "0xc0000005".to_string() });
        }

        None
    }

    pub fn suggest_fix(error: &WineError) -> Vec<String> {
        match error {
            WineError::MissingDLL { dll_name } => vec![
                format!("Install missing library: {}", dll_name),
                "Check 'winetricks' for this package".to_string(),
            ],
            WineError::SteamHelperCrash { .. } => vec![
                "Restart Steam with '-no-browser' flag".to_string(),
                "Disable GPU acceleration in Steam settings".to_string(),
            ],
            WineError::AccessViolation { .. } => vec![
                "Check if the application requires 'run as admin'".to_string(),
                "Verify file permissions in drive_c".to_string(),
            ],
            _ => vec!["Check online WineHQ AppDB for this specific application".to_string()],
        }
    }
}

// Global instance to hold logs (simplified for MVP)
lazy_static::lazy_static! {
    pub static ref GLOBAL_PARSER: LogParser = LogParser::new();
}

#[tauri::command]
pub fn get_recent_logs() -> Vec<LogEntry> {
    if let Ok(logs) = GLOBAL_PARSER.logs.lock() {
        logs.iter().cloned().collect()
    } else {
        Vec::new()
    }
}

#[tauri::command]
pub fn analyze_log_line(line: String) -> Option<WineError> {
    LogParser::analyze_error(&line)
}

#[tauri::command]
pub fn get_fix_suggestion(error: WineError) -> Vec<String> {
    LogParser::suggest_fix(&error)
}
