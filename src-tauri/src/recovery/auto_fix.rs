use serde::{Deserialize, Serialize};
use std::path::Path;
use crate::wine::log_parser::WineError;
use crate::process::manager::ProcessManager;
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum FixResult {
    Fixed { action_taken: String },
    ManualRequired { instructions: Vec<String> },
    Unfixable { reason: String },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FixAttempt {
    pub timestamp: u64,
    pub error: WineError,
    pub result: FixResult,
}

pub struct AutoRecovery;

impl AutoRecovery {
    pub async fn attempt_fix(bottle_path: &Path, error: WineError) -> Result<FixResult, String> {
        match error {
            WineError::SteamHelperCrash { .. } => {
                // Action: Kill all Steam processes and suggest restart
                let _ = ProcessManager::kill_bottle_processes(bottle_path).await;
                
                // Clear Steam cache (heuristic)
                let cache_path = bottle_path.join("drive_c/users/crossover/Local Settings/Application Data/Steam/htmlcache");
                if cache_path.exists() {
                    let _ = std::fs::remove_dir_all(cache_path);
                }

                Ok(FixResult::Fixed { 
                    action_taken: "Terminated stuck Steam processes and cleared HTML cache. Please restart Steam.".to_string() 
                })
            },
            
            WineError::MissingDLL { dll_name } => {
                // Heuristic: If it's a known winetricks package, try to install it
                let package = match dll_name.to_lowercase().as_str() {
                    "d3dcompiler_47.dll" => "d3dcompiler_47",
                    "vcruntime140.dll" => "vcrun2015",
                    "mfc140.dll" => "vcrun2015",
                    "x3daudio1_7.dll" => "directx9",
                    _ => return Ok(FixResult::ManualRequired { 
                        instructions: vec![format!("Please install '{}' manually via Winetricks.", dll_name)] 
                    })
                };

                let output = Command::new("winetricks")
                    .env("WINEPREFIX", bottle_path)
                    .arg("-q")
                    .arg(package)
                    .output()
                    .await
                    .map_err(|e| e.to_string())?;

                if output.status.success() {
                    Ok(FixResult::Fixed { 
                        action_taken: format!("Automatically installed '{}' via Winetricks.", package) 
                    })
                } else {
                    Ok(FixResult::ManualRequired { 
                        instructions: vec![
                            format!("Failed to auto-install '{}'.", package),
                            "Check your internet connection and try manually.".to_string()
                        ] 
                    })
                }
            },

            WineError::AccessViolation { address } => {
                if address.contains("0xc0000005") {
                    Ok(FixResult::ManualRequired {
                        instructions: vec![
                            "This is a generic memory access violation.".to_string(),
                            "1. Try changing the Windows Version to Windows 10 in winecfg.".to_string(),
                            "2. Disable overlay software (Discord, Origin).".to_string()
                        ]
                    })
                } else {
                    Ok(FixResult::Unfixable { reason: "Unknown access violation pattern.".to_string() })
                }
            },

            _ => Ok(FixResult::Unfixable { reason: "No automated fix available for this error.".to_string() })
        }
    }
}

#[tauri::command]
pub async fn attempt_auto_fix(
    bottle_id: String,
    error: WineError,
    handle: tauri::AppHandle
) -> Result<FixResult, String> {
    let bottles = crate::core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id).ok_or("Bottle not found")?;
    
    AutoRecovery::attempt_fix(&bottle.path, error).await
}
