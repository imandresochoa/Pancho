use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::process::Command;
use std::collections::HashSet;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum WineRunnerType {
    Standard,
    GPTK,
    WhiskyGPTK,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WineRunner {
    pub runner_type: WineRunnerType,
    pub path: PathBuf,
    pub version: String,
    pub supports_d3dmetal: bool,
    pub supports_esync: bool,
}

async fn get_wine_version(path: &Path) -> Option<String> {
    let output = Command::new(path)
        .arg("--version")
        .output()
        .await
        .ok()?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Some(version)
    } else {
        None
    }
}

fn check_d3dmetal(wine_path: &Path) -> bool {
    // Check in ../lib/wine/x86_64-windows/ (relative to bin/wine64)
    if let Some(bin_dir) = wine_path.parent() {
        let lib_dir = bin_dir.parent().map(|p| p.join("lib/wine/x86_64-windows"));
        if let Some(path) = lib_dir {
            return path.join("d3dmetald3d11.dll").exists() || path.join("d3dmetald3d12.dll").exists();
        }
    }
    false
}

fn check_esync(version: &str) -> bool {
    // Basic heuristic: most modern GPTK/Whisky builds support esync.
    // Standard wine might not unless specifically patched.
    version.to_lowercase().contains("esync") || version.contains("staging")
}

#[tauri::command]
pub async fn get_wine_runners() -> Result<Vec<WineRunner>, String> {
    let mut runners = Vec::new();
    let mut seen_paths = HashSet::new();

    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let home_path = Path::new(&home);

    let mut scan_paths = vec![
        PathBuf::from("/usr/local/bin/wine64"),
        PathBuf::from("/opt/homebrew/bin/wine64"),
        PathBuf::from("/usr/local/opt/game-porting-toolkit/bin/wine64"),
    ];

    // Whisky Engines
    let whisky_engines_dir = home_path.join("Library/Application Support/com.isaacmarovitz.Whisky/Engines");
    if whisky_engines_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(whisky_engines_dir) {
            for entry in entries.flatten() {
                let wine_path = entry.path().join("bin/wine64");
                if wine_path.exists() {
                    scan_paths.push(wine_path);
                }
            }
        }
    }

    for path in scan_paths {
        if !path.exists() || seen_paths.contains(&path) {
            continue;
        }

        if let Some(version) = get_wine_version(&path).await {
            let runner_type = if path.to_string_lossy().contains("Whisky") {
                WineRunnerType::WhiskyGPTK
            } else if path.to_string_lossy().contains("game-porting-toolkit") {
                WineRunnerType::GPTK
            } else {
                WineRunnerType::Standard
            };

            let supports_d3dmetal = check_d3dmetal(&path);
            let supports_esync = check_esync(&version);

            runners.push(WineRunner {
                runner_type,
                path: path.clone(),
                version,
                supports_d3dmetal,
                supports_esync,
            });
            seen_paths.insert(path);
        }
    }

    Ok(runners)
}
