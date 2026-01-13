import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Calendar as CalendarIcon, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { slotsAPI } from "@/api/slotsAPI";

interface Conflict {
    date: string;
    time: string;
    reason: string;
}

interface Resolution {
    action: 'ignore' | 'reschedule';
    newDate?: string;
    newTime?: string;
}

interface ConflictResolutionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onBack?: () => void;
    conflicts: Conflict[];
    onResolve: (resolutions: { originalDate: string; originalTime: string; action: 'ignore' | 'reschedule'; newDate?: string; newTime?: string }[]) => Promise<void>;
    patientName?: string;
}

interface ConflictRowProps {
    conflict: Conflict;
    resolution: Resolution;
    onChange: (res: Resolution) => void;
}

function ConflictRow({ conflict, resolution, onChange }: ConflictRowProps) {
    const key = `${conflict.date}-${conflict.time}`;
    const formattedDate = format(parseISO(conflict.date), "dd 'de' MMMM", { locale: ptBR });
    const [slotData, setSlotData] = useState<Record<string, { count: number; hasPersonal: boolean; isFull: boolean }>>({});
    const [isLoadingSlots, setIsLoadingSlots] = useState(false);

    // Initialize date with conflict date when switching to reschedule
    useEffect(() => {
        if (resolution.action === 'reschedule' && !resolution.newDate) {
            onChange({ ...resolution, newDate: conflict.date });
        }
    }, [resolution.action]);

    useEffect(() => {
        if (resolution.action === 'reschedule' && resolution.newDate) {
            setIsLoadingSlots(true);
            slotsAPI.getSlots(resolution.newDate, resolution.newDate)
                .then(slots => {
                    const data: Record<string, { count: number; hasPersonal: boolean; isFull: boolean }> = {};
                    slots.forEach(s => {
                        const t = s.time.substring(0, 5);
                        if (!data[t]) data[t] = { count: 0, hasPersonal: false, isFull: false };

                        // Any slot makes it occupied/full based on user request
                        data[t].isFull = true;
                        if (s.type === 'personal') data[t].hasPersonal = true;
                    });

                    setSlotData(data);
                })
                .catch(err => console.error("Error fetching slots for conflict resolution", err))
                .finally(() => setIsLoadingSlots(false));
        }
    }, [resolution.newDate, resolution.action]);

    return (
        <div className="border rounded-lg p-3 space-y-3 bg-slate-50">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-semibold text-sm">
                        {formattedDate} às {conflict.time.substring(0, 5)}
                    </p>
                    <p className="text-xs text-red-500 font-medium mt-1">
                        Motivo: {conflict.reason}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Label className="text-xs">Ação:</Label>
                <Select
                    value={resolution.action}
                    onValueChange={(val: 'ignore' | 'reschedule') => onChange({ ...resolution, action: val })}
                >
                    <SelectTrigger className="h-8 text-xs w-[200    px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ignore">Ignorar e não agendar</SelectItem>
                        <SelectItem value="reschedule">Reagendar</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {resolution.action === 'reschedule' && (
                <div className="flex flex-col md:flex-row gap-4 mt-2 animate-in fade-in slide-in-from-top-1 bg-white p-3 rounded-md border">
                    <div className="w-full md:w-auto flex-shrink-0 border rounded-md p-1">
                        <Calendar
                            mode="single"
                            selected={resolution.newDate ? parseISO(resolution.newDate) : undefined}
                            onSelect={(date) => date && onChange({ ...resolution, newDate: format(date, "yyyy-MM-dd"), newTime: undefined })}
                            initialFocus
                            locale={ptBR}
                            className="rounded-md border-none shadow-none"
                        />
                    </div>

                    <div className="flex-1 min-w-0">
                        <Label className="text-sm font-medium mb-2 block">
                            Selecione o Horário ({resolution.newDate ? format(parseISO(resolution.newDate), "dd/MM") : 'Selecione a data'})
                        </Label>
                        {!resolution.newDate ? (
                            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-md">
                                Selecione uma data no calendário
                            </div>
                        ) : isLoadingSlots ? (
                            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-md">
                                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                Buscando horários...
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[280px] overflow-y-auto pr-2">
                                {Array.from({ length: 17 }, (_, i) => i + 6).map((hour) => {
                                    const timeStr = `${hour.toString().padStart(2, '0')}:00`;
                                    const info = slotData[timeStr] || { count: 0, hasPersonal: false, isFull: false };
                                    const isSelected = resolution.newTime === timeStr;
                                    const isOccupied = info.isFull;

                                    return (
                                        <Button
                                            key={timeStr}
                                            variant={isSelected ? "default" : "outline"}
                                            className={cn(
                                                "h-9 text-xs font-normal",
                                                isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
                                                !isSelected && isOccupied && "bg-red-50 text-red-500 border-red-100 hover:bg-red-50 cursor-not-allowed opacity-80",
                                                !isSelected && !isOccupied && "hover:bg-slate-100"
                                            )}
                                            disabled={isOccupied}
                                            onClick={() => onChange({ ...resolution, newTime: timeStr })}
                                        >
                                            {timeStr}
                                        </Button>
                                    );
                                })}
                            </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                            <span className="flex items-center"><div className="w-7 h-7 rounded-full bg-slate-200 mr-1 border"></div> Livre</span>
                            <span className="flex items-center"><div className="w-7 h-7 rounded-full bg-red-100 mr-1 border border-red-200"></div> Ocupado</span>
                            <span className="flex items-center"><div className="w-8 h-8  rounded-md border border-orange-500 mr-1 flex items-center justify-center text-[10px] font-semibold text-orange-600">{new Date().getDate()}</div> Hoje</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export function ConflictResolutionDialog({ isOpen, onClose, onBack, conflicts, onResolve, patientName }: ConflictResolutionDialogProps) {
    const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
    const [isLoading, setIsLoading] = useState(false);

    // Initialize resolutions with 'ignore'
    useEffect(() => {
        if (isOpen) {
            const initial: Record<string, Resolution> = {};
            conflicts.forEach(c => {
                const key = `${c.date}-${c.time}`;
                // Keep existing if already set (to prevent reset on re-render if conflicts prop change isn't handled carefully, though ideally it resets on open)
                if (!resolutions[key]) {
                    initial[key] = { action: 'ignore' };
                }
            });
            setResolutions(prev => ({ ...prev, ...initial }));
        }
    }, [isOpen, conflicts]);


    const handleResolutionChange = (key: string, res: Resolution) => {
        setResolutions(prev => ({
            ...prev,
            [key]: res
        }));
    };

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            const resolutionArray = conflicts.map(c => {
                const key = `${c.date}-${c.time}`;
                const res = resolutions[key] || { action: 'ignore' };
                return {
                    originalDate: c.date,
                    originalTime: c.time,
                    action: res.action,
                    newDate: res.newDate,
                    newTime: res.newTime
                };
            });
            await onResolve(resolutionArray);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };


    const hasInvalidReschedules = conflicts.some(c => {
        const key = `${c.date}-${c.time}`;
        const res = resolutions[key] || { action: 'ignore' };
        return res.action === 'reschedule' && (!res.newDate || !res.newTime);
    });

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-red-600 flex items-center gap-2">
                        ⚠️ Conflitos de Agendamento
                    </DialogTitle>
                    <DialogDescription>
                        Alguns horários para {patientName || "o paciente"} não puderam ser agendados automaticamente.
                        Decida o que fazer com cada um.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {conflicts.map((conflict) => {
                        const key = `${conflict.date}-${conflict.time}`;
                        const resolution = resolutions[key] || { action: 'ignore' };

                        return (
                            <ConflictRow
                                key={key}
                                conflict={conflict}
                                resolution={resolution}
                                onChange={(res) => handleResolutionChange(key, res)}
                            />
                        );
                    })}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onBack || onClose} disabled={isLoading}>
                        Voltar
                    </Button>
                    <Button onClick={handleConfirm} disabled={isLoading || hasInvalidReschedules}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirmar Contratação
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
