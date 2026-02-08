import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import * as Icons from "lucide-react";
import { BottleWizard } from "@/components/BottleWizard";
import { GraphicsConfig } from "@/components/GraphicsConfig";

interface Bottle {
  id: string;
  name: string;
  path: string;
  created_at: number;
  app_registry?: DetectedApp[];
  cover: string;
  engine_path?: string;
  environment_type: string;
}

interface DetectedApp {
  name: string;
  exe_path: string;
  is_priority: boolean;
  pinned: boolean;
}

interface BackgroundTask {
  id: string;
  title: string;
  status: string;
  progress: number;
  type: 'engine' | 'repair' | 'system';
  isComplete: boolean;
  hasError: boolean;
}

const APP_ASSETS: Record<string, string> = {
  "steam": "/covers/steam_thumbnail.jpg",
  "default": "/covers/cover02.png"
};

const glassyStyle = {
  background: "linear-gradient(135deg, #222222 0%, #000000 100%)",
  boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.05), 0 20px 40px rgba(0,0,0,0.4)",
  border: "1px solid #333333"
};

function App() {
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [selectedBottle, setSelectedBottle] = useState<Bottle | null>(null);
  const selectedBottleRef = useRef<Bottle | null>(null);

  useEffect(() => {
    selectedBottleRef.current = selectedBottle;
  }, [selectedBottle]);

  const [installedApps, setInstalledApps] = useState<DetectedApp[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"library" | "browse" | "analysis">("library");
  
  // Analysis State
  const [analysisInfo, setAnalysisInfo] = useState<any>(null);

  // Notification State
  const [notification, setNotification] = useState<{ message: string, type: 'info' | 'warning' } | null>(null);

  // Engine & Tasks
  const [, setTasks] = useState<BackgroundTask[]>([]);

  // Settings Modal State
  const [settingsTarget, setSettingsTarget] = useState<Bottle | null>(null);
  const [editName, setEditName] = useState("");
  const [editCover, setEditCover] = useState("");

  useEffect(() => {
    loadBottles();
    checkEngine();

    const unlistenStatus = listen<string>("status-update", (event) => {
      addToLog(`[SYSTEM] ${event.payload}`);
      updateTask('repair-task', event.payload);
    });

    const unlistenLib = listen<string>("library-changed", (event) => {
      if (selectedBottleRef.current && event.payload === selectedBottleRef.current.id) {
          handleScanApps();
          refreshBottleDetails();
      }
    });

    const unlistenEngine = listen<string>("engine-status", (event) => {
      addToLog(`[ENGINE] ${event.payload}`);
      updateTask('engine-setup', event.payload);
      if (event.payload.includes("Success") || event.payload.includes("installed")) {
          checkEngine();
      }
    });

    return () => { 
      unlistenStatus.then(f => f()); 
      unlistenEngine.then(f => f());
      unlistenLib.then(f => f());
    };
  }, []);

  useEffect(() => {
    if (selectedBottle) {
      handleScanApps();
      refreshBottleDetails();
      setActiveTab("library");
    }
  }, [selectedBottle?.id]);

  const updateTask = (id: string, status: string) => {
    setTasks(prev => {
      const exists = prev.find(t => t.id === id);
      const isComplete = status.includes("Success") || status.includes("complete") || status.includes("installed");
      const hasError = status.toLowerCase().includes("error") || status.toLowerCase().includes("failed");
      if (!exists) {
        return [...prev, { id, title: id === 'engine-setup' ? 'Engine Deployment' : 'DirectX Repair', status, progress: 0, type: id === 'engine-setup' ? 'engine' : 'repair', isComplete, hasError }];
      }
      return prev.map(t => t.id === id ? { ...t, status, isComplete, hasError } : t);
    });
  };

  const checkEngine = async (): Promise<boolean> => {
    try {
      const status = await invoke<boolean>("check_engine_status");
      return status;
    } catch (e) { return false; }
  };

  const handleAnalyzeApp = async (path: string) => {
    setActiveTab("analysis");
    try {
      const info = await invoke("launch_installer", { path });
      setAnalysisInfo(info);
    } catch (e) { addToLog(`Analysis Error: ${e}`); }
  };

  const loadBottles = async () => {
    try {
      const list = await invoke<Bottle[]>("get_bottles");
      setBottles(list || []);
    } catch (e) { addToLog(`Error: ${e}`); }
  };

  const refreshBottleDetails = async () => {
    if (!selectedBottle) return;
    try {
      const details = await invoke<Bottle>("get_bottle_details", { bottleId: selectedBottle.id });
      if (details) {
          if (!details.app_registry) details.app_registry = [];
          setSelectedBottle(details);
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteBottle = async (id: string) => {
    const confirmed = await ask("Permanently delete this bottle?", { title: "Pancho", kind: "warning" });
    if (!confirmed) return;
    try {
      await invoke("delete_bottle", { id });
      setSettingsTarget(null);
      loadBottles();
    } catch (e) { addToLog(`Error: ${e}`); }
  };

  const handleSaveSettings = async () => {
    if (!settingsTarget) return;
    try {
      if (editName !== settingsTarget.name) await invoke("rename_bottle", { id: settingsTarget.id, newName: editName });
      if (editCover !== settingsTarget.cover) await invoke("set_bottle_cover", { bottleId: settingsTarget.id, coverPath: editCover });
      setSettingsTarget(null);
      loadBottles();
    } catch (e) { addToLog(`Error: ${e}`); }
  };

  const handleScanApps = async () => {
    if (!selectedBottle) return;
    setScanning(true);
    try {
      const apps = await invoke<DetectedApp[]>("scan_for_apps", { bottleId: selectedBottle.id });
      setInstalledApps(apps || []);
    } catch (e) { addToLog(`Scan error: ${e}`); } finally { setScanning(false); }
  };

  const handleRepairDX = async () => {
    if (!selectedBottle) return;
    updateTask('repair-task', 'Preparing repair...');
    try {
      await invoke("install_dx_runtime", { bottleId: selectedBottle.id });
    } catch (e) {
      updateTask('repair-task', `Error: ${e}`);
    }
  };

  const handlePinApp = async (app: DetectedApp) => {
    if (!selectedBottle) return;
    try {
      await invoke("pin_app", { bottleId: selectedBottle.id, app });
      await refreshBottleDetails();
    } catch (e) { console.error(e); }
  };

  const handleUnpinApp = async (exe_path: string) => {
    if (!selectedBottle) return;
    try {
      addToLog(`Unpinning ${exe_path.split('/').pop()}...`);
      await invoke("unpin_app", { bottleId: selectedBottle.id, exe_path: exe_path });
      await refreshBottleDetails();
    } catch (e) { console.error(e); }
  };

  const handleRun = async (path: string) => {
    if (!selectedBottle) return;
    try {
      const fileName = path.split('/').pop()?.toLowerCase() || "";
      if (fileName.includes("steam")) {
          setNotification({ 
            message: "Initializing Steam... Pancho-Core is registering system-level shims for Apple Silicon.", 
            type: "warning" 
          });
          setTimeout(() => setNotification(null), 10000);
      }
      addToLog(`Launching ${path.split('/').pop()}...`);
      await invoke("run_installer", { path, bottleId: selectedBottle.id });
    } catch (err) { addToLog(`Error: ${err}`); }
  };

  const addToLog = (msg: string) => setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const getAsset = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("steam")) return APP_ASSETS.steam;
    return APP_ASSETS.default;
  };

  const registry = selectedBottle?.app_registry || [];
  const priorityApps = [
    ...registry.filter(a => a.pinned), 
    ...installedApps.filter(a => a.is_priority && !registry.some(r => r.exe_path === a.exe_path))
  ];
  const browseApps = [
    ...installedApps.filter(a => !priorityApps.some(p => p.exe_path === a.exe_path)),
    ...registry.filter(a => !a.pinned && !installedApps.some(i => i.exe_path === a.exe_path))
  ];

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden font-sans border-t-2 border-white">
      {!selectedBottle ? (
        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
          <div className="flex justify-between items-center mb-16 border-b border-white/10 pb-8">
            <div className="flex items-center gap-4"><img src="/logo_pancho.svg" alt="Logo" className="h-16 w-auto" /></div>
            <button onClick={() => { setShowCreateModal(true); }} className="bg-white text-black px-8 py-3 font-black hover:bg-zinc-200 transition-all text-xs tracking-widest uppercase">New Bottle</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-8">
            <div 
              onClick={() => { setShowCreateModal(true); }}
              className="border-2 border-dashed border-white/10 hover:border-white/40 hover:bg-white/5 transition-all aspect-[2/3] flex flex-col items-center justify-center gap-6 cursor-pointer group bg-zinc-900/20"
            >
              <div className="p-6 bg-white/5 rounded-full group-hover:scale-110 transition-transform">
                <Icons.Box size={48} className="text-zinc-500 group-hover:text-emerald-500" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 group-hover:text-white">Create New</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Environment</p>
              </div>
            </div>

            {bottles.map(b => (
              <div key={b.id} onClick={() => setSelectedBottle(b)} style={glassyStyle} className="group relative aspect-[2/3] overflow-hidden cursor-pointer hover:border-white hover:scale-[1.02] transition-all duration-300">
                <img src={b.cover || APP_ASSETS.default} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />
                <div className="absolute inset-0 p-8 flex flex-col justify-end">
                    <h3 className="text-2xl font-black tracking-tighter uppercase">{b.name}</h3>
                    <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">{b.environment_type}</p>
                </div>
                <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={(e) => { e.stopPropagation(); setSettingsTarget(b); setEditName(b.name); setEditCover(b.cover); }} className="p-3 text-white bg-black/80 border border-white/20 hover:bg-white hover:text-black transition-colors"><Icons.Settings size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-16 border-b border-white/10 flex items-center px-6 gap-8 shrink-0 bg-zinc-950">
            <button onClick={() => setSelectedBottle(null)} className="p-2 hover:bg-zinc-800 transition-colors"><Icons.ArrowLeft size={24} /></button>
            <img src="/logo_pancho.svg" alt="Logo" className="h-6 w-auto" />
            <nav className="flex gap-px bg-white/5 p-px border border-white/10">
              <button onClick={() => setActiveTab("library")} className={`px-6 py-2 text-[10px] font-black transition-all uppercase tracking-widest ${activeTab === 'library' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}>Library</button>
              <button onClick={() => setActiveTab("browse")} className={`px-6 py-2 text-[10px] font-black transition-all uppercase tracking-widest ${activeTab === 'browse' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}>Browse</button>
              <button onClick={() => setActiveTab("analysis")} className={`px-6 py-2 text-[10px] font-black transition-all uppercase tracking-widest ${activeTab === 'analysis' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}>Analysis</button>
            </nav>
            <div className="ml-auto flex gap-2">
                <button onClick={() => invoke("open_bottle_dir", { bottleId: selectedBottle.id })} className="bg-zinc-900 hover:bg-zinc-800 px-6 py-2 text-[10px] font-black flex items-center gap-3 transition-colors uppercase tracking-widest border-r border-white/10"><Icons.FolderOpen size={14} /> Files</button>
                <button onClick={handleScanApps} className={`bg-zinc-900 hover:bg-zinc-800 px-4 py-2 transition-colors ${scanning ? 'animate-spin' : ''}`}><Icons.RefreshCw size={18} /></button>
            </div>
          </header>
          <div className="flex-1 flex overflow-hidden">
            <main className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-zinc-950">
                {activeTab === "library" && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-8">
                        <div 
                          onClick={() => {
                            open({ multiple: false, filters: [{ name: 'EXE', extensions: ['exe'] }] }).then(s => {
                              if (s && typeof s === 'string') {
                                handlePinApp({ name: s.split('/').pop()?.replace('.exe', '') || "App", exe_path: s, is_priority: false, pinned: true });
                              }
                            });
                          }}
                          className="border-2 border-dashed border-white/10 hover:border-white/40 hover:bg-white/5 transition-all aspect-[2/3] flex flex-col items-center justify-center gap-4 cursor-pointer group"
                        >
                          <div className="p-4 bg-white/5 rounded-full group-hover:scale-110 transition-transform">
                            <Icons.Plus size={32} className="text-zinc-500 group-hover:text-white" />
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 group-hover:text-white">Add Game</p>
                        </div>

                        {priorityApps.map((app, i) => (
                            <div key={i} style={glassyStyle} className="group relative aspect-[2/3] overflow-hidden cursor-pointer hover:border-white transition-all bg-zinc-900" onClick={() => handleRun(app.exe_path)}>
                                <img src={getAsset(app.name)} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
                                <div className="absolute inset-0 p-6 flex flex-col justify-end">
                                    <p className="text-xl font-black uppercase tracking-tight">{app.name}</p>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                        <button onClick={(e) => { e.stopPropagation(); handleAnalyzeApp(app.exe_path); }} className="mt-4 text-[9px] font-black text-zinc-500 hover:text-white uppercase tracking-widest border border-white/10 px-3 py-1 bg-black/50">Analyze</button>
                                        <button onClick={(e) => { e.stopPropagation(); handleUnpinApp(app.exe_path); }} className="mt-4 text-[9px] font-black text-red-500 hover:text-red-400 uppercase tracking-widest border border-red-500/10 px-3 py-1 bg-black/50">Unpin</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {activeTab === "browse" && (
                    <div className="space-y-10">
                        <header className="flex justify-between items-end">
                            <div className="space-y-1">
                                <h2 className="text-[10px] font-black text-emerald-500 tracking-[0.4em] uppercase">Detected Executables</h2>
                                <p className="text-[9px] font-bold text-zinc-600 uppercase">Automated scan of drive_c</p>
                            </div>
                            <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2">
                                <Icons.Info size={14} className="text-zinc-500" />
                                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">
                                    Newly installed? Use the <span className="text-white">Refresh</span> button in the header.
                                </p>
                            </div>
                        </header>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-8">
                            {browseApps.map((app, i) => (
                                <div key={i} className="group relative aspect-[2/3] border border-white/5 hover:border-white/20 bg-zinc-900/40 p-6 flex flex-col transition-all cursor-pointer" onClick={() => handleRun(app.exe_path)}>
                                    <div className="flex-1 flex items-center justify-center">
                                        <Icons.FileCode size={48} className="text-zinc-800 group-hover:text-zinc-600 transition-colors" />
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-sm font-black uppercase tracking-tight truncate text-zinc-400 group-hover:text-white">{app.name}</p>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handlePinApp(app); }}
                                            className="w-full py-2 border border-white/5 text-[8px] font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all"
                                        >
                                            Pin to Library
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {activeTab === "analysis" && analysisInfo && (
                    <div className="space-y-8 max-w-4xl">
                        <div className="bg-zinc-900 border border-white/10 p-10 space-y-6">
                            <h2 className="text-3xl font-black uppercase tracking-tighter italic text-emerald-500">Native PE Analysis</h2>
                            <div className="grid grid-cols-2 gap-8 font-mono text-xs">
                                <div className="space-y-4">
                                    <p className="text-zinc-500 uppercase tracking-widest text-[10px]">Architecture</p>
                                    <p className="text-xl text-white font-black">{analysisInfo.machine}</p>
                                </div>
                                <div className="space-y-4">
                                    <p className="text-zinc-500 uppercase tracking-widest text-[10px]">Entry Point</p>
                                    <p className="text-xl text-white font-black">0x{analysisInfo.entry_point.toString(16)}</p>
                                </div>
                                <div className="space-y-4">
                                    <p className="text-zinc-500 uppercase tracking-widest text-[10px]">Base Address</p>
                                    <p className="text-xl text-white font-black">0x{analysisInfo.base_address.toString(16)}</p>
                                </div>
                                <div className="space-y-4">
                                    <p className="text-zinc-500 uppercase tracking-widest text-[10px]">Sections</p>
                                    <p className="text-xl text-white font-black">{analysisInfo.sections}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
            <aside className="w-80 border-l border-white/10 bg-zinc-900/20 p-8 space-y-8 flex flex-col">
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-[10px] font-black text-zinc-500 tracking-[0.5em] uppercase">Environment</h3>
                        <button onClick={() => handleRepairDX()} className="text-[8px] border border-white/10 px-2 py-1 hover:bg-white hover:text-black transition-all font-black">REPAIR</button>
                    </div>
                    <div className="bg-black border border-white/10 divide-y divide-white/5">
                        <EnvStat label="TYPE" value={selectedBottle.environment_type} active />
                        <EnvStat label="ENGINE" value={selectedBottle.engine_path ? "CUSTOM" : "PANCHO-PRO"} active />
                        <EnvStat label="IPC BRIDGE" value="MACH-PORT" active />
                    </div>
                </div>
                <div className="flex-1 bg-black p-6 flex flex-col overflow-hidden border border-white/5">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-[10px] font-black tracking-widest uppercase text-zinc-700">Output</h3>
                        <button onClick={() => setLog([])} className="text-[8px] opacity-20 hover:opacity-100">CLEAR</button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[9px] custom-scrollbar text-zinc-500 italic">
                        {log.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                </div>
            </aside>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center p-6 z-[400]">
          <div className="bg-zinc-900 border border-white/10 p-12 w-full max-w-xl shadow-2xl">
            <BottleWizard 
                onCancel={() => {
                    setShowCreateModal(false);
                }}
                onComplete={() => {
                    setShowCreateModal(false);
                    loadBottles();
                }}
            />
          </div>
        </div>
      )}

      {settingsTarget && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center p-6 z-[400] overflow-y-auto">
          <div className="bg-zinc-900 border border-white/10 p-12 w-full max-w-2xl shadow-2xl my-auto">
            <div className="flex justify-between items-start mb-12">
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tight">Bottle Settings</h2>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mt-2">{settingsTarget.id}</p>
              </div>
              <button onClick={() => setSettingsTarget(null)} className="p-2 text-zinc-500 hover:text-white transition-colors">
                <Icons.X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <div style={glassyStyle} className="aspect-[2/3] w-full relative overflow-hidden bg-black">
                  <img src={editCover || APP_ASSETS.default} className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                  <div className="absolute inset-0 p-6 flex flex-col justify-end">
                    <p className="text-xl font-black uppercase tracking-tight truncate">{editName}</p>
                  </div>
                </div>
                <button onClick={() => setEditCover("")} className="w-full p-4 text-[10px] font-black uppercase tracking-widest bg-black border border-white/10 hover:text-red-500 transition-colors">
                  Clear Thumbnail
                </button>
              </div>

              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Display Name</label>
                  <input 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    className="w-full bg-black border border-white/10 p-5 outline-none focus:border-white font-bold tracking-widest" 
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Custom Thumbnail URL</label>
                  <input 
                    value={editCover} 
                    onChange={e => setEditCover(e.target.value)} 
                    placeholder="https://..." 
                    className="w-full bg-black border border-white/10 p-5 outline-none focus:border-white font-bold tracking-widest text-xs" 
                  />
                </div>
                
                <div className="pt-8 flex flex-col gap-4">
                    <GraphicsConfig bottleId={settingsTarget.id} />
                    <div className="h-px bg-white/10 my-4" />
                    <button onClick={handleSaveSettings} className="w-full bg-white text-black p-5 font-black text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all">Save Changes</button>
                    <button onClick={() => handleDeleteBottle(settingsTarget.id)} className="w-full border border-red-500/20 text-red-500 p-5 font-black text-xs uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Delete Bottle</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed bottom-8 right-8 z-[500] animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className={`flex items-center gap-5 p-5 border backdrop-blur-xl ${notification.type === 'warning' ? 'bg-black/80 border-emerald-500/30 shadow-2xl' : 'bg-zinc-900/90 border-white/10'} max-w-sm`}>
            <div className={`p-2 rounded-full ${notification.type === 'warning' ? 'bg-emerald-500/10' : 'bg-white/5'}`}>
              <Icons.Zap className={notification.type === 'warning' ? 'text-emerald-500' : 'text-white'} size={14} />
            </div>
            <div className="flex-1 space-y-0.5">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">System Trace</p>
              <p className="text-[10px] font-medium leading-relaxed text-zinc-200 uppercase tracking-tight">
                {notification.message}
              </p>
            </div>
            <button onClick={() => setNotification(null)} className="p-1 text-zinc-600 hover:text-white transition-colors">
              <Icons.X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EnvStat({ label, value, active = false }: { label: string, value: string, active?: boolean }) {
    return (
        <div className="flex justify-between items-center p-4">
            <span className="text-[10px] font-black tracking-widest opacity-30 uppercase">{label}</span>
            <span className={`text-[10px] font-black tracking-widest ${active ? 'text-emerald-500' : 'text-zinc-500'} uppercase`}>{value}</span>
        </div>
    );
}

export default App;