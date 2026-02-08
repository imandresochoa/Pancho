import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as Icons from "lucide-react";

interface Bottle {
  id: string;
  name: string;
  path: string;
  created_at: number;
  pinned_apps?: DetectedApp[];
  cover: string;
  engine_path?: string;
}

interface DetectedApp {
  name: string;
  exe_path: string;
  is_priority: boolean;
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
  "steam": "/covers/steam-cover.jpeg",
  "default": "/covers/cover02.png"
};

const glassyStyle = {
  background: "linear-gradient(135deg, #222222 0%, #000000 100%)",
  boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.05), 0 20px 40px rgba(0,0,0,0.4)",
  border: "1px solid #333333"
};

function App() {
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [selectedBottle, setSelectedBottle] = useState<Bottle | null>(null);
  const [installedApps, setInstalledApps] = useState<DetectedApp[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBottleName, setNewBottleName] = useState("");
  const [activeTab, setActiveTab] = useState<"library" | "browse">("library");
  
  // Engine & Onboarding State
  const [hasProEngine, setHasProEngine] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [isTaskPanelMinimized, setIsTaskPanelMinimized] = useState(false);
  const [verificationError, setVerificationError] = useState("");

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
    };
  }, []);

  useEffect(() => {
    if (selectedBottle) {
      handleScanApps();
      refreshBottleDetails();
      setActiveTab("library");
    } else {
      checkEngine();
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

  const removeTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));

  const checkEngine = async (): Promise<boolean> => {
    try {
      const status = await invoke<boolean>("check_engine_status");
      setHasProEngine(status);
      return status;
    } catch (e) { 
      console.error(e);
      return false;
    }
  };

  const startAutomatedDeployment = async () => {
    setIsOnboarding(false);
    setIsTaskPanelMinimized(false);
    updateTask('engine-setup', 'Initializing download...');
    try {
      await invoke("download_engine");
    } catch (e) {
      updateTask('engine-setup', `Trigger Error: ${e}`);
    }
  };

  const openEngineDir = async () => {
      await invoke("run_shell_command", { 
          command: "open \"$HOME/Library/Application Support/com.andresochoa.tauri-app/engines/\"",
          description: "Opening engine directory"
      });
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

  const handleSetEngine = async () => {
    if (!selectedBottle) return;
    try {
      const selected = await open({ multiple: false, title: "Select Wine/Engine Binary" });
      if (selected && typeof selected === 'string') {
        await invoke("set_bottle_engine", { bottleId: selectedBottle.id, enginePath: selected });
        addToLog(`Engine set to: ${selected}`);
        refreshBottleDetails();
      }
    } catch (e) { addToLog(`Error: ${e}`); }
  };

  const handleResetEngine = async () => {
    if (!selectedBottle) return;
    try {
      await invoke("reset_bottle_engine", { bottleId: selectedBottle.id });
      addToLog("Engine reset to default.");
      refreshBottleDetails();
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

  const addToLog = (msg: string) => setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const getAsset = (name: string) => {
    const n = name.toLowerCase();
    if (n === "steam") return APP_ASSETS.steam;
    return APP_ASSETS.default;
  };

  const pinnedList = selectedBottle?.pinned_apps || [];
  const priorityApps = [...pinnedList, ...installedApps.filter(a => a.is_priority && !pinnedList.some(p => p.exe_path === a.exe_path))];
  const regularApps = installedApps.filter(a => !a.is_priority && !pinnedList.some(p => p.exe_path === a.exe_path));

  const isDeploying = tasks.some(t => t.id === 'engine-setup' && !t.isComplete && !t.hasError);

  // --- RENDERING ---

  if (isOnboarding) {
    return (
      <div className="h-screen w-screen bg-black text-white flex flex-col items-center justify-center p-12 overflow-hidden font-sans">
        <div className="w-full max-w-4xl space-y-12">
          <header className="flex justify-between items-center border-b border-white/10 pb-8">
            <div className="flex items-center gap-4"><img src="/logo_pancho.svg" alt="Logo" className="h-12 w-auto" /></div>
            <button onClick={() => setIsOnboarding(false)} className="p-2 text-zinc-500 hover:text-white transition-colors"><Icons.X size={32} /></button>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
            <div className="md:col-span-4 space-y-12">
               <div className="space-y-4"><h2 className="text-[10px] font-black text-emerald-500 tracking-[0.5em] uppercase">Core Activation</h2><h1 className="text-4xl font-black uppercase tracking-tight leading-none">Pancho-Core Unified Engine</h1></div>
               <div className="space-y-4">{[{ s: 1, t: "Acquisition", d: "Obtain official Apple binaries" }, { s: 2, t: "Integration", d: "Inject Core into Pancho" }, { s: 3, t: "Optimization", d: "Verify Metal 3 hardware" }].map(step => (
                    <div key={step.s} className={`flex items-center gap-6 p-4 border transition-all ${onboardingStep === step.s ? 'bg-white/5 border-white/20' : 'border-transparent opacity-30'}`}><span className="text-2xl font-black font-mono leading-none">{step.s}</span><div><p className="text-[10px] font-black uppercase tracking-widest">{step.t}</p><p className="text-[9px] text-zinc-500 font-medium uppercase tracking-tighter">{step.d}</p></div></div>
                  ))}</div>
            </div>
            <div className="md:col-span-8 bg-zinc-900 border border-white/5 p-12 space-y-10 min-h-[500px] flex flex-col">
               {onboardingStep === 1 && (
                 <div className="space-y-10 flex-1"><div className="space-y-4"><h3 className="text-2xl font-black uppercase tracking-tight">Step 1: Obtain the "Magic Sauce"</h3><p className="text-zinc-400 text-sm leading-relaxed max-w-lg">To match CrossOver performance, we must use Apple's official <span className="text-white">Game Porting Toolkit 2</span>.</p></div>
                    <div className="grid gap-4"><a href="https://developer.apple.com/games/game-porting-toolkit/" target="_blank" className="w-full bg-white text-black p-8 font-black text-xs uppercase tracking-[0.2em] hover:bg-zinc-200 flex items-center justify-center gap-4 transition-all shadow-xl shadow-white/5"><Icons.Apple size={20} /> Official Apple GPTK Page</a>
                       <div className="flex items-center gap-4"><div className="flex-1 h-px bg-white/10"></div><span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Or use our verified mirror</span><div className="flex-1 h-px bg-white/10"></div></div>
                       <button onClick={startAutomatedDeployment} className="w-full border border-emerald-500/30 text-emerald-500 p-6 font-black text-xs uppercase tracking-[0.2em] hover:bg-emerald-500 hover:text-white transition-all">Deploy Optimized Pancho-Core (v23.7.1)</button></div>
                    <div className="mt-auto pt-8 border-t border-white/5"><button onClick={() => setOnboardingStep(2)} className="text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-[0.2em] transition-colors flex items-center gap-2 italic">I have the binaries ready <Icons.ArrowRight size={14} /></button></div></div>
               )}
               {onboardingStep === 2 && (
                 <div className="space-y-10 flex-1"><div className="space-y-4"><h3 className="text-2xl font-black uppercase tracking-tight">Deployment Location</h3><p className="text-zinc-400 text-sm leading-relaxed">Extract the archive contents into a new folder named <code className="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5">pancho-pro-v1</code> within the directory below.</p></div>
                    <div className="grid gap-6"><button onClick={openEngineDir} className="w-full bg-black border-2 border-white/10 hover:border-white p-8 flex items-center gap-8 transition-all group"><div className="p-4 bg-zinc-900 border border-white/5 group-hover:border-emerald-500 transition-colors"><Icons.FolderOpen className="text-zinc-500 group-hover:text-emerald-500" size={32} /></div><div className="text-left overflow-hidden"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Deployment Directory</p><p className="text-[9px] font-mono text-zinc-400 truncate italic">~/Library/Application Support/com.andresochoa.tauri-app/engines/</p></div></button></div>
                    <div className="mt-auto pt-8 border-t border-white/5 flex gap-4"><button onClick={() => setOnboardingStep(1)} className="px-8 py-4 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/5">Back</button><button onClick={() => { setOnboardingStep(3); setVerificationError(""); }} className="flex-1 bg-white text-black p-4 font-black text-xs uppercase tracking-widest hover:bg-zinc-200">Binaries are in place</button></div></div>
               )}
               {onboardingStep === 3 && (
                 <div className="space-y-10 flex-1 flex flex-col items-center justify-center text-center"><div className="w-24 h-24 border-2 border-emerald-500 flex items-center justify-center bg-emerald-500/10 mb-4"><Icons.ShieldCheck className="text-emerald-500" size={48} /></div>
                    <div className="space-y-4 max-w-sm"><h3 className="text-2xl font-black uppercase tracking-tight">System Activation</h3><p className="text-zinc-400 text-sm leading-relaxed">Pancho will now perform a final verification.</p></div>
                    {verificationError && <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-widest">{verificationError}</div>}
                    <div className="w-full pt-12 space-y-4"><button onClick={async () => {
                           const success = await checkEngine();
                           if (success) setIsOnboarding(false);
                           else setVerificationError("Engine not detected. Ensure structure: engines/pancho-pro-v1/bin/wine");
                       }} className="w-full bg-emerald-600 text-white p-6 font-black text-xs uppercase tracking-[0.2em] hover:bg-emerald-500 transition-all">Verify and Finish</button>
                       <button onClick={() => setOnboardingStep(2)} className="text-[10px] font-black text-zinc-600 hover:text-white uppercase tracking-widest transition-colors italic">Something went wrong? Re-check folder</button></div></div>
               )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden font-sans border-t-2 border-white">
      {!selectedBottle ? (
        /* HOME VIEW */
        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
          <div className="flex justify-between items-center mb-16 border-b border-white/10 pb-8">
            <div className="flex items-center gap-4"><img src="/logo_pancho.svg" alt="Logo" className="h-16 w-auto" /></div>
            <div className="flex gap-4">
              {!isDeploying && (
                <button 
                  onClick={() => { setIsOnboarding(true); setOnboardingStep(1); }} 
                  className={`${hasProEngine ? 'border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500 hover:text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'} px-8 py-3 font-black transition-all text-xs tracking-widest uppercase flex items-center gap-3`}
                >
                  {hasProEngine ? <Icons.RefreshCw size={16} /> : <Icons.Zap size={16} />}
                  {hasProEngine ? "Update Engine" : "Deploy Pro Engine"}
                </button>
              )}
              <button onClick={() => setShowCreateModal(true)} className="bg-white text-black px-8 py-3 font-black hover:bg-zinc-200 transition-all text-xs tracking-widest uppercase">New Bottle</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-8">
            {bottles.map(b => (
              <div key={b.id} onClick={() => setSelectedBottle(b)} style={glassyStyle} className="group relative aspect-[2/3] overflow-hidden cursor-pointer hover:border-white hover:scale-[1.02] transition-all duration-300 will-change-transform">
                <img src={b.cover || APP_ASSETS.default} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" /><div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/5 to-transparent opacity-50" /><div className="absolute inset-0 p-8 flex flex-col justify-end"><div className="space-y-2 group-hover:translate-y-[-8px] transition-transform duration-300"><h3 className="text-2xl font-black tracking-tighter leading-tight uppercase">{b.name}</h3><p className="text-[9px] text-zinc-500 font-mono truncate uppercase tracking-widest opacity-50">{b.id}</p></div><div className="mt-6 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-300"><span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Open Bottle</span><div className="bg-white text-black p-3"><Icons.ArrowRight size={20} fill="currentColor" /></div></div></div>
                <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 duration-300"><button onClick={(e) => { e.stopPropagation(); setSettingsTarget(b); setEditName(b.name); setEditCover(b.cover); }} className="p-3 text-white bg-black/80 border border-white/20 hover:bg-white hover:text-black transition-colors shadow-xl"><Icons.Settings size={18} /></button></div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* BOTTLE VIEW */
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-16 border-b border-white/10 flex items-center px-6 gap-8 shrink-0 bg-zinc-950 backdrop-blur-md"><button onClick={() => setSelectedBottle(null)} className="p-2 hover:bg-zinc-800 transition-colors"><Icons.ArrowLeft size={24} /></button><img src="/logo_pancho.svg" alt="Logo" className="h-6 w-auto" /><nav className="flex gap-px bg-white/5 p-px border border-white/10"><button onClick={() => setActiveTab("library")} className={`px-6 py-2 text-[10px] font-black transition-all uppercase tracking-widest ${activeTab === 'library' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}>Library</button><button onClick={() => setActiveTab("browse")} className={`px-6 py-2 text-[10px] font-black transition-all uppercase tracking-widest ${activeTab === 'browse' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}>Browse</button></nav><div className="ml-auto flex gap-2"><button onClick={() => invoke("open_bottle_dir", { bottleId: selectedBottle.id })} className="bg-zinc-900 hover:bg-zinc-800 px-6 py-2 text-[10px] font-black flex items-center gap-3 transition-colors uppercase tracking-widest border-r border-white/10"><Icons.FolderOpen size={14} /> Files</button><button onClick={handleScanApps} className={`bg-zinc-900 hover:bg-zinc-800 px-4 py-2 transition-colors ${scanning ? 'animate-spin' : ''}`}><Icons.RefreshCw size={18} /></button></div></header>
          <div className="flex-1 flex overflow-hidden"><div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-zinc-950">{activeTab === "library" ? (<div className="space-y-10 pb-10"><section className="space-y-6"><div className="flex items-center justify-between"><h2 className="text-[10px] font-black text-zinc-500 tracking-[0.4em] uppercase">Game Collection</h2><button onClick={() => open({ multiple: false, filters: [{ name: 'EXE', extensions: ['exe'] }] }).then(s => s && typeof s === 'string' && handlePinApp({ name: s.split('/').pop()?.replace('.exe', '') || "App", exe_path: s, is_priority: false }))} className="text-[9px] font-black text-slate-500 hover:text-white flex items-center gap-1 uppercase tracking-widest transition-colors">+ Pin Custom .EXE</button></div><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-8">{priorityApps.map((app, i) => (<div key={i} style={glassyStyle} className="group relative aspect-[2/3] overflow-hidden cursor-pointer hover:border-white hover:scale-[1.02] transition-all duration-300 bg-zinc-900 will-change-transform" onClick={() => handleRun(app.exe_path)}><img src={getAsset(app.name)} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" onError={(e) => { (e.target as HTMLImageElement).src = APP_ASSETS.default; }} /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" /><div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/5 to-transparent opacity-50" /><div className="absolute inset-0 p-6 flex flex-col justify-end"><div className="space-y-1 group-hover:translate-y-[-8px] transition-transform duration-300"><p className="text-xl font-black tracking-tighter leading-tight break-words uppercase">{app.name}</p><div className="flex items-center gap-2"><span className="text-[8px] font-black bg-emerald-500 text-white px-1.5 py-0.5 uppercase tracking-widest">Active</span></div></div><div className="mt-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-300"><span className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">Launch Now</span><div className="bg-white text-black p-2"><Icons.PlayCircle className="w-6 h-6" fill="currentColor" /></div></div></div><button onClick={(e) => { e.stopPropagation(); handleUnpinApp(app.exe_path); }} className="absolute top-4 right-4 p-2 bg-black/80 border border-white/20 text-white hover:bg-red-500 transition-all opacity-0 group-hover:opacity-100 shadow-xl"><Icons.StarOff size={14} /></button></div>))}<div onClick={() => open({ multiple: false, filters: [{ name: 'EXE', extensions: ['exe'] }] }).then(s => s && typeof s === 'string' && handleRun(s))} style={glassyStyle} className="group relative aspect-[2/3] hover:border-white transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-6 bg-zinc-900/40 shadow-2xl"><div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/5 to-transparent opacity-50" /><div className="p-6 border border-white/10 group-hover:border-white transition-colors bg-black shadow-xl"><Icons.Plus className="text-zinc-500 group-hover:text-white" size={32} /></div><p className="font-black text-[10px] uppercase tracking-widest text-zinc-500 group-hover:text-white">Install New</p></div></div></section></div>) : (<div className="space-y-6 pb-10"><h2 className="text-[10px] font-black text-zinc-500 tracking-[0.4em] uppercase border-b border-white/10 pb-4">Internal File Browser</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-white/5 border border-white/10 shadow-2xl">{regularApps.map((app, i) => (<div key={i} className="p-6 bg-black border border-white/5 flex items-center justify-between group hover:bg-zinc-900 transition-all"><div className="flex items-center gap-6 overflow-hidden"><div className="p-2 bg-zinc-900 text-zinc-500 group-hover:text-white transition-colors"><Icons.Box size={20} /></div><div className="overflow-hidden"><p className="font-bold text-sm truncate">{app.name}</p><p className="text-[9px] text-zinc-600 truncate font-mono opacity-40">{app.exe_path.split('/').pop()}</p></div></div><div className="flex items-center gap-px bg-white/10"><button onClick={() => handlePinApp(app)} className="p-4 text-zinc-200 bg-black/40 hover:bg-white hover:text-black transition-all border-r border-white/5"><Icons.Star size={14} /></button><button onClick={() => handleRun(app.exe_path)} className="p-4 bg-black/40 text-zinc-400 hover:text-white hover:bg-blue-600 transition-all"><Icons.Play size={16} fill="currentColor" /></button></div></div>))}</div></div>)}</div>
            <aside className="w-80 flex flex-col gap-px shrink-0 border-l border-white/10 bg-zinc-900/20 shadow-2xl"><div className="p-8 border-b border-white/10 bg-black/40 space-y-8"><div className="flex justify-between items-center"><h3 className="text-[10px] font-black text-zinc-500 tracking-[0.5em] uppercase">Environment</h3><button onClick={handleRepairDX} className="text-[9px] px-4 py-1 font-black transition-all border border-white/20 text-white hover:bg-white hover:text-black">REPAIR DX</button></div>            <div className="space-y-px bg-white/5 border border-white/10"><EnvStat label="ENGINE" value={selectedBottle.engine_path ? (selectedBottle.engine_path.includes("pancho-pro") ? "PRO" : "CUSTOM") : (hasProEngine ? "PRO (DEFAULT)" : "STABLE")} />
               <div className="relative group/engine">
                 <button onClick={handleSetEngine} className="w-full text-left p-6 bg-black hover:bg-white/5 transition-all group border-b border-white/10"><div className="flex justify-between items-center mb-2"><span className="text-[10px] font-black tracking-[0.2em] text-zinc-500 group-hover:text-white uppercase">Change Engine</span><Icons.Cpu className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 transition-colors" /></div><div className="bg-zinc-900/50 p-3 border border-white/5 group-hover:border-blue-500/30 transition-colors"><p className="text-[9px] text-zinc-400 truncate font-mono uppercase tracking-widest leading-none">{selectedBottle.engine_path ? selectedBottle.engine_path.split('/').pop() : (hasProEngine ? "PANCHO-PRO-V1" : "SYSTEM WINE")}</p></div></button>
                 {selectedBottle.engine_path && (
                   <button 
                     onClick={(e) => { e.stopPropagation(); handleResetEngine(); }}
                     className="absolute top-2 right-2 p-1.5 bg-zinc-900 border border-white/10 text-[8px] font-black text-zinc-500 hover:text-white hover:border-white transition-all uppercase tracking-tighter"
                     title="Restore Default Engine"
                   >
                     Restore Default
                   </button>
                 )}
               </div>
               <EnvStat label="ESYNC" value="ON" active /><EnvStat label="MSYNC" value="ON" active /></div></div><div className="flex-1 bg-black p-8 flex flex-col overflow-hidden shadow-inner"><div className="flex justify-between items-center mb-6 shrink-0 text-zinc-700"><h3 className="text-[10px] font-black tracking-widest uppercase">Output</h3><button onClick={() => setLog([])} className="text-[9px] font-black hover:text-zinc-400 uppercase tracking-widest opacity-20">Clear</button></div><div className="flex-1 overflow-y-auto space-y-2 font-mono text-[9px] custom-scrollbar">{log.map((l, i) => <div key={i} className="text-zinc-500 border-l border-zinc-800 pl-4 py-0.5 leading-tight italic">{l}</div>)}</div></div></aside></div></div>
      )}

      {/* Task Manager Overlay */}
      <div className={`fixed bottom-8 right-8 z-[300] transition-all duration-500 ${isTaskPanelMinimized ? 'translate-y-[calc(100%-48px)]' : ''}`}>{tasks.length > 0 && (<div style={glassyStyle} className="w-80 bg-zinc-900 border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.8)]"><header className="bg-zinc-800/50 p-4 flex justify-between items-center border-b border-white/10"><div className="flex items-center gap-3"><div className="relative"><Icons.Activity className="text-emerald-500 animate-pulse" size={16} />{tasks.length > 1 && <span className="absolute -top-2 -right-2 bg-emerald-500 text-black text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center">{tasks.length}</span>}</div><h4 className="text-[10px] font-black uppercase tracking-widest">Active Processes</h4></div><button onClick={() => setIsTaskPanelMinimized(!isTaskPanelMinimized)} className="p-1 hover:bg-white/10 transition-colors">{isTaskPanelMinimized ? <Icons.ChevronUp size={16} /> : <Icons.ChevronDown size={16} />}</button></header><div className="p-6 space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar">{tasks.map(task => (<div key={task.id} className={`space-y-3 ${task.isComplete ? 'opacity-50' : ''}`}><div className="flex justify-between items-start"><div className="space-y-1"><p className="text-[10px] font-black uppercase tracking-widest">{task.title}</p><p className={`text-[9px] font-mono leading-tight ${task.hasError ? 'text-red-400' : 'text-zinc-500'}`}>{task.status}</p></div><div className="flex gap-1">{task.isComplete || task.hasError ? (<button onClick={() => removeTask(task.id)} className="p-1 text-zinc-600 hover:text-white transition-colors"><Icons.X size={14} /></button>) : (<Icons.Loader2 className="animate-spin text-zinc-600" size={14} />)}</div></div>{!task.isComplete && !task.hasError && (<div className="h-0.5 w-full bg-zinc-800 overflow-hidden"><div className="h-full bg-emerald-500 animate-progress-indeterminate origin-left" /></div>)}</div>))}</div></div>)}</div>

      {/* Shared Modals */}
      {showCreateModal && (<div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center p-6 z-[400]"><div className="bg-zinc-900 border border-white/10 p-12 w-full max-md shadow-2xl"><h2 className="text-3xl font-black uppercase tracking-tight">Create Bottle</h2><input autoFocus value={newBottleName} onChange={e => setNewBottleName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateBottle()} placeholder="NAME..." className="w-full bg-black border border-white/10 p-5 outline-none focus:border-white font-bold tracking-widest" /><div className="flex gap-px bg-white/10 border border-white/10"><button onClick={() => setShowCreateModal(false)} className="flex-1 p-4 font-black text-xs opacity-50 uppercase tracking-widest hover:bg-white/5">Cancel</button><button onClick={handleCreateBottle} className="flex-1 bg-white text-black p-4 font-black text-xs uppercase tracking-widest hover:bg-zinc-200">Create</button></div></div></div>)}
      {settingsTarget && (<div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center p-6 z-[400] overflow-y-auto"><div className="bg-zinc-900 border border-white/10 p-12 w-full max-w-2xl shadow-2xl my-auto"><div className="flex justify-between items-start"><div><h2 className="text-3xl font-black uppercase tracking-tight">Bottle Settings</h2><p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mt-2">{settingsTarget.id}</p></div><button onClick={() => setSettingsTarget(null)} className="p-2 text-zinc-500 hover:text-white"><Icons.X size={24} /></button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-12"><div className="space-y-6"><div style={glassyStyle} className="aspect-[2/3] w-full relative overflow-hidden"><img src={editCover || APP_ASSETS.default} className="absolute inset-0 w-full h-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" /><div className="absolute inset-0 p-6 flex flex-col justify-end"><p className="text-xl font-black uppercase tracking-tight truncate">{editName}</p></div></div><button onClick={() => setEditCover("")} className="w-full p-4 text-[10px] font-black uppercase tracking-widest bg-black border border-white/10 hover:text-red-500 transition-colors">Clear Thumbnail</button></div><div className="space-y-8"><div className="space-y-3"><label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Display Name</label><input value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-black border border-white/10 p-5 outline-none focus:border-white font-bold tracking-widest" /></div><div className="space-y-3"><label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Custom Thumbnail URL</label><input value={editCover} onChange={e => setEditCover(e.target.value)} placeholder="https://..." className="w-full bg-black border border-white/10 p-5 outline-none focus:border-white font-bold tracking-widest text-[10px]" /></div><div className="pt-8 border-t border-white/5 space-y-4"><button onClick={handleSaveSettings} className="w-full bg-white text-black p-5 font-black text-xs uppercase tracking-widest hover:bg-zinc-200">Save Changes</button><button onClick={() => handleDeleteBottle(settingsTarget.id)} className="w-full p-5 font-black text-xs uppercase tracking-widest text-red-500 hover:bg-red-500/10 border border-red-500/20 transition-colors">Delete Bottle</button></div></div></div></div></div>)}
    </div>
  );
}

function EnvStat({ label, value, active = false }: { label: string, value: string, active?: boolean }) {
    return (
        <div className="flex justify-between items-center p-4 bg-black">
            <span className="text-[10px] font-black tracking-widest opacity-30 uppercase">{label}</span>
            <span className={`text-[10px] font-black tracking-widest ${active ? 'text-emerald-500' : 'text-zinc-500'}`}>{value}</span>
        </div>
    )
}

export default App;
