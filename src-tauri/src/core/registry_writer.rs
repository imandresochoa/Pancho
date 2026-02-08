use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

pub fn inject_registry_keys(prefix_path: &Path, keys: Vec<(&str, &str, &str)>) -> Result<(), String> {
    let user_reg_path = prefix_path.join("user.reg");
    
    // Ensure the file exists (minimal Wine prefix check)
    if !user_reg_path.exists() {
        return Err("Prefix not yet initialized".to_string());
    }

    let mut file = OpenOptions::new()
        .append(true)
        .open(&user_reg_path)
        .map_err(|e| format!("Failed to open user.reg: {}", e))?;

    let mut current_section = String::new();
    
    for (section, key, value) in keys {
        if section != current_section {
            writeln!(file, "\n[{}]", section).map_err(|e| e.to_string())?;
            current_section = section.to_string();
        }
        
        // Correctly format the registry value based on type (simplified heuristic)
        if value.starts_with("0000") {
            writeln!(file, "\"{}\" = dword:{}", key, value).map_err(|e| e.to_string())?;
        } else {
            writeln!(file, "\"{}\"=\" { } \"", key, value).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
