use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub parent_pid: u32,
    pub name: String,
    pub command: String,
    pub bottle_path: Option<String>,
}

pub struct ProcessManager;

impl ProcessManager {
    pub async fn get_all_processes() -> Result<Vec<ProcessInfo>, String> {
        // -ax: all processes with a terminal and all processes without a terminal
        // -o: format output (pid, ppid, command)
        let output = Command::new("ps")
            .arg("-ax")
            .arg("-o")
            .arg("pid,ppid,command")
            .output()
            .await
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut processes = Vec::new();

        // Skip header line
        for line in stdout.lines().skip(1) {
            let parts: Vec<&str> = line.trim().split_whitespace().collect();
            if parts.len() < 3 {
                continue;
            }

            let pid = parts[0].parse::<u32>().unwrap_or(0);
            let ppid = parts[1].parse::<u32>().unwrap_or(0);
            let command = parts[2..].join(" ");
            let name = parts[2].split('/').last().unwrap_or("").to_string();

            processes.push(ProcessInfo {
                pid,
                parent_pid: ppid,
                name,
                command,
                bottle_path: None, // We'll fill this if we find a match
            });
        }

        Ok(processes)
    }

    pub async fn get_bottle_processes(bottle_path: &Path) -> Result<Vec<ProcessInfo>, String> {
        let all_procs = Self::get_all_processes().await?;
        let bottle_path_str = bottle_path.to_string_lossy().to_lowercase();
        
        let mut bottle_procs = Vec::new();
        
        // Step 1: Find direct matches (processes where the bottle path is in the command line)
        // OR find wineserver/wine processes that might belong to this bottle.
        // Wineserver usually doesn't show the prefix in ps command unless it's the one we started.
        // However, standard wine/wine64 calls usually have WINEPREFIX in the environment,
        // but 'ps' doesn't show env by default.
        // Heuristic: look for the bottle path in the command string.
        for mut proc in all_procs {
            if proc.command.to_lowercase().contains(&bottle_path_str) || 
               proc.command.to_lowercase().contains("wineserver") || // Broad match, we'll filter better if needed
               proc.command.to_lowercase().contains("wine64") {
                
                // If it's a generic wine process, it might be hard to tell.
                // But if it's running an exe inside the bottle path, it's a match.
                if proc.command.to_lowercase().contains(&bottle_path_str) {
                    proc.bottle_path = Some(bottle_path_str.clone());
                    bottle_procs.push(proc);
                }
            }
        }

        // Step 2: Build the tree. Any process whose parent is in bottle_procs is also a bottle proc.
        // We repeat this until no new processes are added.
        let mut added = true;
        let all_procs_full = Self::get_all_processes().await?; // Refresh to be safe
        
        while added {
            added = false;
            for proc in &all_procs_full {
                if bottle_procs.iter().any(|bp| bp.pid == proc.parent_pid) {
                    if !bottle_procs.iter().any(|bp| bp.pid == proc.pid) {
                        let mut p = proc.clone();
                        p.bottle_path = Some(bottle_path_str.clone());
                        bottle_procs.push(p);
                        added = true;
                    }
                }
            }
        }

        Ok(bottle_procs)
    }

    pub async fn kill_bottle_processes(bottle_path: &Path) -> Result<u32, String> {
        let procs = Self::get_bottle_processes(bottle_path).await?;
        let mut count = 0;

        for proc in &procs {
            // Don't kill the system processes or yourself
            if proc.pid <= 1 { continue; }
            
            let _ = Command::new("kill")
                .arg("-9")
                .arg(proc.pid.to_string())
                .status()
                .await;
            count += 1;
        }

        // Special case: attempt to kill wineserver -k for this prefix
        let _ = Command::new("wineserver")
            .arg("-k")
            .env("WINEPREFIX", bottle_path)
            .status()
            .await;

        Ok(count)
    }
}

#[tauri::command]
pub async fn get_active_processes(bottle_id: String, handle: tauri::AppHandle) -> Result<Vec<ProcessInfo>, String> {
    let bottles = crate::core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id).ok_or("Bottle not found")?;
    
    ProcessManager::get_bottle_processes(&bottle.path).await
}

#[tauri::command]
pub async fn kill_all_bottle_processes(bottle_id: String, handle: tauri::AppHandle) -> Result<u32, String> {
    let bottles = crate::core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id).ok_or("Bottle not found")?;
    
    ProcessManager::kill_bottle_processes(&bottle.path).await
}

#[tauri::command]
pub async fn is_bottle_running(bottle_id: String, handle: tauri::AppHandle) -> Result<bool, String> {
    let bottles = crate::core::bottle::list_bottles(&handle)?;
    let bottle = bottles.iter().find(|b| b.id == bottle_id).ok_or("Bottle not found")?;
    
    let procs = ProcessManager::get_bottle_processes(&bottle.path).await?;
    Ok(!procs.is_empty())
}
