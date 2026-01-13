import { useEffect, useState } from 'react';
import { DayPicker, SelectSingleEventHandler, ActiveModifiers } from 'react-day-picker';
import { format, isSameDay, parseISO, addWeeks, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { slotsAPI, TimeSlot } from '@/api/slotsAPI';

export interface PreviewResult {
    date: string;
    status: 'available' | 'occupied' | 'conflict';
    details?: string;
}

export interface ResolvedConflict {
    originalDate: string; // YYYY-MM-DD
    newTime: string;
    newDate: string;
}

export interface RecurrenceCalendarProps {
    originalSlotId: string;
    slotDate: string; // "yyyy-MM-dd"
    slotTime: string; // "HH:MM"
    frequency: 'weekly' | 'biweekly' | 'monthly';
    occurrenceCount?: number;
    recurrenceGroupId?: string;
    onDatesChange: (dates: Date[], conflicts: string[], resolved: ResolvedConflict[]) => void;
    forceSkipDate?: string | null;
    onSkipProcessed?: () => void;
    onHasPreviousContractsChange?: (hasPrevious: boolean) => void;
}

const HOURS = Array.from({ length: 17 }, (_, i) => `${(i + 6).toString().padStart(2, '0')}:00`);

export function RecurrenceCalendar({ originalSlotId, slotDate, slotTime, frequency, occurrenceCount, recurrenceGroupId, onDatesChange, forceSkipDate, onSkipProcessed, onHasPreviousContractsChange }: RecurrenceCalendarProps) {
    const [previewDates, setPreviewDates] = useState<PreviewResult[]>([]);
    const [selectedDates, setSelectedDates] = useState<Date[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [occupiedMap, setOccupiedMap] = useState<Record<string, boolean>>({});
    const { toast } = useToast();

    // Resolution State
    const [resolutionDialogOpen, setResolutionDialogOpen] = useState(false);
    const [resolvingDate, setResolvingDate] = useState<Date | null>(null);
    const [daySlots, setDaySlots] = useState<TimeSlot[]>([]);
    const [isLoadingSlots, setIsLoadingSlots] = useState(false);
    const [resolvedConflicts, setResolvedConflicts] = useState<ResolvedConflict[]>([]);
    const [skippedWeekIndices, setSkippedWeekIndices] = useState<number[]>([]);

    const fetchAvailabilityAndPreview = async () => {
        setIsLoading(true);
        try {
            // 1. Fetch Preview - isso já retorna os conflitos detectados pelo backend
            const previewData = await slotsAPI.previewRecurringSlots({
                originalSlotId,
                frequency,
                range: 'current_and_next_month',
                occurrenceCount: occurrenceCount || 1
            });
            const previewResults = previewData.preview as PreviewResult[];
            setPreviewDates(previewResults);
            
            // Passar informação de contratos anteriores para o componente pai
            if (onHasPreviousContractsChange && previewData.hasPreviousContracts !== undefined) {
                onHasPreviousContractsChange(previewData.hasPreviousContracts);
            }

            // 2. Criar occupiedMap diretamente dos previewResults
            // Isso garante consistência entre o que o backend detectou e o que mostramos
            const occupied: Record<string, boolean> = {};
            previewResults.forEach(preview => {
                if (preview.status === 'occupied' || preview.status === 'conflict') {
                    occupied[preview.date] = true;
                }
            });
            setOccupiedMap(occupied);

            // Set initial selection
            const initialSelected = previewResults.map((d: any) => parseISO(d.date));
            setSelectedDates(initialSelected);

            const initialConflicts = previewResults
                .filter((d: any) => d.status === 'occupied' || d.status === 'conflict')
                .map((d: any) => d.date);

            // Reset resolved conflicts when refreshing
            setResolvedConflicts([]);
            setSkippedWeekIndices([]);
            onDatesChange(initialSelected, initialConflicts, []);

        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: 'Erro ao carregar disponibilidade.'
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAvailabilityAndPreview();
    }, [frequency, originalSlotId, occurrenceCount, slotDate]);

    const isDateInValidWeekForRepetition = (date: Date, repetitionIndex: number) => {
        const start = parseISO(slotDate);
        const weeksToAdd = frequency === 'biweekly' ? repetitionIndex * 2 : repetitionIndex;
        const expectedDate = addWeeks(start, weeksToAdd);
        // Semana começa no domingo (weekStartsOn: 0)
        const weekStart = startOfWeek(expectedDate, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(expectedDate, { weekStartsOn: 0 });
        return isWithinInterval(date, { start: weekStart, end: weekEnd });
    };


    const fetchDayAvailability = async (date: Date) => {
        setIsLoadingSlots(true);
        try {
            const dateStr = format(date, 'yyyy-MM-dd');
            const slots = await slotsAPI.getSlots(dateStr, dateStr);
            setDaySlots(slots);
        } catch (error) {
            console.error("Failed to fetch day slots", error);
            toast({
                variant: "destructive",
                title: "Erro",
                description: "Não foi possível carregar os horários disponíveis."
            });
        } finally {
            setIsLoadingSlots(false);
        }
    };

    const handleSelect = async (days: Date[] | undefined) => {
        if (!days) {
            // Should not happen normally if we handle deselection, but if it does, ignore or reset?
            // User says "Remova a opção de deselecionar".
            // If DayPicker returns undefined or empty, it means all were deselected?
            // We just return and do nothing to prevent clearing.
            return;
        }

        // Verificar se clicou em uma data já selecionada (tentativa de deseleção)
        // Quando clica em data selecionada, o DayPicker tenta remover ela do array
        if (days.length < selectedDates.length) {
            // Encontrar qual data foi "removida" (clicada)
            const clickedDate = selectedDates.find(sd => !days.some(d => isSameDay(d, sd)));

            if (clickedDate) {
                // Abrir diálogo para mudar horário desta data
                setResolvingDate(clickedDate);
                setResolutionDialogOpen(true);
                fetchDayAvailability(clickedDate);
                return;
            }
        }

        const added = days.find(d => !selectedDates.some(sd => isSameDay(sd, d)));
        let newSelection = [...selectedDates];

        // 1. Handle New Date Selection
        if (added) {
            let foundRepIndex = -1;
            // Start loop from 0 to capture original week too if needed, or 1? 
            // Existing logic started at 1. We'll stick to 1 for repeats logic, but we need to handle the extended range.
            const baseMaxRep = (frequency === 'weekly' || frequency === 'biweekly') && occurrenceCount ? occurrenceCount - 1 : 1;
            // The total number of valid recurrence weeks we need is (baseMaxRep + 1).
            // But we display up to (baseMaxRep + skippedCount).
            // So the repetition index goes up to baseMaxRep + skippedWeekIndices.length.
            const currentMaxRep = baseMaxRep + skippedWeekIndices.length;

            for (let i = 1; i <= currentMaxRep; i++) {
                // If this week is skipped, we cannot select here (handled by isDateInValidWeekForRepetition check below or separate check?)
                // Actually handleSelect logic wants to find which "slot" this new date belongs to.
                // If the user clicks a date in a SKIPPED week, we shouldn't even be here because it should be disabled.

                if (skippedWeekIndices.includes(i)) continue;

                if (isDateInValidWeekForRepetition(added, i)) {
                    foundRepIndex = i;
                    break;
                }
            }

            if (foundRepIndex !== -1) {
                const dateStr = format(added, 'yyyy-MM-dd');

                // If Conflict: Open Resolution Dialog
                if (occupiedMap[dateStr]) {
                    setResolvingDate(added);
                    setResolutionDialogOpen(true);
                    fetchDayAvailability(added);
                    return;
                }

                // If Valid & Free: Swap date in that repetition week
                // Remove any *other* date that belongs to this same repetition index
                newSelection = newSelection.filter(d => !isDateInValidWeekForRepetition(d, foundRepIndex));
                newSelection.push(added);

                // If we are replacing a date that was previously resolved, remove it from resolvedConflicts
                const updatedResolved = resolvedConflicts.filter(rc => {
                    const rcDate = parseISO(rc.newDate);
                    return !isDateInValidWeekForRepetition(rcDate, foundRepIndex);
                });
                setResolvedConflicts(updatedResolved);

                newSelection.sort((a, b) => a.getTime() - b.getTime());
                setSelectedDates(newSelection);
                updateParent(newSelection, updatedResolved);
                return;
            }
        }

        // 2. Handle Clicking Already Selected Date (Deselection attempt by DayPicker)
        if (days.length < selectedDates.length) {
            // Find which one was "removed" (clicked)
            const removed = selectedDates.find(d => !days.some(day => isSameDay(day, d)));

            if (removed) {
                // Open Resolution Dialog for this date to allow time change
                setResolvingDate(removed);
                setResolutionDialogOpen(true);
                fetchDayAvailability(removed);

                // DO NOT UPDATE selectedDates. Keep it selected.
                return;
            }
        }
    };

    const handleResolveConflict = (time: string) => {
        if (!resolvingDate) return;

        const dateStr = format(resolvingDate, 'yyyy-MM-dd');

        const newResolution: ResolvedConflict = {
            originalDate: dateStr,
            newDate: dateStr,
            newTime: time
        };

        const updatedResolved = [...resolvedConflicts.filter(rc => rc.originalDate !== dateStr), newResolution];
        setResolvedConflicts(updatedResolved);

        let foundRepIndex = -1;
        const baseMaxRep = (frequency === 'weekly' || frequency === 'biweekly') && occurrenceCount ? occurrenceCount - 1 : 1;
        const currentMaxRep = baseMaxRep + skippedWeekIndices.length;

        // Check index 0 as well?
        if (isDateInValidWeekForRepetition(resolvingDate, 0)) {
            foundRepIndex = 0;
        } else {
            for (let i = 1; i <= currentMaxRep; i++) {
                if (skippedWeekIndices.includes(i)) continue;
                if (isDateInValidWeekForRepetition(resolvingDate, i)) {
                    foundRepIndex = i;
                    break;
                }
            }
        }

        let newSelection = [...selectedDates];
        if (foundRepIndex !== -1) {
            newSelection = newSelection.filter(d => !isDateInValidWeekForRepetition(d, foundRepIndex));
            newSelection.push(resolvingDate);
        }

        newSelection.sort((a, b) => a.getTime() - b.getTime());
        setSelectedDates(newSelection);

        setResolutionDialogOpen(false);
        setResolvingDate(null);

        updateParent(newSelection, updatedResolved);
    };

    const skipDate = (dateToSkip: Date) => {
        // 1. Identify Index
        let foundRepIndex = -1;
        const baseMaxRep = (frequency === 'weekly' || frequency === 'biweekly') && occurrenceCount ? occurrenceCount - 1 : 1;
        const currentMaxRep = baseMaxRep + skippedWeekIndices.length;

        if (isDateInValidWeekForRepetition(dateToSkip, 0)) {
            foundRepIndex = 0;
        } else {
            for (let i = 1; i <= currentMaxRep; i++) {
                if (isDateInValidWeekForRepetition(dateToSkip, i)) {
                    foundRepIndex = i;
                    break;
                }
            }
        }

        if (foundRepIndex === -1) return;

        // 2. Add to skipped
        // Prevent duplicate skips
        if (skippedWeekIndices.includes(foundRepIndex)) return;

        const newSkipped = [...skippedWeekIndices, foundRepIndex];
        setSkippedWeekIndices(newSkipped);

        // 3. Remove dateToSkip from selection
        const dateStr = format(dateToSkip, 'yyyy-MM-dd');
        let newSelection = selectedDates.filter(d => !isSameDay(d, dateToSkip));
        const updatedResolved = resolvedConflicts.filter(rc => rc.originalDate !== dateStr);
        setResolvedConflicts(updatedResolved);

        // 4. Calculate NEW week index to add
        const newIndex = currentMaxRep + 1;

        // 5. Calculate Date for newIndex
        const start = parseISO(slotDate);
        const weeksToAdd = frequency === 'biweekly' ? newIndex * 2 : newIndex;
        const newDate = addWeeks(start, weeksToAdd);

        // 6. Add to selection
        newSelection.push(newDate);
        newSelection.sort((a, b) => a.getTime() - b.getTime());
        setSelectedDates(newSelection);

        setResolutionDialogOpen(false);
        setResolvingDate(null);
        updateParent(newSelection, updatedResolved);
    };

    const handleSkipWeek = () => {
        if (!resolvingDate) return;
        skipDate(resolvingDate);
    };

    useEffect(() => {
        if (forceSkipDate) {
            const date = parseISO(forceSkipDate);
            // Verify if it's already selected or valid
            // We should try to skip it even if not "selected" in terms of array, 
            // but it must be within a valid week.
            skipDate(date);
            if (onSkipProcessed) onSkipProcessed();
        }
    }, [forceSkipDate, skippedWeekIndices, selectedDates, resolvedConflicts, frequency, occurrenceCount, slotDate, onSkipProcessed]); // Added dependencies for skipDate

    const updateParent = (dates: Date[], resolved: ResolvedConflict[]) => {
        const formatted = dates.map(d => format(d, 'yyyy-MM-dd'));
        const conflicts = formatted.filter(dateStr => {
            const isOccupied = occupiedMap[dateStr];
            const isResolved = resolved.some(r => r.originalDate === dateStr);
            return isOccupied && !isResolved;
        });

        onDatesChange(dates, conflicts, resolved);
    };

    const getSlotStatus = (time: string) => {
        const slot = daySlots.find(s => s.time.substring(0, 5) === time);
        if (!slot) return 'available';

        const isOccupiedStatus = slot.status && slot.status.toUpperCase() !== 'VAGO' && slot.status.toUpperCase() !== 'Vago';
        const isPersonal = slot.type === 'personal';

        if (isOccupiedStatus || isPersonal) return 'occupied';
        return 'available';
    };

    const isConflict = resolvingDate ? occupiedMap[format(resolvingDate, 'yyyy-MM-dd')] : false;

    return (
        <div className="flex flex-col items-center">
            {isLoading ? (
                <div className="h-64 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="w-full flex flex-col items-center">
                    <style>{`
                        /* Today Style - Stronger Contrast */
                        .rdp-day_today {
                            font-weight: 900 !important;
                            color: #c2410c !important; /* Orange-700 - Darker for readability */
                            position: relative;
                        }
                        .rdp-day_today:not(.rdp-day_selected) {
                            border: 2px solid #f97316 !important; /* Orange-500 */
                            background-color: #fff7ed !important; /* Orange-50 */
                        }
                        
                        /* Selected Style - Ensure visibility */
                        .rdp-day_selected:not([disabled]) { 
                            background-color: hsl(var(--primary)) !important; 
                            color: hsl(var(--primary-foreground)) !important;
                            font-weight: 700 !important;
                            border: 2px solid transparent !important;
                            opacity: 1 !important;
                        }
                        
                        /* When Today is also Selected */
                        .rdp-day_selected.rdp-day_today {
                            background-color: hsl(var(--primary)) !important;
                            color: hsl(var(--primary-foreground)) !important;
                            border: 2px solid #f97316 !important;
                        }

                        /* Standard Interaction */
                        .rdp-day_selected:hover:not([disabled]) { 
                            opacity: 0.9;
                        }
                        .rdp-day:hover:not(.rdp-day_selected):not([disabled]) {
                            background-color: #f1f5f9; /* Slate-100 */
                        }

                        /* Conflict Style */
                        .rdp-day_conflict:not(.rdp-day_selected) {
                            background-color: #fee2e2; /* Red-100 */
                            color: #b91c1c; /* Red-700 */
                            font-weight: bold;
                        }
                        
                        /* Resolved Conflict Style */
                        .rdp-day_resolved {
                            background-color: #d1fae5 !important;
                            color: #065f46 !important;
                            font-weight: bold;
                            border: 2px solid #10b981;
                        }
                         .rdp-day_resolved.rdp-day_selected {
                            background-color: #10b981 !important;
                            color: white !important;
                        }

                        /* Conflict that is Selected (needs resolution) */
                        .rdp-day_conflict_selected {
                            background-color: #ef4444 !important; /* Red-500 */
                            color: white !important;
                            box-shadow: 0 0 0 2px hsl(var(--background)), 0 0 0 4px #ef4444;
                            z-index: 10;
                            position: relative;
                        }

                        /* ORIGINAL DATE Marker */
                        .rdp-day_original:not(.rdp-day_selected) {
                             background-color: #fffbeb; /* Amber-50 */
                             color: #78350f !important; /* Amber-900 - dark text for contrast */
                        }
                        .rdp-day_original::after {
                            content: '★';
                            position: absolute;
                            top: -6px;
                            right: -4px;
                            font-size: 11px;
                            color: #f59e0b; /* Amber-500 */
                            text-shadow: 0 0 1px white;
                            z-index: 5;
                        }
                        /* If selected, make star brighter white/yellow */
                        .rdp-day_selected.rdp-day_original::after {
                            color: #fcd34d; /* Amber-300 */
                            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                        }
                    `}</style>
                    <DayPicker
                        mode="multiple"
                        selected={selectedDates}
                        onSelect={handleSelect}
                        modifiers={{
                            conflict: (date) => {
                                const dStr = format(date, 'yyyy-MM-dd');
                                return !!occupiedMap[dStr] && !resolvedConflicts.some(r => r.originalDate === dStr);
                            },
                            resolved: (date) => {
                                const dStr = format(date, 'yyyy-MM-dd');
                                return resolvedConflicts.some(r => r.originalDate === dStr);
                            },
                            conflictSelected: (date) => {
                                const dStr = format(date, 'yyyy-MM-dd');
                                const isResolved = resolvedConflicts.some(r => r.originalDate === dStr);
                                return !!occupiedMap[dStr] && !isResolved && selectedDates.some(sd => isSameDay(sd, date));
                            },
                            original: (date) => {
                                if (!slotDate) return false;
                                return isSameDay(date, parseISO(slotDate));
                            }
                        }}
                        modifiersClassNames={{
                            conflict: 'rdp-day_conflict',
                            resolved: 'rdp-day_resolved',
                            conflictSelected: 'rdp-day_conflict_selected',
                            original: 'rdp-day_original'
                        }}
                        weekStartsOn={0}
                        locale={ptBR}
                        labels={{
                            labelMonthDropdown: () => 'Mês',
                            labelYearDropdown: () => 'Ano',
                        }}
                        numberOfMonths={2}
                        pagedNavigation
                        disabled={[
                            { before: new Date() },
                            (date) => {
                                if (frequency !== 'weekly' && frequency !== 'biweekly') return false;
                                const baseMaxRep = occurrenceCount ? occurrenceCount - 1 : 1;
                                const currentMaxRep = baseMaxRep + skippedWeekIndices.length;

                                let isValid = false;
                                // Check if in Any Valid Week (0..currentMaxRep)
                                // We include 0 now because original week is also valid/invalid context
                                // But original code loop started at 1 for "MaxRep".
                                // Let's keep logic: check 0, check 1..Max

                                if (isDateInValidWeekForRepetition(date, 0)) {
                                    // If index 0 is skipped, then disabled
                                    if (!skippedWeekIndices.includes(0)) isValid = true;
                                }

                                if (!isValid) {
                                    for (let i = 1; i <= currentMaxRep; i++) {
                                        if (isDateInValidWeekForRepetition(date, i)) {
                                            if (!skippedWeekIndices.includes(i)) {
                                                isValid = true;
                                            }
                                            // If it's in a week but that week is skipped -> isValid stays false (disabled)
                                            // If it's in a week and not skipped -> isValid = true
                                            break;
                                        }
                                    }
                                }

                                return !isValid;
                            }
                        ]}
                        className="border rounded-md p-3"
                        classNames={{
                            months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                            month: "space-y-4",
                            caption: "flex justify-center pt-1 relative items-center",
                            caption_label: "text-sm font-medium",
                            nav: "space-x-1 flex items-center",
                            nav_button: cn("h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 border border-input hover:bg-accent hover:text-accent-foreground rounded-md flex items-center justify-center transition-colors"),
                            nav_button_previous: "absolute left-1",
                            nav_button_next: "absolute right-1",
                            table: "w-full border-collapse space-y-1",
                            head_row: "flex",
                            head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                            row: "flex w-full mt-2",
                            cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                            day: cn("h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-md flex items-center justify-center cursor-pointer transition-colors"),
                            day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                            day_today: "border-2 border-orange-500 bg-transparent text-orange-600 font-bold hover:bg-orange-100",
                            day_outside: "text-muted-foreground opacity-50",
                            day_disabled: "text-muted-foreground opacity-20",
                            day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                            day_hidden: "invisible",
                        }}
                    />

                    <div className="mt-4 flex gap-4 text-xs justify-center flex-wrap">
                        <div className="flex items-center gap-1">
                            <div className="w-6 h-6 border-2 border-orange-600 bg-orange-50 rounded-sm flex items-center justify-center text-xs font-semibold text-orange-700">
                                {new Date().getDate()}
                            </div>
                            <span className="text-muted-foreground">Hoje</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded-sm flex items-center justify-center relative">
                                <span className="absolute -top-1 -right-1 text-amber-500 text-[10px]">★</span>
                                <div className="w-3 h-3 bg-slate-200 rounded-sm"></div>
                            </div>
                            <span className="text-muted-foreground">Inicio do Contrato</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-primary rounded-sm" />
                            <span className="text-muted-foreground">Selecionado</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-red-100 border border-red-200 rounded-sm" />
                            <span className="text-muted-foreground">Ocupado</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-emerald-100 border border-emerald-500 rounded-sm" />
                            <span className="text-muted-foreground">Realocado</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-red-500 border-2 border-blue-500 rounded-sm" />
                            <span className="text-muted-foreground">Conflito</span>
                        </div>
                    </div>

                    <Dialog open={resolutionDialogOpen} onOpenChange={setResolutionDialogOpen}>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>
                                    {isConflict ? "Resolver Conflito" : "Alterar Horário"}
                                </DialogTitle>
                                <DialogDescription>
                                    {isConflict
                                        ? "O horário original está ocupado. Selecione um novo horário."
                                        : "Selecione um novo horário para este agendamento."}
                                    <br />
                                    Data: {resolvingDate && format(resolvingDate, "dd 'de' MMMM", { locale: ptBR })}
                                </DialogDescription>
                            </DialogHeader>

                            <ScrollArea className="h-[300px] w-full pr-4 border rounded-md p-2">
                                {isLoadingSlots ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-2">
                                        {HOURS.map(time => {
                                            const status = getSlotStatus(time);
                                            return (
                                                <Button
                                                    key={time}
                                                    variant={status === 'occupied' ? 'secondary' : 'outline'}
                                                    className={status === 'occupied' ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:bg-primary/5'}
                                                    disabled={status === 'occupied'}
                                                    onClick={() => handleResolveConflict(time)}
                                                >
                                                    <Clock className="w-3 h-3 mr-2 hidden sm:block" />
                                                    {time}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                )}
                            </ScrollArea>

                            {/* Separador e opção de pular - Apenas se não for data original */}
                            {resolvingDate && (!slotDate || !isSameDay(resolvingDate, parseISO(slotDate))) && (
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
                                        onClick={handleSkipWeek}
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
                                <Button variant="outline" onClick={() => setResolutionDialogOpen(false)}>
                                    Cancelar
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            )}
        </div>
    );
}
