use std::path::{Path, PathBuf};
use std::collections::HashMap;
use tokio::process::Command;
use crate::bottle::template::{RegistryEntry, RegistryValueType};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct RegistryManager;

impl RegistryManager {
    pub fn generate_reg_file(entries: &[RegistryEntry]) -> String {
        let mut content = String::from("Windows Registry Editor Version 5.00\n\n");
        let _current_key = String::new();

        // Group by key to avoid repeating [Header]
        let mut grouped: HashMap<String, Vec<&RegistryEntry>> = HashMap::new();
        for entry in entries {
            grouped.entry(entry.key.clone()).or_default().push(entry);
        }

        for (key, entries) in grouped {
            content.push_str(&format!("[{}]\n", key));
            for entry in entries {
                let value_data = match entry.value_type {
                    RegistryValueType::String => format!("\"{}\"", entry.value_data.replace(r"\", r"\\").replace(r#"""#, r#"\""#)),
                    RegistryValueType::DWord => format!("dword:{:08x}", entry.value_data.parse::<u32>().unwrap_or(0)),
                    RegistryValueType::Binary => format!("hex:{}", entry.value_data), // Assumes pre-formatted hex string
                };
                content.push_str(&format!("\"{}\"={}\n", entry.value_name, value_data));
            }
            content.push('\n');
        }

        content
    }

    pub async fn write_entries(bottle_path: &Path, wine_path: &Path, entries: &[RegistryEntry]) -> Result<(), String> {
        if entries.is_empty() {
            return Ok(())
        }

        let reg_content = Self::generate_reg_file(entries);
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let reg_file_path = bottle_path.join(format!("pancho_update_{}.reg", timestamp));

        std::fs::write(&reg_file_path, reg_content).map_err(|e| e.to_string())?;

        // Execute regedit
        let output = Command::new(wine_path)
            .env("WINEPREFIX", bottle_path)
            .arg("regedit")
            .arg("/S")
            .arg(&reg_file_path)
            .output()
            .await
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(format!("Regedit failed: {}", String::from_utf8_lossy(&output.stderr)));
        }

        // Cleanup
        let _ = std::fs::remove_file(reg_file_path);

        Ok(())
    }

    pub async fn set_dll_override(bottle_path: &Path, wine_path: &Path, dll: &str, mode: &str) -> Result<(), String> {
        let entry = RegistryEntry {
            key: r"HKEY_CURRENT_USER\Software\Wine\DllOverrides".to_string(),
            value_name: dll.to_string(),
            value_type: RegistryValueType::String,
            value_data: mode.to_string(),
        };

        Self::write_entries(bottle_path, wine_path, &[entry]).await
    }
}

#[tauri::command]
pub async fn write_registry_entries(
    bottle_id: String,
    entries: Vec<RegistryEntry>,
    handle: tauri::AppHandle
) -> Result<(), String> {
    let bottles = crate::core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id).ok_or("Bottle not found")?;
    
    // Determine wine path (use custom or default to 'wine')
    let wine_path = bottle.engine_path.clone().unwrap_or_else(|| PathBuf::from("wine"));

    RegistryManager::write_entries(&bottle.path, &wine_path, &entries).await
}

#[tauri::command]
pub async fn set_dll_overrides(
    bottle_id: String,
    overrides: HashMap<String, String>,
    handle: tauri::AppHandle
) -> Result<(), String> {
    let bottles = crate::core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id).ok_or("Bottle not found")?;
    let wine_path = bottle.engine_path.clone().unwrap_or_else(|| PathBuf::from("wine"));

    let entries: Vec<RegistryEntry> = overrides.iter().map(|(dll, mode)| {
        RegistryEntry {
            key: r"HKEY_CURRENT_USER\Software\Wine\DllOverrides".to_string(),
            value_name: dll.clone(),
            value_type: RegistryValueType::String,
            value_data: mode.clone(),
        }
    }).collect();

    RegistryManager::write_entries(&bottle.path, &wine_path, &entries).await
}
