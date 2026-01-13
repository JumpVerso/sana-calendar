import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TimeSlotDialog } from "./TimeSlotDialog";
import { PatientInfoDialog } from "./PatientInfoDialog";
import { PRICE_CATEGORIES, COMMERCIAL_STATUSES } from "@/constants/business-rules";
import { Check, X, User, Send, AlertTriangle } from "lucide-react";
import { formatCentsToBRL } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { patientsAPI } from "@/api/patientsAPI";
import { TimeSlot, EventType } from "./TimeSlotCard";

interface DoubleSlotCardProps {
    slots: TimeSlot[];
    dayIndex: number;
    slotIndices: number[];
    date: Date;
    onUpdate: (slotIndex: number, updatedSlot: TimeSlot, createSiblingType?: EventType) => void | Promise<void>;
    onRemove?: (slotIndex: number) => void | Promise<void>;
    isOneHourBlocked?: boolean;
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

const statusBaseColors: Record<string, string> = {
    "Vago": "bg-slate-100 text-slate-700 border-slate-300",
    "AGUARDANDO": "bg-yellow-100 text-yellow-800 border-yellow-300",
    "CONFIRMADO": "bg-green-100 text-green-800 border-green-300",
    "RESERVADO": "bg-orange-100 text-orange-800 border-orange-300",
    "CONTRATADO": "bg-blue-100 text-blue-800 border-blue-300",
};

const statusIcons: Record<string, string> = {
    "Vago": "○",
    "AGUARDANDO": "⏱",
    "CONFIRMADO": "✓",
    "RESERVADO": "📌",
    "CONTRATADO": "🔒",
};

const statusHoverColors: Record<string, string> = {
    "Vago": "hover:bg-slate-200 hover:text-slate-800 hover:border-slate-400",
    "AGUARDANDO": "hover:bg-yellow-200 hover:text-yellow-900 hover:border-yellow-400",
    "CONFIRMADO": "hover:bg-green-200 hover:text-green-900 hover:border-green-400",
    "RESERVADO": "hover:bg-orange-200 hover:text-orange-900 hover:border-orange-400",
    "CONTRATADO": "hover:bg-blue-200 hover:text-blue-900 hover:border-blue-400",
};

export const DoubleSlotCard = ({ slots, dayIndex, slotIndices, date, onUpdate, onRemove }: DoubleSlotCardProps) => {
    const [activeTab, setActiveTab] = useState<string>("0");
    const [dialogOpenIndex, setDialogOpenIndex] = useState<number>(-1);
    const [statusPopoverOpen, setStatusPopoverOpen] = useState(-1);
    const [patientDialogOpen, setPatientDialogOpen] = useState(false);
    const [pendingStatus, setPendingStatus] = useState<"RESERVADO" | "CONTRATADO" | null>(null);
    const [pendingSlotIndex, setPendingSlotIndex] = useState(-1);
    const [pendingStatusUpdate, setPendingStatusUpdate] = useState<Record<number, string | null>>({});
    const [isWaitingForData, setIsWaitingForData] = useState<Record<number, boolean>>({});
    const [isSendingFlow, setIsSendingFlow] = useState<Record<number, boolean>>({});
    const [confirmVagoOpen, setConfirmVagoOpen] = useState(false);
    const [confirmVagoSlotIndex, setConfirmVagoSlotIndex] = useState(-1);
    const popoverContainerRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    const getCategoryLabel = (value: string) => {
        return PRICE_CATEGORIES.find(c => c.value === value)?.label || value;
    };

    const getPossibleStatuses = (currentStatus: string): string[] => {
        switch (currentStatus) {
            case "Vago":
            case "VAGO":
                return ["RESERVADO"];
            case "RESERVADO":
                return ["VAGO", "CONFIRMADO"];
            case "CONFIRMADO":
                return ["VAGO", "CONTRATADO"];
            case "CONTRATADO":
                return ["VAGO", "CONFIRMADO"];
            default:
                return ["RESERVADO"];
        }
    };

    const [pendingValorUpdate, setPendingValorUpdate] = useState<Record<number, string | null>>({});

    // Clear creation loading when data arrives
    useEffect(() => {
        slots.forEach((slot, index) => {
            if (isWaitingForData[index] && slot.type) {
                setIsWaitingForData(prev => ({ ...prev, [index]: false }));
            }
        });
    }, [slots, isWaitingForData]);

    // Clear status update loading when data arrives
    useEffect(() => {
        slots.forEach((slot, index) => {
            const pending = pendingStatusUpdate[index];
            if (pending && slot.status === pending) {
                setPendingStatusUpdate(prev => ({ ...prev, [index]: null }));
            }
        });
    }, [slots, pendingStatusUpdate]);

    const handleStatusChange = async (slotArrayIndex: number, newStatus: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const slot = slots[slotArrayIndex];

        if (newStatus === "RESERVADO") {
            setPendingStatus("RESERVADO");
            setPendingSlotIndex(slotArrayIndex);
            setPatientDialogOpen(true);
            setStatusPopoverOpen(-1);
        } else if (newStatus === "CONTRATADO") {
            try {
                await onUpdate(slotIndices[slotArrayIndex], {
                    ...slot,
                    status: "CONTRATADO",
                    patientName: slot.patientName || "",
                    patientPhone: slot.patientPhone || ""
                });
                setStatusPopoverOpen(-1);
            } catch (error) {
                console.error(error);
            }
        } else if (newStatus === "CONFIRMADO") {
            try {
                setPendingStatusUpdate(prev => ({ ...prev, [slotArrayIndex]: "CONFIRMADO" }));
                await onUpdate(slotIndices[slotArrayIndex], {
                    ...slot,
                    status: "CONFIRMADO",
                });
            } catch (error) {
                setPendingStatusUpdate(prev => ({ ...prev, [slotArrayIndex]: null }));
                console.error("Erro ao atualizar status:", error);
            }
            setStatusPopoverOpen(-1);
        } else if (newStatus === "VAGO" || newStatus === "Vago") {
            // Verificar se tem dados de paciente para mostrar confirmação
            const hasPatientData = slot.patientName || slot.patientPhone || slot.patientEmail;

            if (hasPatientData && ['RESERVADO', 'CONFIRMADO', 'CONTRATADO'].includes(slot.status)) {
                // Mostrar diálogo de confirmação
                setConfirmVagoSlotIndex(slotArrayIndex);
                setConfirmVagoOpen(true);
            } else {
                // Não tem dados ou já está vago, pode mudar diretamente
                await executeVagoChange(slotArrayIndex);
            }
            setStatusPopoverOpen(-1);
        }
    };

    const executeVagoChange = async (slotArrayIndex: number) => {
        const slot = slots[slotArrayIndex];
        try {
            setPendingStatusUpdate(prev => ({ ...prev, [slotArrayIndex]: "Vago" }));
            await onUpdate(slotIndices[slotArrayIndex], {
                ...slot,
                status: "Vago",
                patientId: null,  // Limpar FK do paciente
                groupId: null,    // Limpar FK do contrato
                flow_status: null,
            });
        } catch (error) {
            setPendingStatusUpdate(prev => ({ ...prev, [slotArrayIndex]: null }));
        }
    };

    const handlePatientInfoSave = async (patientName: string, patientPhone: string, patientEmail?: string, patientId?: string) => {
        if (pendingSlotIndex >= 0) {
            const slot = slots[pendingSlotIndex];
            const statusToUse = pendingStatus || slot.status;

            if (!slot.id) {
                toast({
                    variant: "destructive",
                    title: "Erro",
                    description: "Slot sem ID"
                });
                return;
            }

            try {
                if (pendingStatus) {
                    setPendingStatusUpdate(prev => ({ ...prev, [pendingSlotIndex]: pendingStatus }));
                }

                // Se não temos patientId, criar ou buscar paciente
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

                // Construct updated slot
                const updatedSlot = {
                    ...slot,
                    status: statusToUse,
                    patientId: finalPatientId,
                    patientName: patientName,
                    patientPhone: patientPhone,
                    patientEmail: patientEmail,
                };

                await onUpdate(slotIndices[pendingSlotIndex], updatedSlot as any);

                // Realtime vai atualizar automaticamente
                setPatientDialogOpen(false); // Close the dialog

                console.log("[DoubleSlotCard] PatientSaved. Status:", statusToUse);

                // Recorrencia agora é tratada no DayColumn via onUpdate

                setPendingStatus(null);
                setPendingSlotIndex(-1);
            } catch (error: any) {
                if (pendingStatus) {
                    setPendingStatusUpdate(prev => ({ ...prev, [pendingSlotIndex]: null }));
                }
                // Toast handled by useTimeSlots
            }
        }
    };

    const handleSendFlow = async (slotArrayIndex: number, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
        }

        const slot = slots[slotArrayIndex];

        // Removida validação de telefone conforme solicitado
        if (!slot.patientName) {
            toast({
                variant: "destructive",
                title: "Erro",
                description: "Nome do paciente é obrigatório"
            });
            return;
        }

        if (!slot.id) {
            toast({
                variant: "destructive",
                title: "Erro",
                description: "Slot sem ID, não é possível enviar flow"
            });
            return;
        }

        try {
            setIsSendingFlow(prev => ({ ...prev, [slotArrayIndex]: true }));

            // Chamar API backend para enviar flow
            const { slotsAPI } = await import('@/api/slotsAPI');
            await slotsAPI.sendFlow(slot.id, {
                patientName: slot.patientName,
                patientPhone: slot.patientPhone || "", // Enviar vazio se não tiver
            });

            toast({
                title: "Flow enviado!",
                description: `Flow enviado para ${slot.patientName}`
            });

            // Realtime vai atualizar automaticamente
        } catch (error: any) {
            console.error('Erro ao enviar flow:', error);
            toast({
                variant: "destructive",
                title: "Erro ao enviar flow",
                description: error.message || "Erro desconhecido"
            });
        } finally {
            setIsSendingFlow(prev => ({ ...prev, [slotArrayIndex]: false }));
        }
    };

    const renderSlotContent = (slotArrayIndex: number) => {
        const slot = slots[slotArrayIndex];
        const isPersonal = slot.type === 'personal';
        const hasPatientInfo = slot.patientName && slot.patientName.trim() !== "";
        const shouldShowFlowButton = slot.status === "RESERVADO" && slot.flow_status !== "confirmado";

        return (
            <div className="flex flex-col h-full justify-between" ref={popoverContainerRef}>
                {slot.type && (
                    <div className="flex-1 flex flex-col justify-center text-xs min-h-0">
                        {isPersonal ? (
                            <div className="flex items-center justify-center">
                                <Badge
                                    variant="outline"
                                    className={`${eventTypeColors.personal} text-[10px] px-2 py-0.5 font-semibold`}
                                >
                                    {slot.status || 'Pessoal'}
                                </Badge>
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                {hasPatientInfo && (
                                    <div
                                        className="flex items-center gap-1 font-semibold text-foreground/80 truncate cursor-pointer hover:text-foreground text-xs"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setPendingSlotIndex(slotArrayIndex);
                                            setPendingStatus(null);
                                            setPatientDialogOpen(true);
                                        }}
                                    >
                                        <User className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{slot.patientName}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Botões de ação */}
                {slot.type && slot.status && (
                    <div className="pt-1 mt-auto flex gap-0.5">
                        <Popover
                            open={slot.status === 'AGUARDANDO' ? false : (statusPopoverOpen === slotArrayIndex)}
                            onOpenChange={(open) => {
                                if (slot.status !== 'AGUARDANDO') {
                                    setStatusPopoverOpen(open ? slotArrayIndex : -1);
                                }
                            }}
                        >
                            <PopoverTrigger asChild onClick={(e) => {
                                e.stopPropagation();
                                if (slot.status === 'CONTRATADO') {
                                    setStatusPopoverOpen(-1);
                                    setPendingSlotIndex(slotArrayIndex);
                                    setPatientDialogOpen(true);
                                }
                            }}>
                                {isPersonal ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={`w-full h-6 text-[9px] font-semibold transition-all px-1`}
                                    >
                                        <div className="flex items-center justify-center w-full gap-1 overflow-hidden">
                                            {slot.valor === "concluido" ? (
                                                <>
                                                    <Check className="h-3 w-3 shrink-0" />
                                                    <span className="truncate">Concluído</span>
                                                </>
                                            ) : (
                                                <span className="truncate">{slot.status}</span>
                                            )}
                                        </div>
                                    </Button>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={`${shouldShowFlowButton ? 'flex-[1.4]' : 'flex-1'} min-w-0 px-1 h-6 text-[10px] font-semibold transition-all ${statusBaseColors[slot.status] || statusBaseColors["Vago"]} ${slot.status === 'AGUARDANDO' ? 'cursor-default' : 'cursor-pointer'}`}
                                    >
                                        <div className="flex items-center justify-center w-full gap-1 overflow-hidden">
                                            <span className="truncate">{(slot.status === "Vago" || slot.status === "VAGO") ? "Vago" : slot.status}</span>
                                        </div>
                                    </Button>
                                )}
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
                                {isPersonal ? (
                                    <div className="space-y-2">
                                        <p className="text-sm font-semibold text-center mb-3">Status da Atividade</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant="outline"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    try {
                                                        const newValor = slot.valor === "nao_realizado" ? "pendente" : "nao_realizado";
                                                        setPendingValorUpdate(prev => ({ ...prev, [slotArrayIndex]: newValor }));
                                                        await onUpdate(slotIndices[slotArrayIndex], { ...slot, valor: newValor });
                                                    } catch (error) {
                                                        console.error("Erro ao atualizar valor:", error);
                                                        setPendingValorUpdate(prev => ({ ...prev, [slotArrayIndex]: null }));
                                                    }
                                                    setStatusPopoverOpen(-1);
                                                }}
                                                disabled={!!pendingValorUpdate[slotArrayIndex]}
                                                className="h-12 flex-col gap-1"
                                            >
                                                {pendingValorUpdate[slotArrayIndex] === "nao_realizado" || (pendingValorUpdate[slotArrayIndex] === "pendente" && slot.valor === "nao_realizado") ? (
                                                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                                                ) : (
                                                    <>
                                                        <X className="h-4 w-4" />
                                                        <span className="text-[10px]">Não Realizada</span>
                                                    </>
                                                )}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    try {
                                                        const newValor = slot.valor === "concluido" ? "pendente" : "concluido";
                                                        setPendingValorUpdate(prev => ({ ...prev, [slotArrayIndex]: newValor }));
                                                        await onUpdate(slotIndices[slotArrayIndex], { ...slot, valor: newValor });
                                                    } catch (error) {
                                                        console.error("Erro ao atualizar valor:", error);
                                                        setPendingValorUpdate(prev => ({ ...prev, [slotArrayIndex]: null }));
                                                    }
                                                    setStatusPopoverOpen(-1);
                                                }}
                                                disabled={!!pendingValorUpdate[slotArrayIndex]}
                                                className="h-12 flex-col gap-1"
                                            >
                                                {pendingValorUpdate[slotArrayIndex] === "concluido" || (pendingValorUpdate[slotArrayIndex] === "pendente" && slot.valor === "concluido") ? (
                                                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                                                ) : (
                                                    <>
                                                        <Check className="h-4 w-4" />
                                                        <span className="text-[10px]">Feita</span>
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-sm font-semibold text-center mb-3">Alterar Status</p>
                                        <div className={`grid gap-2 ${getPossibleStatuses(slot.status).length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                            {getPossibleStatuses(slot.status).map((status) => {
                                                const actionLabels: Record<string, string> = {
                                                    "Vago": "Cancelar",
                                                    "VAGO": "Cancelar",
                                                    "RESERVADO": "Reservar",
                                                    "CONFIRMADO": "Confirmar",
                                                    "CONTRATADO": "Contratar",
                                                };

                                                return (
                                                    <Button
                                                        key={status}
                                                        variant="outline"
                                                        onClick={(e) => handleStatusChange(slotArrayIndex, status, e)}
                                                        className={`h-10 flex-col gap-1 transition-all ${statusBaseColors[status]} ${statusHoverColors[status]}`}
                                                        disabled={!!pendingStatusUpdate[slotArrayIndex]}
                                                    >
                                                        {pendingStatusUpdate[slotArrayIndex] && status === slot.status ? (
                                                            <div className="flex items-center justify-center w-full h-full">
                                                                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <span className="text-[10px] font-semibold">{actionLabels[status] || status}</span>
                                                            </>
                                                        )}
                                                    </Button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </PopoverContent>
                        </Popover>

                        {shouldShowFlowButton && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 h-6 text-[9px] border-purple-200 bg-purple-50 text-purple-700 disabled:opacity-70 px-1"
                                onClick={(e) => handleSendFlow(slotArrayIndex, e)}
                            >
                                <Send className="h-2.5 w-2.5 shrink-0" />
                            </Button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Determinar as cores das bordas laterais baseadas nos tipos dos slots
    const getLeftBorderClass = () => {
        if (!slots[0]?.type) return '';
        switch (slots[0].type) {
            case 'personal': return 'border-l-4 border-l-event-personal';
            case 'online': return 'border-l-4 border-l-event-online';
            case 'presential': return 'border-l-4 border-l-event-presential';
            default: return '';
        }
    };

    const getRightBorderClass = () => {
        if (!slots[1]?.type) return '';
        switch (slots[1].type) {
            case 'personal': return 'border-r-4 border-r-event-personal';
            case 'online': return 'border-r-4 border-r-event-online';
            case 'presential': return 'border-r-4 border-r-event-presential';
            default: return '';
        }
    };

    return (
        <>
            <Card
                className={`border h-full flex flex-col cursor-pointer overflow-hidden p-0 relative z-10 ${getLeftBorderClass()} ${getRightBorderClass()} ${Object.values(isWaitingForData).some(v => v) ? 'pointer-events-none' : ''}`}
                onClick={() => {
                    const currentSlot = slots[parseInt(activeTab)];
                    const isReadOnlyStatus = currentSlot && ['RESERVADO', 'CONFIRMADO', 'CONTRATADO'].includes(currentSlot.status);

                    if (isReadOnlyStatus) {
                        setPendingSlotIndex(parseInt(activeTab));
                        setPendingStatus(null);
                        setPatientDialogOpen(true);
                    } else {
                        setDialogOpenIndex(parseInt(activeTab));
                    }
                }}
            >
                <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                    <TabsList className="grid w-full grid-cols-2 rounded-none h-6 shrink-0 p-0 bg-muted/50">
                        {slots.map((slot, index) => (
                            <TabsTrigger
                                key={index}
                                value={index.toString()}
                                className="px-1 h-6 text-[10px] data-[state=active]:bg-background data-[state=active]:font-semibold rounded-none border-b-2 border-transparent data-[state=active]:border-primary/20 transition-all"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center gap-1.5 w-full justify-center overflow-hidden">
                                    {isWaitingForData[index] ? (
                                        <div className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                                    ) : (
                                        <>
                                            {slot.type && (
                                                <span className={`truncate max-w-[60px] ${slot.type === 'online' ? 'text-event-online' :
                                                    slot.type === 'presential' ? 'text-event-presential' :
                                                        slot.type === 'personal' ? 'text-event-personal' : ''
                                                    }`}>
                                                    {eventTypeLabels[slot.type]}
                                                </span>
                                            )}
                                            <span className="text-[10px] opacity-70">
                                                {statusIcons[slot.status] || statusIcons["Vago"]}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {slots.map((slot, index) => (
                        <TabsContent
                            key={index}
                            value={index.toString()}
                            className="flex-1 mt-0 p-1.5 min-h-0 overflow-hidden"
                        >
                            {isWaitingForData[index] ? (
                                <div className="flex items-center justify-center h-full">
                                    <Skeleton className="h-4 w-20" />
                                </div>
                            ) : (
                                renderSlotContent(index)
                            )}
                        </TabsContent>
                    ))}
                </Tabs>
            </Card>

            {/* Dialogs */}
            {dialogOpenIndex >= 0 && (
                <TimeSlotDialog
                    slot={slots[dialogOpenIndex]}
                    isOpen={true}
                    onClose={() => setDialogOpenIndex(-1)}
                    onSave={async (updatedSlot, createSiblingType) => {
                        try {
                            await onUpdate(slotIndices[dialogOpenIndex], updatedSlot, createSiblingType);
                            // If we created a new slot (was empty before), show loading on card
                            if (!slots[dialogOpenIndex].type) {
                                setIsWaitingForData(prev => ({ ...prev, [dialogOpenIndex]: true }));
                            }
                            setDialogOpenIndex(-1);
                        } catch (error) {
                            console.error(error);
                        }
                    }}
                    onRemove={onRemove ? async () => {
                        await onRemove(slotIndices[dialogOpenIndex]);
                        setDialogOpenIndex(-1);
                    } : undefined}
                />
            )}

            <PatientInfoDialog
                isOpen={patientDialogOpen}
                onClose={() => {
                    setPatientDialogOpen(false);
                    setPendingStatus(null);
                    setPendingSlotIndex(-1);
                }}
                onSave={handlePatientInfoSave}
                initialName={pendingSlotIndex >= 0 ? slots[pendingSlotIndex].patientName || "" : ""}
                initialPhone={pendingSlotIndex >= 0 ? slots[pendingSlotIndex].patientPhone || "" : ""}
                initialEmail={pendingSlotIndex >= 0 ? slots[pendingSlotIndex].patientEmail || "" : ""}
                initialPatientId={pendingSlotIndex >= 0 ? slots[pendingSlotIndex].patientId || undefined : undefined}
                initialPrivacyTermsAccepted={pendingSlotIndex >= 0 ? slots[pendingSlotIndex].privacyTermsAccepted || false : false}
                statusType={pendingStatus || (pendingSlotIndex >= 0 ? slots[pendingSlotIndex].status : "RESERVADO")}
                slotDate={format(date, 'yyyy-MM-dd')}
                slotTime={pendingSlotIndex >= 0 ? slots[pendingSlotIndex].time : undefined}
                slotType={pendingSlotIndex >= 0 ? slots[pendingSlotIndex].type : undefined}
                slotPrice={pendingSlotIndex >= 0 ? Number(slots[pendingSlotIndex].preco) : undefined}
                flowStatus={pendingSlotIndex >= 0 ? slots[pendingSlotIndex].flow_status : undefined}
                isCreation={pendingSlotIndex >= 0 ? (slots[pendingSlotIndex].status === 'Vago' || slots[pendingSlotIndex].status === 'VAGO') : false}
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
                            {confirmVagoSlotIndex >= 0 && (
                                <>
                                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                        <p className="text-sm font-semibold text-blue-900 mb-2">📅 Agendamento:</p>
                                        <div className="text-sm text-blue-800 space-y-1">
                                            <p><strong>Data:</strong> {format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
                                            <p><strong>Horário:</strong> {slots[confirmVagoSlotIndex].time}</p>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                        <p className="text-sm font-semibold text-amber-900 mb-2">⚠️ Atenção:</p>
                                        <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                                            <li>Todos os dados do paciente serão <strong>excluídos permanentemente</strong></li>
                                            <li>Nome: <strong>{slots[confirmVagoSlotIndex].patientName}</strong></li>
                                            <li>Telefone: <strong>{slots[confirmVagoSlotIndex].patientPhone}</strong></li>
                                            {slots[confirmVagoSlotIndex].patientEmail && <li>Email: <strong>{slots[confirmVagoSlotIndex].patientEmail}</strong></li>}
                                        </ul>
                                    </div>
                                </>
                            )}
                            <p className="text-sm text-muted-foreground">
                                Esta ação não pode ser desfeita. Tem certeza que deseja continuar?
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                setConfirmVagoOpen(false);
                                if (confirmVagoSlotIndex >= 0) {
                                    await executeVagoChange(confirmVagoSlotIndex);
                                }
                            }}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {confirmVagoSlotIndex >= 0 && slots[confirmVagoSlotIndex].status === "RESERVADO" ? "Sim, Cancelar Reserva" : "Sim, Cancelar Agendamento"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
