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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useCallback } from "react";
import { DayPicker } from "react-day-picker";
import { format, isSameDay, parseISO, addDays, addWeeks, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Calendar as CalendarIcon, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { slotsAPI } from "@/api/slotsAPI";
import { TimeSlot } from "@/api/slotsAPI";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

interface BulkPersonalActivityDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    activity: string;
    duration: string;
    initialDate?: string; // Data inicial (do slot clicado)
    initialTime?: string; // Horário inicial (do slot clicado)
}

interface SelectedSlot {
    date: string; // YYYY-MM-DD
    time: string; // HH:MM
}

type RecurrencePattern = 'manual' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

// Gerar horários de 06:00 às 22:00 em intervalos de 30 minutos
const HOURS = Array.from({ length: 33 }, (_, i) => {
    const hour = Math.floor(i / 2) + 6;
    const minute = (i % 2) * 30;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
});

const MAX_DATES = 30;

export function BulkPersonalActivityDialog({
    isOpen,
    onClose,
    onConfirm,
    activity,
    duration,
    initialDate,
    initialTime,
}: BulkPersonalActivityDialogProps) {
    const [pattern, setPattern] = useState<RecurrencePattern>('manual');
    const [selectedDuration, setSelectedDuration] = useState<string>(duration);
    const [baseDate, setBaseDate] = useState<Date | undefined>(() => (initialDate ? parseISO(initialDate) : undefined));
    const [selectedDates, setSelectedDates] = useState<Date[]>([]);
    const [selectedSlots, setSelectedSlots] = useState<Record<string, string>>({}); // { date: time }
    const [occupiedMap, setOccupiedMap] = useState<Record<string, Set<string>>>({}); // { date: Set<times> }
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const { toast } = useToast();

    // Carregar slots ocupados uma única vez ao abrir o modal
    useEffect(() => {
        if (!isOpen) {
            // Resetar quando fechar
            setSelectedDates([]);
            setSelectedSlots({});
            setOccupiedMap({});
            setPattern('manual');
            setSelectedDuration(duration);
            setBaseDate(initialDate ? parseISO(initialDate) : undefined);
            setIsInitialLoad(true);
            return;
        }

        // Buscar slots dos próximos 3 meses uma única vez
        const loadOccupiedSlots = async () => {
            setIsLoading(true);
            setIsInitialLoad(true);
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const threeMonthsLater = addMonths(today, 3);
                
                const startDateStr = format(today, 'yyyy-MM-dd');
                const endDateStr = format(threeMonthsLater, 'yyyy-MM-dd');
                
                // Uma única request para buscar todos os slots
                const allSlots = await slotsAPI.getSlots(startDateStr, endDateStr);
                
                // Processar todos os slots e criar o mapa de ocupação
                const newOccupiedMap: Record<string, Set<string>> = {};
                
                allSlots.forEach(slot => {
                    const slotDate = slot.date; // YYYY-MM-DD
                    
                    if (!newOccupiedMap[slotDate]) {
                        newOccupiedMap[slotDate] = new Set<string>();
                    }
                    
                    // Priorizar startTime e endTime (ISO strings com data/hora precisa)
                    if (slot.startTime && slot.endTime) {
                        const startDate = new Date(slot.startTime);
                        const endDate = new Date(slot.endTime);
                        
                        // Verificar se o slot está na mesma data (ignorar slots de outras datas)
                        const slotDateStr = format(startDate, 'yyyy-MM-dd');
                        if (slotDateStr === slotDate) {
                            // Marcar todos os intervalos de 30min entre start e end
                            let currentTime = new Date(startDate);
                            while (currentTime < endDate) {
                                const hours = currentTime.getHours().toString().padStart(2, '0');
                                const minutes = currentTime.getMinutes().toString().padStart(2, '0');
                                const timeStr = `${hours}:${minutes}`;
                                newOccupiedMap[slotDate].add(timeStr);
                                currentTime = new Date(currentTime.getTime() + 30 * 60 * 1000); // +30 min
                            }
                        }
                    } else if (slot.time) {
                        // Fallback apenas se não tiver startTime/endTime
                        const time = slot.time.substring(0, 5); // HH:MM
                        newOccupiedMap[slotDate].add(time);
                    }
                });
                
                setOccupiedMap(newOccupiedMap);
            } catch (error) {
                console.error('Erro ao carregar slots ocupados:', error);
                toast({
                    variant: "destructive",
                    title: "Erro ao carregar dados",
                    description: "Não foi possível verificar horários ocupados. Tente novamente.",
                });
            } finally {
                setIsLoading(false);
                setIsInitialLoad(false);
            }
        };

        loadOccupiedSlots();

        // Inicializar com data/horário inicial se fornecido
        if (initialDate) {
            const initialDateObj = parseISO(initialDate);
            const normalizedDate = new Date(initialDateObj.getFullYear(), initialDateObj.getMonth(), initialDateObj.getDate());
            
            setSelectedDates([normalizedDate]);
            setBaseDate(normalizedDate);
            
            if (initialTime) {
                setSelectedSlots({ [initialDate]: initialTime });
            }
        } else {
            setBaseDate(undefined);
        }
    }, [isOpen, initialDate, initialTime, toast]);

    // Aplicar padrão de recorrência
    useEffect(() => {
        if (!isOpen || pattern === 'manual') return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = baseDate ? new Date(baseDate) : (initialDate ? parseISO(initialDate) : today);
        // Normalizar startDate para comparação (apenas data, sem hora)
        const startDateOnly = new Date(startDate);
        startDateOnly.setHours(0, 0, 0, 0);
        // Usar a data mais recente entre hoje e a data inicial do slot
        const minDate = startDateOnly > today ? startDateOnly : today;

        let dates: Date[] = [];

        switch (pattern) {
            case 'daily':
                // Todos os dias a partir da data inicial até o final do próximo mês
                const monthEnd = endOfMonth(addMonths(startDate, 1));
                dates = eachDayOfInterval({ start: startDate, end: monthEnd });
                break;
            case 'weekly':
                // Mesmo dia da semana por 8 semanas, começando da data inicial
                const dayOfWeek = startDate.getDay();
                for (let i = 0; i < 8; i++) {
                    const weekStart = startOfWeek(addWeeks(startDate, i), { weekStartsOn: 0 });
                    const date = addDays(weekStart, dayOfWeek);
                    const dateOnly = new Date(date);
                    dateOnly.setHours(0, 0, 0, 0);
                    if (dateOnly >= minDate) dates.push(date);
                }
                break;
            case 'biweekly':
                // A cada 15 dias, 8 ocorrências, começando da data inicial
                for (let i = 0; i < 8; i++) {
                    const date = addDays(startDate, i * 15);
                    const dateOnly = new Date(date);
                    dateOnly.setHours(0, 0, 0, 0);
                    if (dateOnly >= minDate) dates.push(date);
                }
                break;
            case 'monthly':
                // Mesmo dia do mês, 6 meses, começando da data inicial
                const dayOfMonth = startDate.getDate();
                for (let i = 0; i < 6; i++) {
                    const date = addMonths(startDate, i);
                    // Ajustar se o dia não existe no mês (ex: 31 de fevereiro)
                    const lastDay = endOfMonth(date).getDate();
                    const adjustedDay = Math.min(dayOfMonth, lastDay);
                    const finalDate = new Date(date.getFullYear(), date.getMonth(), adjustedDay);
                    const dateOnly = new Date(finalDate);
                    dateOnly.setHours(0, 0, 0, 0);
                    if (dateOnly >= minDate) dates.push(finalDate);
                }
                break;
        }

        // Filtrar datas passadas (usando a data mínima entre hoje e a data inicial do slot)
        dates = dates.filter(d => {
            const dateOnly = new Date(d);
            dateOnly.setHours(0, 0, 0, 0);
            return dateOnly >= minDate;
        });
        
        // Limitar a 30 datas
        if (dates.length > 30) {
            dates = dates.slice(0, 30);
            toast({
                title: "Limite aplicado",
                description: `O padrão foi limitado a 30 datas.`,
            });
        }
        
        setSelectedDates(dates);

        // Definir horário padrão para todas as datas
        const defaultTime = initialTime || '12:00';
        const slots: Record<string, string> = {};
        dates.forEach(date => {
            slots[format(date, 'yyyy-MM-dd')] = defaultTime;
        });
        setSelectedSlots(slots);
    }, [pattern, isOpen, baseDate, initialDate, initialTime, toast]);

    // Função para verificar se um horário está ocupado (usa cache)
    const isTimeOccupied = useCallback((dateStr: string, time: string): boolean => {
        const occupied = occupiedMap[dateStr];
        if (!occupied) return false;
        
        // Verificar se o horário ou qualquer intervalo de 30min dentro da duração está ocupado
        const [h, m] = time.split(':').map(Number);
        const durationMinutes = selectedDuration === '2h' ? 120 : selectedDuration === '1h30' ? 90 : selectedDuration === '1h' ? 60 : 30;
        
        for (let i = 0; i < durationMinutes; i += 30) {
            const checkTime = new Date();
            checkTime.setHours(h, m + i, 0, 0);
            const timeStr = format(checkTime, 'HH:mm');
            if (occupied.has(timeStr)) {
                return true;
            }
        }
        
        return false;
    }, [occupiedMap, selectedDuration]);

    // Verificar conflitos ao mudar horários selecionados (usando cache)
    useEffect(() => {
        if (isInitialLoad || selectedDates.length === 0) return;

        // Verificar se algum horário selecionado tem conflito e limpar se necessário
        setSelectedSlots(prevSlots => {
            const updated = { ...prevSlots };
            const clearedDates: string[] = [];
            
            selectedDates.forEach(date => {
                const dateStr = format(date, 'yyyy-MM-dd');
                const currentTime = prevSlots[dateStr];
                
                if (currentTime && isTimeOccupied(dateStr, currentTime)) {
                    clearedDates.push(dateStr);
                    delete updated[dateStr];
                }
            });
            
            // Notificar o usuário sobre conflitos encontrados
            if (clearedDates.length > 0) {
                const formattedDates = clearedDates.map(d => {
                    const [year, month, day] = d.split('-');
                    return `${day}/${month}`;
                }).join(', ');
                
                toast({
                    variant: "destructive",
                    title: "Conflitos detectados",
                    description: `O horário de ${clearedDates.length} data(s) foi limpo por conflito: ${formattedDates}. Selecione um novo horário.`,
                });
            }
            
            return clearedDates.length > 0 ? updated : prevSlots;
        });
    }, [selectedDates, occupiedMap, selectedDuration, isInitialLoad, toast, isTimeOccupied]);

    const handleDateSelect = (dates: Date[] | undefined) => {
        if (!dates) {
            setSelectedDates([]);
            setSelectedSlots({});
            return;
        }

        // Filtrar datas passadas (usando a data mínima entre hoje e a data inicial do slot)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDateOnly = initialDate ? (() => {
            const sd = parseISO(initialDate);
            sd.setHours(0, 0, 0, 0);
            return sd;
        })() : today;
        const minDate = startDateOnly > today ? startDateOnly : today;
        let validDates = dates.filter(d => {
            const dateOnly = new Date(d);
            dateOnly.setHours(0, 0, 0, 0);
            return dateOnly >= minDate;
        });

        // Limitar a 30 datas
        if (validDates.length > MAX_DATES) {
            toast({
                variant: "destructive",
                title: "Limite atingido",
                description: `Máximo de ${MAX_DATES} datas por lote. Algumas datas não foram adicionadas.`,
            });
            // Manter apenas as primeiras 30 datas (ordenadas)
            validDates = validDates
                .sort((a, b) => a.getTime() - b.getTime())
                .slice(0, MAX_DATES);
        }

        setSelectedDates(validDates);

        // Manter slots existentes e adicionar novos com horário padrão
        const newSlots: Record<string, string> = { ...selectedSlots };
        validDates.forEach(date => {
            const dateStr = format(date, 'yyyy-MM-dd');
            if (!newSlots[dateStr]) {
                newSlots[dateStr] = initialTime || '12:00';
            }
        });

        // Remover slots de datas não selecionadas
        Object.keys(newSlots).forEach(dateStr => {
            if (!validDates.some(d => format(d, 'yyyy-MM-dd') === dateStr)) {
                delete newSlots[dateStr];
            }
        });

        setSelectedSlots(newSlots);
    };

    const handleTimeChange = (dateStr: string, time: string) => {
        setSelectedSlots(prev => ({
            ...prev,
            [dateStr]: time,
        }));
    };

    const handleConfirm = async () => {
        if (selectedDates.length === 0) {
            toast({
                variant: "destructive",
                title: "Nenhuma data selecionada",
                description: "Selecione pelo menos uma data para criar as atividades.",
            });
            return;
        }

        // Validar que todas as datas têm horário
        const missingTimes = selectedDates.filter(d => {
            const dateStr = format(d, 'yyyy-MM-dd');
            return !selectedSlots[dateStr];
        });

        if (missingTimes.length > 0) {
            toast({
                variant: "destructive",
                title: "Horários faltando",
                description: "Defina um horário para todas as datas selecionadas.",
            });
            return;
        }

        // Verificar se há conflitos antes de criar
        const slotsWithConflicts: string[] = [];
        selectedDates.forEach(date => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const time = selectedSlots[dateStr];
            if (time && isTimeOccupied(dateStr, time)) {
                slotsWithConflicts.push(`${format(date, "dd/MM")} às ${time}`);
            }
        });

        if (slotsWithConflicts.length > 0) {
            toast({
                variant: "destructive",
                title: "Conflitos detectados",
                description: `Resolva os conflitos antes de criar: ${slotsWithConflicts.slice(0, 3).join(', ')}${slotsWithConflicts.length > 3 ? '...' : ''}`,
            });
            return;
        }

        setIsCreating(true);
        try {
            const slotsToCreate = selectedDates.map(date => {
                const dateStr = format(date, 'yyyy-MM-dd');
                return {
                    date: dateStr,
                    time: selectedSlots[dateStr],
                    activity,
                    duration: selectedDuration,
                };
            });

            const result = await slotsAPI.createBulkPersonalSlots(slotsToCreate);

            if (result.failed && result.failed.length > 0) {
                toast({
                    variant: "destructive",
                    title: "Alguns slots não puderam ser criados",
                    description: `${result.created.length} criados, ${result.failed.length} falharam.`,
                });
            } else {
                toast({
                    title: "Sucesso!",
                    description: `${result.created.length} atividade(s) pessoal(is) criada(s) com sucesso.`,
                });
            }

            onConfirm();
            onClose();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Erro ao criar atividades",
                description: error.message || "Ocorreu um erro ao criar as atividades em lote.",
            });
        } finally {
            setIsCreating(false);
        }
    };

    const sortedSelectedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());

    // Calcular data mínima para desabilitar no calendário (hoje ou data inicial do slot, o que for mais recente)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minDisabledDate = initialDate ? (() => {
        const sd = parseISO(initialDate);
        sd.setHours(0, 0, 0, 0);
        return sd > today ? sd : today;
    })() : today;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5 text-primary" />
                        Criar Atividades Pessoais em Lote
                    </DialogTitle>
                    <DialogDescription>
                        Selecione múltiplos dias e horários para criar atividades pessoais de uma vez.
                        Atividade: <strong>{activity}</strong>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Data inicial (abre ao clicar, estilo "nativo" porém custom) */}
                    <div className="space-y-2">
                        <Label>Data inicial</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className={cn(
                                        "w-full justify-between font-normal",
                                        !baseDate && "text-muted-foreground"
                                    )}
                                >
                                    {baseDate ? format(baseDate, "dd/MM/yyyy") : "Selecionar data"}
                                    <CalendarIcon className="h-4 w-4 opacity-70" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={baseDate}
                                    onSelect={(d) => {
                                        if (!d) return;
                                        const dateOnly = new Date(d);
                                        dateOnly.setHours(0, 0, 0, 0);
                                        if (dateOnly < minDisabledDate) {
                                            toast({
                                                variant: "destructive",
                                                title: "Data inválida",
                                                description: `Escolha uma data a partir de ${format(minDisabledDate, "dd/MM")}.`,
                                            });
                                            return;
                                        }
                                        setBaseDate(dateOnly);
                                        setSelectedDates([dateOnly]);
                                        const key = format(dateOnly, "yyyy-MM-dd");
                                        const time = initialTime || selectedSlots[key] || "12:00";
                                        setSelectedSlots({ [key]: time });
                                    }}
                                    disabled={[{ before: minDisabledDate }]}
                                    locale={ptBR}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Duração */}
                    <div className="space-y-2">
                        <Label>Duração</Label>
                        <Select
                            value={selectedDuration}
                            onValueChange={(value) => {
                                setSelectedDuration(value);
                                // Limpar horários selecionados que podem ter conflito com nova duração
                                setSelectedSlots(prev => {
                                    const updated = { ...prev };
                                    let clearedCount = 0;
                                    
                                    selectedDates.forEach(date => {
                                        const dateStr = format(date, 'yyyy-MM-dd');
                                        const time = prev[dateStr];
                                        if (time) {
                                            // Verificar conflito com nova duração
                                            const [h, m] = time.split(':').map(Number);
                                            const durationMinutes = value === '2h' ? 120 : value === '1h30' ? 90 : value === '1h' ? 60 : 30;
                                            
                                            for (let i = 0; i < durationMinutes; i += 30) {
                                                const checkTime = new Date();
                                                checkTime.setHours(h, m + i, 0, 0);
                                                const timeStr = format(checkTime, 'HH:mm');
                                                const occupied = occupiedMap[dateStr];
                                                if (occupied && occupied.has(timeStr)) {
                                                    delete updated[dateStr];
                                                    clearedCount++;
                                                    break;
                                                }
                                            }
                                        }
                                    });
                                    
                                    if (clearedCount > 0) {
                                        toast({
                                            variant: "destructive",
                                            title: "Conflitos detectados",
                                            description: `${clearedCount} horário(s) foram limpos devido a conflitos com a nova duração.`,
                                        });
                                    }
                                    
                                    return updated;
                                });
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione a duração" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="30m">30 minutos</SelectItem>
                                <SelectItem value="1h">1 hora</SelectItem>
                                <SelectItem value="1h30">1 hora e 30 min</SelectItem>
                                <SelectItem value="2h">2 horas</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Padrão de Recorrência */}
                    <div className="space-y-3">
                        <Label className="text-base font-semibold">Padrão de Recorrência</Label>
                        <RadioGroup value={pattern} onValueChange={(v) => setPattern(v as RecurrencePattern)} className="grid grid-cols-5 gap-2">
                            <div
                                className={`relative flex flex-col items-center justify-center border-2 p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:border-primary/50 ${pattern === 'manual' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-200'}`}
                                onClick={() => setPattern('manual')}
                            >
                                <span className={`font-semibold text-sm ${pattern === 'manual' ? 'text-primary' : 'text-slate-700'}`}>Manual</span>
                                <span className="text-[10px] text-muted-foreground text-center mt-1">Seleção livre</span>
                                <RadioGroupItem value="manual" id="manual" className="sr-only" />
                            </div>
                            <div
                                className={`relative flex flex-col items-center justify-center border-2 p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:border-primary/50 ${pattern === 'daily' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-200'}`}
                                onClick={() => setPattern('daily')}
                            >
                                <span className={`font-semibold text-sm ${pattern === 'daily' ? 'text-primary' : 'text-slate-700'}`}>Diário</span>
                                <span className="text-[10px] text-muted-foreground text-center mt-1">Todos os dias</span>
                                <RadioGroupItem value="daily" id="daily" className="sr-only" />
                            </div>
                            <div
                                className={`relative flex flex-col items-center justify-center border-2 p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:border-primary/50 ${pattern === 'weekly' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-200'}`}
                                onClick={() => setPattern('weekly')}
                            >
                                <span className={`font-semibold text-sm ${pattern === 'weekly' ? 'text-primary' : 'text-slate-700'}`}>Semanal</span>
                                <span className="text-[10px] text-muted-foreground text-center mt-1">1x por semana</span>
                                <RadioGroupItem value="weekly" id="weekly" className="sr-only" />
                            </div>
                            <div
                                className={`relative flex flex-col items-center justify-center border-2 p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:border-primary/50 ${pattern === 'biweekly' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-200'}`}
                                onClick={() => setPattern('biweekly')}
                            >
                                <span className={`font-semibold text-sm ${pattern === 'biweekly' ? 'text-primary' : 'text-slate-700'}`}>Quinzenal</span>
                                <span className="text-[10px] text-muted-foreground text-center mt-1">A cada 15 dias</span>
                                <RadioGroupItem value="biweekly" id="biweekly" className="sr-only" />
                            </div>
                            <div
                                className={`relative flex flex-col items-center justify-center border-2 p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:border-primary/50 ${pattern === 'monthly' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-200'}`}
                                onClick={() => setPattern('monthly')}
                            >
                                <span className={`font-semibold text-sm ${pattern === 'monthly' ? 'text-primary' : 'text-slate-700'}`}>Mensal</span>
                                <span className="text-[10px] text-muted-foreground text-center mt-1">1x por mês</span>
                                <RadioGroupItem value="monthly" id="monthly" className="sr-only" />
                            </div>
                        </RadioGroup>
                    </div>

                    {/* Calendário */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b">
                            <CalendarIcon className="h-5 w-5 text-primary" />
                            <h3 className="font-semibold text-base text-slate-800">Selecione as Datas</h3>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                            <style>{`
                                .bulk-calendar {
                                    width: 100%;
                                }
                                .bulk-calendar .rdp-months {
                                    width: 100%;
                                }
                                .bulk-calendar .rdp-month {
                                    width: 100%;
                                }
                                .bulk-calendar .rdp-table {
                                    width: 100%;
                                    max-width: none;
                                }
                                .bulk-calendar .rdp-cell {
                                    width: 42px;
                                    height: 42px;
                                    padding: 2px;
                                }
                                .bulk-calendar .rdp-day {
                                    width: 38px;
                                    height: 38px;
                                    font-size: 0.9rem;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                }
                                .bulk-calendar .rdp-head_cell {
                                    text-transform: uppercase;
                                    font-size: 0.7rem;
                                    font-weight: 700;
                                    color: #64748b;
                                    height: 32px;
                                }
                                .bulk-calendar .rdp-day_today {
                                    border: 2px solid #f97316 !important;
                                    border-radius: 8px;
                                    background-color: #fff7ed !important;
                                    color: #c2410c !important;
                                    font-weight: 900 !important;
                                }
                                .bulk-calendar .rdp-day_selected {
                                    background-color: #3b82f6 !important;
                                    color: white !important;
                                    font-weight: 800 !important;
                                    border-radius: 8px;
                                }
                                .bulk-calendar .rdp-day_disabled {
                                    opacity: 0.15 !important;
                                    pointer-events: none;
                                }
                                .bulk-calendar .rdp-day:not(.rdp-day_disabled):not(.rdp-day_selected):hover {
                                    background-color: #f1f5f9 !important;
                                    border-radius: 8px;
                                }
                                .bulk-calendar .rdp-day_conflict {
                                    background-color: #fee2e2 !important;
                                    border: 2px solid #ef4444 !important;
                                    color: #dc2626 !important;
                                }
                            `}</style>
                            {isLoading ? (
                                <div className="h-[440px] flex items-center justify-center">
                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                </div>
                            ) : (
                            <DayPicker
                                mode="multiple"
                                selected={selectedDates}
                                onSelect={handleDateSelect}
                                modifiers={{
                                    conflict: (date) => {
                                        const dStr = format(date, 'yyyy-MM-dd');
                                        const isSelected = selectedDates.some(d => format(d, 'yyyy-MM-dd') === dStr);
                                        if (!isSelected) return false;
                                        const time = selectedSlots[dStr];
                                        // Conflito = sem horário OU horário ocupado
                                        return !time || isTimeOccupied(dStr, time);
                                    },
                                }}
                                modifiersClassNames={{
                                    conflict: 'rdp-day_conflict',
                                }}
                                weekStartsOn={0}
                                locale={ptBR}
                                disabled={[{ before: minDisabledDate }]}
                                numberOfMonths={2}
                                pagedNavigation
                                className="bulk-calendar"
                            />
                            )}
                        </div>
                        <div className="mt-4 pt-4 border-t flex flex-wrap gap-4 justify-center text-xs">
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full border-2 border-orange-500 bg-orange-50"></div>
                                <span className="font-medium text-slate-500 uppercase tracking-tighter">Hoje</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                <span className="font-medium text-slate-500 uppercase tracking-tighter">Selecionado</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-200 border-2 border-red-500"></div>
                                <span className="font-medium text-slate-500 uppercase tracking-tighter">Conflito</span>
                            </div>
                        </div>
                    </div>

                    {/* Lista de Seleções */}
                    {sortedSelectedDates.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-2 border-b">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-primary" />
                                    <h3 className="font-semibold text-base text-slate-800">
                                        Datas Selecionadas
                                    </h3>
                                </div>
                                <span className={`text-sm font-medium ${sortedSelectedDates.length >= MAX_DATES ? 'text-red-600' : 'text-slate-500'}`}>
                                    {sortedSelectedDates.length}/{MAX_DATES}
                                </span>
                            </div>
                            <div className="border rounded-xl overflow-hidden shadow-sm max-h-[300px] overflow-y-auto">
                                <div className="bg-slate-50 p-3 border-b grid grid-cols-[1fr,auto] gap-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    <span>Data e Horário</span>
                                    <span>Status</span>
                                </div>
                                <div className="divide-y bg-white">
                                    {sortedSelectedDates.map((date) => {
                                        const dateStr = format(date, 'yyyy-MM-dd');
                                        const time = selectedSlots[dateStr] || '';
                                        // Conflito = sem horário OU horário ocupado
                                        const hasConflict = !time || isTimeOccupied(dateStr, time);

                                        return (
                                            <div
                                                key={dateStr}
                                                className={`p-3 grid grid-cols-[1fr,auto] gap-4 items-center ${
                                                    hasConflict
                                                        ? 'bg-red-50 border-l-4 border-red-400'
                                                        : 'hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-sm text-slate-800">
                                                            {format(date, "dd 'de' MMMM", { locale: ptBR })}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground capitalize">
                                                            {format(date, "EEEE", { locale: ptBR })}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Select
                                                            value={time || undefined}
                                                            onValueChange={(t) => handleTimeChange(dateStr, t)}
                                                        >
                                                            <SelectTrigger className={`h-8 w-[120px] text-xs ${hasConflict ? 'border-red-300 bg-red-50' : ''}`}>
                                                                <SelectValue placeholder="Selecione o horário" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {HOURS.map((h) => {
                                                                    // Verificar se este horário específico tem conflito
                                                                    const [hHour, hMin] = h.split(':').map(Number);
                                                                    const durationMinutes = selectedDuration === '2h' ? 120 : selectedDuration === '1h30' ? 90 : selectedDuration === '1h' ? 60 : 30;
                                                                    let hourHasConflict = false;
                                                                    const occupied = occupiedMap[dateStr];
                                                                    if (occupied) {
                                                                        for (let i = 0; i < durationMinutes; i += 30) {
                                                                            const checkTime = new Date();
                                                                            checkTime.setHours(hHour, hMin + i, 0, 0);
                                                                            const timeStr = format(checkTime, 'HH:mm');
                                                                            if (occupied.has(timeStr)) {
                                                                                hourHasConflict = true;
                                                                                break;
                                                                            }
                                                                        }
                                                                    }
                                                                    return (
                                                                        <SelectItem 
                                                                            key={h} 
                                                                            value={h}
                                                                            disabled={hourHasConflict}
                                                                            className={hourHasConflict ? 'text-red-500 opacity-50' : ''}
                                                                        >
                                                                            {h} {hourHasConflict && '(Ocupado)'}
                                                                        </SelectItem>
                                                                    );
                                                                })}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                <div className="flex items-center">
                                                    {hasConflict ? (
                                                        <div className="flex items-center gap-1.5 text-red-600 text-xs">
                                                            <XCircle className="h-4 w-4" />
                                                            <span className="font-medium">Conflito</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 text-green-600 text-xs">
                                                            <CheckCircle2 className="h-4 w-4" />
                                                            <span className="font-medium">Disponível</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isCreating}>
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleConfirm} 
                        disabled={
                            isCreating || 
                            sortedSelectedDates.length === 0 ||
                            sortedSelectedDates.some(d => {
                                const dateStr = format(d, 'yyyy-MM-dd');
                                const time = selectedSlots[dateStr];
                                return !time || isTimeOccupied(dateStr, time);
                            })
                        }
                        title={
                            sortedSelectedDates.some(d => {
                                const dateStr = format(d, 'yyyy-MM-dd');
                                const time = selectedSlots[dateStr];
                                return !time || isTimeOccupied(dateStr, time);
                            })
                                ? "Resolva todos os conflitos antes de criar"
                                : ""
                        }
                    >
                        {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Criar {sortedSelectedDates.length > 0 && `(${sortedSelectedDates.length})`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
