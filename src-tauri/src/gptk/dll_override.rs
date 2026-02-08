use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::wine::registry::RegistryManager;
use crate::bottle::template::{RegistryEntry, RegistryValueType};
use crate::gptk::d3dmetal::D3DMetalManager;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum GraphicsBackend {
    D3DMetal,
    DXVK,
    WineD3D,
}

pub struct DllOverrideManager;

impl DllOverrideManager {
    pub async fn set_backend(bottle_path: &Path, wine_path: &Path, backend: GraphicsBackend) -> Result<(), String> {
        let mut overrides = HashMap::new();

        match backend {
            GraphicsBackend::D3DMetal => {
                // Ensure D3DMetal libs are present
                if !D3DMetalManager::verify(bottle_path) {
                    return Err("D3DMetal libraries are missing. Please install them first.".to_string());
                }

                // D3DMetal uses its own libs masquerading as d3d11/d3d12, so we set them to "native"
                // Assuming they were copied as d3dmetald3d11.dll etc and loaded via some other mechanism?
                // OR if we renamed them to d3d11.dll during install (which M6 didn't do, it kept original names).
                //
                // Wait, standard GPTK usage via Wine is:
                // "d3d11"="native" -> looks for d3d11.dll in system32.
                // If we want to use D3DMetal, we usually have to ensure the d3dmetal loader is active.
                //
                // Standard GPTK instructions:
                // copy d3dmetald3d11.dll, d3dmetald3d12.dll, dxgid3dmetal.dll to system32
                // AND OFTEN copy/rename them to d3d11.dll etc OR rely on Wine's internal hacks.
                //
                // For this module, let's assume "native" override forces Wine to look for a DLL in system32.
                // If M6 installs them as `d3dmetald3d11.dll`, Wine won't find `d3d11.dll` unless we renamed it.
                //
                // Let's stick to the common GPTK pattern:
                // The environment variables `MTL_HUD_ENABLED=1` etc trigger the internal hooks if using Apple's Wine.
                // But if we are copying DLLs, we usually override `d3d11` to `native`.
                
                overrides.insert("d3d11".to_string(), "native".to_string());
                overrides.insert("d3d12".to_string(), "native".to_string());
                overrides.insert("dxgi".to_string(), "native".to_string());
            }
            GraphicsBackend::DXVK => {
                overrides.insert("d3d11".to_string(), "native".to_string());
                overrides.insert("dxgi".to_string(), "native".to_string());
                // DXVK doesn't usually handle d3d12, so we leave it or set to builtin
                overrides.insert("d3d12".to_string(), "builtin".to_string());
            }
            GraphicsBackend::WineD3D => {
                // Revert to built-in Wine implementations
                overrides.insert("d3d11".to_string(), "builtin".to_string());
                overrides.insert("d3d12".to_string(), "builtin".to_string());
                overrides.insert("dxgi".to_string(), "builtin".to_string());
            }
        }

        let entries: Vec<RegistryEntry> = overrides.iter().map(|(dll, mode)| {
            RegistryEntry {
                key: r"HKEY_CURRENT_USER\Software\Wine\DllOverrides".to_string(),
                value_name: dll.clone(),
                value_type: RegistryValueType::String,
                value_data: mode.clone(),
            }
        }).collect();

        RegistryManager::write_entries(bottle_path, wine_path, &entries).await
    }

    pub async fn get_current_backend(_bottle_path: &Path, _wine_path: &Path) -> Result<GraphicsBackend, String> {
        // This is a bit tricky without querying the registry.
        // For now, we'll assume WineD3D unless we verify otherwise later (e.g. by checking reg files).
        // A robust implementation would parse the registry file.
        // M4 RegistryManager writes to registry but doesn't read yet (except via reg query which is async).
        
        // MVP: Just return Unknown or Default.
        // But for the UI, let's default to WineD3D if we can't tell.
        Ok(GraphicsBackend::WineD3D) 
    }
}

#[tauri::command]
pub async fn set_graphics_backend(
    bottle_id: String,
    backend: GraphicsBackend,
    handle: tauri::AppHandle
) -> Result<(), String> {
    let bottles = crate::core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id).ok_or("Bottle not found")?;
    let wine_path = bottle.engine_path.clone().unwrap_or_else(|| PathBuf::from("wine"));

    DllOverrideManager::set_backend(&bottle.path, &wine_path, backend).await
}
