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
    } catch (e) { addToLog(`Error: ${e}`); }
  };

  const refreshBottleDetails = async () => {
    if (!selectedBottle) return;
    try {
      const details = await invoke<Bottle>("get_bottle_details", { bottleId: selectedBottle.id });
      if (details) {
          if (!details.pinned_apps) details.pinned_apps = [];
          setSelectedBottle(details);
      }
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
    const confirmed = await ask("Permanently delete this bottle?", { title: "Pancho", kind: "warning" });
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
      addToLog(`Error: ${e}`);
      setRepairing(false);
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
      await invoke("unpin_app", { bottleId: selectedBottle.id, exe_path: exe_path });
      await refreshBottleDetails();
    } catch (e) { console.error(e); }
  };

  const handleRun = async (path: string) => {
    if (!selectedBottle) return;
    try {
      addToLog(`Launching ${path.split('/').pop()}...`);
      await invoke("run_installer", { path, bottleId: selectedBottle.id });
    } catch (err) { addToLog(`Error: ${err}`); }
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

  // --- RENDERING ---

  if (!selectedBottle) {
    return (
      <div className="h-screen w-screen bg-black text-white p-12 overflow-y-auto font-sans">
        <div className="flex justify-between items-center mb-16 border-b border-white/10 pb-8">
          <div className="flex items-center gap-4">
             <img src="/logo_pancho.svg" alt="Logo" className="h-16 w-auto" />
          </div>
          <button onClick={() => setShowCreateModal(true)} className="bg-white text-black px-8 py-3 font-black hover:bg-zinc-200 transition-all text-xs tracking-widest uppercase">New Bottle</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {bottles.map(b => (
            <div key={b.id} onClick={() => setSelectedBottle(b)} className="p-10 bg-zinc-900 border border-white/10 hover:border-white cursor-pointer transition-all group relative overflow-hidden shadow-2xl">
              <button onClick={(e) => handleDeleteBottle(e, b.id)} className="absolute top-6 right-6 p-2 text-zinc-600 hover:text-red-500 transition-all"><Icons.Trash2 size={18} /></button>
              <Icons.Wine className="mb-8 text-zinc-700 group-hover:text-white transition-colors" size={48} />
              <h3 className="text-3xl font-black tracking-tight">{b.name.toUpperCase()}</h3>
              <p className="text-[10px] text-zinc-500 mt-2 font-mono truncate uppercase tracking-widest opacity-50">{b.id}</p>
            </div>
          ))}
        </div>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center p-6 z-50">
            <div className="bg-zinc-900 border border-white/10 p-12 w-full max-w-md space-y-8 shadow-2xl">
              <h2 className="text-2xl font-black uppercase tracking-tight">Create Bottle</h2>
              <input autoFocus value={newBottleName} onChange={e => setNewBottleName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateBottle()} placeholder="NAME..." className="w-full bg-black border border-white/10 p-5 outline-none focus:border-white font-bold tracking-widest" />
              <div className="flex gap-1">
                <button onClick={() => setShowCreateModal(false)} className="flex-1 p-4 font-black text-xs opacity-50 uppercase tracking-widest hover:opacity-100 transition-all">Cancel</button>
                <button onClick={handleCreateBottle} className="flex-1 bg-white text-black p-4 font-black text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all shadow-lg">Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden font-sans border-t-2 border-white">
      <header className="h-16 border-b border-white/10 flex items-center px-6 gap-8 shrink-0 bg-zinc-950 backdrop-blur-md">
        <button onClick={() => setSelectedBottle(null)} className="p-2 hover:bg-zinc-800 transition-colors"><Icons.ArrowLeft size={24} /></button>
        <img src="/logo_pancho.svg" alt="Logo" className="h-6 w-auto" />
        
        <nav className="flex gap-px bg-white/5 p-px border border-white/10">
           <button onClick={() => setActiveTab("library")} className={`px-6 py-2 text-[10px] font-black transition-all uppercase tracking-widest ${activeTab === 'library' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}>Library</button>
           <button onClick={() => setActiveTab("browse")} className={`px-6 py-2 text-[10px] font-black transition-all uppercase tracking-widest ${activeTab === 'browse' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}>Browse</button>
        </nav>

        <div className="ml-auto flex gap-px bg-white/10">
          <button onClick={() => invoke("open_bottle_dir", { bottleId: selectedBottle.id })} className="bg-zinc-900 hover:bg-zinc-800 px-6 py-2 text-[10px] font-black flex items-center gap-3 transition-colors uppercase tracking-widest border-r border-white/10"><Icons.FolderOpen size={14} /> Files</button>
          <button onClick={handleScanApps} className={`bg-zinc-900 hover:bg-zinc-800 px-4 py-2 transition-colors ${scanning ? 'animate-spin' : ''}`}><Icons.RefreshCw size={18} /></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-zinc-950">
          {activeTab === "library" ? (
            <div className="space-y-10 pb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
               <section className="space-y-6">
                  <div className="flex items-center justify-between">
                     <h2 className="text-[10px] font-black text-zinc-500 tracking-[0.4em] uppercase">Game Collection</h2>
                     <button onClick={() => {
                        open({ multiple: false, filters: [{ name: 'EXE', extensions: ['exe'] }] }).then(selected => {
                            if (selected && typeof selected === 'string') {
                                const name = selected.split('/').pop()?.replace('.exe', '') || "App";
                                handlePinApp({ name, exe_path: selected, is_priority: false });
                            }
                        });
                     }} className="text-[9px] font-black text-zinc-500 hover:text-white flex items-center gap-1 uppercase tracking-widest transition-colors">+ Pin Custom .EXE</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-8">
                    {priorityApps.map((app, i) => (
                      <div key={i} className="group relative aspect-[2/3] overflow-hidden border border-white/5 shadow-2xl transition-all duration-500 ease-out cursor-pointer hover:border-white hover:scale-[1.05] bg-zinc-900 will-change-transform" onClick={() => handleRun(app.exe_path)}>
                         <img src={getAsset(app.name)} className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-110" onError={(e) => { (e.target as HTMLImageElement).src = APP_ASSETS.default; }} />
                         <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent opacity-90 transition-opacity group-hover:opacity-100" />
                         <div className="absolute inset-0 p-6 flex flex-col justify-end">
                            <div className="space-y-1 transition-transform duration-500 ease-out group-hover:translate-y-[-8px]">
                               <p className="text-xl font-black tracking-tighter leading-tight break-words uppercase">{app.name}</p>
                               <div className="flex items-center gap-2">
                                  <span className="text-[8px] font-black bg-emerald-500 text-white px-1.5 py-0.5 uppercase tracking-widest">Active</span>
                               </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between opacity-0 translate-y-2 transition-all duration-500 ease-out group-hover:opacity-100 group-hover:translate-y-0">
                               <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Launch Now</span>
                               <div className="bg-white text-black p-2"><Icons.PlayCircle className="w-6 h-6" fill="currentColor" /></div>
                            </div>
                         </div>
                         <button onClick={(e) => { e.stopPropagation(); handleUnpinApp(app.exe_path); }} className="absolute top-4 right-4 p-2 bg-black/40 backdrop-blur-md text-white/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shadow-lg"><Icons.StarOff size={14} /></button>
                      </div>
                    ))}
                    <div onClick={() => {
                        open({ multiple: false, filters: [{ name: 'EXE', extensions: ['exe'] }] }).then(selected => {
                            if (selected && typeof selected === 'string') handleRun(selected);
                        });
                    }} className="group relative aspect-[2/3] border-2 border-dashed border-white/10 hover:border-white hover:bg-white/5 transition-all duration-500 ease-out cursor-pointer flex flex-col items-center justify-center gap-4 bg-zinc-900/40">
                       <div className="p-6 border border-white/10 group-hover:border-white transition-colors bg-black shadow-xl"><Icons.Plus className="text-zinc-500 group-hover:text-white" size={32} /></div>
                       <p className="font-black text-[10px] uppercase tracking-widest text-zinc-500 group-hover:text-white">Install New</p>
                    </div>
                  </div>
               </section>
            </div>
          ) : (
            <div className="space-y-6 pb-10 animate-in fade-in duration-500">
               <h2 className="text-[10px] font-black text-zinc-500 tracking-[0.4em] uppercase border-b border-white/10 pb-4">Internal File Browser</h2>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-white/5 border border-white/10">
                 {regularApps.map((app, i) => (
                   <div key={i} className="p-6 bg-black border border-white/5 flex items-center justify-between group hover:bg-zinc-900 transition-all">
                     <div className="flex items-center gap-6 overflow-hidden">
                       <div className="p-2 bg-zinc-900 text-zinc-500 group-hover:text-white transition-colors"><Icons.Box size={20} /></div>
                       <div className="overflow-hidden">
                         <p className="font-bold text-sm truncate">{app.name}</p>
                         <p className="text-[9px] text-zinc-600 truncate font-mono opacity-40">{app.exe_path.split('/').pop()}</p>
                       </div>
                     </div>
                     <div className="flex items-center gap-px bg-white/10">
                        <button onClick={() => handlePinApp(app)} className="p-4 text-zinc-600 hover:text-white hover:bg-white/5 transition-all"><Icons.Star size={14} /></button>
                        <button onClick={() => handleRun(app.exe_path)} className="p-4 bg-white/5 text-zinc-400 hover:text-white hover:bg-blue-600 transition-all"><Icons.Play size={16} fill="currentColor" /></button>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-80 flex flex-col gap-px shrink-0 border-l border-white/10 bg-zinc-900/20">
          <div className="p-8 border-b border-white/10 bg-black/40 space-y-8">
            <div className="flex justify-between items-center">
               <h3 className="text-[10px] font-black text-zinc-500 tracking-[0.5em] uppercase">Environment</h3>
               <button onClick={handleRepairDX} disabled={repairing} className={`text-[9px] px-4 py-1 font-black transition-all border border-white/20 text-white hover:bg-white hover:text-black ${repairing ? 'animate-pulse opacity-50' : ''}`}>
                 {repairing ? "REPAIRING..." : "REPAIR DX"}
               </button>
            </div>
            <div className="space-y-px bg-white/5 border border-white/10">
               <EnvStat label="ENGINE" value="WINE-11.0" />
               <EnvStat label="ARCH" value="X86_64" />
               <EnvStat label="ESYNC" value="ON" active />
               <EnvStat label="MSYNC" value="ON" active />
            </div>
          </div>
          <div className="flex-1 bg-black p-8 flex flex-col overflow-hidden shadow-inner">
            <div className="flex justify-between items-center mb-6 shrink-0 text-zinc-700">
              <h3 className="text-[10px] font-black tracking-widest uppercase">System Output</h3>
              <button onClick={() => setLog([])} className="text-[9px] font-black hover:text-zinc-400 uppercase tracking-widest">Clear</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[9px] custom-scrollbar">
              {log.map((l, i) => <div key={i} className="text-zinc-500 border-l border-zinc-800 pl-4 py-0.5 leading-tight italic">{l}</div>)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EnvStat({ label, value, active = false }: { label: string, value: string, active?: boolean }) {
    return (
        <div className="flex justify-between items-center p-4 bg-black">
            <span className="text-[9px] font-black tracking-widest opacity-30 uppercase">{label}</span>
            <span className={`text-[9px] font-black px-2 py-0.5 ${active ? 'text-emerald-500' : 'text-zinc-500'}`}>{value}</span>
        </div>
    )
}

export default App;
