import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RunnerSelector, WineRunner } from "@/components/RunnerSelector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import * as Icons from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface BottleTemplate {
    id: string;
    name: string;
    description: string;
    recommended_runner: 'Standard' | 'GPTK' | 'WhiskyGPTK' | null;
}

interface BottleWizardProps {
    onComplete: () => void;
    onCancel: () => void;
}

export function BottleWizard({ onComplete, onCancel }: BottleWizardProps) {
    const [step, setStep] = useState(1);
    const [name, setName] = useState("");
    const [selectedRunner, setSelectedRunner] = useState<WineRunner | null>(null);
    const [templates, setTemplates] = useState<BottleTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<BottleTemplate | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [status, setStatus] = useState("");

    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        try {
            const temps = await invoke<BottleTemplate[]>("get_bottle_templates");
            setTemplates(temps);
            // Default to Steam template
            if (temps.length > 0) setSelectedTemplate(temps[0]);
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreate = async () => {
        if (!name || !selectedRunner || !selectedTemplate) return;
        setIsCreating(true);
        setStatus("Initializing Bottle...");

        try {
            // 1. Create Bottle
            const bottle = await invoke<any>("create_bottle", { 
                name, 
                environmentType: selectedTemplate.id === 'steam_gaming' ? 'pro' : 'classic' 
            });
            setStatus("Setting up Engine...");

            // 2. Set Engine
            await invoke("set_bottle_engine", { 
                bottleId: bottle.id, 
                enginePath: selectedRunner.path 
            });

            // 3. Initialize (boot wine)
            setStatus("Booting Wine...");
            await invoke("initialize_pro_bottle", { bottleId: bottle.id });

            // 4. Install Dependencies & Registry
            // If template is Steam, run the installer
            if (selectedTemplate.id === 'steam_gaming') {
                setStatus("Downloading & Installing Steam...");
                await invoke("install_steam", { bottleId: bottle.id });
            }

            // 5. Apply Registry/DLL Overrides (General)
            // Note: The Steam installer command (M9) already applies Steam-specific registry keys.
            // Future: Call a generic apply_template command here for other templates.
            if (selectedTemplate.id !== 'steam_gaming') {
                 // For now, non-Steam templates just get basic init
            }

            setStatus("Complete!");
            setTimeout(() => {
                onComplete();
            }, 1000);

        } catch (err) {
            setStatus(`Error: ${err}`);
            setIsCreating(false);
        }
    };

    if (isCreating) {
        return (
            <div className="flex flex-col items-center justify-center space-y-8 py-10">
                 <div className="relative">
                  <div className="w-24 h-24 border-2 border-emerald-500/20 rounded-full animate-ping absolute inset-0" />
                  <div className="w-24 h-24 border-t-2 border-emerald-500 rounded-full animate-spin relative z-10" />
                  <Icons.Zap className="absolute inset-0 m-auto text-emerald-500 animate-pulse" size={32} />
                </div>
                <div className="text-center space-y-4">
                  <h3 className="text-2xl font-black uppercase tracking-tighter italic text-white animate-pulse">
                    {status}
                  </h3>
                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.5em]">Please Wait</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <h2 className="text-2xl font-black uppercase tracking-tight">Create Bottle</h2>
                <div className="flex gap-2">
                    {[1, 2, 3].map(s => (
                        <div key={s} className={`h-1 w-8 ${step >= s ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
                    ))}
                </div>
            </div>

            {step === 1 && (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Bottle Name</label>
                        <input 
                            autoFocus 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && name && setStep(2)}
                            placeholder="My Gaming Bottle" 
                            className="w-full bg-black border border-white/10 p-6 outline-none focus:border-white font-bold tracking-widest uppercase text-lg" 
                        />
                    </div>
                    <div className="flex gap-px">
                        <Button variant="secondary" onClick={onCancel} className="flex-1 rounded-none h-14 font-black uppercase">Cancel</Button>
                        <Button 
                            onClick={() => setStep(2)} 
                            disabled={!name}
                            className="flex-1 rounded-none h-14 font-black uppercase bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-6">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Select Template</label>
                        <div className="grid gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {templates.map(t => (
                                <Card 
                                    key={t.id}
                                    onClick={() => setSelectedTemplate(t)}
                                    className={`p-6 cursor-pointer transition-all border rounded-none ${selectedTemplate?.id === t.id ? 'bg-white text-black border-white' : 'bg-black border-white/10 hover:border-white/40 text-white'}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-black uppercase tracking-tight">{t.name}</h3>
                                                {t.id === 'steam_gaming' && <Badge className="bg-emerald-500 text-black border-none text-[8px]">RECOMMENDED</Badge>}
                                            </div>
                                            <p className={`text-[10px] mt-2 font-bold uppercase tracking-tight ${selectedTemplate?.id === t.id ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                                {t.description}
                                            </p>
                                        </div>
                                        {t.id === 'steam_gaming' && <Icons.Gamepad2 className={selectedTemplate?.id === t.id ? 'text-black' : 'text-emerald-500'} />}
                                        {t.id === 'standard_gaming' && <Icons.Joystick className={selectedTemplate?.id === t.id ? 'text-black' : 'text-zinc-500'} />}
                                        {t.id === 'application' && <Icons.AppWindow className={selectedTemplate?.id === t.id ? 'text-black' : 'text-blue-500'} />}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-px">
                        <Button variant="secondary" onClick={() => setStep(1)} className="flex-1 rounded-none h-14 font-black uppercase">Back</Button>
                        <Button onClick={() => setStep(3)} className="flex-1 rounded-none h-14 font-black uppercase bg-white text-black hover:bg-zinc-200">Next</Button>
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <div className="bg-black/20 border border-white/5 p-1 rounded-lg">
                            <RunnerSelector 
                                onSelect={setSelectedRunner} 
                                selectedPath={selectedRunner?.path} 
                            />
                        </div>
                    </div>
                    <div className="flex gap-px">
                        <Button variant="secondary" onClick={() => setStep(2)} className="flex-1 rounded-none h-14 font-black uppercase">Back</Button>
                        <Button 
                            onClick={handleCreate} 
                            disabled={!selectedRunner}
                            className="flex-[2] rounded-none h-14 font-black uppercase bg-emerald-600 hover:bg-emerald-500 text-white italic"
                        >
                            Launch {selectedTemplate?.name}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
