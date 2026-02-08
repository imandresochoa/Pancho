use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use crate::bottle::template::{RegistryEntry, RegistryValueType};
use crate::wine::registry::RegistryManager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum SteamLaunchMode {
    Normal,
    BigPicture,
    Silent,
    Console,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SteamStatus {
    pub is_installed: bool,
    pub path: Option<PathBuf>,
}

pub struct SteamLauncher;

impl SteamLauncher {
    pub async fn install_steam(bottle_path: &Path, wine_path: &Path) -> Result<(), String> {
        let installer_url = "https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe";
        let installer_path = bottle_path.join("SteamSetup.exe");

        // Download installer using curl
        let status = Command::new("curl")
            .arg("-L")
            .arg(installer_url)
            .arg("-o")
            .arg(&installer_path)
            .status()
            .await
            .map_err(|e| e.to_string())?;

        if !status.success() {
            return Err("Failed to download Steam installer".to_string());
        }

        // Run installer silently
        let output = Command::new(wine_path)
            .env("WINEPREFIX", bottle_path)
            .arg(&installer_path)
            .arg("/S")
            .output()
            .await
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(format!("Steam installation failed: {}", String::from_utf8_lossy(&output.stderr)));
        }

        // Setup registry keys for Steam
        let entries = vec![
            RegistryEntry {
                key: r"HKEY_CURRENT_USER\Software\Valve\Steam".to_string(),
                value_name: "SteamPath".to_string(),
                value_type: RegistryValueType::String,
                value_data: r"C:\Program Files (x86)\Steam".to_string(),
            },
            RegistryEntry {
                key: r"HKEY_CURRENT_USER\Software\Valve\Steam".to_string(),
                value_name: "SteamExe".to_string(),
                value_type: RegistryValueType::String,
                value_data: r"C:\Program Files (x86)\Steam\steam.exe".to_string(),
            },
        ];

        RegistryManager::write_entries(bottle_path, wine_path, &entries).await?;

        // Cleanup installer
        let _ = std::fs::remove_file(installer_path);

        Ok(())
    }

    pub async fn launch_steam(
        bottle_path: &Path, 
        wine_path: &Path, 
        mode: SteamLaunchMode,
        environment_type: &str
    ) -> Result<u32, String> {
        let steam_exe = "C:\\Program Files (x86)\\Steam\\steam.exe";
        
        let mut cmd = Command::new(wine_path);
        cmd.env("WINEPREFIX", bottle_path);
        
        // Essential flags for macOS/Apple Silicon performance
        cmd.env("WINEESYNC", "1");
        
        if environment_type == "pro" {
            cmd.env("MTL_HUD_ENABLED", "1");
            cmd.env("WINE_D3D11_ALLOW_SWAPCHAIN_RECREATION", "1");
        }

        cmd.arg(steam_exe);

        // Prevent CEF crashes and reduce overhead
        cmd.arg("-no-browser"); 
        
        match mode {
            SteamLaunchMode::BigPicture => { cmd.arg("-tenfoot"); },
            SteamLaunchMode::Silent => { cmd.arg("-silent"); },
            SteamLaunchMode::Console => { cmd.arg("-console"); },
            SteamLaunchMode::Normal => {} // No-op
        }

        let child = cmd.spawn().map_err(|e| e.to_string())?;
        Ok(child.id().unwrap_or(0))
    }

    pub fn check_status(bottle_path: &Path) -> SteamStatus {
        let steam_path = bottle_path.join("drive_c/Program Files (x86)/Steam/steam.exe");
        SteamStatus {
            is_installed: steam_path.exists(),
            path: if steam_path.exists() { Some(steam_path) } else { None },
        }
    }
}

#[tauri::command]
pub async fn install_steam(bottle_id: String, handle: tauri::AppHandle) -> Result<(), String> {
    let bottles = crate::core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id).ok_or("Bottle not found")?;
    let wine_path = bottle.engine_path.clone().unwrap_or_else(|| PathBuf::from("wine"));

    SteamLauncher::install_steam(&bottle.path, &wine_path).await
}

#[tauri::command]
pub async fn launch_steam(
    bottle_id: String, 
    mode: SteamLaunchMode, 
    handle: tauri::AppHandle
) -> Result<u32, String> {
    let bottles = crate::core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id).ok_or("Bottle not found")?;
    let wine_path = bottle.engine_path.clone().unwrap_or_else(|| PathBuf::from("wine"));

    SteamLauncher::launch_steam(&bottle.path, &wine_path, mode, &bottle.environment_type).await
}

#[tauri::command]
pub fn check_steam_status(bottle_id: String, handle: tauri::AppHandle) -> Result<SteamStatus, String> {
    let bottles = crate::core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id).ok_or("Bottle not found")?;
    
    Ok(SteamLauncher::check_status(&bottle.path))
}
