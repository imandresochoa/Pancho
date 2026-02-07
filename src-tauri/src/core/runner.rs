use std::process::Command;
use std::path::Path;
use std::fs;
use tauri::Manager;

#[derive(serde::Serialize)]
pub struct RunResult {
    pub success: bool,
    pub message: String,
}

pub fn find_runner() -> Option<String> {
    // Common paths and binary names for wine/gptk on macOS
    let paths = [
        "/opt/homebrew/bin/gameportingtoolkit",
        "/usr/local/bin/gameportingtoolkit",
        "/opt/homebrew/bin/wine64",
        "/usr/local/bin/wine64",
        "/opt/homebrew/bin/wine",
        "/usr/local/bin/wine",
        "/Applications/Whisky.app/Contents/Resources/wine/bin/wine64",
    ];

    for path in paths {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    // Try finding via 'which' for any version of wine
    let binaries = ["gameportingtoolkit", "wine64", "wine"];
    for bin in binaries {
        if let Ok(output) = Command::new("which").arg(bin).output() {
            if output.status.success() {
                return Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
            }
        }
    }

    None
}

pub fn run_executable(exe_path: &str, prefix_path: &Path) -> Result<RunResult, String> {
    let runner = find_runner().ok_or("No Wine or Game Porting Toolkit found. Please install them via Homebrew.")?;
    
    if !prefix_path.exists() {
        fs::create_dir_all(&prefix_path).map_err(|e| e.to_string())?;
    }

    // Optimization: Use D3DMetal if we are using GPTK, otherwise standard Wine variables
    let mut command = Command::new(&runner);
    command.env("WINEPREFIX", prefix_path.to_str().unwrap())
           .env("WINEESYNC", "1")           // Improve multi-threading performance
           .env("MTL_HUD_ENABLED", "1")     // Show FPS and GPU metrics
           .env("WINEDEBUG", "-all")        // Disable debug logs to save CPU cycles
           .arg(exe_path);

    command.spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    Ok(RunResult {
        success: true,
        message: format!("Launched in bottle with optimizations"),
    })
}
