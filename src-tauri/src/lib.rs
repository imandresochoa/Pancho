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
    
    core::runner::run_executable(path, &bottle.path)
}

#[tauri::command]
async fn get_bottles(handle: tauri::AppHandle) -> Result<Vec<core::bottle::Bottle>, String> {
    core::bottle::list_bottles(&handle)
}

#[tauri::command]
async fn create_bottle(name: &str, handle: tauri::AppHandle) -> Result<core::bottle::Bottle, String> {
    core::bottle::create_bottle(&handle, name)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            launch_installer, 
            run_installer,
            get_bottles,
            create_bottle,
            scan_for_apps,
            open_bottle_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
