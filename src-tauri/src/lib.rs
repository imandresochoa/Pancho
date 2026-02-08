// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod core;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn launch_installer(path: &str) -> Result<core::loader::ExecutableInfo, String> {
    println!("Request to launch installer: {}", path);
    core::loader::load_executable(path)
}

#[tauri::command]
async fn run_installer(path: &str, bottle_id: &str, handle: tauri::AppHandle) -> Result<core::runner::RunResult, String> {
    let bottles = core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id)
        .ok_or("Bottle not found")?;
    
    let custom_engine = if let Some(path) = &bottle.engine_path {
        Some(path.to_str().unwrap().to_string())
    } else if let Some(pro_path) = core::engine::get_pro_engine_path(&handle) {
        Some(pro_path.to_str().unwrap().to_string())
    } else {
        None
    };

    let mut child = core::runner::run_executable(path, &bottle.path, custom_engine, &bottle.environment_type)?;
    
    let handle_clone = handle.clone();
    let bottle_id_str = bottle_id.to_string();
    let installer_path = path.to_string();

    // Spawn a monitor that ACTUALLY waits for the process to exit
    std::thread::spawn(move || {
        let _ = handle_clone.emit("status-update", "Installer active. Monitoring for completion...");
        
        // Wait for the main installer process to close
        let _ = child.wait();
        
        let _ = handle_clone.emit("status-update", "Installer finished. Synchronizing library...");

        // Perform final checks and auto-unpin
        let bottles = core::bottle::list_bottles(&handle_clone).unwrap_or_default();
        if let Some(b) = bottles.iter().find(|b| b.id == bottle_id_str) {
            let apps = core::scanner::scan_bottle_for_apps(&b.path);
            
            // Logic to detect if Steam.exe appeared
            let is_steam_setup = installer_path.to_lowercase().contains("steam");
            if is_steam_setup {
                let has_steam = apps.iter().any(|a| a.exe_path.to_lowercase().contains("steam.exe") && !a.exe_path.to_lowercase().contains("setup"));
                if has_steam {
                    // It's installed! Hide the setup card.
                    let _ = core::bottle::remove_pinned_app(&handle_clone, &bottle_id_str, &installer_path);
                }
            }
            
            // Notify frontend to refresh immediately
            let _ = handle_clone.emit("library-changed", &bottle_id_str);
        }
    });

    Ok(core::runner::RunResult {
        success: true,
        message: "Launched with Pancho-Core".to_string(),
    })
}

#[tauri::command]
async fn run_shell_command(command: String, description: String) -> Result<(), String> {
    println!("Executing: {}", description);
    let _ = std::process::Command::new("sh")
        .arg("-c")
        .arg(command)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn check_engine_status(handle: tauri::AppHandle) -> Result<bool, String> {
    Ok(core::engine::get_pro_engine_path(&handle).is_some())
}

#[tauri::command]
async fn download_engine(handle: tauri::AppHandle) -> Result<(), String> {
    core::engine::setup_gaming_engine(handle).await
}

#[tauri::command]
async fn set_bottle_engine(bottle_id: &str, engine_path: &str, handle: tauri::AppHandle) -> Result<(), String> {
    core::bottle::set_bottle_engine(&handle, bottle_id, std::path::PathBuf::from(engine_path))
}

#[tauri::command]
async fn reset_bottle_engine(bottle_id: &str, handle: tauri::AppHandle) -> Result<(), String> {
    core::bottle::reset_bottle_engine(&handle, bottle_id)
}

#[tauri::command]
async fn set_bottle_cover(bottle_id: &str, cover_path: &str, handle: tauri::AppHandle) -> Result<(), String> {
    core::bottle::set_bottle_cover(&handle, bottle_id, cover_path)
}

#[tauri::command]
async fn get_bottles(handle: tauri::AppHandle) -> Result<Vec<core::bottle::Bottle>, String> {
    core::bottle::list_bottles(&handle)
}

#[tauri::command]
async fn create_bottle(name: &str, environment_type: &str, handle: tauri::AppHandle) -> Result<core::bottle::Bottle, String> {
    core::bottle::create_bottle(&handle, name, environment_type)
}

#[tauri::command]
async fn delete_bottle(id: &str, handle: tauri::AppHandle) -> Result<(), String> {
    core::bottle::delete_bottle(&handle, id)
}

#[tauri::command]
async fn rename_bottle(id: &str, new_name: &str, handle: tauri::AppHandle) -> Result<(), String> {
    core::bottle::rename_bottle(&handle, id, new_name)
}

#[tauri::command]
async fn scan_for_apps(bottle_id: &str, handle: tauri::AppHandle) -> Result<Vec<core::scanner::DetectedApp>, String> {
    let bottles = core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id)
        .ok_or("Bottle not found")?;
    
    Ok(core::scanner::scan_bottle_for_apps(&bottle.path))
}

#[tauri::command]
async fn open_bottle_dir(bottle_id: &str, handle: tauri::AppHandle) -> Result<(), String> {
    let bottles = core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id)
        .ok_or("Bottle not found")?;
    
    // Open the directory using the tauri-plugin-opener
    tauri_plugin_opener::reveal_item_in_dir(bottle.path.to_str().unwrap());
    Ok(())
}

#[tauri::command]
async fn pin_app(bottle_id: &str, app: core::scanner::DetectedApp, handle: tauri::AppHandle) -> Result<(), String> {
    core::bottle::add_pinned_app(&handle, bottle_id, app)
}

#[tauri::command]
async fn unpin_app(bottle_id: &str, exe_path: &str, handle: tauri::AppHandle) -> Result<(), String> {
    core::bottle::remove_pinned_app(&handle, bottle_id, exe_path)
}

#[tauri::command]
async fn get_bottle_details(bottle_id: &str, handle: tauri::AppHandle) -> Result<core::bottle::Bottle, String> {
    let bottles = core::bottle::list_bottles(&handle)?;
    let bottle = bottles.into_iter().find(|b| b.id == bottle_id)
        .ok_or("Bottle not found")?;
    Ok(bottle)
}

use tauri::Emitter;

#[tauri::command]
async fn install_dx_runtime(bottle_id: &str, handle: tauri::AppHandle) -> Result<(), String> {
    let bottles = core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id)
        .ok_or("Bottle not found")?;

    let prefix = bottle.path.to_str().unwrap().to_string();
    let handle_clone = handle.clone();

    std::thread::spawn(move || {
        let _ = handle_clone.emit("status-update", "Killing active processes...".to_string());
        
        // Kill any existing wine processes to unlock the prefix
        let _ = std::process::Command::new("wineserver")
            .arg("-k")
            .env("WINEPREFIX", &prefix)
            .output();

        let _ = handle_clone.emit("status-update", "Purging incompatible drivers...".to_string());
        
        let drive_c = std::path::Path::new(&prefix).join("drive_c").join("windows").join("system32");
        let _ = std::fs::remove_file(drive_c.join("d3d11.dll"));
        let _ = std::fs::remove_file(drive_c.join("dxgi.dll"));

        // Sequence of installations
        let components = ["d3dcompiler_47", "vcredist2022"];
        
        for comp in components {
            let _ = handle_clone.emit("status-update", format!("Installing {}...", comp));
            let output = std::process::Command::new("winetricks")
                .env("WINEPREFIX", &prefix)
                .arg("-q")
                .arg(comp)
                .output();

            if let Ok(out) = output {
                if !out.status.success() {
                    let err = String::from_utf8_lossy(&out.stderr);
                    let _ = handle_clone.emit("status-update", format!("Warning on {}: {}", comp, err));
                }
            }
        }

        let _ = handle_clone.emit("status-update", "Graphics repair complete. Restart Pancho.".to_string());
    });
    
    Ok(())
}

#[tauri::command]
async fn kill_wine_processes(bottle_id: &str, handle: tauri::AppHandle) -> Result<(), String> {
    let bottles = core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id)
        .ok_or("Bottle not found")?;
    
    let prefix = bottle.path.to_str().unwrap().to_string();
    
    // Kill any existing wine processes to unlock the prefix
    let _ = std::process::Command::new("wineserver")
        .arg("-k")
        .env("WINEPREFIX", &prefix)
        .output();
        
    Ok(())
}

#[tauri::command]
async fn initialize_pro_bottle(bottle_id: &str, handle: tauri::AppHandle) -> Result<(), String> {
    let bottles = core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id)
        .ok_or("Bottle not found")?;

    let prefix = bottle.path.to_str().unwrap().to_string();
    let env_type = bottle.environment_type.clone();
    let handle_clone = handle.clone();

    let engine_path = if let Some(pro_path) = core::engine::get_pro_engine_path(&handle) {
        pro_path.to_str().unwrap().to_string()
    } else {
        "wine".to_string()
    };

    std::thread::spawn(move || {
        let _ = handle_clone.emit("bottle-init-status", "Sowing the seeds of the world...");
        
        // 1. Initialize the prefix (wineboot)
        let _ = std::process::Command::new(&engine_path)
            .env("WINEPREFIX", &prefix)
            .arg("wineboot")
            .arg("-u")
            .output();

        if env_type == "pro" {
            let _ = handle_clone.emit("bottle-init-status", "Raising the mountains...");
            let _ = core::patcher::apply_modern_game_patches(&engine_path, std::path::Path::new(&prefix));
            
            let _ = handle_clone.emit("bottle-init-status", "Forging the Metal rivers...");
            let _ = core::patcher::optimize_for_metal(&engine_path, std::path::Path::new(&prefix));
            
            let _ = handle_clone.emit("bottle-init-status", "Inviting the Steam gods...");
            let _ = core::patcher::apply_steam_specific_patches(&engine_path, std::path::Path::new(&prefix));
        }

        let _ = handle_clone.emit("bottle-init-status", "World construction complete.");
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Start the Pancho-Mach IPC Broker
    if let Ok(broker) = core::mach_ipc::MachBroker::new() {
        broker.start_listening();
    }

    // Initialize the Native Exception Translator
    unsafe {
        core::signals::setup_signal_handler();
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            launch_installer, 
            run_installer,
            kill_wine_processes,
            get_bottles,
            create_bottle,
            initialize_pro_bottle,
            delete_bottle,
            rename_bottle,
            set_bottle_engine,
            reset_bottle_engine,
            set_bottle_cover,
            scan_for_apps,
            open_bottle_dir,
            install_dx_runtime,
            get_bottle_details,
            pin_app,
            unpin_app,
            check_engine_status,
            download_engine,
            run_shell_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
