import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { format, startOfWeek, endOfWeek, addDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DayPicker } from "react-day-picker";
import { Loader2, Calendar, User, Bell, Clock, Edit, Trash2, AlertTriangle, Gift } from "lucide-react";
import { slotsAPI, TimeSlot } from "@/api/slotsAPI";
import { useToast } from "@/hooks/use-toast";
import { PatientForm, validateEmail } from "./shared/PatientForm";
import { ReminderSettings } from "./shared/ReminderSettings";

interface RecurrenceReviewDialogProps {
    isOpen: boolean;
    onClose: () => void;
    groupId: string;
    slotTime: string;
}

interface GroupSlot {
    id?: string;
    date: string;
    time: string;
    isPaid?: boolean;
    isInaugural?: boolean;
    patientName?: string;
    patientPhone?: string;
    patientEmail?: string;
    patientId?: string;
    groupId?: string;
    startTime?: string; // Timestamp ISO para ordenação precisa
}

export function RecurrenceReviewDialog({
    isOpen,
    onClose,
    groupId,
    slotTime,
}: RecurrenceReviewDialogProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [slots, setSlots] = useState<GroupSlot[]>([]);
    const [patientName, setPatientName] = useState("");
    const [patientPhone, setPatientPhone] = useState("");
    const [patientEmail, setPatientEmail] = useState("");
    const [payments, setPayments] = useState<Record<string, boolean>>({});
    const [inaugurals, setInaugurals] = useState<Record<string, boolean>>({});
    const [frequency, setFrequency] = useState<"weekly" | "monthly" | "biweekly" | "individual">("individual");
    const [editingSlot, setEditingSlot] = useState<GroupSlot | null>(null);
    const [newTime, setNewTime] = useState("");
    const [newDate, setNewDate] = useState<Date | null>(null);
    const [availableSlots, setAvailableSlots] = useState<Array<{ time: string; available: boolean }>>([]);
    const [slotToCancel, setSlotToCancel] = useState<GroupSlot | null>(null);

    // Estado local para armazenar o groupId de forma independente da prop
    // Isso evita que alterações externas (como cancelamento de slots) invalidem o ID
    const [localGroupId, setLocalGroupId] = useState<string>("");

    // Estados para lembretes por slot (mapa: date -> {oneHour, twentyFourHours})
    const [remindersPerSlot, setRemindersPerSlot] = useState<Record<string, { oneHour: boolean; twentyFourHours: boolean }>>({});
    const [emailError, setEmailError] = useState("");

    // Estados globais para controle da UI de notificações
    const [globalOneHour, setGlobalOneHour] = useState(false);
    const [globalTwentyFourHours, setGlobalTwentyFourHours] = useState(false);

    // Estado para armazenar informação da sessão original
    const [originalSession, setOriginalSession] = useState<{ contractId: string; slotId: string; startTime: string } | null>(null);



    const handleEmailChange = (value: string) => {
        setPatientEmail(value);
        if (value && !validateEmail(value)) {
            setEmailError("Email inválido");
        } else {
            setEmailError("");
        }
    };

    // Carregar dados do grupo
    useEffect(() => {
        if (isOpen && groupId) {
            console.log('[RecurrenceReviewDialog] Carregando dados para groupId:', groupId);
            // Armazenar o groupId localmente para evitar perda por atualizações externas
            setLocalGroupId(groupId);
            // Passar groupId diretamente na primeira carga para evitar race condition
            loadGroupData(groupId);
        } else if (isOpen && !groupId) {
            console.error('[RecurrenceReviewDialog] Diálogo aberto sem groupId válido!');
        }
    }, [isOpen, groupId]);

    const loadGroupData = async (idToUse?: string) => {
        // Usar o ID passado como parâmetro (primeira carga) ou o localGroupId (recargas)
        const effectiveGroupId = idToUse || localGroupId;

        if (!effectiveGroupId) {
            console.error('[RecurrenceReviewDialog] loadGroupData chamado sem groupId válido');
            return;
        }

        setIsLoading(true);
        try {
            const groupSlots = await slotsAPI.getContractSlots(effectiveGroupId);

            // Ordenar por start_time se disponível, senão por date + time
            groupSlots.sort((a, b) => {
                // Se ambos têm start_time, usar para ordenação precisa
                if ((a as any).startTime && (b as any).startTime) {
                    return new Date((a as any).startTime).getTime() - new Date((b as any).startTime).getTime();
                }
                // Fallback: ordenar por date e depois por time
                const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
                if (dateCompare !== 0) return dateCompare;
                return (a.time || '').localeCompare(b.time || '');
            });

            setSlots(groupSlots);

            // Carregar dados do paciente
            if (groupSlots.length > 0) {
                setPatientName(groupSlots[0].patientName || '');
                setPatientPhone(groupSlots[0].patientPhone || '');
                setPatientEmail(groupSlots[0].patientEmail || '');

                // Buscar a sessão original do paciente (primeira sessão do primeiro contrato)
                if (groupSlots[0].patientId) {
                    try {
                        const original = await slotsAPI.getOriginalSession(groupSlots[0].patientId);
                        setOriginalSession(original);
                    } catch (error) {
                        console.error('Erro ao buscar sessão original:', error);
                        setOriginalSession(null);
                    }
                } else {
                    setOriginalSession(null);
                }
            }

            // Extrair pagamentos, inaugurais e lembretes
            const paymentsMap: Record<string, boolean> = {};
            const inauguralsMap: Record<string, boolean> = {};
            const remindersMap: Record<string, { oneHour: boolean; twentyFourHours: boolean }> = {};
            groupSlots.forEach(slot => {
                paymentsMap[slot.date] = slot.isPaid || false;
                inauguralsMap[slot.date] = slot.isInaugural || false;
                remindersMap[slot.date] = {
                    // @ts-ignore - reminders pode não existir em slots antigos
                    oneHour: slot.reminders?.oneHour || false,
                    // @ts-ignore
                    twentyFourHours: slot.reminders?.twentyFourHours || false
                };
            });
            setPayments(paymentsMap);
            setInaugurals(inauguralsMap);
            setRemindersPerSlot(remindersMap);

            // Inicializar estados globais com base no primeiro slot (ou false)
            if (groupSlots.length > 0) {
                // @ts-ignore
                const firstSlotReminders = groupSlots[0].reminders || { oneHour: false, twentyFourHours: false };
                setGlobalOneHour(firstSlotReminders.oneHour);
                setGlobalTwentyFourHours(firstSlotReminders.twentyFourHours);
            } else {
                setGlobalOneHour(false);
                setGlobalTwentyFourHours(false);
            }

            // Determinar frequência
            // Determinar frequência
            if (groupSlots.length > 1) {
                const firstDate = new Date(groupSlots[0].date);
                const secondDate = new Date(groupSlots[1].date);
                const daysDiff = Math.round((secondDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));

                if (daysDiff >= 6 && daysDiff <= 8) {
                    setFrequency('weekly');
                } else if (daysDiff >= 13 && daysDiff <= 15) {
                    setFrequency('biweekly');
                } else if (daysDiff >= 28 && daysDiff <= 31) {
                    setFrequency('monthly');
                }
            }
        } catch (error) {
            console.error('Erro ao carregar dados do grupo:', error);
            toast({
                title: "Erro ao carregar",
                description: "Não foi possível carregar os dados do contrato",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const togglePayment = (date: string) => {
        setPayments(prev => ({
            ...prev,
            [date]: !prev[date]
        }));
    };

    const toggleInaugural = (slotIdentifier: string) => {
        // Encontrar o slot por ID (mais preciso) ou por data (fallback)
        const slot = slots.find(s => String(s.id) === slotIdentifier || s.date === slotIdentifier);
        if (!slot) return;

        // Verificar se é a sessão original
        let isOriginal = false;
        if (originalSession) {
            // Priorizar comparação por ID do slot - converter para string
            if (slot.id && originalSession.slotId) {
                isOriginal = String(slot.id) === String(originalSession.slotId);
            } else if (slot.startTime) {
                // Fallback: comparar por start_time e contract_id
                const slotStartTime = new Date(slot.startTime).getTime();
                const originalStartTime = new Date(originalSession.startTime).getTime();
                const slotContractId = slot.groupId ? String(slot.groupId) : null;
                const originalContractId = String(originalSession.contractId);
                isOriginal = slotStartTime === originalStartTime && 
                             slotContractId === originalContractId;
            }
        }

        if (!isOriginal) {
            toast({
                variant: "destructive",
                title: "Não permitido",
                description: "Apenas a primeira sessão do primeiro contrato pode ser inaugural."
            });
            return;
        }

        setInaugurals(prev => ({
            ...prev,
            [slot.date]: !prev[slot.date]
        }));
    };

    // Função auxiliar para criar data local correta (evita problema de UTC-3 virar dia anterior)
    const parseLocalDate = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
    };

    const isPastDate = (dateStr: string, timeStr: string) => {
        const slotDate = parseLocalDate(dateStr);
        slotDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (slotDate < today) return true; // Dias anteriores
        if (slotDate > today) return false; // Dias futuros

        // Se for hoje, verifica o horário
        const [hours, minutes] = timeStr.split(':').map(Number);
        const slotDateTime = new Date();
        slotDateTime.setHours(hours, minutes, 0, 0);

        const now = new Date();
        return slotDateTime < now;
    };

    const handleSave = async () => {
        // Debug: Verificar o valor do localGroupId
        console.log('[RecurrenceReviewDialog] handleSave - localGroupId:', localGroupId, 'tipo:', typeof localGroupId);

        // Validar localGroupId
        if (!localGroupId || localGroupId.trim() === '') {
            toast({
                title: "Erro de validação",
                description: "ID do grupo de recorrência inválido. Não é possível salvar.",
                variant: "destructive",
            });
            return;
        }

        if (patientEmail && !validateEmail(patientEmail)) {
            toast({
                title: "Email inválido",
                description: "Por favor, corrija o email antes de salvar.",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            await slotsAPI.updateContract(localGroupId, {
                patientName,
                patientPhone,
                patientEmail,
                payments,
                inaugurals,
                remindersPerDate: remindersPerSlot
            });

            toast({
                title: "Salvo com sucesso",
                description: "As alterações foram salvas no banco de dados",
            });
            onClose();
        } catch (error) {
            console.error('Erro ao salvar:', error);
            toast({
                title: "Erro ao salvar",
                description: error instanceof Error ? error.message : "Não foi possível salvar as alterações",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditTime = async (slot: GroupSlot) => {
        setEditingSlot(slot);
        setNewTime(slot.time);
        const slotDate = parseLocalDate(slot.date);
        setNewDate(slotDate);

        // Carregar horários disponíveis para a data atual
        await loadAvailableSlots(slot.date);
    };

    const loadAvailableSlots = async (dateStr: string) => {
        try {
            // Gerar todos os horários de 06:00 a 22:00
            const allSlots = [];
            for (let hour = 6; hour <= 22; hour++) {
                allSlots.push({
                    time: `${hour.toString().padStart(2, '0')}:00`,
                    available: true
                });
            }

            // Buscar slots ocupados nessa data
            const occupiedSlots = await slotsAPI.getSlots(dateStr, dateStr);

            // Marcar horários ocupados (exceto o slot sendo editado)
            // Considera ocupado: slots não-vagos OU slots pessoais
            const slotsWithAvailability = allSlots.map(slot => ({
                ...slot,
                available: !occupiedSlots.some(occupied =>
                    occupied.time === slot.time &&
                    occupied.id !== editingSlot?.id &&
                    (occupied.status?.toUpperCase() !== 'VAGO' || occupied.type === 'personal')
                )
            }));

            setAvailableSlots(slotsWithAvailability);
        } catch (error) {
            console.error('Erro ao carregar horários:', error);
        }
    };

    const handleSaveTime = async () => {
        if (!editingSlot || !newTime || !newDate) return;

        try {
            const newDateStr = format(newDate, 'yyyy-MM-dd');
            await slotsAPI.changeSlotTime(editingSlot.id!, newDateStr, newTime);

            toast({
                title: "Horário atualizado",
                description: `Alterado para ${format(newDate, "dd/MM/yyyy", { locale: ptBR })} às ${newTime}`,
            });

            setEditingSlot(null);
            loadGroupData(); // Recarregar dados
        } catch (error) {
            console.error('Erro ao atualizar horário:', error);
            toast({
                title: "Erro ao atualizar",
                description: error instanceof Error ? error.message : "Não foi possível atualizar o horário",
                variant: "destructive",
            });
        }
    };

    const handleRequestCancel = (slot: GroupSlot) => {
        setSlotToCancel(slot);
    };

    const confirmCancelSlot = async () => {
        if (!slotToCancel || !slotToCancel.id) return;

        try {
            await slotsAPI.deleteSlot(slotToCancel.id);

            toast({
                title: "Agendamento cancelado",
                description: "O agendamento foi removido com sucesso.",
            });

            // Remove from local state immediately
            setSlots(currentSlots => currentSlots.filter(s => s.id !== slotToCancel.id));
            setSlotToCancel(null);

        } catch (error) {
            console.error('Erro ao cancelar agendamento:', error);
            toast({
                title: "Erro ao cancelar",
                description: "Não foi possível cancelar o agendamento. Tente novamente.",
                variant: "destructive",
            });
        }
    };

    const frequencyLabels = {
        weekly: "Semanal",
        monthly: "Mensal",
        biweekly: "Quinzenal",
        individual: "Individual"
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Rever Contrato</DialogTitle>
                    <DialogDescription>
                        Visualize e edite as informações do contrato. Datas passadas não podem ser alteradas.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <Tabs defaultValue="patient" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="patient" className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                Paciente
                            </TabsTrigger>
                            <TabsTrigger value="schedule" className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Agendamento
                            </TabsTrigger>
                            <TabsTrigger value="notifications" className="flex items-center gap-2">
                                <Bell className="h-4 w-4" />
                                Notificações
                            </TabsTrigger>
                        </TabsList>

                        {/* Aba 1: Dados do Paciente */}
                        <TabsContent value="patient" className="space-y-4 mt-4">
                            <PatientForm
                                name={patientName}
                                onNameChange={setPatientName}
                                phone={patientPhone}
                                onPhoneChange={setPatientPhone}
                                email={patientEmail}
                                onEmailChange={handleEmailChange}
                                emailError={emailError}
                            />
                        </TabsContent>

                        {/* Aba 2: Agendamento */}
                        <TabsContent value="schedule" className="space-y-4 mt-4">
                            <div className="space-y-4">
                                {/* Informações do Contrato */}
                                <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                                    <h3 className="font-semibold text-sm">Informações do Contrato</h3>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <span className="text-muted-foreground">Tipo:</span>{" "}
                                            <span className="font-medium">{frequencyLabels[frequency]}</span><br />
                                            <span className="text-muted-foreground">Sessões:</span>{" "}
                                            <span className="font-medium">{slots.length}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Lista de Datas */}
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-sm">Datas do Contrato</h3>
                                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                        {slots.map((slot, index) => {
                                            const isPast = isPastDate(slot.date, slot.time);
                                            const slotDate = parseLocalDate(slot.date);
                                            
                                            // Verificar se este slot é a sessão original do paciente
                                            // Comparar pelo slotId (mais preciso) ou por start_time + contract_id
                                            let isOriginalSession = false;
                                            if (originalSession) {
                                                // Priorizar comparação por ID do slot (mais preciso) - converter para string para garantir comparação correta
                                                if (slot.id && originalSession.slotId) {
                                                    isOriginalSession = String(slot.id) === String(originalSession.slotId);
                                                } else if (slot.startTime) {
                                                    // Fallback: comparar por start_time e contract_id
                                                    const slotStartTime = new Date(slot.startTime).getTime();
                                                    const originalStartTime = new Date(originalSession.startTime).getTime();
                                                    
                                                    // Verificar se é o mesmo slot (mesmo start_time e mesmo contract_id)
                                                    // Converter contract_id para string para garantir comparação correta
                                                    const slotContractId = slot.groupId ? String(slot.groupId) : null;
                                                    const originalContractId = String(originalSession.contractId);
                                                    isOriginalSession = slotStartTime === originalStartTime && 
                                                                         slotContractId === originalContractId;
                                                }
                                            }
                                            
                                            // Verificar se pode ser inaugural: apenas a sessão original
                                            const canBeInaugural = isOriginalSession;
                                            
                                            return (
                                                <div
                                                    key={slot.id}
                                                    className={`flex items-center justify-between p-3 rounded-lg border ${isPast ? 'bg-slate-50 opacity-60' : 'bg-white'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                                        <div>
                                                            <p className="font-medium text-sm">
                                                                {format(slotDate, "dd/MM/yyyy", { locale: ptBR })}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {format(slotDate, "EEEE", { locale: ptBR })} • {slot.time}
                                                            </p>
                                                        </div>
                                                        {isPast && (
                                                            <span className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded">
                                                                Passado
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {!isPast && (
                                                            <>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleRequestCancel(slot)}
                                                                    className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                >
                                                                    <Trash2 className="h-3 w-3 mr-1" />
                                                                    Cancelar
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleEditTime(slot)}
                                                                    className="h-8 px-2"
                                                                >
                                                                    <Clock className="h-3 w-3 mr-1" />
                                                                    Editar
                                                                </Button>
                                                            </>
                                                        )}
                                                        {canBeInaugural && (
                                                            <div className="flex items-center gap-1">
                                                                <Label 
                                                                    htmlFor={`inaugural-${slot.id || slot.date}`} 
                                                                    className={`text-xs cursor-pointer flex items-center gap-1 min-w-[80px] justify-end ${inaugurals[slot.date] ? 'text-blue-700' : 'text-muted-foreground'}`}
                                                                >
                                                                    <Gift className="h-3 w-3" />
                                                                    {inaugurals[slot.date] ? 'Inaugural' : 'Regular'}
                                                                </Label>
                                                                <Switch
                                                                    id={`inaugural-${slot.id || slot.date}`}
                                                                    checked={!!inaugurals[slot.date]}
                                                                    onCheckedChange={() => toggleInaugural(String(slot.id || slot.date))}
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-1">
                                                            <Label 
                                                                htmlFor={`paid-${slot.date}`} 
                                                                className="text-xs cursor-pointer min-w-[70px] text-right"
                                                            >
                                                                {(() => {
                                                                    const isPaid = payments[slot.date];
                                                                    if (isPaid) return '✓ Pago';
                                                                    return isPast ? 'Vencido' : 'Pendente';
                                                                })()}
                                                            </Label>
                                                            <Switch
                                                                id={`paid-${slot.date}`}
                                                                checked={!!payments[slot.date]}
                                                                onCheckedChange={() => togglePayment(slot.date)}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {/* Aba 3: Notificações */}
                        <TabsContent value="notifications" className="space-y-4 mt-4">
                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    Configure os lembretes automáticos via WhatsApp para todas as sessões do contrato.
                                </p>
                                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                                    <div className="p-4 rounded-lg border bg-white border-slate-200">
                                        <ReminderSettings
                                            reminderOneHour={globalOneHour}
                                            setReminderOneHour={(value) => {
                                                setGlobalOneHour(value);
                                                // Atualiza todos os slots com a nova configuração
                                                const newRemindersMap: Record<string, { oneHour: boolean; twentyFourHours: boolean }> = {};
                                                slots.forEach(slot => {
                                                    newRemindersMap[slot.date] = {
                                                        oneHour: value,
                                                        twentyFourHours: globalTwentyFourHours
                                                    };
                                                });
                                                setRemindersPerSlot(newRemindersMap);
                                            }}
                                            reminderTwentyFourHours={globalTwentyFourHours}
                                            setReminderTwentyFourHours={(value) => {
                                                setGlobalTwentyFourHours(value);
                                                // Atualiza todos os slots com a nova configuração
                                                const newRemindersMap: Record<string, { oneHour: boolean; twentyFourHours: boolean }> = {};
                                                slots.forEach(slot => {
                                                    newRemindersMap[slot.date] = {
                                                        oneHour: globalOneHour,
                                                        twentyFourHours: value
                                                    };
                                                });
                                                setRemindersPerSlot(newRemindersMap);
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                )}

                {/* Diálogo de Edição de Horário */}
                <Dialog open={!!editingSlot} onOpenChange={(open) => !open && setEditingSlot(null)}>
                    <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Ajustar Data e Horário</DialogTitle>
                            <DialogDescription>
                                Selecione uma nova data (mesma semana) e horário para o agendamento
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex flex-col md:flex-row gap-8 py-6">
                            {/* Lado Esquerdo: Calendário */}
                            <div className="flex-1 space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b">
                                    <Calendar className="h-5 w-5 text-primary" />
                                    <h3 className="font-semibold text-base text-slate-800">1. Selecione a Nova Data</h3>
                                </div>

                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-[440px] md:h-full">
                                    {newDate && (
                                        <>
                                            <style>{`
                                                .recurrence-calendar {
                                                    width: 100%;
                                                }
                                                .recurrence-calendar .rdp-months {
                                                    width: 100%;
                                                }
                                                .recurrence-calendar .rdp-month {
                                                    width: 100%;
                                                }
                                                .recurrence-calendar .rdp-table {
                                                    width: 100%;
                                                    max-width: none;
                                                }
                                                .recurrence-calendar .rdp-cell {
                                                    width: 42px;
                                                    height: 42px;
                                                    padding: 2px;
                                                }
                                                .recurrence-calendar .rdp-day {
                                                    width: 38px;
                                                    height: 38px;
                                                    font-size: 0.9rem;
                                                    display: flex;
                                                    align-items: center;
                                                    justify-content: center;
                                                }
                                                .recurrence-calendar .rdp-head_cell {
                                                    text-transform: uppercase;
                                                    font-size: 0.7rem;
                                                    font-weight: 700;
                                                    color: #64748b;
                                                    height: 32px;
                                                }
                                                .recurrence-calendar .rdp-day_today {
                                                    border: 2px solid #f97316 !important;
                                                    border-radius: 8px;
                                                    background-color: #fff7ed !important;
                                                    color: #c2410c !important;
                                                    font-weight: 900 !important;
                                                }
                                                .recurrence-calendar .rdp-day_selected {
                                                    background-color: #3b82f6 !important;
                                                    color: white !important;
                                                    font-weight: 800 !important;
                                                    border-radius: 8px;
                                                }
                                                .recurrence-calendar .rdp-day_disabled {
                                                    opacity: 0.15 !important;
                                                    pointer-events: none;
                                                }
                                                .recurrence-calendar .rdp-day:not(.rdp-day_disabled):not(.rdp-day_selected):hover {
                                                    background-color: #f1f5f9 !important;
                                                    border-radius: 8px;
                                                }
                                            `}</style>
                                            <DayPicker
                                                mode="single"
                                                selected={newDate}
                                                defaultMonth={newDate}
                                                onSelect={(date) => {
                                                    if (date) {
                                                        setNewDate(date);
                                                        loadAvailableSlots(format(date, 'yyyy-MM-dd'));
                                                    }
                                                }}
                                                disabled={(date) => {
                                                    if (!editingSlot) return true;
                                                    const originalDate = new Date(editingSlot.date + 'T12:00:00'); // Evita problemas de fuso
                                                    const weekStart = startOfWeek(originalDate, { weekStartsOn: 0 }); // Começa no domingo
                                                    const weekEnd = endOfWeek(originalDate, { weekStartsOn: 0 });
                                                    return date < weekStart || date > weekEnd;
                                                }}
                                                locale={ptBR}
                                                className="recurrence-calendar"
                                            />
                                        </>
                                    )}
                                    <div className="mt-4 pt-4 border-t flex flex-wrap gap-4 justify-center">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-3 h-3 rounded-full border-2 border-orange-500 bg-orange-50"></div>
                                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-tighter">Hoje</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-tighter">Selecionado</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-3 h-3 rounded-full bg-slate-200"></div>
                                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-tighter">Indisponível</span>
                                        </div>
                                    </div>

                                    {/* Aviso dentro do card do calendário */}
                                    <div className="mt-3 text-[10px] text-amber-700 bg-amber-50/50 px-3 py-2 rounded border border-amber-200/50 font-medium flex items-start gap-1.5">
                                        <span className="text-xs">💡</span>
                                        <span><strong>Regra:</strong> Para manter o fluxo do contrato, escolha um dia na mesma semana.</span>
                                    </div>
                                </div>
                            </div>


                            {/* Lado Direito: Horários */}
                            <div className="flex-1 space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b">
                                    <Clock className="h-5 w-5 text-primary" />
                                    <h3 className="font-semibold text-base text-slate-800">2. Selecione o Horário</h3>
                                </div>

                                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 h-full max-h-[450px] overflow-hidden flex flex-col">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto pr-1">
                                        {availableSlots.map((slot) => (
                                            <Button
                                                key={slot.time}
                                                variant={newTime === slot.time ? "default" : "outline"}
                                                className={`h-11 ${newTime === slot.time
                                                    ? 'bg-primary shadow-md'
                                                    : 'bg-white hover:bg-slate-50'
                                                    } ${!slot.available ? 'opacity-30 cursor-not-allowed grayscale' : ''}`}
                                                onClick={() => slot.available && setNewTime(slot.time)}
                                                disabled={!slot.available}
                                            >
                                                <span className="font-bold">{slot.time}</span>
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setEditingSlot(null)}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSaveTime} disabled={!newTime || !newDate}>
                                Salvar Alterações
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar Alterações
                    </Button>
                </DialogFooter>
            </DialogContent>

            {/* AlertDialog de Cancelamento */}
            <AlertDialog open={!!slotToCancel} onOpenChange={(open) => !open && setSlotToCancel(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-red-100 rounded-full">
                                <AlertTriangle className="h-6 w-6 text-red-600" />
                            </div>
                            <AlertDialogTitle className="text-xl">Confirmar Cancelamento</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription className="pt-4 space-y-3">
                            <p className="text-base">
                                Você está prestes a <strong>cancelar este agendamento</strong> do contrato.
                            </p>

                            {/* Informações do Agendamento */}
                            {slotToCancel && (
                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                    <p className="text-sm font-semibold text-blue-900 mb-2">📅 Agendamento:</p>
                                    <div className="text-sm text-blue-800 space-y-1">
                                        <p><strong>Data:</strong> {format(parseLocalDate(slotToCancel.date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
                                        <p><strong>Horário:</strong> {slotToCancel.time}</p>
                                    </div>
                                </div>
                            )}

                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-sm font-semibold text-amber-900 mb-2">⚠️ Atenção:</p>
                                <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                                    <li>Este slot será <strong>removido permanentemente</strong> do contrato.</li>
                                    <li>Esta ação não afetará os outros agendamentos.</li>
                                </ul>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Esta ação não pode ser desfeita. Tem certeza que deseja continuar?
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Fechar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmCancelSlot}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Sim, Cancelar Agendamento
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
}
