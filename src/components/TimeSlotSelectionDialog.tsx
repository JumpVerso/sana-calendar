import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, Loader2 } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { slotsAPI } from "@/api/slotsAPI";

interface TimeSlotSelectionDialogProps {
    open: boolean;
    onClose: () => void;
    date: string; // Data no formato YYYY-MM-DD
    currentTime: string; // Horário atual no formato HH:mm
    onSelectTime: (time: string) => void;
    onSkip: () => void;
    canSkip?: boolean;
    isConflict?: boolean;
    conflictReason?: string; // Motivo do conflito (ex: "Dia bloqueado", "Horário ocupado")
    isBlockedDay?: boolean; // Se o dia está bloqueado
    proposedDurationMinutes?: number; // duração do agendamento que será colocado neste horário
}

// Gerar opções de horário (baseado nas configurações do sistema)
// Mantém o mesmo comportamento da tela principal: de startHour até endHour, em intervalos de 30min,
// incluindo o "endHour:00" no final.
const generateTimeOptions = (startHour: number, endHour: number) => {
    const times: string[] = [];

    for (let hour = startHour; hour < endHour; hour++) {
        const hourStr = hour.toString().padStart(2, '0');
        times.push(`${hourStr}:00`);
        times.push(`${hourStr}:30`);
    }

    const endStr = endHour.toString().padStart(2, '0');
    times.push(`${endStr}:00`);

    return times;
};

export function TimeSlotSelectionDialog({
    open,
    onClose,
    date,
    currentTime,
    onSelectTime,
    onSkip,
    canSkip = true,
    isConflict = false,
    conflictReason,
    isBlockedDay = false,
    proposedDurationMinutes = 60,
}: TimeSlotSelectionDialogProps) {
    const { appConfig } = useSettings();
    const normalizedCurrentTime = (currentTime || "").trim();
    const formattedDate = date ? format(parseISO(date), "dd 'de' MMMM", { locale: ptBR }) : '';

    const [occupiedTimes, setOccupiedTimes] = React.useState<Set<string>>(new Set());
    const [isLoadingSlots, setIsLoadingSlots] = React.useState(false);

    const parseTimeToMinutes = (time: string): number => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };

    const formatMinutesToTime = (minutes: number): string => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const parseDurationMinutes = (duration?: string): number => {
        if (!duration) return 30;
        if (duration === '2h' || duration === '120m') return 120;
        if (duration === '1h30' || duration === '90m') return 90;
        if (duration === '1h' || duration === '60m') return 60;
        if (duration === '30m') return 30;
        return 30;
    };

    const isSlotBlocking = (slot: { type: string | null; status?: string }): boolean => {
        if (slot.type) return true; // online/presential/personal
        const statusUpper = (slot.status || '').toUpperCase();
        return ['CONFIRMADO', 'RESERVADO', 'CONTRATADO', 'INDISPONIVEL', 'AGUARDANDO', 'PENDENTE'].includes(statusUpper);
    };

    const baseTimeOptions = React.useMemo(() => {
        const start = appConfig?.startHour ?? 6;
        const end = appConfig?.endHour ?? 22;
        return generateTimeOptions(start, end);
    }, [appConfig?.startHour, appConfig?.endHour]);

    const timeOptions = React.useMemo(() => {
        // Se o horário atual não estiver na lista base (ex: fora do range), incluir.
        if (normalizedCurrentTime && !baseTimeOptions.includes(normalizedCurrentTime)) {
            return [normalizedCurrentTime, ...baseTimeOptions];
        }
        return baseTimeOptions;
    }, [normalizedCurrentTime, baseTimeOptions]);

    React.useEffect(() => {
        const fetchDaySlots = async () => {
            if (!open || !date) return;

            setIsLoadingSlots(true);
            try {
                const slots = await slotsAPI.getSlots(date, date);
                const occupied = new Set<string>();

                slots.forEach((s) => {
                    if (!isSlotBlocking(s)) return;

                    // Preferir startTime/endTime (mais preciso, inclui duração real de atividade pessoal)
                    if (s.startTime && s.endTime) {
                        const start = new Date(s.startTime);
                        const end = new Date(s.endTime);
                        let current = new Date(start);
                        while (current < end) {
                            occupied.add(format(current, 'HH:mm'));
                            current = new Date(current.getTime() + 30 * 60 * 1000);
                        }
                        return;
                    }

                    // Fallback: usar time + duração inferida
                    const startStr = (s.time || '').substring(0, 5);
                    if (!startStr) return;
                    const startMin = parseTimeToMinutes(startStr);
                    const durationMin =
                        s.type && s.type !== 'personal'
                            ? 60
                            : parseDurationMinutes((s as any).duration);
                    const endMin = startMin + durationMin;
                    for (let t = startMin; t < endMin; t += 30) {
                        occupied.add(formatMinutesToTime(t));
                    }
                });

                setOccupiedTimes(occupied);
            } catch (e) {
                console.error("Failed to fetch slots for time selection", e);
                setOccupiedTimes(new Set());
            } finally {
                setIsLoadingSlots(false);
            }
        };

        fetchDaySlots();
    }, [open, date]);

    const isCandidateOverlapping = React.useCallback((candidateStart: string) => {
        const startMin = parseTimeToMinutes(candidateStart);
        for (let i = 0; i < proposedDurationMinutes; i += 30) {
            const t = formatMinutesToTime(startMin + i);
            if (occupiedTimes.has(t)) return true;
        }
        return false;
    }, [occupiedTimes, proposedDurationMinutes]);

    return (
        <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{isConflict ? "Resolver Conflito" : "Alterar Horário"}</DialogTitle>
                    <DialogDescription>
                        {isBlockedDay ? (
                            <>
                                <span className="font-semibold text-destructive">Este dia está bloqueado.</span>
                                <br />
                                Você precisa <strong>mudar a data</strong> no calendário, não apenas o horário.
                                <br />
                                Data: {formattedDate}
                            </>
                        ) : isConflict ? (
                            <>
                                {conflictReason ? (
                                    <>
                                        <span className="font-semibold text-destructive">{conflictReason}</span>
                                        <br />
                                        Selecione um novo horário.
                                    </>
                                ) : (
                                    "O horário original está ocupado. Selecione um novo horário."
                                )}
                                <br />
                                Data: {formattedDate}
                            </>
                        ) : (
                            <>
                                Selecione um novo horário para este agendamento.
                                <br />
                                Data: {formattedDate}
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="h-[300px] w-full pr-4 border rounded-md p-2">
                    {isLoadingSlots ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : isBlockedDay ? (
                        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                            <div className="bg-destructive/10 rounded-full p-4 mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
                                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
                                    <line x1="9" x2="9" y1="3" y2="21"></line>
                                    <line x1="3" x2="21" y1="9" y2="9"></line>
                                </svg>
                            </div>
                            <p className="text-lg font-semibold text-destructive mb-2">Dia Bloqueado</p>
                            <p className="text-sm text-muted-foreground mb-4">
                                Não é possível criar agendamentos neste dia.
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Feche este diálogo e selecione outra data no calendário.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-2">
                            {timeOptions.map((time) => {
                                const isOccupied = isCandidateOverlapping(time);
                                return (
                                    <Button
                                        key={time}
                                        variant={isOccupied ? "secondary" : "outline"}
                                        className={cn(
                                            isOccupied && "opacity-50 cursor-not-allowed",
                                            !isOccupied && "hover:border-primary hover:bg-primary/5",
                                        )}
                                        disabled={isOccupied}
                                        onClick={() => {
                                            onSelectTime(time);
                                            onClose();
                                        }}
                                    >
                                        <Clock className="w-3 h-3 mr-2 hidden sm:block" />
                                        {time}
                                    </Button>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>

                {canSkip && (
                    <div className="space-y- mx-2">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">ou</span>
                            </div>
                        </div>

                        <Button
                            onClick={() => {
                                onSkip();
                                onClose();
                            }}
                            variant="outline"
                            className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 mt-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-2">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                            PULAR ESTA SEMANA
                        </Button>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
