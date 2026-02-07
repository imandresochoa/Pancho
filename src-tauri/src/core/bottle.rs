use serde::{Serialize, Deserialize};
use std::path::PathBuf;
use std::fs;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Bottle {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub created_at: u64,
}

pub fn get_bottles_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?.join("bottles");
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

pub fn list_bottles(app_handle: &tauri::AppHandle) -> Result<Vec<Bottle>, String> {
    let bottles_dir = get_bottles_dir(app_handle)?;
    let mut bottles = Vec::new();

    if let Ok(entries) = fs::read_dir(bottles_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let config_path = path.join("pancho.json");
                if config_path.exists() {
                    if let Ok(config_str) = fs::read_to_string(config_path) {
                        if let Ok(bottle) = serde_json::from_str::<Bottle>(&config_str) {
                            bottles.push(bottle);
                        }
                    }
                }
            }
        }
    }
    Ok(bottles)
}

pub fn create_bottle(app_handle: &tauri::AppHandle, name: &str) -> Result<Bottle, String> {
    let id = name.to_lowercase().replace(" ", "_");
    let bottles_dir = get_bottles_dir(app_handle)?;
    let bottle_path = bottles_dir.join(&id);

    if bottle_path.exists() {
        return Err("A bottle with this name already exists.".to_string());
    }

    fs::create_dir_all(&bottle_path).map_err(|e| e.to_string())?;

    let bottle = Bottle {
        id,
        name: name.to_string(),
        path: bottle_path.clone(),
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    };

    let config_path = bottle_path.join("pancho.json");
    let config_str = serde_json::to_string(&bottle).map_err(|e| e.to_string())?;
    fs::write(config_path, config_str).map_err(|e| e.to_string())?;

    Ok(bottle)
}
