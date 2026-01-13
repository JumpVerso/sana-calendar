import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TimeSlotDialog } from "./TimeSlotDialog";
import { PatientInfoDialog } from "./PatientInfoDialog";
import { RecurrenceDialog } from "./RecurrenceDialog";
import { RecurrenceReviewDialog } from "./RecurrenceReviewDialog";
import { ContractViewDialog } from "./ContractViewDialog";
import { ContractRenewalDialog } from "./ContractRenewalDialog";
import { PRICE_CATEGORIES, COMMERCIAL_STATUSES } from "@/constants/business-rules";
import { Check, X, User, Trash2, Send, MessageSquare, AlertTriangle, Loader2, CheckCheck } from "lucide-react";
import { formatCentsToBRL } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { slotsAPI } from "@/api/slotsAPI";
import { patientsAPI } from "@/api/patientsAPI";

export type EventType = "personal" | "online" | "presential" | null;

export interface TimeSlot {
  id?: string;
  time: string;
  type: EventType;
  valor: string;
  preco: string;
  status: string;
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  patientId?: string;  // Adicionar ID do paciente
  privacyTermsAccepted?: boolean;
  flow_status?: string | null;
  groupId?: string; // Antes recurrenceGroupId
  lastModified?: number; // Timestamp em ms para controle de versão
  reminders?: { oneHour: boolean; twentyFourHours: boolean };
  isPaid?: boolean; // Status de pagamento
  isInaugural?: boolean; // Marca se o slot é inaugural
  duration?: string; // Duração (ex: '1h') - Mapeado de price_category para personal
  isLastSlotOfContract?: boolean; // Indica se é o último slot do contrato
  needsRenewal?: boolean; // Indica se o contrato precisa de renovação
}

interface TimeSlotCardProps {
  slot: TimeSlot;
  dayIndex: number;
  slotIndex: number;
  date: Date;
  onUpdate: (updatedSlot: TimeSlot, createSiblingType?: EventType) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
  isDouble?: boolean;
  isLoading?: boolean;
  isOneHourBlocked?: boolean;
  maxDuration?: number;
  isBlocked?: boolean; // Indica se o dia está bloqueado
  isLastSlotOfContract?: boolean; // Indica se é o último slot do contrato (para renovação)
  needsRenewal?: boolean; // Indica se o contrato precisa de renovação
}

const eventTypeLabels: Record<Exclude<EventType, null>, string> = {
  personal: "Pessoal",
  online: "Online",
  presential: "Presencial",
};

const eventTypeColors: Record<Exclude<EventType, null>, string> = {
  personal: "bg-event-personal/20 text-event-personal border-event-personal/40 font-semibold",
  online: "bg-event-online/20 text-event-online border-event-online/40 font-semibold",
  presential: "bg-event-presential/20 text-event-presential border-event-presential/40 font-semibold",
};

const eventTypeBorderColors: Record<Exclude<EventType, null>, string> = {
  personal: "border-l-4 border-l-event-personal",
  online: "border-l-4 border-l-event-online",
  presential: "border-l-4 border-l-event-presential",
};

const statusColors: Record<string, string> = {
  "Vago": "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200",
  "AGUARDANDO": "bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200",
  "CONFIRMADO": "bg-green-100 text-green-800 border-green-300 hover:bg-green-200",
  "RESERVADO": "bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200",
  "CONTRATADO": "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200",
  "RENOVAR": "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200",
};

const statusHoverColors: Record<string, string> = {
  "Vago": "hover:bg-slate-200 hover:text-slate-800 hover:border-slate-400",
  "AGUARDANDO": "hover:bg-yellow-200 hover:text-yellow-900 hover:border-yellow-400",
  "CONFIRMADO": "hover:bg-green-200 hover:text-green-900 hover:border-green-400",
  "RESERVADO": "hover:bg-orange-200 hover:text-orange-900 hover:border-orange-400",
  "CONTRATADO": "hover:bg-blue-200 hover:text-blue-900 hover:border-blue-400",
};

const statusBaseColors: Record<string, string> = {
  "Vago": "bg-slate-100 text-slate-700 border-slate-300",
  "AGUARDANDO": "bg-yellow-100 text-yellow-800 border-yellow-300",
  "CONFIRMADO": "bg-green-100 text-green-800 border-green-300",
  "RESERVADO": "bg-orange-100 text-orange-800 border-orange-300",
  "CONTRATADO": "bg-blue-100 text-blue-800 border-blue-300",
  "INDISPONIVEL": "bg-gray-300 text-gray-700 border-gray-400",
};

const statusIcons: Record<string, string> = {
  "Vago": "○",
  "AGUARDANDO": "⏱",
  "CONFIRMADO": "✓",
  "RESERVADO": "📌",
  "CONTRATADO": "🔒",
  "INDISPONIVEL": "🚫",
};

const statusActionLabels: Record<string, string> = {
  "RESERVADO": "Reservar",
  "CONFIRMADO": "Confirmar",
  "CONTRATADO": "Contratar",
  "VAGO": "Liberar Horário",
  "Vago": "Liberar Horário",
};

export const TimeSlotCard = ({ slot, dayIndex, slotIndex, date, onUpdate, onRemove, isDouble = false, isLoading = false, isOneHourBlocked = false, maxDuration, isBlocked = false, isLastSlotOfContract = false, needsRenewal = false }: TimeSlotCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [patientDialogOpen, setPatientDialogOpen] = useState(false);
  const [contractViewOpen, setContractViewOpen] = useState(false);
  const [renewalDialogOpen, setRenewalDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<"RESERVADO" | "CONTRATADO" | null>(null);
  const [isSendingFlow, setIsSendingFlow] = useState(false);
  const popoverContainerRef = useRef<HTMLDivElement>(null);
  const [confirmVagoOpen, setConfirmVagoOpen] = useState(false);
  const [reviewContractOpen, setReviewContractOpen] = useState(false);
  const { toast } = useToast();

  const getCategoryLabel = (value: string) => {
    return PRICE_CATEGORIES.find(c => c.value === value)?.label || value;
  };

  const [isDeleting, setIsDeleting] = useState(false);

  const handleRemoveClick = async (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (onRemove) {
      try {
        setIsDeleting(true);
        await onRemove();
      } catch (error) {
        console.error("Erro ao remover:", error);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  // Função para obter os status possíveis baseado no status atual
  const getPossibleStatuses = (currentStatus: string): string[] => {
    switch (currentStatus) {
      case "Vago":
      case "VAGO":
        return ["RESERVADO"]; // Vago pode ir para Reservado
      case "RESERVADO":
        return ["VAGO", "CONFIRMADO"]; // Reservado pode ir para Vago ou Confirmado
      case "CONFIRMADO":
        return ["VAGO", "CONTRATADO"]; // Confirmado pode ir para Vago ou Contratado
      case "CONTRATADO":
        return ["VAGO", "CONFIRMADO"]; // Contratado agora pode mudar
      default:
        return ["RESERVADO"]; // Default: pode ir para Reservado
    }
  };

  const [isWaitingForData, setIsWaitingForData] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<string | null>(null);



  // Clear creation loading when data arrives
  useEffect(() => {
    if (isWaitingForData && slot.type) {
      setIsWaitingForData(false);
    }
  }, [slot.type, isWaitingForData]);

  // Clear status update loading when data arrives
  useEffect(() => {
    if (pendingStatusUpdate && slot.status === pendingStatusUpdate) {
      setPendingStatusUpdate(null);
    }
  }, [slot.status, pendingStatusUpdate]);



  const handleStatusChange = async (newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // RESERVADO e CONTRATADO requerem dados do paciente
    if (newStatus === "RESERVADO") {
      setPendingStatus("RESERVADO");
      setPatientDialogOpen(true);
    } else if (newStatus === "CONTRATADO") {
      try {
        await onUpdate({
          ...slot,
          status: "CONTRATADO",
          patientName: slot.patientName || "",
          patientPhone: slot.patientPhone || ""
        } as any);
        // Do not open patient dialog, DayColumn interceptor will handle RecurrenceDialog
      } catch (error) {
        console.error("Erro ao definir contratado:", error);
      }
    }
    // CONFIRMADO mantém os dados do paciente existentes
    else if (newStatus === "CONFIRMADO") {
      try {
        setPendingStatusUpdate("CONFIRMADO");
        await onUpdate({ ...slot, status: "CONFIRMADO" });
      } catch (error: any) {
        setPendingStatusUpdate(null);
        // Toast handled by useTimeSlots
      }
      setStatusPopoverOpen(false);
    }
    // VAGO: limpa dados - REQUER CONFIRMAÇÃO
    else if (newStatus === "VAGO" || newStatus === "Vago") {
      // Verificar se tem dados de paciente para mostrar confirmação
      const hasPatientData = slot.patientName || slot.patientPhone || slot.patientEmail;

      if (hasPatientData && ['RESERVADO', 'CONFIRMADO', 'CONTRATADO'].includes(slot.status)) {
        // Mostrar diálogo de confirmação
        setConfirmVagoOpen(true);
      } else {
        // Não tem dados ou já está vago, pode mudar diretamente
        await executeVagoChange();
      }
      setStatusPopoverOpen(false);
    }
  };

  const executeVagoChange = async () => {
    try {
      setPendingStatusUpdate("Vago");
      await onUpdate({
        ...slot,
        status: "Vago",
        patientId: null,  // Limpar FK do paciente
        groupId: null,    // Limpar FK do contrato
        flow_status: null
      });
    } catch (error: any) {
      setPendingStatusUpdate(null);
      // Toast handled by useTimeSlots
    }
  };

  const handlePatientInfoSave = async (patientName: string, patientPhone: string, patientEmail?: string, patientId?: string) => {
    const statusToUse = pendingStatus || slot.status;

    try {
      if (pendingStatus) {
        setPendingStatusUpdate(pendingStatus);
      }

      let finalPatientId = patientId;

      // Se NÃO temos patientId, CRIAR novo paciente
      if (!finalPatientId) {
        const patient = await patientsAPI.createPatient({
          name: patientName,
          phone: patientPhone,
          email: patientEmail || undefined
        });
        finalPatientId = patient.id;
      }
      // Se temos patientId, ATUALIZAR se dados mudaram
      else {
        const dataChanged =
          slot.patientName !== patientName ||
          slot.patientPhone !== patientPhone ||
          slot.patientEmail !== patientEmail;

        if (dataChanged) {
          await patientsAPI.updatePatient(finalPatientId, {
            name: patientName,
            phone: patientPhone,
            email: patientEmail || undefined
          });
        }
      }

      // Atualizar slot com patient_id (FK)
      await onUpdate({
        ...slot,
        status: statusToUse,
        patientId: finalPatientId,
        patientName,
        patientPhone,
        patientEmail,
      } as any);

      setPendingStatus(null);
      setPatientDialogOpen(false);
    } catch (error: any) {
      if (pendingStatus) {
        setPendingStatusUpdate(null);
      }
      console.error(error);
      // Toast handled by useTimeSlots
    }
  };

  const handleSetPersonalStatus = async (completed: boolean, e: React.MouseEvent) => {
    e.stopPropagation();

    // Toggle logic: If clicking the one already selected, go back to PENDENTE.
    // If clicking the other, switch to it.
    let newStatus = "PENDENTE";

    if (completed) {
      newStatus = slot.status === "CONCLUIDO" ? "PENDENTE" : "CONCLUIDO";
    } else {
      newStatus = slot.status === "NAO_REALIZADO" ? "PENDENTE" : "NAO_REALIZADO";
    }

    try {
      setPendingStatusUpdate(newStatus);
      // Send status update. API will handle routing to backend status field.
      // We send 'valor' as formatting helper or just status directly.
      // API expects 'valor' for smart mapping or 'status' explicit.
      // Let's use 'status' explicit for clarity.
      await onUpdate({ ...slot, status: newStatus });
    } catch (error: any) {
      setPendingStatusUpdate(null);
      console.error(error);
      // Toast handled by useTimeSlots
    }
    setStatusPopoverOpen(false);
  };

  const handleSendFlow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSendingFlow) return;

    if (!slot.patientName) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Nome do paciente é obrigatório para enviar o flow"
      });
      return;
    }

    if (!slot.id) return;

    try {
      setIsSendingFlow(true);
      const { slotsAPI } = await import('@/api/slotsAPI');

      const updatedSlot = await slotsAPI.sendFlow(slot.id, {
        patientName: slot.patientName,
        patientPhone: slot.patientPhone || ""
      });

      // Atualizar o estado local com o flow_status retornado pelo backend
      await onUpdate({
        ...slot,
        flow_status: updatedSlot.flow_status || "Enviado"
      });

      toast({
        title: "Flow enviado com sucesso",
        description: "O template foi disparado pelo WhatsApp.",
      });

    } catch (error: any) {
      console.error('Erro ao enviar flow:', error);
      toast({
        variant: "destructive",
        title: "Erro ao enviar flow",
        description: error.message || "Não foi possível disparar o template."
      });
    } finally {
      setIsSendingFlow(false);
    }
  };

  const isPersonal = slot.type === 'personal';
  const isCompleted = slot.status === "CONCLUIDO";
  const isNotRealized = slot.status === "NAO_REALIZADO";
  const hasPatientInfo = slot.patientName && slot.patientName.trim() !== "";
  
  // Verificar se é um contrato que precisa de renovação
  const shouldShowRenewalButton = isLastSlotOfContract && needsRenewal && slot.status === 'CONTRATADO';
  const displayStatus = shouldShowRenewalButton ? 'RENOVAR' : slot.status;

  // Lógica de visibilidade do Flow Status
  // 1. Deve ser status RESERVADO
  // 2. Não deve ser status CONFIRMADO (já tratado pelo status principal)
  // 3. Se flow_status for 'confirmado', esconder o botão (mas mostrar tag pequena se quiser - por enquanto escondendo)
  const shouldShowFlowButton = slot.status === "RESERVADO" && slot.flow_status !== "confirmado";

  // Tag pequena para mostrar status do flow se já foi enviado/preenchido
  const showFlowTag = slot.flow_status && slot.flow_status !== "confirmado" && slot.status === "RESERVADO";

  // Calculate end time for display
  const getEndTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m);

    // Se for atividade pessoal, usar a duração do slot
    // Se for Online/Presencial, mantém o padrão antigo de 1 hora (se houver essa lógica) ou 30m.
    if (slot.type === 'personal') {
      if (slot.duration === '2h' || slot.duration === '120m') {
        date.setHours(h + 2, m);
      } else if (slot.duration === '1h30' || slot.duration === '90m') {
        date.setHours(h + 1, m + 30);
      } else if (slot.duration === '1h' || slot.duration === '60m') {
        date.setHours(h + 1, m);
      } else {
        date.setMinutes(m + 30);
      }
    } else if (slot.type) {
      date.setHours(h + 1, m);
    } else {
      date.setMinutes(m + 30);
    }
    return format(date, 'HH:mm');
  };

  const endTime = getEndTime(slot.time);
  const timeLabel = slot.type ? `${slot.time} - ${endTime}` : slot.time;

  // Height calculation:
  // Empty (30m) = 60px.
  // Filled (1h) = 120px. 
  // We substract a bit for gap/border? In DayColumn we used p-1 (4px padding all around).
  // So available height is approx 60px (row) - 8px (padding needed?).
  // Actually Index.tsx defined row height as 60px.
  // DayColumn puts a div with border-b. 
  // If we want pixel perfect match, the content should be height-full of the container.
  // But DayColumn container is auto-sized by content?
  // No, I set Index.tsx Time Column to fixed 60px.
  // So DayColumn slots MUST be 60px (empty) or 120px (filled).

  const heightClass = "h-full";
  const isCompactPersonal = isPersonal && !isDouble && (slot.duration === '30m' || !slot.duration || slot.duration === '#30m');

  return (
    <>
      <div className={`relative z-10 group w-full ${isCompactPersonal ? 'h-full flex items-center justify-center' : 'h-full'}`}>
        <Card
          className={`${isDouble ? 'p-1' : (slot.type === 'personal' ? (isCompactPersonal ? 'px-2 py-0.5' : 'p-1') : 'p-2')} ${isBlocked && !slot.type ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} transition-colors duration-200 ${isBlocked && !slot.type ? '' : 'hover:bg-slate-50 hover:shadow-md'} border ${isCompactPersonal ? 'h-[53px] w-full' : heightClass} flex flex-col ${isCompactPersonal ? 'justify-between' : 'justify-between'} select-none overflow-hidden ${isLoading || isWaitingForData ? 'pointer-events-none' : ''} ${isCompleted ? 'bg-green-50 border-green-300' : (slot.type ? eventTypeBorderColors[slot.type] : '')}`}
          onClick={(e) => {
            if (isLoading || isWaitingForData) return;
            // Se o dia está bloqueado e o slot está vazio, não permitir criar novo evento
            if (isBlocked && !slot.type) {
              return;
            }
            if (popoverContainerRef.current && popoverContainerRef.current.contains(e.target as Node)) {
              return;
            }
            if (slot.status === 'CONTRATADO') {
              setContractViewOpen(true);
            }
            else if (['RESERVADO', 'CONFIRMADO'].includes(slot.status)) {
              setPatientDialogOpen(true);
            }
            else {
              setIsOpen(true);
            }
          }}
          style={{ WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'manipulation' }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="h-full w-full rounded-md opacity-20" />
            </div>
          ) : (
            <>
              {/* Header: Time and Badges */}
              <div className="flex items-start justify-between">
                <span className={`font-bold ${slot.type ? 'text-xs text-primary' : 'text-[10px] text-muted-foreground'}`}>{timeLabel}</span>

                <div className="flex flex-col items-end gap-0.5 scale-90 origin-top-right">
                  <div className="flex gap-1 items-center">
                    {['RESERVADO', 'CONFIRMADO', 'CONTRATADO'].includes(slot.status) && (
                      (() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const slotDate = new Date(date);
                        slotDate.setHours(0, 0, 0, 0);

                        const isOverdue = slotDate < today;
                        const isPaid = slot.isPaid;
                        const isInaugural = slot.isInaugural;

                        let badgeClass = "";
                        let text = "";

                        if (isInaugural) {
                          badgeClass = "bg-blue-50 text-blue-700 border-blue-200";
                          text = "Inaugural";
                        } else if (isPaid) {
                          badgeClass = "bg-green-50 text-green-700 border-green-200";
                          text = "Pago";
                        } else if (isOverdue) {
                          badgeClass = "bg-red-50 text-red-700 border-red-200";
                          text = "Vencido";
                        } else {
                          badgeClass = "bg-yellow-50 text-yellow-700 border-yellow-200";
                          text = "Pendente";
                        }

                        return (
                          <Badge variant="outline" className={`${badgeClass} text-[10px] px-2 py-0.5 h-auto font-bold flex gap-1 items-center`}>
                            <span>$</span> <span className="text-[9px] font-normal">{text}</span>
                          </Badge>
                        );
                      })()
                    )}
                    {slot.type && (
                      <Badge variant="outline" className={`${eventTypeColors[slot.type]} text-[10px] px-2 py-0.5 h-auto`}>
                        {eventTypeLabels[slot.type]}
                      </Badge>
                    )}
                  </div>
                  {slot.flow_status && slot.status !== 'CONTRATADO' && slot.status !== 'CONFIRMADO' && (
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] px-2 py-0.5 h-auto">
                      {slot.flow_status}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Body: Content - ONLY render if NOT compact personal (avoids flex-1 pushing content down) */}
              {!isCompactPersonal && slot.type ? (
                <div className="flex-1 flex flex-col justify-center min-h-0 overflow-hidden text-xs space-y-0.5">
                  {isPersonal ? (
                    (isDouble) && <span className={`font-semibold truncate text-center ${isCompleted ? 'text-green-700' : ''}`}>
                      {slot.valor || 'Atividade Pessoal'}
                    </span>
                  ) : (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1 font-semibold text-foreground/80 truncate">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {slot.patientName || (
                            (slot.status === 'Vago' || slot.status === 'VAGO')
                              ? "HORÁRIO DISPONÍVEL"
                              : "Sem Paciente"
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                !isCompactPersonal && <div className="flex-1" /> // Spacer only if not compact
              )}

              {/* Footer: Action Button */}
              {/* Only show button if tall enough or create hover effect? */}
              {/* For 30m usage, we might not have space for a big button. */}
              {/* Maybe show button only on hover or keep it small. */}

              {slot.type && slot.status && (
                <div ref={popoverContainerRef} className={`${isCompactPersonal ? '' : 'pt-1 mt-auto'} flex gap-0.5`}>
                  <Popover open={slot.status === 'AGUARDANDO' || shouldShowRenewalButton ? false : statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
                    <PopoverTrigger asChild onClick={(e) => { e.stopPropagation(); if (shouldShowRenewalButton) setRenewalDialogOpen(true); }}>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`${shouldShowFlowButton ? 'flex-[1.4] min-w-0' : 'w-full'} ${isCompactPersonal ? 'h-5 text-[10px]' : 'h-6 text-[10px]'} px-1 ${isPersonal
                          ? (isCompleted
                            ? "bg-green-600 text-white hover:bg-green-700 border-green-600"
                            : (isNotRealized
                              ? "bg-red-100 text-red-800 border-red-300 hover:bg-red-200"
                              : (statusColors[slot.status] || "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")))
                          : (statusColors[displayStatus] || statusColors["Vago"])
                          }`}
                      >
                        <span className="truncate flex items-center justify-center gap-1">
                          {pendingStatusUpdate ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              {isPersonal && isCompleted && <Check className="h-3 w-3" />}
                              {isPersonal ? (slot.valor || 'Atividade') : (shouldShowRenewalButton ? '🔄 RENOVAR' : slot.status)}
                            </>
                          )}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
                      {isPersonal ? (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-center mb-3">Status da Atividade</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" onClick={(e) => handleSetPersonalStatus(false, e)} className="h-12 flex-col gap-1">
                              <X className="h-4 w-4" /> <span className="text-xs">Não Realizada</span>
                            </Button>
                            <Button variant="outline" onClick={(e) => handleSetPersonalStatus(true, e)} className="h-12 flex-col gap-1">
                              <Check className="h-4 w-4" /> <span className="text-xs">Feita</span>
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-center mb-1">Alterar Status</p>
                          {slot.status === 'CONTRATADO' && (
                            <Button variant="outline" onClick={() => { setStatusPopoverOpen(false); setReviewContractOpen(true); }} className="w-full h-8 text-xs mb-2">Rever Contrato</Button>
                          )}
                          {slot.status !== 'CONTRATADO' && (
                            <div className={`grid gap-1 ${getPossibleStatuses(slot.status).length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                              {getPossibleStatuses(slot.status).map(s => (
                                <Button key={s} variant="outline" onClick={(e) => handleStatusChange(s, e)} className="h-8 text-[10px]">
                                  {statusActionLabels[s] || s}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>

                  {/* BUTTON: Send Flow (Alongside Status) */}
                  {shouldShowFlowButton && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={`flex-1 h-6 text-[9px] px-1 ${slot.flow_status
                        ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                        : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
                      onClick={handleSendFlow}
                      disabled={isSendingFlow}
                      title={slot.flow_status ? "Flow Enviado" : "Enviar Flow WhatsApp"}
                    >
                      {isSendingFlow ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        slot.flow_status ? <CheckCheck className="h-3 w-3" /> : <Send className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <TimeSlotDialog
        slot={slot}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSave={async (slotToSave, siblingType) => {
          // Intercept save to handle card loading state
          try {
            await onUpdate(slotToSave, siblingType);
            // After successful API call, we are waiting for Realtime update
            // If we created a new slot (was empty before), show loading on card
            if (!slot.type) {
              setIsWaitingForData(true);
            }
            setIsOpen(false);
          } catch (error) {
            console.error(error);
            // Keep dialog open on error? Or let Dialog handle error?
            // Dialog handles its own loading/error state for the button.
            // If we are here, onUpdate threw error.
          }
        }}
        onRemove={isDouble && !slot.type ? onRemove : undefined}
        isOneHourBlocked={isOneHourBlocked}
        maxDuration={maxDuration}
        date={format(date, 'yyyy-MM-dd')}
      />

      <PatientInfoDialog
        isOpen={patientDialogOpen}
        onClose={() => {
          setPatientDialogOpen(false);
        }}
        onSave={handlePatientInfoSave}
        initialName={slot.patientName || ""}
        initialPhone={slot.patientPhone || ""}
        initialEmail={slot.patientEmail || ""}
        initialPatientId={slot.patientId || undefined}
        initialPrivacyTermsAccepted={slot.privacyTermsAccepted || false}
        statusType={pendingStatus || slot.status || "RESERVADO"}
        slotDate={format(date, 'yyyy-MM-dd')}
        slotTime={slot.time}
        slotType={slot.type}
        slotPrice={slot.preco ? Number(slot.preco) : undefined}
        flowStatus={slot.flow_status}
        isCreation={slot.status === 'Vago' || slot.status === 'VAGO'}
      />

      {/* Diálogo de confirmação para mudar para VAGO */}
      <AlertDialog open={confirmVagoOpen} onOpenChange={setConfirmVagoOpen}>
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
                Você está prestes a <strong>cancelar este agendamento</strong> e marcar o horário como vago.
              </p>

              {/* Informações do Agendamento */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-semibold text-blue-900 mb-2">📅 Agendamento:</p>
                <div className="text-sm text-blue-800 space-y-1">
                  <p><strong>Data:</strong> {format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
                  <p><strong>Horário:</strong> {slot.time}</p>
                </div>
              </div>


              <p className="text-sm text-muted-foreground">
                Esta ação não pode ser desfeita. Tem certeza que deseja continuar?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fechar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmVagoOpen(false);
                await executeVagoChange();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {slot.status === "RESERVADO" ? "Sim, Cancelar Reserva" : "Sim, Cancelar Agendamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de Revisão de Contrato */}
      <RecurrenceReviewDialog
        isOpen={reviewContractOpen}
        onClose={() => setReviewContractOpen(false)}
        groupId={slot.groupId || ''}
        slotTime={slot.time}
      />

      {/* Diálogo de Visualização de Contrato */}
      <ContractViewDialog
        isOpen={contractViewOpen}
        onClose={() => setContractViewOpen(false)}
        contractId={slot.groupId || ''}
        patientName={slot.patientName}
        patientPhone={slot.patientPhone}
        patientEmail={slot.patientEmail}
        slotType={slot.type}
        privacyTermsAccepted={slot.privacyTermsAccepted}
      />

      {/* Diálogo de Renovação de Contrato */}
      {slot.groupId && (
        <ContractRenewalDialog
          isOpen={renewalDialogOpen}
          onClose={() => setRenewalDialogOpen(false)}
          contractId={slot.groupId}
          onConfirmed={() => {
            // Recarregar dados após confirmação
            toast({
              title: "Contrato Renovado",
              description: "A nova sessão foi agendada com sucesso.",
            });
          }}
        />
      )}
    </>
  );
};
