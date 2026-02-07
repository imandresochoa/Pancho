use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DetectedApp {
    pub name: String,
    pub exe_path: String, // Absolute path
}

pub fn scan_bottle_for_apps(bottle_path: &Path) -> Vec<DetectedApp> {
    let mut apps = Vec::new();
    let drive_c = bottle_path.join("drive_c");
    
    if !drive_c.exists() {
        return apps;
    }

    // Common locations to look for games and apps
    let search_paths = [
        drive_c.join("Program Files"),
        drive_c.join("Program Files (x86)"),
        drive_c.join("users").join("Public").join("Desktop"),
    ];

    for path in search_paths {
        if !path.exists() { continue; }

        // We use WalkDir to find .exe files, but we limit depth to avoid 
        // listing every single helper utility in a game folder.
        for entry in WalkDir::new(path)
            .max_depth(3)
            .into_iter()
            .filter_map(|e| e.ok()) 
        {
            let p = entry.path();
            if p.is_file() && p.extension().map_or(false, |ext| ext == "exe") {
                let file_name = p.file_stem().unwrap().to_string_lossy().to_string();
                
                // Filter out common uninstalls or helpers
                let lower_name = file_name.to_lowercase();
                if lower_name.contains("uninst") || lower_name.contains("helper") || lower_name.contains("crashhandler") {
                    continue;
                }

                apps.push(DetectedApp {
                    name: file_name,
                    exe_path: p.to_string_lossy().to_string(),
                });
            }
        }
    }

    // Special check for Steam if not found
    let steam_path = drive_c.join("Program Files (x86)").join("Steam").join("steam.exe");
    if steam_path.exists() && !apps.iter().any(|a| a.name.to_lowercase() == "steam") {
        apps.push(DetectedApp {
            name: "Steam".to_string(),
            exe_path: steam_path.to_string_lossy().to_string(),
        });
    }

    apps
}
