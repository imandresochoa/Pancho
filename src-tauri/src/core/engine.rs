use std::path::PathBuf;
use std::fs;
use std::process::Command;
use tauri::Manager;
use tauri::Emitter;

pub fn get_engines_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?.join("engines");
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

pub fn get_pro_engine_path(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    let engines_dir = get_engines_dir(app_handle).ok()?;
    let engine_folder = engines_dir.join("pancho-pro-v1");
    
    // Very flexible search to handle different extraction styles
    let possible_paths = [
        engine_folder.join("bin").join("wine64"),
        engine_folder.join("bin").join("wine"),
        engine_folder.join("wine-crossover-23.7.1-1-osx64").join("bin").join("wine64"),
        engine_folder.join("wine-crossover-23.7.1-osx64").join("bin").join("wine64"),
        engine_folder.join("Contents").join("Resources").join("wine").join("bin").join("wine64"),
    ];

    for path in possible_paths {
        if path.exists() {
            return Some(path);
        }
    }
    None
}

pub async fn setup_gaming_engine(app_handle: tauri::AppHandle) -> Result<(), String> {
    let engines_dir = get_engines_dir(&app_handle)?;
    let engine_folder = engines_dir.join("pancho-pro-v1");
    
    let handle_clone = app_handle.clone();
    
    std::thread::spawn(move || {
        let _ = handle_clone.emit("engine-status", "Initiating download (Pro Engine)...");

        let url = "https://github.com/Gcenx/winecx/releases/download/crossover-wine-23.7.1-1/wine-crossover-23.7.1-1-osx64.tar.xz";
        let tar_path = engines_dir.join("engine.tar.xz");

        let _ = fs::remove_file(&tar_path);
        if engine_folder.exists() {
            let _ = fs::remove_dir_all(&engine_folder);
        }
        let _ = fs::create_dir_all(&engine_folder);

        let download = Command::new("curl")
            .arg("-fL")
            .arg("-o")
            .arg(&tar_path)
            .arg(url)
            .output();

        match download {
            Ok(output) => {
                if !output.status.success() {
                    let _ = handle_clone.emit("engine-status", "Error: Download failed.");
                    return;
                }
            },
            Err(_) => {
                let _ = handle_clone.emit("engine-status", "Error: Network unreachable.");
                return;
            }
        }

        let _ = handle_clone.emit("engine-status", "Extracting binaries...");

        let extract = Command::new("tar")
            .arg("-xJf")
            .arg(&tar_path)
            .arg("-C")
            .arg(&engine_folder)
            .arg("--strip-components=1")
            .output();

        match extract {
            Ok(output) => {
                if !output.status.success() {
                    let _ = handle_clone.emit("engine-status", "Error: Extraction failed.");
                    return;
                }
            },
            Err(_) => {
                let _ = handle_clone.emit("engine-status", "Error: Tar failure.");
                return;
            }
        }

        let _ = fs::remove_file(tar_path);
        let _ = handle_clone.emit("engine-status", "Success: Engine Deployment complete.");
    });

    Ok(())
}