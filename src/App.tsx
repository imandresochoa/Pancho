import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
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

function App() {
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [selectedBottle, setSelectedBottle] = useState<Bottle | null>(null);
  const [installedApps, setInstalledApps] = useState<DetectedApp[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBottleName, setNewBottleName] = useState("");

  useEffect(() => {
    loadBottles();
  }, []);

  useEffect(() => {
    if (selectedBottle?.id) {
      handleScanApps();
    }
  }, [selectedBottle?.id]);

  const loadBottles = async () => {
    try {
      const list = await invoke<Bottle[]>("get_bottles");
      setBottles(list || []);
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
    } catch (e) {
      addToLog(`Error creating: ${e}`);
    }
  };

  const handleScanApps = async () => {
    if (!selectedBottle) return;
    setScanning(true);
    try {
      const apps = await invoke<DetectedApp[]>("scan_for_apps", { bottleId: selectedBottle.id });
      setInstalledApps(apps || []);
    } catch (e) {
      addToLog(`Scan error: ${e}`);
    } finally {
      setScanning(false);
    }
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

  // --- SAFE RENDERING LOGIC ---
  if (!selectedBottle) {
    return (
      <div className="h-screen w-screen bg-slate-950 text-white p-8 overflow-y-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-black tracking-tighter">YOUR BOTTLES</h1>
          <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 px-6 py-2 rounded-xl font-bold hover:bg-blue-500 transition-all">NEW BOTTLE</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {bottles.map(b => (
            <div key={b.id} onClick={() => setSelectedBottle(b)} className="p-8 bg-slate-900 border border-white/5 rounded-3xl hover:border-blue-500/50 cursor-pointer transition-all group">
              <Icons.Wine className="mb-4 text-slate-600 group-hover:text-blue-400 transition-colors" size={40} />
              <h3 className="text-2xl font-bold">{b.name}</h3>
              <p className="text-[10px] text-slate-500 mt-2 font-mono truncate">{b.path}</p>
            </div>
          ))}
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-50">
            <div className="bg-slate-900 border border-white/10 p-10 rounded-[2.5rem] w-full max-w-md space-y-6 shadow-2xl">
              <h2 className="text-2xl font-bold">New Bottle</h2>
              <input autoFocus value={newBottleName} onChange={e => setNewBottleName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateBottle()} placeholder="Name..." className="w-full bg-slate-800 border-white/5 p-4 rounded-2xl focus:ring-2 ring-blue-500 outline-none" />
              <div className="flex gap-3">
                <button onClick={() => setShowCreateModal(false)} className="flex-1 p-4 font-bold opacity-50">CANCEL</button>
                <button onClick={handleCreateBottle} className="flex-1 bg-blue-600 p-4 rounded-2xl font-bold">CREATE</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- BOTTLE DETAIL VIEW ---
  return (
    <div className="h-screen w-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      <header className="h-16 border-b border-white/5 flex items-center px-6 gap-4 shrink-0 bg-slate-900/50">
        <button onClick={() => setSelectedBottle(null)} className="p-2 hover:bg-slate-800 rounded-full"><Icons.ArrowLeft size={24} /></button>
        <h1 className="text-xl font-black uppercase tracking-tight">{selectedBottle.name}</h1>
        <div className="ml-auto flex gap-2">
          <button onClick={() => invoke("open_bottle_dir", { bottleId: selectedBottle.id })} className="bg-slate-800 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2"><Icons.FolderOpen size={14} /> FILES</button>
          <button onClick={handleScanApps} className={`bg-slate-800 p-2 rounded-lg ${scanning ? 'animate-spin' : ''}`}><Icons.RefreshCw size={18} /></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        <div className="flex-1 overflow-y-auto space-y-8 pr-2">
          {/* Main App Grid */}
          <section className="space-y-4">
            <h2 className="text-[10px] font-black text-slate-500 tracking-widest uppercase">Detected Applications</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {installedApps.length > 0 ? installedApps.map((app, i) => (
                <div key={i} className="bg-slate-900 border border-white/5 p-6 rounded-3xl flex items-center justify-between group hover:border-blue-500/30 transition-all">
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="p-3 bg-slate-800 rounded-2xl text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all"><Icons.Box size={24} /></div>
                    <div className="overflow-hidden">
                      <p className="font-bold text-lg truncate">{app.name}</p>
                      <p className="text-[10px] text-slate-500 truncate font-mono">{app.exe_path.split('/').pop()}</p>
                    </div>
                  </div>
                  <button onClick={() => handleRun(app.exe_path)} className="p-4 bg-blue-600 rounded-2xl hover:scale-110 active:scale-95 transition-all shadow-lg shadow-blue-600/20"><Icons.Play size={20} fill="currentColor" /></button>
                </div>
              )) : (
                <div className="col-span-full border-2 border-dashed border-white/5 py-20 rounded-3xl text-center text-slate-600">
                  <p className="italic">No apps found yet. Use the button below to install something.</p>
                </div>
              )}
            </div>
          </section>

          {/* Installer Section */}
          <section className="space-y-4">
            <h2 className="text-[10px] font-black text-slate-500 tracking-widest uppercase">Setup</h2>
            <button 
              onClick={async () => {
                const selected = await open({ multiple: false, filters: [{ name: 'EXE', extensions: ['exe'] }] });
                if (selected && typeof selected === 'string') handleRun(selected);
              }}
              className="w-full border-2 border-dashed border-white/10 p-12 rounded-[2rem] hover:bg-blue-600/5 hover:border-blue-500/20 transition-all text-center flex flex-col items-center gap-3"
            >
              <Icons.Plus className="text-blue-500" size={32} />
              <span className="font-bold opacity-60">RUN NEW INSTALLER (.EXE)</span>
            </button> section
          </section>
        </div>

        {/* Sidebar */}
        <aside className="w-80 flex flex-col gap-6 shrink-0">
          <div className="p-6 bg-slate-900 rounded-[2rem] border border-white/5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-[10px] font-black text-slate-500 tracking-widest">ENVIRONMENT</h3>
              <button 
                onClick={() => invoke("install_dx_runtime", { bottleId: selectedBottle.id })}
                className="text-[9px] bg-blue-600/20 text-blue-400 px-2 py-1 rounded font-black hover:bg-blue-600/40 transition-all"
              >
                FIX GRAPHICS
              </button>
            </div>
            <div className="space-y-2 text-[11px] font-bold">
              <div className="flex justify-between"><span>ESYNC</span><span className="text-emerald-500">ACTIVE</span></div>
              <div className="flex justify-between"><span>D3DMETAL</span><span className="text-emerald-500">ACTIVE</span></div>
              <div className="flex justify-between"><span>LOGS</span><span className="text-slate-500">OFF</span></div>
            </div>
          </div>

          <div className="flex-1 bg-black/40 rounded-[2rem] border border-white/5 p-6 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[10px] font-black text-slate-600 tracking-widest uppercase">Activity</h3>
              <button onClick={() => setLog([])} className="text-[9px] font-black opacity-30 hover:opacity-100">CLEAR</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[10px]">
              {log.map((l, i) => <div key={i} className="text-emerald-500/70 border-l border-emerald-500/20 pl-2 leading-tight">{l}</div>)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
