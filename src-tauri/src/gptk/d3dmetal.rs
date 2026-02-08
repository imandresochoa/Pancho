use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct D3DMetalLibs {
    pub d3d11: Option<PathBuf>,
    pub d3d12: Option<PathBuf>,
    pub dxgi: Option<PathBuf>,
}

pub struct D3DMetalManager;

impl D3DMetalManager {
    pub fn detect() -> D3DMetalLibs {
        let mut libs = D3DMetalLibs { d3d11: None, d3d12: None, dxgi: None };
        
        let home = std::env::var("HOME").unwrap_or_default();
        let home_path = Path::new(&home);

        let scan_paths = vec![
            PathBuf::from("/usr/local/opt/game-porting-toolkit/lib/wine/x86_64-windows/"),
            // Add Whisky search paths
            home_path.join("Library/Application Support/com.isaacmarovitz.Whisky/Engines"),
        ];

        for base_path in scan_paths {
            if !base_path.exists() { continue; }

            // If it's the Whisky Engines dir, we need to look into each engine
            if base_path.to_string_lossy().contains("Whisky/Engines") {
                if let Ok(entries) = fs::read_dir(&base_path) {
                    for entry in entries.flatten() {
                        let engine_lib_path = entry.path().join("lib/wine/x86_64-windows");
                        if engine_lib_path.exists() {
                            libs = Self::find_in_dir(&engine_lib_path);
                            if libs.d3d11.is_some() { return libs; }
                        }
                    }
                }
            } else {
                libs = Self::find_in_dir(&base_path);
                if libs.d3d11.is_some() { return libs; }
            }
        }

        libs
    }

    fn find_in_dir(dir: &Path) -> D3DMetalLibs {
        D3DMetalLibs {
            d3d11: Self::check_file(dir, "d3dmetald3d11.dll"),
            d3d12: Self::check_file(dir, "d3dmetald3d12.dll"),
            dxgi: Self::check_file(dir, "dxgid3dmetal.dll"),
        }
    }

    fn check_file(dir: &Path, name: &str) -> Option<PathBuf> {
        let path = dir.join(name);
        if path.exists() { Some(path) } else { None }
    }

    pub async fn install_to_bottle(bottle_path: &Path) -> Result<(), String> {
        let libs = Self::detect();
        
        let d3d11_src = libs.d3d11.ok_or("d3dmetald3d11.dll not found")?;
        let d3d12_src = libs.d3d12.ok_or("d3dmetald3d12.dll not found")?;
        let dxgi_src = libs.dxgi.ok_or("dxgid3dmetal.dll not found")?;

        let dest_dir = bottle_path.join("drive_c/windows/system32");
        if !dest_dir.exists() {
            return Err("system32 directory not found in bottle".to_string());
        }

        fs::copy(&d3d11_src, dest_dir.join("d3dmetald3d11.dll")).map_err(|e| e.to_string())?;
        fs::copy(&d3d12_src, dest_dir.join("d3dmetald3d12.dll")).map_err(|e| e.to_string())?;
        fs::copy(&dxgi_src, dest_dir.join("dxgid3dmetal.dll")).map_err(|e| e.to_string())?;

        // Also common practice to copy them as d3d11.dll/d3d12.dll/dxgi.dll 
        // OR rely on DLL overrides (M8). GPTK usually needs them with their d3dmetal names 
        // and then we set overrides to use 'native'.

        Ok(())
    }

    pub fn verify(bottle_path: &Path) -> bool {
        let dest_dir = bottle_path.join("drive_c/windows/system32");
        dest_dir.join("d3dmetald3d11.dll").exists() && 
        dest_dir.join("d3dmetald3d12.dll").exists() && 
        dest_dir.join("dxgid3dmetal.dll").exists()
    }
}

#[tauri::command]
pub async fn detect_d3dmetal() -> Result<D3DMetalLibs, String> {
    Ok(D3DMetalManager::detect())
}

#[tauri::command]
pub async fn install_d3dmetal(bottle_id: String, handle: tauri::AppHandle) -> Result<(), String> {
    let bottles = crate::core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id).ok_or("Bottle not found")?;
    
    D3DMetalManager::install_to_bottle(&bottle.path).await
}

#[tauri::command]
pub async fn verify_d3dmetal(bottle_id: String, handle: tauri::AppHandle) -> Result<bool, String> {
    let bottles = crate::core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id).ok_or("Bottle not found")?;
    
    Ok(D3DMetalManager::verify(&bottle.path))
}
