import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Gamepad2, Terminal, FileCode, Play, Zap, Plus, Wine, ArrowLeft, RefreshCw, Box, X, FolderOpen, MoreVertical } from "lucide-react";

interface Bottle {
  id: string;
  name: string;
  path: string;
  created_at: number;
}

interface DetectedApp {
  name: string;
  exe_path: string;
}

interface ExecutableInfo {
  path: string;
  machine: string;
  entry_point: number;
  sections: number;
  is_64_bit: boolean;
}

function App() {
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [selectedBottle, setSelectedBottle] = useState<Bottle | null>(null);
  const [installedApps, setInstalledApps] = useState<DetectedApp[]>([]);
  const [exeInfo, setExeInfo] = useState<ExecutableInfo | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBottleName, setNewBottleName] = useState("");

  useEffect(() => {
    loadBottles();
  }, []);

  useEffect(() => {
    if (selectedBottle) {
      handleScanApps();
    }
  }, [selectedBottle]);

  const loadBottles = async () => {
    try {
      const list = await invoke<Bottle[]>("get_bottles");
      setBottles(list);
    } catch (e) {
      addToLog(`Error loading bottles: ${e}`);
    }
  };

  const handleCreateBottle = async () => {
    if (!newBottleName.trim()) return;
    try {
      await invoke("create_bottle", { name: newBottleName });
      setNewBottleName("");
      setShowCreateModal(false);
      loadBottles();
      addToLog(`Created bottle: ${newBottleName}`);
    } catch (e) {
      addToLog(`Error creating bottle: ${e}`);
    }
  };

  const handleScanApps = async () => {
    if (!selectedBottle) return;
    setScanning(true);
    try {
      const apps = await invoke<DetectedApp[]>("scan_for_apps", { bottleId: selectedBottle.id });
      setInstalledApps(apps);
      addToLog(`Found ${apps.length} apps in ${selectedBottle.name}`);
    } catch (e) {
      addToLog(`Scan error: ${e}`);
    } finally {
      setScanning(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!selectedBottle) return;
    try {
      await invoke("open_bottle_dir", { bottleId: selectedBottle.id });
      addToLog(`Opening folder for ${selectedBottle.name}`);
    } catch (e) {
      addToLog(`Error opening folder: ${e}`);
    }
  };

  const handleSelectExe = async () => {
    if (!selectedBottle) return;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Windows Executable', extensions: ['exe', 'msi'] }]
      });

      if (selected && typeof selected === 'string') {
        setLoading(true);
        const info = await invoke<ExecutableInfo>("launch_installer", { path: selected });
        setExeInfo(info);
        setLoading(false);
        addToLog(`Analyzed: ${selected}`);
      }
    } catch (err) {
      addToLog(`Error: ${err}`);
      setLoading(false);
    }
  };

  const handleRun = async (path?: string) => {
    const targetPath = path || exeInfo?.path;
    if (!targetPath || !selectedBottle) return;
    try {
      addToLog(`Launching ${targetPath.split('/').pop()}...`);
      await invoke("run_installer", { path: targetPath, bottleId: selectedBottle.id });
    } catch (err) {
      addToLog(`Launch Error: ${err}`);
    }
  };

  const addToLog = (msg: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans dark select-none">
       <header data-tauri-drag-region className="h-14 flex items-center px-6 border-b border-border/40 bg-card/50 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2 text-primary">
            <Gamepad2 className="h-6 w-6" />
            <span className="font-bold text-lg tracking-tight">Pancho</span>
          </div>
       </header>

       <main className="flex-1 overflow-hidden flex flex-col p-6 relative">
          {!selectedBottle ? (
            <div className="space-y-6">
               <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-bold tracking-tight">Your Bottles</h2>
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                  >
                    <Plus size={18} /> New Bottle
                  </button>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bottles.map(bottle => (
                    <div 
                      key={bottle.id}
                      onClick={() => setSelectedBottle(bottle)}
                      className="p-6 bg-card border border-border/60 rounded-2xl hover:border-primary/50 cursor-pointer transition-all group relative overflow-hidden"
                    >
                       <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical size={16} className="text-muted-foreground" />
                       </div>
                       <Wine className="mb-4 text-muted-foreground group-hover:text-primary transition-colors" size={32} />
                       <h3 className="text-xl font-bold">{bottle.name}</h3>
                       <p className="text-[10px] text-muted-foreground mt-1 truncate opacity-60 font-mono tracking-tighter">
                          {bottle.path}
                       </p>
                    </div>
                  ))}
                  {bottles.length === 0 && (
                     <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-3xl bg-secondary/10">
                        <Wine className="mx-auto text-muted-foreground/20 mb-4" size={48} />
                        <p className="text-muted-foreground font-medium">No bottles yet. Create one to get started.</p>
                     </div>
                  )}
               </div>

               {/* Create Modal */}
               {showCreateModal && (
                 <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                    <div className="bg-card border border-border p-8 rounded-3xl shadow-2xl w-full max-w-md space-y-6 animate-in fade-in zoom-in-95 duration-200">
                       <div className="flex items-center justify-between">
                          <h3 className="text-xl font-bold">New Bottle</h3>
                          <button onClick={() => setShowCreateModal(false)} className="hover:bg-secondary p-1 rounded-full"><X size={20}/></button>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Bottle Name</label>
                          <input 
                            autoFocus
                            type="text" 
                            value={newBottleName}
                            onChange={(e) => setNewBottleName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateBottle()}
                            placeholder="e.g. Steam Games"
                            className="w-full bg-secondary border border-border px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                       </div>
                       <button 
                        onClick={handleCreateBottle}
                        className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                       >
                         Create Bottle
                       </button>
                    </div>
                 </div>
               )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col space-y-6 animate-in fade-in slide-in-from-left-4 overflow-hidden">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button onClick={() => { setSelectedBottle(null); setExeInfo(null); setInstalledApps([]); }} className="p-2 hover:bg-secondary rounded-full transition-colors">
                      <ArrowLeft size={24} />
                    </button>
                    <div>
                       <h2 className="text-3xl font-bold tracking-tight">{selectedBottle.name}</h2>
                       <p className="text-[10px] text-muted-foreground font-mono">ID: {selectedBottle.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <button 
                        onClick={handleOpenFolder}
                        className="flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary text-foreground rounded-lg text-sm font-medium transition-colors"
                        title="Open in Finder"
                     >
                        <FolderOpen size={16} /> <span>Files</span>
                     </button>
                     <button 
                        onClick={handleScanApps} 
                        className={`p-2 rounded-lg hover:bg-secondary transition-all ${scanning ? 'animate-spin' : ''}`}
                        title="Refresh apps"
                     >
                        <RefreshCw size={18} />
                     </button>
                  </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
                  <div className="lg:col-span-2 space-y-6 overflow-y-auto pr-2 pb-6">
                     {/* Installed Apps */}
                     <div className="space-y-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Installed Applications</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                           {installedApps.map((app, i) => (
                             <div 
                               key={i}
                               className="p-4 bg-card/40 border border-border/40 rounded-xl flex items-center justify-between group hover:border-primary/40 transition-all shadow-sm"
                             >
                                <div className="flex items-center gap-3 overflow-hidden">
                                   <div className="p-2 bg-secondary rounded-lg text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                                      <Box size={20} />
                                   </div>
                                   <div className="overflow-hidden">
                                      <p className="font-bold truncate text-sm">{app.name}</p>
                                      <p className="text-[10px] text-muted-foreground truncate font-mono">{app.exe_path.split('/').pop()}</p>
                                   </div>
                                </div>
                                <button 
                                  onClick={() => handleRun(app.exe_path)}
                                  className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all shadow-lg shadow-emerald-500/10 shrink-0"
                                >
                                   <Play size={16} fill="currentColor" />
                                </button>
                             </div>
                           ))}
                           {installedApps.length === 0 && !scanning && (
                             <div className="col-span-full py-12 text-center border border-dashed border-border rounded-2xl bg-secondary/5">
                                <p className="text-sm text-muted-foreground italic">No applications detected. Install one below.</p>
                             </div>
                           )}
                        </div>
                     </div>

                     {/* Installer Section */}
                     <div className="space-y-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Run New Installer / Executable</h4>
                        {!exeInfo ? (
                           <button 
                            onClick={handleSelectExe}
                            disabled={loading}
                            className="w-full border-2 border-dashed border-border rounded-2xl p-10 text-center space-y-3 hover:border-primary/40 hover:bg-primary/5 transition-all flex flex-col items-center justify-center group"
                           >
                              <div className="p-3 bg-secondary rounded-full group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                 <Plus size={24} />
                              </div>
                              <div>
                                 <p className="text-sm font-bold">{loading ? "Analyzing..." : "Select Windows Executable"}</p>
                                 <p className="text-xs text-muted-foreground">.exe or .msi installers are supported</p>
                              </div>
                           </button>
                        ) : (
                           <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-xl animate-in zoom-in-95 duration-200">
                              <div className="flex items-center justify-between">
                                 <div className="flex items-center gap-3">
                                   <FileCode className="text-blue-400" size={24} />
                                   <div>
                                      <h3 className="font-bold truncate max-w-[200px] text-sm">{exeInfo.path.split('/').pop()}</h3>
                                      <p className="text-[10px] text-muted-foreground uppercase">{exeInfo.machine} • {exeInfo.is_64_bit ? '64-bit' : '32-bit'}</p>
                                   </div>
                                 </div>
                                 <button onClick={() => setExeInfo(null)} className="text-xs text-primary hover:underline font-bold">Change</button>
                              </div>
                              <button 
                                onClick={() => handleRun()}
                                className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform shadow-lg shadow-primary/20"
                              >
                                 <Play size={20} fill="currentColor" /> RUN INSTALLER
                              </button>
                           </div>
                        )}
                     </div>
                  </div>

                  {/* Sidebar Info & Logs */}
                  <div className="space-y-4 flex flex-col overflow-hidden pb-6">
                     <div className="p-5 bg-secondary/20 rounded-2xl border border-border/50 space-y-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                          <Zap size={14} className="text-yellow-500" /> Environment
                        </h4>
                        <div className="space-y-3 text-xs">
                           <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">ESync</span>
                              <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-bold text-[9px]">ACTIVE</span>
                           </div>
                           <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">D3DMetal</span>
                              <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-bold text-[9px]">ACTIVE</span>
                           </div>
                           <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">HUD</span>
                              <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-bold text-[9px]">ACTIVE</span>
                           </div>
                        </div>
                     </div>

                     <div className="flex-1 bg-black/40 rounded-2xl border border-border/40 p-4 font-mono text-[10px] flex flex-col overflow-hidden shadow-inner">
                        <div className="flex items-center justify-between mb-3 shrink-0">
                          <div className="flex items-center gap-2 text-muted-foreground/60">
                            <Terminal size={12} /> <span className="uppercase tracking-widest text-[9px] font-bold">Activity</span>
                          </div>
                          <button onClick={() => setLog([])} className="text-[9px] hover:text-white uppercase font-bold opacity-40 hover:opacity-100 transition-opacity">Clear</button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                           {log.map((l, i) => <div key={i} className="text-emerald-400/80 leading-tight border-l border-emerald-400/20 pl-2 py-0.5">{l}</div>)}
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          )}
       </main>
    </div>
  );
}

export default App;