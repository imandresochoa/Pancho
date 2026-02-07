import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import * as Icons from "lucide-react";

interface Bottle {
  id: string;
  name: string;
  path: string;
  created_at: number;
  pinned_apps?: DetectedApp[];
}

interface DetectedApp {
  name: string;
  exe_path: string;
  is_priority: boolean;
}

const APP_ASSETS: Record<string, string> = {
  "steam": "/covers/steam_cover.png",
  "default": "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop"
};

function App() {
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [selectedBottle, setSelectedBottle] = useState<Bottle | null>(null);
  const [installedApps, setInstalledApps] = useState<DetectedApp[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBottleName, setNewBottleName] = useState("");
  const [activeTab, setActiveTab] = useState<"library" | "browse">("library");

  useEffect(() => {
    loadBottles();
    const unlisten = listen<string>("status-update", (event) => {
      addToLog(`[SYSTEM] ${event.payload}`);
      if (event.payload.includes("successfully") || event.payload.includes("Error") || event.payload.includes("Failed")) {
        setRepairing(false);
      }
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  useEffect(() => {
    if (selectedBottle?.id) {
      handleScanApps();
      refreshBottleDetails();
      setActiveTab("library");
    }
  }, [selectedBottle?.id]);

  const loadBottles = async () => {
    try {
      const list = await invoke<Bottle[]>("get_bottles");
      setBottles(list || []);
    } catch (e) { addToLog(`Error loading bottles: ${e}`); }
  };

  const refreshBottleDetails = async () => {
    if (!selectedBottle) return;
    try {
      const details = await invoke<Bottle>("get_bottle_details", { bottleId: selectedBottle.id });
      if (details) setSelectedBottle(details);
    } catch (e) { console.error(e); }
  };

  const handleCreateBottle = async () => {
    if (!newBottleName.trim()) return;
    try {
      await invoke("create_bottle", { name: newBottleName });
      setNewBottleName("");
      setShowCreateModal(false);
      loadBottles();
    } catch (e) { addToLog(`Error: ${e}`); }
  };

  const handleDeleteBottle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const confirmed = await ask("Permanently delete this bottle and all its data?", { title: "Pancho", kind: "warning" });
    if (!confirmed) return;
    try {
      await invoke("delete_bottle", { id });
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
    if (!selectedBottle || repairing) return;
    setRepairing(true);
    addToLog("Starting DirectX Repair...");
    try {
      await invoke("install_dx_runtime", { bottleId: selectedBottle.id });
    } catch (e) {
      addToLog(`Trigger error: ${e}`);
      setRepairing(false);
    }
  };

  const handlePinApp = async (app: DetectedApp) => {
    if (!selectedBottle) return;
    try {
      await invoke("pin_app", { bottleId: selectedBottle.id, app });
      await refreshBottleDetails();
      addToLog(`Pinned ${app.name}`);
    } catch (e) { addToLog(`Pin error: ${e}`); }
  };

  const handleUnpinApp = async (exe_path: string) => {
    if (!selectedBottle) return;
    try {
      await invoke("unpin_app", { bottleId: selectedBottle.id, exe_path: exe_path });
      await refreshBottleDetails();
    } catch (e) { console.error(e); }
  };

  const handleAddManualShortcut = async () => {
    if (!selectedBottle) return;
    try {
      const selected = await open({ multiple: false, filters: [{ name: 'EXE', extensions: ['exe'] }] });
      if (selected && typeof selected === 'string') {
        const name = selected.split('/').pop()?.replace('.exe', '') || "App";
        await handlePinApp({ name, exe_path: selected, is_priority: false });
      }
    } catch (e) { console.error(e); }
  };

  const handleSelectAndRunInstaller = async () => {
    if (!selectedBottle) return;
    try {
      const selected = await open({ multiple: false, filters: [{ name: 'EXE', extensions: ['exe'] }] });
      if (selected && typeof selected === 'string') handleRun(selected);
    } catch (e) { console.error(e); }
  };

  const handleRun = async (path: string) => {
    if (!selectedBottle) return;
    try {
      addToLog(`Launching ${path.split('/').pop()}...`);
      await invoke("run_installer", { path, bottleId: selectedBottle.id });
    } catch (err) {
      addToLog(`Launch Error: ${err}`);
    }
  };

  const addToLog = (msg: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const getAsset = (name: string) => {
    const n = name.toLowerCase();
    if (n === "steam") return APP_ASSETS.steam;
    return APP_ASSETS.default;
  };

  const pinnedList = selectedBottle?.pinned_apps || [];
  const priorityApps = [
      ...pinnedList,
      ...installedApps.filter(a => a.is_priority && !pinnedList.some(p => p.exe_path === a.exe_path))
  ];
  const regularApps = installedApps.filter(a => !a.is_priority && !pinnedList.some(p => p.exe_path === a.exe_path));

  if (!selectedBottle) {
    return (
      <div className="h-screen w-screen bg-slate-950 text-white p-8 overflow-y-auto font-sans">
        <div className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-3">
             <Icons.Gamepad2 className="text-blue-500 w-10 h-10" />
             <h1 className="text-4xl font-black tracking-tighter uppercase">Pancho</h1>
          </div>
          <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 px-6 py-2 rounded-xl font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 text-xs tracking-widest uppercase">New Bottle</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {bottles.map(b => (
            <div key={b.id} onClick={() => setSelectedBottle(b)} className="p-8 bg-slate-900 border border-white/5 rounded-[2rem] hover:border-blue-500/50 cursor-pointer transition-all group relative overflow-hidden shadow-2xl">
              <button onClick={(e) => handleDeleteBottle(e, b.id)} className="absolute top-6 right-6 p-2 text-slate-600 hover:text-red-500 bg-black/20 rounded-full opacity-0 group-hover:opacity-100 transition-all"><Icons.Trash2 size={18} /></button>
              <Icons.Wine className="mb-6 text-slate-600 group-hover:text-blue-400 transition-colors" size={48} />
              <h3 className="text-2xl font-black tracking-tight">{b.name.toUpperCase()}</h3>
              <p className="text-[9px] text-slate-500 mt-2 font-mono truncate uppercase tracking-widest opacity-50">{b.id}</p>
            </div>
          ))}
        </div>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-50">
            <div className="bg-slate-900 border border-white/10 p-10 rounded-[3rem] w-full max-w-md space-y-6 shadow-2xl">
              <h2 className="text-2xl font-black uppercase tracking-tight">Create Bottle</h2>
              <input autoFocus value={newBottleName} onChange={e => setNewBottleName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateBottle()} placeholder="Name..." className="w-full bg-slate-800 border-white/5 p-5 rounded-2xl outline-none focus:ring-2 ring-blue-500 font-bold" />
              <div className="flex gap-3">
                <button onClick={() => setShowCreateModal(false)} className="flex-1 p-4 font-black text-xs opacity-50 uppercase">Cancel</button>
                <button onClick={handleCreateBottle} className="flex-1 bg-blue-600 p-4 rounded-2xl font-black text-xs shadow-lg shadow-blue-600/20 uppercase tracking-widest">Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-950 text-white flex flex-col overflow-hidden font-sans">
      <header className="h-16 border-b border-white/5 flex items-center px-6 gap-8 shrink-0 bg-slate-900/50 backdrop-blur-md">
        <button onClick={() => setSelectedBottle(null)} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><Icons.ArrowLeft size={24} /></button>
        <h1 className="text-xl font-black uppercase tracking-tighter truncate max-w-[150px]">{selectedBottle.name}</h1>
        <nav className="flex gap-1 bg-slate-800/50 p-1 rounded-xl border border-white/5">
           <button onClick={() => setActiveTab("library")} className={`px-5 py-1.5 rounded-lg text-[9px] font-black transition-all uppercase tracking-widest ${activeTab === 'library' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Library</button>
           <button onClick={() => setActiveTab("browse")} className={`px-5 py-1.5 rounded-lg text-[9px] font-black transition-all uppercase tracking-widest ${activeTab === 'browse' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Browse</button>
        </nav>
        <div className="ml-auto flex gap-2">
          <button onClick={() => invoke("open_bottle_dir", { bottleId: selectedBottle.id })} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-[9px] font-black flex items-center gap-2 transition-colors uppercase tracking-widest"><Icons.FolderOpen size={14} /> Files</button>
          <button onClick={handleScanApps} className={`bg-slate-800 hover:bg-slate-700 p-2 rounded-lg transition-colors ${scanning ? 'animate-spin' : ''}`}><Icons.RefreshCw size={18} /></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === "library" ? (
            <div className="space-y-10 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <section className="space-y-6">
                  <div className="flex items-center justify-between">
                     <h2 className="text-[10px] font-black text-blue-400 tracking-[0.4em] uppercase">Your Collection</h2>
                     <button onClick={handleAddManualShortcut} className="text-[9px] font-black text-slate-500 hover:text-white flex items-center gap-1 uppercase tracking-widest transition-colors">+ Pin Custom .EXE</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-8">
                    {priorityApps.map((app, i) => (
                      <div key={i} className="group relative aspect-[2/3] rounded-[1.5rem] overflow-hidden border border-white/5 shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-blue-500/50 hover:scale-[1.05] cursor-pointer bg-slate-900 will-change-transform" onClick={() => handleRun(app.exe_path)}>
                         <img 
                            src={getAsset(app.name)} 
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110 will-change-transform" 
                            onError={(e) => { (e.target as HTMLImageElement).src = APP_ASSETS.default; }} 
                         />
                         <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/10 to-transparent opacity-90 transition-opacity group-hover:opacity-100" />
                         <div className="absolute inset-0 p-6 flex flex-col justify-end">
                            <div className="space-y-1 transition-transform duration-500 ease-out group-hover:translate-y-[-8px]">
                               <p className="text-lg font-black tracking-tighter leading-tight break-words uppercase">{app.name}</p>
                               <div className="flex items-center gap-2">
                                  <span className="text-[8px] font-black bg-blue-600/90 px-1.5 py-0.5 rounded uppercase tracking-tighter">Verified</span>
                               </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between opacity-0 translate-y-2 transition-all duration-500 ease-out group-hover:opacity-100 group-hover:translate-y-0">
                               <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Play Now</span>
                               <Icons.PlayCircle className="text-white w-8 h-8" fill="currentColor" />
                            </div>
                         </div>
                         <button onClick={(e) => { e.stopPropagation(); handleUnpinApp(app.exe_path); }} className="absolute top-4 right-4 p-2 bg-black/40 backdrop-blur-md rounded-full text-white/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shadow-lg"><Icons.StarOff size={14} /></button>
                      </div>
                    ))}
                    <div onClick={handleSelectAndRunInstaller} className="group relative aspect-[2/3] rounded-[1.5rem] border-2 border-dashed border-white/10 hover:border-blue-500/40 hover:bg-blue-600/5 transition-all duration-500 ease-out cursor-pointer flex flex-col items-center justify-center gap-4 bg-slate-900/20">
                       <div className="p-6 bg-slate-900 rounded-[1.5rem] group-hover:scale-110 transition-transform shadow-2xl border border-white/5"><Icons.Plus className="text-blue-500" size={32} /></div>
                       <div className="text-center space-y-1"><p className="font-black text-[10px] uppercase tracking-widest">Install New</p></div>
                    </div>
                  </div>
               </section>
            </div>
          ) : (
            <div className="space-y-6 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <h2 className="text-[10px] font-black text-slate-500 tracking-[0.4em] uppercase border-b border-white/5 pb-4">Internal File Browser</h2>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                 {regularApps.map((app, i) => (
                   <div key={i} className="p-4 bg-slate-900/40 border border-white/5 rounded-2xl flex items-center justify-between group hover:border-white/10 transition-all">
                     <div className="flex items-center gap-4 overflow-hidden">
                       <div className="p-2 bg-slate-800 rounded-xl text-slate-400 group-hover:text-blue-400 transition-colors"><Icons.Box size={20} /></div>
                       <div className="overflow-hidden"><p className="font-bold text-sm truncate">{app.name}</p><p className="text-[9px] text-slate-600 truncate font-mono opacity-40">{app.exe_path.split('/').pop()}</p></div>
                     </div>
                     <div className="flex items-center gap-1">
                        <button onClick={() => handlePinApp(app)} className="p-2 text-slate-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all" title="Pin to Library"><Icons.Star size={14} /></button>
                        <button onClick={() => handleRun(app.exe_path)} className="p-2 text-blue-400 hover:bg-blue-400 hover:text-white rounded-lg transition-all"><Icons.Play size={16} fill="currentColor" /></button>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-80 flex flex-col gap-6 shrink-0 pb-10">
          <div className="p-6 bg-slate-900 rounded-[2.5rem] border border-white/5 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
               <h3 className="text-[10px] font-black text-slate-500 tracking-widest uppercase tracking-[0.2em]">Environment</h3>
               <button onClick={handleRepairDX} disabled={repairing} className={`text-[9px] px-3 py-1 rounded-full font-black transition-all ${repairing ? 'bg-slate-800 text-slate-500 animate-pulse' : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/40'}`}>
                 {repairing ? "REPAIRING..." : "FIX GRAPHICS"}
               </button>
            </div>
            <div className="space-y-3">
               <EnvStat label="ENGINE" value="WINE-11.0" />
               <EnvStat label="ARCH" value="X86_64" />
               <EnvStat label="ESYNC" value="ON" active />
               <EnvStat label="MSYNC" value="ON" active />
            </div>
          </div>
          <div className="flex-1 bg-black/40 rounded-[2.5rem] border border-white/5 p-6 flex flex-col overflow-hidden shadow-inner">
            <div className="flex justify-between items-center mb-4 shrink-0 text-slate-600">
              <h3 className="text-[10px] font-black tracking-widest uppercase tracking-[0.2em]">System Log</h3>
              <button onClick={() => setLog([])} className="text-[9px] font-black hover:text-white uppercase transition-colors tracking-widest">Clear</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[9px] custom-scrollbar">
              {log.map((l, i) => <div key={i} className="text-emerald-500/60 border-l border-emerald-500/20 pl-2 py-0.5 leading-tight">{l}</div>)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EnvStat({ label, value, active = false }: { label: string, value: string, active?: boolean }) {
    return (
        <div className="flex justify-between items-center bg-black/20 p-4 rounded-2xl border border-white/5">
            <span className="text-[9px] font-black tracking-widest opacity-40 uppercase">{label}</span>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${active ? 'bg-emerald-500/10 text-emerald-500' : 'text-slate-400'}`}>{value}</span>
        </div>
    )
}

export default App;
