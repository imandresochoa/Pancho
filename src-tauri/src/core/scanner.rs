use std::path::Path;
use std::fs;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DetectedApp {
    pub name: String,
    pub exe_path: String,
    pub is_priority: bool,
    #[serde(default)]
    pub pinned: bool,
}

pub fn scan_bottle_for_apps(bottle_path: &Path) -> Vec<DetectedApp> {
    let mut apps = Vec::new();
    let drive_c = bottle_path.join("drive_c");

    if !drive_c.exists() {
        return apps;
    }

    let priority_names = [
        "steam.exe",
        "epicgameslauncher.exe",
        "galaxyclient.exe",
    ];

    // Recursive scan for .exe files
    scan_dir(&drive_c, &mut apps, &priority_names);

    apps
}

fn scan_dir(dir: &Path, apps: &mut Vec<DetectedApp>, priority_names: &[&str]) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Avoid scanning very deep or irrelevant system dirs to stay fast
                let dir_name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                if dir_name == "windows" || dir_name == "users" {
                    continue;
                }
                scan_dir(&path, apps, priority_names);
            } else if let Some(ext) = path.extension() {
                if ext.to_string_lossy().to_lowercase() == "exe" {
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                    
                    // Basic heuristic: Ignore uninstallers and common helpers
                    if file_name.contains("unins") || file_name.contains("helper") || file_name.contains("crashpad") {
                        continue;
                    }

                    let is_priority = priority_names.contains(&file_name.as_str());
                    let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();

                    apps.push(DetectedApp {
                        name,
                        exe_path: path.to_str().unwrap_or_default().to_string(),
                        is_priority,
                        pinned: false,
                    });
                }
            }
        }
    }
}
