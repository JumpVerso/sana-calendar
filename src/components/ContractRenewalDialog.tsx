import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Calendar, Clock, User, AlertTriangle, RefreshCw, Loader2, Check, X } from "lucide-react";
import { format, parseISO, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useState } from "react";
import { renewalsAPI, RenewalPreview } from "@/api/renewalsAPI";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { TimeSlotSelectionDialog } from "./TimeSlotSelectionDialog";
import { blockedDaysAPI } from "@/api/blockedDaysAPI";
import { slotsAPI } from "@/api/slotsAPI";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ContractRenewalDialogProps {
    isOpen: boolean;
    onClose: () => void;
    contractId: string;
    onConfirmed?: () => void;
}

export function ContractRenewalDialog({
    isOpen,
    onClose,
    contractId,
    onConfirmed
}: ContractRenewalDialogProps) {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [preview, setPreview] = useState<RenewalPreview | null>(null);
    const [editDate, setEditDate] = useState('');
    const [editTime, setEditTime] = useState('');
    const [editingSessionIndex, setEditingSessionIndex] = useState<number | null>(null);
    const [timeSlotDialogOpen, setTimeSlotDialogOpen] = useState(false);
    const [dateSelectionDialogOpen, setDateSelectionDialogOpen] = useState(false);
    const [selectedDateForTimeEdit, setSelectedDateForTimeEdit] = useState<string | null>(null);
    const [originalDateForEdit, setOriginalDateForEdit] = useState<string | null>(null);
    const [blockedDays, setBlockedDays] = useState<Set<string>>(new Set());
    const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (isOpen && contractId) {
            loadRenewalData();
        }
    }, [isOpen, contractId]);

    const loadRenewalData = async () => {
        try {
            setLoading(true);
            const previewData = await renewalsAPI.getRenewalPreview(contractId);
            setPreview(previewData);
            setEditDate(previewData.suggestedDate);
            setEditTime(previewData.suggestedTime);
            
            // Carregar dias bloqueados para TODAS AS DATAS das sessões E suas semanas completas
            // Isso garante que todos os dias bloqueados sejam identificados, mesmo que não estejam
            // diretamente nas datas sugeridas (ex: dia 23 bloqueado quando apenas dia 24 é sugerido)
            const allDates: Date[] = [];
            
            // Adicionar todas as datas das sessões
            if (previewData.sessions && previewData.sessions.length > 0) {
                previewData.sessions.forEach(session => {
                    allDates.push(parseISO(session.date));
                });
            }
            
            // Adicionar a suggestedDate se não estiver nas sessions
            if (previewData.suggestedDate) {
                const suggestedDateObj = parseISO(previewData.suggestedDate);
                if (!allDates.some(d => format(d, 'yyyy-MM-dd') === previewData.suggestedDate)) {
                    allDates.push(suggestedDateObj);
                }
            }
            
            // Para cada data, adicionar toda a semana (domingo a sábado) para garantir cobertura completa
            const allWeekRanges: Date[] = [];
            allDates.forEach(dateObj => {
                const weekStart = startOfWeek(dateObj, { weekStartsOn: 0 }); // Domingo
                const weekEnd = endOfWeek(dateObj, { weekStartsOn: 0 }); // Sábado
                allWeekRanges.push(weekStart, weekEnd);
            });
            
            // Calcular o range total (min de todos os weekStart, max de todos os weekEnd)
            if (allWeekRanges.length > 0) {
                const minDate = allWeekRanges.reduce((a, b) => a < b ? a : b);
                const maxDate = allWeekRanges.reduce((a, b) => a > b ? a : b);
                const minDateStr = format(minDate, 'yyyy-MM-dd');
                const maxDateStr = format(maxDate, 'yyyy-MM-dd');
                
                console.log(`[ContractRenewalDialog] Carregando dias bloqueados para range: ${minDateStr} até ${maxDateStr}`);
                console.log(`[ContractRenewalDialog] Datas das sessões consideradas:`, allDates.map(d => format(d, 'yyyy-MM-dd')));
                const blocked = await blockedDaysAPI.getBlockedDaysInRange(minDateStr, maxDateStr);
                console.log(`[ContractRenewalDialog] Dias bloqueados encontrados:`, blocked.map(b => b.date));
                setBlockedDays(new Set(blocked.map(b => b.date)));
            }
        } catch (error: any) {
            console.error('Erro ao carregar dados de renovação:', error);
            toast({
                title: "Erro",
                description: error.message || "Falha ao carregar dados de renovação",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const checkAvailability = async (date: string, time: string): Promise<{ available: boolean; reason?: string }> => {
        try {
            // Verificar se o dia está bloqueado
            const isBlocked = blockedDays.has(date);
            if (isBlocked) {
                return { available: false, reason: 'Dia bloqueado' };
            }

            // Verificar overlap com slots existentes
            const slots = await slotsAPI.getSlots(date, date);
            const [h, m] = time.split(':').map(Number);
            const durationMinutes = 60; // Assumindo 1h para renovação
            
            // Verificar se há conflito
            for (const slot of slots) {
                if (!slot.startTime || !slot.endTime) continue;
                
                const slotStart = new Date(slot.startTime);
                const slotEnd = new Date(slot.endTime);
                const proposedStart = new Date(`${date}T${time}:00`);
                const proposedEnd = new Date(proposedStart.getTime() + durationMinutes * 60000);
                
                // Verificar sobreposição
                if (proposedStart < slotEnd && proposedEnd > slotStart) {
                    return { available: false, reason: 'Horário ocupado' };
                }
            }
            
            return { available: true };
        } catch (error) {
            console.error('Erro ao verificar disponibilidade:', error);
            return { available: false, reason: 'Erro ao verificar disponibilidade' };
        }
    };

    const handleConfirm = async () => {
        try {
            setSubmitting(true);

            // Verificar disponibilidade para todas as sessões editadas
            if (sessions && sessions.length > 1) {
                // Verificar cada sessão que foi editada ou que tem noAvailability
                for (const session of sessions) {
                    const isBlocked = blockedDays.has(session.date);
                    if (isBlocked || session.noAvailability) {
                        setIsCheckingAvailability(true);
                        // Se a sessão foi editada, usar os valores editados
                        // Por enquanto, apenas verificar a primeira sessão que precisa de atenção
                        const availability = await checkAvailability(session.date, session.time);
                        setIsCheckingAvailability(false);
                        
                        if (!availability.available) {
                            toast({
                                title: "Horário Indisponível",
                                description: availability.reason === 'Dia bloqueado' 
                                    ? `O dia ${format(parseISO(session.date), "dd/MM/yyyy")} está bloqueado. Edite a sessão para selecionar outra data.`
                                    : `O horário ${session.time} em ${format(parseISO(session.date), "dd/MM/yyyy")} está ocupado. Edite a sessão para selecionar outro horário.`,
                                variant: "destructive"
                            });
                            return;
                        }
                    }
                }
            } else if (editDate && editTime && (editDate !== suggestedDate || editTime !== suggestedTime)) {
                // Sessão única editada
                setIsCheckingAvailability(true);
                const availability = await checkAvailability(editDate, editTime);
                setIsCheckingAvailability(false);
                
                if (!availability.available) {
                    toast({
                        title: "Horário Indisponível",
                        description: availability.reason === 'Dia bloqueado' 
                            ? `O dia ${format(parseISO(editDate), "dd/MM/yyyy")} está bloqueado. Selecione outra data.`
                            : `O horário ${editTime} em ${format(parseISO(editDate), "dd/MM/yyyy")} está ocupado. Selecione outro horário.`,
                        variant: "destructive"
                    });
                    return;
                }
            }

            // Para múltiplas sessões, usar apenas a primeira para ajuste (o backend gerencia o resto)
            // Para sessão única, usar os ajustes se foram editados
            const adjustments = (sessions && sessions.length > 1) 
                ? undefined // Backend gerencia múltiplas sessões
                : ((editDate && editTime && (editDate !== suggestedDate || editTime !== suggestedTime)) 
                    ? { date: editDate, time: editTime } 
                    : undefined);
            
            const result = await renewalsAPI.confirmRenewalDirect(contractId, adjustments);

            toast({
                title: "Sucesso!",
                description: result.totalCreated > 1 
                    ? `${result.totalCreated} sessões foram agendadas com sucesso.`
                    : "Renovação confirmada com sucesso. A nova sessão foi agendada.",
            });

            // Invalidar queries para atualizar a UI
            queryClient.invalidateQueries({ queryKey: ['slots'] });

            onConfirmed?.();
            onClose();
        } catch (error: any) {
            console.error('Erro ao confirmar renovação:', error);
            toast({
                title: "Erro",
                description: error.message || "Falha ao confirmar renovação",
                variant: "destructive"
            });
        } finally {
            setSubmitting(false);
            setIsCheckingAvailability(false);
        }
    };

    const handleClose = () => {
        onClose();
    };

    if (!preview && !loading) {
        return null;
    }

    const timeWasChanged = preview?.timeWasChanged;
    const noAvailability = preview?.noAvailability;
    const originalTime = preview?.originalTime;
    const suggestedDate = preview?.suggestedDate || '';
    const suggestedTime = preview?.suggestedTime || '';
    const patientName = preview?.patientName;
    const patientPhone = preview?.patientPhone;
    const frequency = preview?.frequency;
    const sessionsCount = preview?.sessionsCount || 1;
    const sessions = preview?.sessions;
    
    // Verificar se a primeira sessão (suggestedDate) realmente tem problema
    // Se houver múltiplas sessões, verificar a primeira sessão individualmente
    // Se não houver sessões ou for sessão única, usar o noAvailability geral
    const firstSessionHasProblem = sessions && sessions.length > 0 
        ? (sessions[0].noAvailability || blockedDays.has(sessions[0].date))
        : (noAvailability || (suggestedDate && blockedDays.has(suggestedDate)));
    
    // Verificar se há outras sessões com problema (além da primeira)
    const otherSessionsHaveProblems = sessions && sessions.length > 1 
        ? sessions.slice(1).some(s => s.noAvailability || blockedDays.has(s.date))
        : false;
    
    // Verificar se há alguma sessão com problema que não foi resolvida
    // Uma sessão está resolvida se:
    // 1. Não está mais em dia bloqueado (foi editada para outra data)
    // 2. Não tem mais noAvailability (foi editada para outro horário/data)
    const hasUnresolvedProblems = sessions && sessions.length > 0
        ? sessions.some(s => {
            const isBlocked = blockedDays.has(s.date);
            // Se está bloqueado ou tem noAvailability, precisa ser resolvido
            // Consideramos resolvido se foi editado (a sessão foi modificada)
            return (isBlocked || s.noAvailability);
        })
        : firstSessionHasProblem;

    const getFrequencyLabel = () => {
        switch (frequency) {
            case 'weekly': return 'Semanal';
            case 'biweekly': return 'Quinzenal';
            case 'monthly': return 'Mensal';
            default: return frequency || 'Personalizado';
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <RefreshCw className="h-5 w-5 text-amber-600" />
                        Renovar Contrato
                    </DialogTitle>
                    <DialogDescription>
                        Confirme a renovação do contrato para agendar a próxima sessão.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Alerta de horário alterado */}
                        {timeWasChanged && !noAvailability && (
                            <Alert variant="default" className="bg-amber-50 border-amber-200">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                <AlertTitle className="text-amber-800">Horário Alterado</AlertTitle>
                                <AlertDescription className="text-amber-700">
                                    O horário original ({originalTime}) estava ocupado.
                                    Sugerimos {suggestedTime}.
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Alerta de sem disponibilidade - apenas se a primeira sessão tiver problema */}
                        {firstSessionHasProblem && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Sem Disponibilidade</AlertTitle>
                                <AlertDescription>
                                    {suggestedDate && blockedDays.has(suggestedDate) ? (
                                        <>
                                            O dia {format(parseISO(suggestedDate), "dd/MM/yyyy")} está <strong>bloqueado</strong>.
                                            Por favor, selecione outra data manualmente.
                                        </>
                                    ) : (
                                        <>
                                            Não há horários disponíveis em {suggestedDate ? format(parseISO(suggestedDate), "dd/MM/yyyy") : ''}.
                                            Por favor, selecione outra data manualmente.
                                        </>
                                    )}
                                </AlertDescription>
                            </Alert>
                        )}
                        
                        {/* Alerta informativo se outras sessões têm problema (mas não a primeira) */}
                        {!firstSessionHasProblem && otherSessionsHaveProblems && (
                            <Alert variant="default" className="bg-amber-50 border-amber-200">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                <AlertTitle className="text-amber-800">Algumas sessões precisam de atenção</AlertTitle>
                                <AlertDescription className="text-amber-700">
                                    Algumas sessões futuras têm conflitos ou estão em dias bloqueados. Você pode editá-las individualmente na lista abaixo.
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Informações do Paciente */}
                        <Card className="p-4 bg-blue-50 border-blue-200">
                            <div className="flex items-center gap-2 mb-2">
                                <User className="h-4 w-4 text-blue-700" />
                                <span className="font-medium text-blue-900">Paciente</span>
                            </div>
                            <div className="text-sm text-blue-800">
                                <p className="font-semibold">{patientName || 'Não informado'}</p>
                                {patientPhone && <p className="text-blue-600">{patientPhone}</p>}
                            </div>
                        </Card>

                        {/* Sessões a serem criadas */}
                        <Card className="p-4 bg-purple-50 border-purple-200">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-purple-700" />
                                    <span className="font-medium text-purple-900">
                                        {sessionsCount > 1 ? `Próximas Sessões (${sessionsCount})` : 'Próxima Sessão'}
                                    </span>
                                </div>
                                <Badge variant="outline" className="text-purple-700 border-purple-300">
                                    {getFrequencyLabel()}
                                </Badge>
                            </div>

                            {/* Múltiplas sessões */}
                            {sessions && sessions.length > 1 ? (
                                <div className="space-y-2">
                                    {sessions.map((session, idx) => {
                                        const isBlocked = blockedDays.has(session.date);
                                        const isEditing = editingSessionIndex === idx;
                                        return (
                                            <div key={idx} className={`flex items-center justify-between py-2 border-b border-purple-200 last:border-0 ${isBlocked ? 'bg-red-50/50' : ''}`}>
                                                <div className="flex items-center gap-2 text-purple-800">
                                                    <span className="font-semibold text-sm">
                                                        {format(parseISO(session.date), "dd/MM (EEE)", { locale: ptBR })}
                                                    </span>
                                                    <span className="text-sm">às</span>
                                                    <span className="font-semibold text-sm">{session.time}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isBlocked && (
                                                        <Badge variant="outline" className="text-red-600 border-red-300 text-xs">
                                                            Dia bloqueado
                                                        </Badge>
                                                    )}
                                                    {session.timeWasChanged && !isBlocked && (
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs cursor-help">
                                                                        Deslizado
                                                                    </Badge>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p>O horário foi automaticamente ajustado porque o horário original estava ocupado.</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    )}
                                                    {session.noAvailability && !isBlocked && (
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs cursor-help">
                                                                        Alterado
                                                                    </Badge>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p>Esta sessão precisa ser ajustada. Edite a data ou horário para resolver.</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    )}
                                                    <div className="flex gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={async () => {
                                                                setEditingSessionIndex(idx);
                                                                setOriginalDateForEdit(session.date);
                                                                setSelectedDateForTimeEdit(session.date);
                                                                
                                                                // Carregar dias bloqueados da semana antes de abrir o modal
                                                                try {
                                                                    const weekStart = startOfWeek(parseISO(session.date), { weekStartsOn: 0 });
                                                                    const weekEnd = endOfWeek(parseISO(session.date), { weekStartsOn: 0 });
                                                                    const startDateStr = format(weekStart, 'yyyy-MM-dd');
                                                                    const endDateStr = format(weekEnd, 'yyyy-MM-dd');
                                                                    const blocked = await blockedDaysAPI.getBlockedDaysInRange(startDateStr, endDateStr);
                                                                    setBlockedDays(new Set(blocked.map(b => b.date)));
                                                                } catch (error) {
                                                                    console.error('Erro ao carregar dias bloqueados:', error);
                                                                }
                                                                
                                                                setDateSelectionDialogOpen(true);
                                                            }}
                                                            className="text-purple-600 hover:text-purple-800 h-7 px-2 text-xs"
                                                        >
                                                            Data
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                setEditingSessionIndex(idx);
                                                                setOriginalDateForEdit(session.date);
                                                                setSelectedDateForTimeEdit(session.date);
                                                                setTimeSlotDialogOpen(true);
                                                            }}
                                                            className="text-purple-600 hover:text-purple-800 h-7 px-2 text-xs"
                                                        >
                                                            Horário
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-purple-800">
                                            <Calendar className="h-4 w-4" />
                                            <span className="font-semibold">
                                                {editDate ? format(parseISO(editDate), "EEEE, dd 'de' MMMM", { locale: ptBR }) : (suggestedDate ? format(parseISO(suggestedDate), "EEEE, dd 'de' MMMM", { locale: ptBR }) : '')}
                                            </span>
                                            {((editDate && blockedDays.has(editDate)) || (!editDate && suggestedDate && blockedDays.has(suggestedDate))) && (
                                                <Badge variant="outline" className="text-red-600 border-red-300 text-xs">
                                                    Dia bloqueado
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-purple-800">
                                            <Clock className="h-4 w-4" />
                                            <span className="font-semibold">{editTime || suggestedTime}</span>
                                            {timeWasChanged && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs cursor-help">
                                                                Deslizado
                                                            </Badge>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>O horário foi automaticamente ajustado porque o horário original estava ocupado.</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={async () => {
                                                    // Usar data editada ou sugerida
                                                    const currentDate = editDate || suggestedDate;
                                                    setOriginalDateForEdit(currentDate);
                                                    setSelectedDateForTimeEdit(currentDate);
                                                    
                                                    // Carregar dias bloqueados da semana antes de abrir o modal
                                                    if (currentDate) {
                                                        try {
                                                            const weekStart = startOfWeek(parseISO(currentDate), { weekStartsOn: 0 });
                                                            const weekEnd = endOfWeek(parseISO(currentDate), { weekStartsOn: 0 });
                                                            const startDateStr = format(weekStart, 'yyyy-MM-dd');
                                                            const endDateStr = format(weekEnd, 'yyyy-MM-dd');
                                                            const blocked = await blockedDaysAPI.getBlockedDaysInRange(startDateStr, endDateStr);
                                                            setBlockedDays(new Set(blocked.map(b => b.date)));
                                                        } catch (error) {
                                                            console.error('Erro ao carregar dias bloqueados:', error);
                                                        }
                                                    }
                                                    
                                                    setDateSelectionDialogOpen(true);
                                                }}
                                                className="text-purple-600 hover:text-purple-800"
                                            >
                                                Editar Data
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    // Sempre definir a data atual (editada ou sugerida) para o modal de horário
                                                    const currentDate = editDate || suggestedDate;
                                                    setOriginalDateForEdit(currentDate);
                                                    setSelectedDateForTimeEdit(currentDate);
                                                    setTimeSlotDialogOpen(true);
                                                }}
                                                className="text-purple-600 hover:text-purple-800"
                                            >
                                                Editar Horário
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </Card>

                        {/* Informação sobre horário original */}
                        {originalTime && originalTime !== suggestedTime && (
                            <p className="text-xs text-muted-foreground text-center">
                                Horário original do contrato: {originalTime}
                            </p>
                        )}
                    </div>
                )}

                <DialogFooter className="flex justify-between sm:justify-between gap-2 mt-4">
                    <Button
                        variant="outline"
                        onClick={handleClose}
                        disabled={submitting}
                    >
                        <X className="h-4 w-4 mr-1" />
                        Fechar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={submitting || loading || isCheckingAvailability || hasUnresolvedProblems}
                        title={hasUnresolvedProblems ? "Resolva todos os problemas nas sessões antes de confirmar" : ""}
                    >
                        {submitting ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <Check className="h-4 w-4 mr-2" />
                        )}
                        Confirmar Renovação
                    </Button>
                </DialogFooter>
            </DialogContent>

            {/* Dialog de seleção de data (com regra de uma semana) */}
            <Dialog open={dateSelectionDialogOpen} onOpenChange={setDateSelectionDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Selecionar Data</DialogTitle>
                        <DialogDescription>
                            Selecione uma data dentro da mesma semana da data original.
                            {originalDateForEdit && (
                                <> Data original: {format(parseISO(originalDateForEdit), "dd/MM/yyyy", { locale: ptBR })}</>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {originalDateForEdit && (
                            <CalendarComponent
                                mode="single"
                                selected={selectedDateForTimeEdit ? parseISO(selectedDateForTimeEdit) : undefined}
                                defaultMonth={parseISO(originalDateForEdit)}
                                onSelect={async (date) => {
                                    if (date) {
                                        const dateStr = format(date, 'yyyy-MM-dd');
                                        const originalDate = parseISO(originalDateForEdit);
                                        
                                        // Verificar se está dentro da mesma semana
                                        const weekStart = startOfWeek(originalDate, { weekStartsOn: 0 }); // Domingo
                                        const weekEnd = endOfWeek(originalDate, { weekStartsOn: 0 });
                                        
                                        if (!isWithinInterval(date, { start: weekStart, end: weekEnd })) {
                                            toast({
                                                title: "Data fora da semana",
                                                description: "A data deve estar dentro da mesma semana da data original.",
                                                variant: "destructive"
                                            });
                                            return;
                                        }
                                        
                                        // Verificar se o dia está bloqueado ANTES de selecionar
                                        try {
                                            const checkResult = await blockedDaysAPI.checkDayBlocked(dateStr);
                                            if (checkResult.isBlocked) {
                                                toast({
                                                    title: "Dia Bloqueado",
                                                    description: `O dia ${format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR })} está bloqueado. Selecione outra data.`,
                                                    variant: "destructive"
                                                });
                                                // Atualizar blockedDays para incluir esta data
                                                setBlockedDays(prev => new Set([...prev, dateStr]));
                                                return;
                                            }
                                        } catch (error) {
                                            console.error('Erro ao verificar dia bloqueado:', error);
                                        }
                                        
                                        setSelectedDateForTimeEdit(dateStr);
                                        
                                        // Se estiver editando uma sessão específica, atualizar a data imediatamente
                                        if (editingSessionIndex !== null && sessions) {
                                            const updatedSessions = [...sessions];
                                            const originalSession = updatedSessions[editingSessionIndex];
                                            const isNewDateBlocked = blockedDays.has(dateStr);
                                            const dateChanged = dateStr !== originalSession.date;
                                            
                                            updatedSessions[editingSessionIndex] = {
                                                ...originalSession,
                                                date: dateStr,
                                                // Se mudou para data não bloqueada, remover noAvailability
                                                noAvailability: isNewDateBlocked ? true : (dateChanged ? false : originalSession.noAvailability)
                                            };
                                            setPreview({
                                                ...preview!,
                                                sessions: updatedSessions
                                            });
                                        }
                                        
                                        setDateSelectionDialogOpen(false);
                                        setTimeSlotDialogOpen(true);
                                    }
                                }}
                                disabled={(date) => {
                                    if (!originalDateForEdit) return false;
                                    const dateStr = format(date, 'yyyy-MM-dd');
                                    const originalDate = parseISO(originalDateForEdit);
                                    
                                    // Desabilitar dias bloqueados
                                    if (blockedDays.has(dateStr)) return true;
                                    
                                    // Desabilitar datas fora da mesma semana
                                    const weekStart = startOfWeek(originalDate, { weekStartsOn: 0 }); // Domingo
                                    const weekEnd = endOfWeek(originalDate, { weekStartsOn: 0 });
                                    return !isWithinInterval(date, { start: weekStart, end: weekEnd });
                                }}
                                locale={ptBR}
                            />
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setDateSelectionDialogOpen(false);
                            setSelectedDateForTimeEdit(null);
                            setOriginalDateForEdit(null);
                            setEditingSessionIndex(null);
                        }}>
                            Cancelar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog de seleção de horário */}
            <TimeSlotSelectionDialog
                open={timeSlotDialogOpen}
                onClose={() => {
                    setTimeSlotDialogOpen(false);
                    setSelectedDateForTimeEdit(null);
                    setOriginalDateForEdit(null);
                    setEditingSessionIndex(null);
                }}
                date={selectedDateForTimeEdit || editDate || suggestedDate || ''}
                currentTime={editingSessionIndex !== null && sessions 
                    ? sessions[editingSessionIndex].time 
                    : editTime || suggestedTime}
                isConflict={false}
                conflictReason={selectedDateForTimeEdit && blockedDays.has(selectedDateForTimeEdit) ? 'Dia bloqueado' : undefined}
                isBlockedDay={!!(selectedDateForTimeEdit && blockedDays.has(selectedDateForTimeEdit))}
                proposedDurationMinutes={60}
                onSelectTime={(time) => {
                    if (editingSessionIndex !== null && sessions) {
                        // Atualizar sessão específica
                        const updatedSessions = [...sessions];
                        const originalSession = updatedSessions[editingSessionIndex];
                        const newDate = selectedDateForTimeEdit || originalSession.date;
                        
                        // Verificar se a nova data não está bloqueada
                        const isNewDateBlocked = blockedDays.has(newDate);
                        
                        // Verificar se houve mudança (data ou horário diferente do original)
                        const dateChanged = newDate !== originalSession.date;
                        const timeChanged = time !== originalSession.time;
                        
                        updatedSessions[editingSessionIndex] = {
                            ...originalSession,
                            time,
                            date: newDate,
                            // Remover noAvailability se não está mais bloqueado e foi editado
                            noAvailability: isNewDateBlocked ? true : (dateChanged || timeChanged ? false : originalSession.noAvailability)
                        };
                        setPreview({
                            ...preview!,
                            sessions: updatedSessions
                        });
                    } else {
                        // Sessão única editada
                        setEditTime(time);
                        setEditDate(selectedDateForTimeEdit || suggestedDate);
                    }
                    setTimeSlotDialogOpen(false);
                    setSelectedDateForTimeEdit(null);
                    setOriginalDateForEdit(null);
                    setEditingSessionIndex(null);
                }}
                onSkip={() => {}}
                canSkip={false}
            />
        </Dialog>
    );
}
