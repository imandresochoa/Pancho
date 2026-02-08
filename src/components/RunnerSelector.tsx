import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Wine, Zap, ShieldCheck, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WineRunner {
  runner_type: 'Standard' | 'GPTK' | 'WhiskyGPTK';
  path: string;
  version: string;
  supports_d3dmetal: boolean;
  supports_esync: boolean;
}

interface RunnerSelectorProps {
  onSelect: (runner: WineRunner) => void;
  selectedPath?: string;
}

export function RunnerSelector({ onSelect, selectedPath }: RunnerSelectorProps) {
  const [runners, setRunners] = useState<WineRunner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectRunners();
  }, []);

  const detectRunners = async () => {
    setLoading(true);
    try {
      const detected = await invoke<WineRunner[]>("get_wine_runners");
      setRunners(detected);
      
      // Auto-select priority runner if none selected
      if (!selectedPath && detected.length > 0) {
        const priority = detected.find(r => r.runner_type === 'GPTK') || 
                         detected.find(r => r.runner_type === 'WhiskyGPTK') || 
                         detected[0];
        onSelect(priority);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Detecting Wine Environments...</p>
      </div>
    );
  }

  if (runners.length === 0) {
    return (
      <Alert variant="destructive" className="bg-red-500/10 border-red-500/20 text-red-500">
        <Info className="h-4 w-4" />
        <AlertTitle className="font-black uppercase tracking-tight">No Wine Runners Found</AlertTitle>
        <AlertDescription className="text-xs mt-2 space-y-4">
          <p>Pancho requires a Wine or Game Porting Toolkit installation to run games.</p>
          <div className="bg-black/50 p-4 border border-red-500/10 font-mono text-[10px] break-all">
            brew install --cask whisky-wine
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={detectRunners}
            className="w-full mt-2 border-red-500/20 hover:bg-red-500 hover:text-white font-black uppercase text-[9px]"
          >
            Retry Detection
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Wine Engine</Label>
        <Badge variant="outline" className="text-[8px] font-black border-white/10 text-zinc-500 uppercase">
          {runners.length} Detected
        </Badge>
      </div>

      <RadioGroup 
        value={selectedPath} 
        onValueChange={(val) => {
          const runner = runners.find(r => r.path === val);
          if (runner) onSelect(runner);
        }}
        className="grid gap-2"
      >
        {runners.map((runner) => (
          <div key={runner.path}>
            <RadioGroupItem
              value={runner.path}
              id={runner.path}
              className="peer sr-only"
            />
            <Label
              htmlFor={runner.path}
              className="flex items-center justify-between rounded-none border border-white/10 bg-black p-4 hover:bg-zinc-900 peer-data-[state=checked]:border-white peer-data-[state=checked]:bg-zinc-900 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-full ${runner.runner_type === 'Standard' ? 'bg-zinc-800' : 'bg-emerald-500/10'}`}>
                  <Wine size={16} className={runner.runner_type === 'Standard' ? 'text-zinc-500' : 'text-emerald-500'} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black uppercase tracking-tight">{runner.runner_type}</p>
                    {runner.runner_type === 'GPTK' && (
                      <Badge className="bg-emerald-500 text-black text-[7px] font-black uppercase px-1 py-0 h-3">Recommended</Badge>
                    )}
                  </div>
                  <p className="text-[9px] text-zinc-500 font-mono truncate max-w-[200px]">{runner.version}</p>
                </div>
              </div>
              
              <div className="flex gap-1">
                {runner.supports_d3dmetal && (
                  <div className="p-1 bg-blue-500/10 rounded" title="D3DMetal Support">
                    <Zap size={12} className="text-blue-500" />
                  </div>
                )}
                {runner.supports_esync && (
                  <div className="p-1 bg-orange-500/10 rounded" title="ESync Support">
                    <ShieldCheck size={12} className="text-orange-500" />
                  </div>
                )}
              </div>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}