import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { format, addWeeks, addMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, User, Repeat, CalendarDays, Check, Banknote, Gift, AlertTriangle } from "lucide-react";
import { slotsAPI } from "@/api/slotsAPI";
import { RecurrenceCalendar } from "./RecurrenceCalendar";
import { PatientForm, validateEmail } from "./shared/PatientForm";
import { ReminderSettings } from "./shared/ReminderSettings";
import { TimeSlotSelectionDialog } from "./TimeSlotSelectionDialog";
import { ContractViewDialog } from "./ContractViewDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCentsToBRL } from "@/lib/utils";

interface RecurrenceDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (
        frequency: 'individual' | 'weekly' | 'biweekly' | 'monthly',
        dates?: string[],
        occurrenceCount?: number,
        patientName?: string,
        patientPhone?: string,
        patientEmail?: string,
        payments?: Record<string, boolean>,
        inaugurals?: Record<string, boolean>,
        conflicts?: string[],
        reminders?: { oneHour: boolean; twentyFourHours: boolean },
        resolvedConflicts?: any[]
    ) => Promise<void>;
    slotId?: string | null;
    initialName?: string;
    initialPhone?: string;
    initialEmail?: string;
    initialPrivacyTermsAccepted?: boolean;
    // We might need the date of the slot itself to show "Individual" correctly immediately
    slotDate?: string;
    slotTime?: string;
}

export function RecurrenceDialog({ isOpen, onClose, onConfirm, slotId, initialName = '', initialPhone = '', initialEmail = '', slotDate, slotTime }: RecurrenceDialogProps) {
    const [frequency, setFrequency] = useState<'individual' | 'weekly' | 'biweekly' | 'monthly'>('individual');
    const [occurrenceCount, setOccurrenceCount] = useState<number>(1);
    const [isLoading, setIsLoading] = useState(false);
    const [generatedDates, setGeneratedDates] = useState<string[]>([]);
    const [conflictDates, setConflictDates] = useState<string[]>([]);
    const [resolvedConflicts, setResolvedConflicts] = useState<any[]>([]);
    const [payments, setPayments] = useState<Record<string, boolean>>({});
    const [inaugurals, setInaugurals] = useState<Record<string, boolean>>({});
    const [hasPreviousContracts, setHasPreviousContracts] = useState<boolean>(false);
    const [pendingContracts, setPendingContracts] = useState<Array<{ contractId: string; totalDebt: number; unpaidCount: number }>>([]);
    const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
    const [selectedContractInfo, setSelectedContractInfo] = useState<{ contractId: string; patientName?: string; patientPhone?: string; patientEmail?: string; slotType?: 'online' | 'presential' | 'personal' | null; privacyTermsAccepted?: boolean } | null>(null);
    const [contractViewOpen, setContractViewOpen] = useState(false);
    const [step, setStep] = useState(1);

    // Form states
    const [patientName, setPatientName] = useState(initialName);
    const [patientPhone, setPatientPhone] = useState(initialPhone);
    const [patientEmail, setPatientEmail] = useState(initialEmail);
    const [emailError, setEmailError] = useState("");

    // Estados para lembretes (Step 3)
    const [reminderOneHour, setReminderOneHour] = useState(false);
    const [reminderTwentyFourHours, setReminderTwentyFourHours] = useState(false);

    // Estados para pular semanas
    const [skippedDates, setSkippedDates] = useState<Set<string>>(new Set());
    const [dateToSkip, setDateToSkip] = useState<string | null>(null);
    const [selectedDateForTimeEdit, setSelectedDateForTimeEdit] = useState<string | null>(null);
    const [timeSlotDialogOpen, setTimeSlotDialogOpen] = useState(false);

    // Reset state when dialog opens
    useEffect(() => {
        if (isOpen) {
            setFrequency('individual');
            setOccurrenceCount(1);
            setPatientName(initialName);
            setPatientPhone(initialPhone);
            setPatientEmail(initialEmail);
            setEmailError("");
            setPayments({});
            setInaugurals({});
            setHasPreviousContracts(false);
            setPendingContracts([]);
            setSelectedContractId(null);
            setContractViewOpen(false);
            setResolvedConflicts([]);
            setStep(1);
            setReminderOneHour(false);
            setReminderTwentyFourHours(false);
            setSkippedDates(new Set());
            setDateToSkip(null);
            setSelectedDateForTimeEdit(null);
            setTimeSlotDialogOpen(false);
            if (slotDate) {
                setGeneratedDates([slotDate]);
            } else {
                setGeneratedDates([]);
            }
        }
    }, [isOpen, initialName, initialPhone, initialEmail, slotDate]);

    // Set default count when frequency changes
    useEffect(() => {
        // Para frequências recorrentes, iniciar em "Repetir 1x" (total = 2 ocorrências)
        if (frequency === 'weekly' || frequency === 'biweekly' || frequency === 'monthly') {
            setOccurrenceCount(2);
        } else {
            setOccurrenceCount(1);
        }
    }, [frequency]);

    // Verificar contratos anteriores e pendentes
    useEffect(() => {
        if (!isOpen) return;
        
        // Verificar se tem contratos anteriores (para mostrar inaugural)
        const checkContracts = async () => {
            if (!initialPhone && !initialEmail) {
                setHasPreviousContracts(false);
                setPendingContracts([]);
                return;
            }

            try {
                // Verificar se tem contratos anteriores
                const hasPrevious = await slotsAPI.checkPreviousContracts(initialPhone, initialEmail);
                setHasPreviousContracts(hasPrevious);

                // Buscar contratos pendentes
                const pending = await slotsAPI.getPendingContracts(initialPhone, initialEmail);
                setPendingContracts(pending);
            } catch (error) {
                console.error("Failed to check contracts:", error);
                setHasPreviousContracts(false);
                setPendingContracts([]);
            }
        };

        checkContracts();
    }, [isOpen, initialPhone, initialEmail]);

    // Update dates when frequency or count changes
    useEffect(() => {
        if (!isOpen || !slotId) return;

        const fetchPreview = async () => {
            if (frequency === 'individual') {
                if (slotDate) setGeneratedDates([slotDate]);
                return;
            }

            // For Weekly, the Calendar component handles fetching and updating generatedDates via callback
            if (frequency === 'weekly' || frequency === 'biweekly') {
                return;
            }

            try {
                // For Monthly, we fetch manually here since there is no calendar
                const result = await slotsAPI.previewRecurringSlots({
                    originalSlotId: slotId,
                    frequency,
                    range: 'current_and_next_month',
                    occurrenceCount
                });

                const dates = result.preview.map((r: any) => r.date);
                const conflicts = result.preview
                    .filter((r: any) => r.status === 'occupied')
                    .map((r: any) => r.date);
                setGeneratedDates(dates);
                setConflictDates(conflicts);
                setHasPreviousContracts(result.hasPreviousContracts || false);
            } catch (error) {
                console.error("Failed to fetch preview:", error);
            }
        };

        fetchPreview();
    }, [frequency, occurrenceCount, slotId, isOpen, slotDate]);


    const togglePayment = (dateStr: string) => {
        setPayments(prev => ({
            ...prev,
            [dateStr]: !prev[dateStr]
        }));
    };

    const toggleInaugural = (dateStr: string) => {
        setInaugurals(prev => ({
            ...prev,
            [dateStr]: !prev[dateStr]
        }));
    };

    // Função para validar email


    const handleEmailChange = (value: string) => {
        setPatientEmail(value);
        if (value.trim() && !validateEmail(value)) {
            setEmailError("Email inválido");
        } else {
            setEmailError("");
        }
    };

    const handleConfirm = async () => {
        if (!patientName.trim()) return;
        if (emailError) return;

        setIsLoading(true);
        try {
            await onConfirm(
                frequency,
                generatedDates,
                occurrenceCount,
                patientName,
                patientPhone,
                patientEmail,
                payments,
                inaugurals,
                conflictDates,
                { oneHour: reminderOneHour, twentyFourHours: reminderTwentyFourHours }, // Reminders
                resolvedConflicts  // Conflitos resolvidos
            );
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    // Função helper para obter o horário de um slot (original ou ajustado)
    const getSlotTime = (dateStr: string): string => {
        // Verifica se há conflito resolvido nesta data
        const resolved = resolvedConflicts.find(rc => rc.newDate === dateStr || rc.originalDate === dateStr);
        if (resolved && resolved.newTime) {
            return resolved.newTime;
        }
        // Retorna horário original
        return slotTime || '';
    };

    // Função para abrir modal ao clicar na data
    const handleDateClick = (dateStr: string) => {
        setSelectedDateForTimeEdit(dateStr);
        setTimeSlotDialogOpen(true);
    };

    // Função para pular semana
    // Função para pular semana
    const handleSkipDate = (dateStr: string) => {
        if (frequency === 'weekly' || frequency === 'biweekly') {
            setDateToSkip(dateStr);
            setTimeSlotDialogOpen(false);
            return;
        }

        const newSkipped = new Set(skippedDates);
        newSkipped.add(dateStr);
        setSkippedDates(newSkipped);
        setTimeSlotDialogOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {step === 1 ? "Dados do Contato 1/3" : step === 2 ? "Configurar Agendamento 2/3" : "Confirmar Notificações 3/3"}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 1
                            ? "Preencha os dados de contato do paciente."
                            : step === 2
                                ? "Defina a frequência e os detalhes do agendamento."
                                : "Defina as notificações para os agendamentos."}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {step === 1 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-left-2">
                            <PatientForm
                                name={patientName}
                                onNameChange={setPatientName}
                                phone={patientPhone}
                                onPhoneChange={setPatientPhone}
                                email={patientEmail}
                                onEmailChange={handleEmailChange}
                                emailError={emailError}
                                autoFocus
                            />
                        </div>
                    )}

                    {step === 2 && (
                        <div className="grid gap-4 animate-in fade-in slide-in-from-right-2">
                            <div className="space-y-3">
                                <Label className="text-base font-semibold">Tipo de Agendamento</Label>
                                <RadioGroup value={frequency} onValueChange={(v) => setFrequency(v as any)} className="grid grid-cols-4 gap-4">
                                    <div
                                        className={`relative flex flex-col items-center justify-center border-2 p-4 rounded-xl cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:border-primary/50 ${frequency === 'individual' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-200'}`}
                                        onClick={() => setFrequency('individual')}
                                    >
                                        <div className={`p-2 rounded-full mb-2 ${frequency === 'individual' ? 'bg-primary/20 text-primary' : 'bg-slate-100 text-slate-500'}`}>
                                            <User className="h-5 w-5" />
                                        </div>
                                        <span className={`font-semibold text-sm ${frequency === 'individual' ? 'text-primary' : 'text-slate-700'}`}>Individual</span>
                                        <span className="text-[11px] text-muted-foreground text-center">Apenas esta data</span>
                                        <RadioGroupItem value="individual" id="individual" className="sr-only" />
                                    </div>
                                    <div
                                        className={`relative flex flex-col items-center justify-center border-2 p-4 rounded-xl cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:border-primary/50 ${frequency === 'weekly' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-200'}`}
                                        onClick={() => setFrequency('weekly')}
                                    >
                                        <div className={`p-2 rounded-full mb-2 ${frequency === 'weekly' ? 'bg-primary/20 text-primary' : 'bg-slate-100 text-slate-500'}`}>
                                            <Repeat className="h-5 w-5" />
                                        </div>
                                        <span className={`font-semibold text-sm ${frequency === 'weekly' ? 'text-primary' : 'text-slate-700'}`}>Semanal</span>
                                        <span className="text-[11px] text-muted-foreground text-center">Repetir semanalmente</span>

                                        <RadioGroupItem value="weekly" id="weekly" className="sr-only" />
                                    </div>
                                    <div
                                        className={`relative flex flex-col items-center justify-center border-2 p-4 rounded-xl cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:border-primary/50 ${frequency === 'biweekly' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-200'}`}
                                        onClick={() => setFrequency('biweekly')}
                                    >
                                        <div className={`p-2 rounded-full mb-2 ${frequency === 'biweekly' ? 'bg-primary/20 text-primary' : 'bg-slate-100 text-slate-500'}`}>
                                            <CalendarDays className="h-5 w-5" />
                                        </div>
                                        <span className={`font-semibold text-sm ${frequency === 'biweekly' ? 'text-primary' : 'text-slate-700'}`}>Quinzenal</span>
                                        <span className="text-[11px] text-muted-foreground text-center">A cada 2 semanas</span>
                                        <RadioGroupItem value="biweekly" id="biweekly" className="sr-only" />
                                    </div>
                                    <div
                                        className={`relative flex flex-col items-center justify-center border-2 p-4 rounded-xl cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:border-primary/50 ${frequency === 'monthly' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-200'}`}
                                        onClick={() => setFrequency('monthly')}
                                    >
                                        <div className={`p-2 rounded-full mb-2 ${frequency === 'monthly' ? 'bg-primary/20 text-primary' : 'bg-slate-100 text-slate-500'}`}>
                                            <CalendarDays className="h-5 w-5" />
                                        </div>
                                        <span className={`font-semibold text-sm ${frequency === 'monthly' ? 'text-primary' : 'text-slate-700'}`}>Mensal</span>
                                        <span className="text-[11px] text-muted-foreground text-center">1x por mês</span>
                                        <RadioGroupItem value="monthly" id="monthly" className="sr-only" />
                                    </div>
                                </RadioGroup>
                            </div>

                            {frequency === 'weekly' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-2">
                                        <Label>Repetição</Label>
                                        <Select value={occurrenceCount.toString()} onValueChange={(v) => setOccurrenceCount(parseInt(v))}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione quantas vezes" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="2">Repetir 1x (Próxima semana)</SelectItem>
                                                <SelectItem value="3">Repetir 2x (2 semanas)</SelectItem>
                                                <SelectItem value="4">Repetir 3x (3 semanas)</SelectItem>
                                                <SelectItem value="5">Repetir 4x (4 semanas)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {slotId && (
                                        <div className="border rounded-md p-4 bg-slate-50">
                                            <p className="text-sm font-medium mb-2 text-center text-muted-foreground">
                                                Verifique e ajuste no calendário:
                                            </p>
                                            <RecurrenceCalendar
                                                originalSlotId={slotId}
                                                frequency={frequency}
                                                occurrenceCount={occurrenceCount}
                                                slotDate={slotDate || ''}
                                                slotTime={''}
                                                resolvedConflicts={resolvedConflicts as any}
                                                onDatesChange={(dates: Date[], conflicts: string[], resolved: any[]) => {
                                                    const formatted = dates.map(d => format(d, 'yyyy-MM-dd'));
                                                    setGeneratedDates(formatted);
                                                    setConflictDates(conflicts);
                                                    setResolvedConflicts(resolved);
                                                }}
                                                forceSkipDate={dateToSkip}
                                                onSkipProcessed={() => setDateToSkip(null)}
                                                onHasPreviousContractsChange={setHasPreviousContracts}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                            {frequency === 'biweekly' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-2">
                                        <Label>Repetição</Label>
                                        <Select value={occurrenceCount.toString()} onValueChange={(v) => setOccurrenceCount(parseInt(v))}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione quantas vezes" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="2">Repetir 1x (Próxima quinzena)</SelectItem>
                                                <SelectItem value="3">Repetir 2x (2 quinzenas)</SelectItem>
                                                <SelectItem value="4">Repetir 3x (3 quinzenas)</SelectItem>
                                                <SelectItem value="5">Repetir 4x (4 quinzenas)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {slotId && (
                                        <div className="border rounded-md p-4 bg-slate-50">
                                            <p className="text-sm font-medium mb-2 text-center text-muted-foreground">
                                                Verifique e ajuste no calendário:
                                            </p>
                                            <RecurrenceCalendar
                                                originalSlotId={slotId}
                                                frequency={frequency}
                                                occurrenceCount={occurrenceCount}
                                                slotDate={slotDate || ''}
                                                slotTime={''}
                                                resolvedConflicts={resolvedConflicts as any}
                                                onDatesChange={(dates: Date[], conflicts: string[], resolved: any[]) => {
                                                    const formatted = dates.map(d => format(d, 'yyyy-MM-dd'));
                                                    setGeneratedDates(formatted);
                                                    setConflictDates(conflicts);
                                                    setResolvedConflicts(resolved);
                                                }}
                                                forceSkipDate={dateToSkip}
                                                onSkipProcessed={() => setDateToSkip(null)}
                                                onHasPreviousContractsChange={setHasPreviousContracts}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                            {frequency === 'monthly' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-2">
                                        <Label>Repetição</Label>
                                        <Select value={occurrenceCount.toString()} onValueChange={(v) => setOccurrenceCount(parseInt(v))}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione quantas vezes" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="2">Repetir 1x (Próximo mês)</SelectItem>
                                                <SelectItem value="3">Repetir 2x (2 meses)</SelectItem>
                                                <SelectItem value="4">Repetir 3x (3 meses)</SelectItem>
                                                <SelectItem value="5">Repetir 4x (4 meses)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <p className="text-sm text-muted-foreground">
                                        O agendamento mensal será repetido {Math.max(0, occurrenceCount - 1)} vez{occurrenceCount - 1 === 1 ? "" : "es"}.
                                    </p>
                                </div>
                            )}

                            <div className="space-y-3 mt-4">
                                <Label className="text-base font-semibold">Datas Geradas</Label>
                                <div className="border rounded-xl overflow-hidden shadow-sm">
                                    <div className="bg-slate-50 p-3 border-b grid grid-cols-[1fr,auto] gap-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        <span>Data do Agendamento</span>
                                        <span>Status Pagamento</span>
                                    </div>
                                    <div className="divide-y max-h-[300px] overflow-y-auto bg-white">
                                        {generatedDates.length === 0 ? (
                                            <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                                                <CalendarDays className="h-8 w-8 text-slate-300" />
                                                <p>Nenhuma data selecionada.</p>
                                            </div>
                                        ) : (
                                            generatedDates.map((dateStr) => {
                                                const isOriginal = dateStr === slotDate;
                                                const isSkipped = skippedDates.has(dateStr);
                                                const isConflict = conflictDates.includes(dateStr);

                                                // Calcular a primeira data válida (não pulada) para habilitar o Inaugural
                                                // Só mostrar se for o primeiro contrato (não renovação)
                                                const sortedDates = [...generatedDates].sort();
                                                const firstValidDate = sortedDates.find(d => !skippedDates.has(d));
                                                const showInaugural = dateStr === firstValidDate && !hasPreviousContracts;

                                                return (
                                                    <div
                                                        key={dateStr}
                                                        onClick={() => !isSkipped && handleDateClick(dateStr)}
                                                        className={`p-3 grid grid-cols-[1fr,auto] gap-4 items-center transition-all ${isSkipped
                                                            ? 'opacity-40 bg-slate-100 cursor-not-allowed'
                                                            : isOriginal
                                                                ? 'bg-amber-50/50 hover:bg-amber-50 cursor-pointer'
                                                                : isConflict
                                                                    ? 'bg-red-50/40 hover:bg-red-50/60 cursor-pointer border-l-4 border-red-400'
                                                                    : 'hover:bg-slate-50 cursor-pointer hover:border-l-4 hover:border-primary'
                                                            }`}
                                                    >
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`font-medium text-sm ${isSkipped
                                                                    ? 'line-through text-slate-400'
                                                                    : isOriginal
                                                                        ? 'text-amber-900'
                                                                        : 'text-slate-800'
                                                                    }`}>
                                                                    {format(parseISO(dateStr), "dd 'de' MMMM", { locale: ptBR })}
                                                                </span>
                                                                {isConflict && !isSkipped && (
                                                                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200 font-bold shadow-sm flex items-center gap-1">
                                                                        <AlertTriangle className="h-3 w-3" />
                                                                        Conflito
                                                                    </span>
                                                                )}
                                                                {isOriginal && (
                                                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-bold shadow-sm">
                                                                        Original
                                                                    </span>
                                                                )}
                                                                {isSkipped && (
                                                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-bold shadow-sm">
                                                                        Pulada
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-xs capitalize ${isSkipped ? 'text-slate-400' : 'text-muted-foreground'}`}>
                                                                    {format(parseISO(dateStr), "EEEE", { locale: ptBR })}
                                                                </span>
                                                                {/* Exibir horário (original ou ajustado) */}
                                                                {getSlotTime(dateStr) && (
                                                                    <>
                                                                        <span className={`text-xs ${isSkipped ? 'text-slate-400' : 'text-muted-foreground'}`}>•</span>
                                                                        <span className={`text-xs font-medium ${isSkipped ? 'text-slate-400' : 'text-slate-600'}`}>
                                                                            {getSlotTime(dateStr)}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                            {/* Tag Inaugural - Somente na primeira data válida */}
                                                            {showInaugural && (
                                                                <div className="flex items-center gap-1.5">
                                                                    <Label
                                                                        htmlFor={`inaugural-${dateStr}`}
                                                                        className={`text-xs font-medium cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all ${inaugurals[dateStr]
                                                                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                                            : 'bg-slate-50 text-slate-400 border-slate-200'
                                                                            }`}
                                                                    >
                                                                        <Gift className="h-3 w-3" />
                                                                        Inaugural
                                                                    </Label>
                                                                    <Switch
                                                                        id={`inaugural-${dateStr}`}
                                                                        checked={!!inaugurals[dateStr]}
                                                                        disabled={isSkipped}
                                                                        onCheckedChange={() => toggleInaugural(dateStr)}
                                                                    />
                                                                </div>
                                                            )}

                                                            {/* Tag Pago/Pendente - Desabilitado se Inaugural ou Pulada */}
                                                            <div className="flex items-center gap-1.5">
                                                                <Label
                                                                    htmlFor={`paid-${dateStr}`}
                                                                    className={`text-xs font-medium cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all ${inaugurals[dateStr] || isSkipped
                                                                        ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed opacity-50'
                                                                        : payments[dateStr]
                                                                            ? 'bg-green-50 text-green-700 border-green-200'
                                                                            : 'bg-slate-50 text-slate-500 border-slate-200'
                                                                        }`}
                                                                >
                                                                    {payments[dateStr] ? <Check className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}
                                                                    {payments[dateStr] ? 'Pago' : 'Pendente'}
                                                                </Label>
                                                                <Switch
                                                                    id={`paid-${dateStr}`}
                                                                    checked={!!payments[dateStr]}
                                                                    disabled={!!inaugurals[dateStr] || isSkipped}
                                                                    onCheckedChange={() => togglePayment(dateStr)}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
                            <div className="space-y-2">
                                <h3 className="font-semibold text-lg">Notificações</h3>
                                <p className="text-sm text-muted-foreground">
                                    Configure os lembretes automáticos via WhatsApp para o paciente.
                                </p>
                            </div>

                            <ReminderSettings
                                reminderOneHour={reminderOneHour}
                                setReminderOneHour={setReminderOneHour}
                                reminderTwentyFourHours={reminderTwentyFourHours}
                                setReminderTwentyFourHours={setReminderTwentyFourHours}
                            />
                        </div>
                    )}
                </div>

                <DialogFooter className="flex justify-between sm:justify-between w-full">
                    {step === 1 ? (
                        <>
                            <Button variant="outline" onClick={onClose}>
                                Voltar
                            </Button>
                            <Button onClick={() => setStep(2)} disabled={!patientName.trim() || !!emailError}>
                                Próximo
                            </Button>
                        </>
                    ) : step === 2 ? (
                        <>
                            <Button variant="outline" onClick={() => setStep(1)} disabled={isLoading}>
                                Voltar
                            </Button>
                            <div className="flex flex-col items-end gap-2">
                                <Button
                                    onClick={() => setStep(3)}
                                    disabled={conflictDates.length > 0}
                                    title={conflictDates.length > 0 ? "Resolva todos os conflitos no calendário antes de prosseguir" : ""}
                                >
                                    Próximo
                                </Button>
                                {conflictDates.length > 0 && (
                                    <p className="text-xs text-red-600 font-medium">
                                        É preciso resolver os conflitos antes de prosseguir
                                    </p>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={() => setStep(2)} disabled={isLoading}>
                                Voltar
                            </Button>
                            <Button onClick={handleConfirm} disabled={isLoading || !patientName.trim()}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Confirmar Contratação
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>

            {/* Modal de seleção de horário e pular semana */}
            <TimeSlotSelectionDialog
                open={timeSlotDialogOpen}
                onClose={() => {
                    setTimeSlotDialogOpen(false);
                    setSelectedDateForTimeEdit(null);
                }}
                date={selectedDateForTimeEdit || ''}
                currentTime={selectedDateForTimeEdit ? getSlotTime(selectedDateForTimeEdit) : ''}
                isConflict={!!(selectedDateForTimeEdit && conflictDates.includes(selectedDateForTimeEdit))}
                proposedDurationMinutes={60}
                onSelectTime={(time) => {
                    const dateStr = selectedDateForTimeEdit;
                    if (!dateStr) return;

                    const newResolution = { originalDate: dateStr, newDate: dateStr, newTime: time };
                    setResolvedConflicts((prev) => [
                        ...prev.filter((rc) => rc.originalDate !== dateStr),
                        newResolution,
                    ]);

                    // Ao escolher um novo horário, considerar o conflito resolvido na lista
                    setConflictDates((prev) => prev.filter((d) => d !== dateStr));

                    setTimeSlotDialogOpen(false);
                    setSelectedDateForTimeEdit(null);
                }}
                onSkip={() => handleSkipDate(selectedDateForTimeEdit || '')}
                canSkip={selectedDateForTimeEdit !== slotDate}
            />

            {/* Dialog de Visualização do Contrato */}
            {selectedContractInfo && (
                <ContractViewDialog
                    isOpen={contractViewOpen}
                    onClose={() => {
                        setContractViewOpen(false);
                        setSelectedContractInfo(null);
                    }}
                    contractId={selectedContractInfo.contractId}
                    patientName={selectedContractInfo.patientName}
                    patientPhone={selectedContractInfo.patientPhone}
                    patientEmail={selectedContractInfo.patientEmail}
                    slotType={selectedContractInfo.slotType}
                    privacyTermsAccepted={selectedContractInfo.privacyTermsAccepted}
                />
            )}
        </Dialog>
    );
}

