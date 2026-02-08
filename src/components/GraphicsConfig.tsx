import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import * as Icons from "lucide-react";

interface GraphicsConfigProps {
    bottleId: string;
}

interface D3DMetalLibs {
    d3d11: boolean;
    d3d12: boolean;
    dxgi: boolean;
}

export function GraphicsConfig({ bottleId }: GraphicsConfigProps) {
    const [backend, setBackend] = useState<"D3DMetal" | "DXVK" | "WineD3D">("D3DMetal");
    // const [hudEnabled, setHudEnabled] = useState(true);
    // const [esync, setEsync] = useState(true);
    const [metalLibs, setMetalLibs] = useState<D3DMetalLibs | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        checkStatus();
    }, [bottleId]);

    const checkStatus = async () => {
        try {
            // Check if Metal libs are installed
            const isInstalled = await invoke<boolean>("verify_d3dmetal", { bottleId });
            setMetalLibs({ d3d11: isInstalled, d3d12: isInstalled, dxgi: isInstalled });
            
            // In a real app we'd fetch the current backend from registry, 
            // for now we default to D3DMetal if libs exist
            if (isInstalled) setBackend("D3DMetal");
            else setBackend("DXVK");
        } catch (e) {
            console.error(e);
        }
    };

    const handleApply = async () => {
        setLoading(true);
        try {
            if (backend === "D3DMetal" && !metalLibs?.d3d11) {
                await invoke("install_d3dmetal", { bottleId });
            }
            
            await invoke("set_graphics_backend", { bottleId, backend });
            
            // HUD and ESync usually require env var changes which implies updating the bottle config
            // or setting persistent registry keys. For MVP, we'll assume backend logic handles critical env vars.
            
            checkStatus();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <Label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Rendering Backend</Label>
                <RadioGroup value={backend} onValueChange={(v: any) => setBackend(v)} className="grid grid-cols-1 gap-4">
                    <div className="relative">
                        <RadioGroupItem value="D3DMetal" id="d3dmetal" className="peer sr-only" />
                        <Label
                            htmlFor="d3dmetal"
                            className="flex flex-col items-start justify-between rounded-none border border-white/10 bg-black p-4 hover:bg-zinc-900 peer-data-[state=checked]:border-white peer-data-[state=checked]:bg-zinc-900 cursor-pointer transition-all"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Icons.Zap size={16} className="text-emerald-500" />
                                <span className="font-black uppercase tracking-tight">D3DMetal (GPTK)</span>
                            </div>
                            <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-wide">
                                Highest Performance for DX11/12. Requires Apple Silicon.
                            </p>
                        </Label>
                    </div>

                    <div className="relative">
                        <RadioGroupItem value="DXVK" id="dxvk" className="peer sr-only" />
                        <Label
                            htmlFor="dxvk"
                            className="flex flex-col items-start justify-between rounded-none border border-white/10 bg-black p-4 hover:bg-zinc-900 peer-data-[state=checked]:border-white peer-data-[state=checked]:bg-zinc-900 cursor-pointer transition-all"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Icons.BoxSelect size={16} className="text-blue-500" />
                                <span className="font-black uppercase tracking-tight">DXVK (Vulkan)</span>
                            </div>
                            <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-wide">
                                Compatible with older titles (DX9/10/11). Stable but slower than Metal.
                            </p>
                        </Label>
                    </div>

                    <div className="relative">
                        <RadioGroupItem value="WineD3D" id="wined3d" className="peer sr-only" />
                        <Label
                            htmlFor="wined3d"
                            className="flex flex-col items-start justify-between rounded-none border border-white/10 bg-black p-4 hover:bg-zinc-900 peer-data-[state=checked]:border-white peer-data-[state=checked]:bg-zinc-900 cursor-pointer transition-all"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Icons.Coffee size={16} className="text-zinc-500" />
                                <span className="font-black uppercase tracking-tight">WineD3D (OpenGL)</span>
                            </div>
                            <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-wide">
                                Legacy translation. Slowest, use only for compatibility debugging.
                            </p>
                        </Label>
                    </div>
                </RadioGroup>
            </div>

            {!metalLibs?.d3d11 && backend === "D3DMetal" && (
                <Alert className="bg-emerald-500/10 border-emerald-500/20 text-emerald-500 rounded-none">
                    <Icons.DownloadCloud className="h-4 w-4" />
                    <AlertDescription className="text-[10px] font-bold uppercase tracking-wide ml-2">
                        D3DMetal libraries will be installed automatically.
                    </AlertDescription>
                </Alert>
            )}

            <Button 
                onClick={handleApply} 
                disabled={loading}
                className="w-full h-14 rounded-none bg-white text-black font-black uppercase tracking-widest hover:bg-zinc-200"
            >
                {loading ? "Applying Configuration..." : "Apply Graphics Settings"}
            </Button>
        </div>
    );
}
