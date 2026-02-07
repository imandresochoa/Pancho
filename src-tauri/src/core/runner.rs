use std::process::Command;
use std::path::Path;
use std::fs;

#[derive(serde::Serialize)]
pub struct RunResult {
    pub success: bool,
    pub message: String,
}

pub fn find_runner() -> Option<String> {
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

    if let Ok(output) = Command::new("which").arg("wine64").output() {
        if output.status.success() {
            return Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }
    }

    None
}

pub fn run_executable(exe_path: &str, prefix_path: &Path) -> Result<RunResult, String> {
    let runner = find_runner().ok_or("No Wine found.")?;
    
    if !prefix_path.exists() {
        fs::create_dir_all(&prefix_path).map_err(|e| e.to_string())?;
    }

    let mut command = Command::new(&runner);
    command.env("WINEPREFIX", prefix_path.to_str().unwrap())
           .arg(exe_path);

    command.spawn()
        .map_err(|e| format!("Failed to spawn: {}", e))?;

    Ok(RunResult {
        success: true,
        message: format!("Launched with {}", runner),
    })
}