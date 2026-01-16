import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calendar, Clock, CreditCard, FileText, User, Video, MapPin, CheckCircle2, Circle, DollarSign, AlertTriangle } from "lucide-react";
import { format, parseISO, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useState } from "react";
import { slotsAPI } from "@/api/slotsAPI";
import { formatCentsToBRL } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RecurrenceReviewDialog } from "./RecurrenceReviewDialog";

interface ContractSlot {
    id?: string;
    date: string;
    time: string;
    isPaid?: boolean;
    isInaugural?: boolean; // Marca se o slot é inaugural (gratuito)
    status: string;
    price?: number | null; // Preço em centavos
    startTime?: string; // ISO string para ordenação precisa
}

interface ContractViewDialogProps {
    isOpen: boolean;
    onClose: () => void;
    contractId: string;
    patientName?: string;
    patientPhone?: string;
    patientEmail?: string;
    slotType?: 'online' | 'presential' | 'personal' | null;
    privacyTermsAccepted?: boolean;
}

export function ContractViewDialog({
    isOpen,
    onClose,
    contractId,
    patientName,
    patientPhone,
    patientEmail,
    slotType,
    privacyTermsAccepted
}: ContractViewDialogProps) {
    const [slots, setSlots] = useState<ContractSlot[]>([]);
    const [loading, setLoading] = useState(true);
    const [frequency, setFrequency] = useState<string>('weekly');
    const [pendingContracts, setPendingContracts] = useState<Array<{ contractId: string; totalDebt: number; unpaidCount: number; firstStartTime?: string | null }>>([]);
    const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
    const [selectedContractInfo, setSelectedContractInfo] = useState<{ contractId: string; patientName?: string; patientPhone?: string; patientEmail?: string; slotType?: 'online' | 'presential' | 'personal' | null; privacyTermsAccepted?: boolean } | null>(null);
    const [contractViewOpen, setContractViewOpen] = useState(false);
    const [reviewContractOpen, setReviewContractOpen] = useState(false);
    const [contractSlotTime, setContractSlotTime] = useState<string>('');

    useEffect(() => {
        if (isOpen && contractId) {
            loadContractSlots();
            loadPendingContracts();
        }
    }, [isOpen, contractId, patientPhone, patientEmail]);

    const loadPendingContracts = async () => {
        if (!patientPhone && !patientEmail) return;
        if (!contractId) return; // Não filtrar se não temos o contractId atual
        
        try {
            // Buscar o start_time do primeiro slot do contrato atual para comparar
            // Os slots já vêm ordenados por start_time do backend
            const currentContractSlots = await slotsAPI.getContractSlots(contractId);
            
            // Ordenar por start_time se disponível, senão por date+time
            const sortedCurrentSlots = [...currentContractSlots].sort((a, b) => {
                const aStartTime = (a as any).startTime;
                const bStartTime = (b as any).startTime;
                if (aStartTime && bStartTime) {
                    return new Date(aStartTime).getTime() - new Date(bStartTime).getTime();
                }
                const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
                if (dateCompare !== 0) return dateCompare;
                return (a.time || '').localeCompare(b.time || '');
            });
            
            const currentContractFirstSlot = sortedCurrentSlots.length > 0 ? sortedCurrentSlots[0] : null;
            const firstSlotStartTime = currentContractFirstSlot ? (currentContractFirstSlot as any).startTime : null;
            const currentContractStartTime = firstSlotStartTime 
                ? new Date(firstSlotStartTime).getTime() 
                : null;

            const pending = await slotsAPI.getPendingContracts(patientPhone, patientEmail);
            
            // Filtrar apenas contratos anteriores (com start_time menor que o contrato atual)
            // e que não sejam o contrato atual
            const currentContractIdStr = String(contractId).trim();
            const olderPendingContracts = pending.filter(c => {
                // Excluir o contrato atual
                if (c.contractId) {
                    const pendingContractIdStr = String(c.contractId).trim();
                    if (pendingContractIdStr === currentContractIdStr) {
                        return false;
                    }
                }

                // Se não temos start_time do contrato atual, não podemos comparar - não mostrar
                if (!currentContractStartTime) {
                    return false;
                }

                // Se o contrato pendente não tem start_time, não podemos comparar - não mostrar
                if (!c.firstStartTime) {
                    return false;
                }

                // Filtrar apenas contratos com start_time anterior ao contrato atual
                const pendingStartTime = new Date(c.firstStartTime).getTime();
                return pendingStartTime < currentContractStartTime;
            });

            setPendingContracts(olderPendingContracts);
        } catch (error) {
            console.error('Erro ao buscar contratos pendentes:', error);
            setPendingContracts([]);
        }
    };

    const loadContractSlots = async () => {
        try {
            setLoading(true);
            const contractSlots = await slotsAPI.getContractSlots(contractId);

            // Mapear para ContractSlot incluindo isInaugural e startTime
            const mappedSlots: ContractSlot[] = contractSlots.map(slot => ({
                id: slot.id,
                date: slot.date,
                time: slot.time,
                isPaid: slot.isPaid,
                isInaugural: slot.isInaugural,
                status: slot.status,
                price: slot.price,
                startTime: (slot as any).startTime // startTime vem da API mas precisa ser mapeado
            }));

            // Ordenar por data
            const sortedSlots = mappedSlots.sort((a, b) =>
                new Date(a.date).getTime() - new Date(b.date).getTime()
            );

            setSlots(sortedSlots);

            // Determinar frequência (pode vir do backend futuramente)
            if (sortedSlots.length > 1) {
                const diff = Math.abs(
                    new Date(sortedSlots[1].date).getTime() -
                    new Date(sortedSlots[0].date).getTime()
                );
                const days = diff / (1000 * 60 * 60 * 24);

                if (days <= 8) setFrequency('weekly');
                else if (days <= 16) setFrequency('biweekly');
                else setFrequency('monthly');
            }
        } catch (error) {
            console.error('Erro ao carregar slots do contrato:', error);
        } finally {
            setLoading(false);
        }
    };

    const getFrequencyLabel = () => {
        switch (frequency) {
            case 'weekly': return 'Semanal';
            case 'biweekly': return 'Quinzenal';
            case 'monthly': return 'Mensal';
            default: return 'Personalizado';
        }
    };

    const getTypeIcon = () => {
        if (slotType === 'online') return <Video className="h-4 w-4" />;
        if (slotType === 'presential') return <MapPin className="h-4 w-4" />;
        return <User className="h-4 w-4" />;
    };

    const getTypeLabel = () => {
        if (slotType === 'online') return 'Online';
        if (slotType === 'presential') return 'Presencial';
        return 'Pessoal';
    };

    // Calcular status financeiro
    const getFinancialStatus = () => {
        // Se há débitos de contratos anteriores, sempre mostrar "Atenção"
        if (pendingContracts.length > 0) {
            return { status: 'atencao-debitos', label: 'Atenção', color: 'red', className: 'bg-red-100 text-red-800 border-red-300' };
        }

        const nonInauguralSlots = slots.filter(s => !s.isInaugural);
        
        if (nonInauguralSlots.length === 0) {
            return { status: 'em-dia', label: 'Em dia', color: 'green', className: 'bg-green-100 text-green-800 border-green-300' };
        }

        const allPaid = nonInauguralSlots.every(s => s.isPaid);
        const hasOverdueUnpaid = nonInauguralSlots.some(s => 
            isPast(parseISO(s.date)) && !s.isPaid
        );

        if (allPaid) {
            return { status: 'em-dia', label: 'Em dia', color: 'green', className: 'bg-green-100 text-green-800 border-green-300' };
        }
        
        if (hasOverdueUnpaid) {
            return { status: 'atencao', label: 'Atenção', color: 'red', className: 'bg-red-100 text-red-800 border-red-300' };
        }

        return { status: 'regular', label: 'Regular', color: 'yellow', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' };
    };

    // Calcular valor total em aberto
    const getTotalOpen = () => {
        return slots
            .filter(s => !s.isInaugural && !s.isPaid)
            .reduce((sum, s) => sum + (s.price || 0), 0);
    };

    // Calcular quantidades de sessões
    const getSessionCounts = () => {
        const inauguralCount = slots.filter(s => s.isInaugural).length;
        const regularCount = slots.filter(s => !s.isInaugural).length;
        const paidCount = slots.filter(s => !s.isInaugural && s.isPaid).length;
        const openCount = slots.filter(s => !s.isInaugural && !s.isPaid).length;
        
        return { inauguralCount, regularCount, paidCount, openCount };
    };

    // Formatar contagem de sessões
    const getSessionCountLabel = () => {
        const { inauguralCount, regularCount } = getSessionCounts();
        
        if (inauguralCount > 0 && regularCount > 0) {
            const inauguralText = inauguralCount === 1 ? 'inaugural' : 'inaugurais';
            return `${inauguralCount} ${inauguralText} + ${regularCount} sessões`;
        } else if (inauguralCount > 0) {
            const inauguralText = inauguralCount === 1 ? 'inaugural' : 'inaugurais';
            return `${inauguralCount} ${inauguralText}`;
        } else {
            return `${regularCount} ${regularCount === 1 ? 'sessão' : 'sessões'}`;
        }
    };

    // Mostrar todas as sessões do contrato
    const visibleSlots = slots;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Visualizar Contrato
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Informações do Paciente */}
                        <Card className="p-4 bg-blue-50 border-blue-200">
                            <div className="flex items-center gap-2 mb-3">
                                <User className="h-5 w-5 text-blue-700" />
                                <h3 className="font-semibold text-blue-900">Informações do Paciente</h3>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-blue-700">Nome:</span>
                                    <span className="font-medium text-blue-900">{patientName || 'Não informado'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-blue-700">Telefone:</span>
                                    <span className="font-medium text-blue-900">{patientPhone || 'Não informado'}</span>
                                </div>
                                {patientEmail && (
                                    <div className="flex justify-between">
                                        <span className="text-blue-700">Email:</span>
                                        <span className="font-medium text-blue-900">{patientEmail}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center">
                                    <span className="text-blue-700">Termos de Privacidade:</span>
                                    <Badge variant={privacyTermsAccepted ? "default" : "secondary"} className="text-xs">
                                        {privacyTermsAccepted ? '✓ Aceito' : '○ Não aceito'}
                                    </Badge>
                                </div>
                            </div>
                        </Card>

                        {/* Informações do Contrato */}
                        <Card className="p-4 bg-purple-50 border-purple-200">
                            <div className="flex items-center gap-2 mb-3">
                                <Calendar className="h-5 w-5 text-purple-700" />
                                <h3 className="font-semibold text-purple-900">Detalhes do Contrato Atual</h3>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-purple-700">Tipo:</span>
                                    <div className="flex items-center gap-1">
                                        {getTypeIcon()}
                                        <span className="font-medium text-purple-900">{getTypeLabel()}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-purple-700">Frequência:</span>
                                    <span className="font-medium text-purple-900">{getFrequencyLabel()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-purple-700">Total de Sessões:</span>
                                    <span className="font-medium text-purple-900">{slots.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-purple-700">Sessões Pagas:</span>
                                    <span className="font-medium text-purple-900">
                                        {slots.filter(s => s.isPaid && !s.isInaugural).length} de {slots.filter(s => !s.isInaugural).length}
                                    </span>
                                </div>
                                {slots.some(s => s.isInaugural) && (
                                    <div className="flex justify-between">
                                        <span className="text-purple-700">Sessões Inaugurais:</span>
                                        <span className="font-medium text-purple-900">
                                            {slots.filter(s => s.isInaugural).length}
                                        </span>
                                    </div>
                                )}
                                {slots.length > 0 && slots[0].price && (
                                    <div className="flex justify-between">
                                        <span className="text-purple-700">Valor da Sessão:</span>
                                        <span className="font-medium text-purple-900">
                                            {formatCentsToBRL(slots[0].price)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </Card>

                        {/* Dados Financeiros */}
                        <Card className="p-4 bg-green-50 border-green-200">
                            <div className="flex items-center gap-2 mb-3">
                                <DollarSign className="h-5 w-5 text-green-700" />
                                <h3 className="font-semibold text-green-900">Dados Financeiros</h3>
                            </div>
                            <div className="space-y-3 text-sm">
                                {/* Status do Contrato */}
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-green-700">Status:</span>
                                        <Badge 
                                            variant="outline" 
                                            className={getFinancialStatus().className}
                                        >
                                            {getFinancialStatus().label}
                                        </Badge>
                                    </div>
                                    <div className="text-xs text-green-600 ml-auto text-right">
                                        {(() => {
                                            const status = getFinancialStatus().status;
                                            if (status === 'em-dia') {
                                                return '🟢 Em dia: Todas as sessões contratadas estão pagas';
                                            } else if (status === 'regular') {
                                                return '🟡 Regular: Existem sessões futuras a pagar, sem pendências vencidas';
                                            } else if (status === 'atencao-debitos') {
                                                return '🔴 Atenção: Existem débitos de contratos anteriores (veja abaixo)';
                                            } else {
                                                return '🔴 Atenção: Existem sessões já realizadas sem pagamento';
                                            }
                                        })()}
                                    </div>
                                </div>

                                {/* Contagem de Sessões */}
                                <div className="flex justify-between">
                                    <span className="text-green-700">Sessões:</span>
                                    <span className="font-medium text-green-900">
                                        {getSessionCountLabel()}
                                    </span>
                                </div>

                                {/* Sessões Pagas */}
                                {(() => {
                                    const { paidCount, regularCount } = getSessionCounts();
                                    if (regularCount > 0) {
                                        return (
                                            <div className="flex justify-between">
                                                <span className="text-green-700">Sessões Pagas:</span>
                                                <span className="font-medium text-green-900">
                                                    {paidCount} de {regularCount}
                                                </span>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                {/* Alerta de Contratos Pendentes */}
                                {pendingContracts.length > 0 && (
                                    <div className="pt-2 border-t border-green-200 space-y-2">
                                        {pendingContracts.map((contract) => {
                                            const totalDebt = contract.totalDebt;
                                            return (
                                                <Alert 
                                                    key={contract.contractId}
                                                    variant="destructive"
                                                    className="cursor-pointer hover:bg-destructive/10 transition-colors"
                                                    onClick={async () => {
                                                        // Buscar informações do contrato para obter slotType
                                                        try {
                                                            const contractSlots = await slotsAPI.getContractSlots(contract.contractId);
                                                            const firstSlot = contractSlots[0];
                                                            setSelectedContractInfo({
                                                                contractId: contract.contractId,
                                                                patientName,
                                                                patientPhone,
                                                                patientEmail,
                                                                slotType: firstSlot?.type || null,
                                                                privacyTermsAccepted
                                                            });
                                                            setContractViewOpen(true);
                                                        } catch (error) {
                                                            console.error('Erro ao buscar informações do contrato:', error);
                                                        }
                                                    }}
                                                >
                                                    <AlertTriangle className="h-4 w-4" />
                                                    <AlertTitle>Atenção: Paciente com débitos de contratos anteriores</AlertTitle>
                                                    <AlertDescription className="space-y-2">
                                                        <div>
                                                            Valor: <strong>{formatCentsToBRL(totalDebt)}</strong>
                                                            <br />
                                                            <span className="text-xs text-muted-foreground">
                                                                {contract.unpaidCount} {contract.unpaidCount === 1 ? 'sessão' : 'sessões'} em aberto
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-2 mt-2">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 text-xs"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    // Buscar o primeiro slot do contrato para obter o horário
                                                                    slotsAPI.getContractSlots(contract.contractId).then(contractSlots => {
                                                                        if (contractSlots.length > 0) {
                                                                            setContractSlotTime(contractSlots[0].time);
                                                                            setSelectedContractId(contract.contractId);
                                                                            setReviewContractOpen(true);
                                                                        }
                                                                    });
                                                                }}
                                                            >
                                                                Rever Contrato
                                                            </Button>
                                                        </div>
                                                    </AlertDescription>
                                                </Alert>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Sessões em Aberto e Valor Total */}
                                {(() => {
                                    const { openCount } = getSessionCounts();
                                    const totalOpen = getTotalOpen();
                                    
                                    if (openCount > 0) {
                                        return (
                                            <>
                                                <div className="flex justify-between">
                                                    <span className="text-green-700">Sessões em Aberto:</span>
                                                    <span className="font-medium text-green-900">
                                                        {openCount}
                                                    </span>
                                                </div>
                                                {totalOpen > 0 && (
                                                    <div className="flex justify-between items-center pt-2 border-t border-green-200">
                                                        <span className="text-green-700 font-semibold">Valor Total em Aberto:</span>
                                                        <span className="font-bold text-green-900 text-base">
                                                            {formatCentsToBRL(totalOpen)}
                                                        </span>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                        </Card>

                        {/* Agendamentos */}
                        <div>
                            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                                <Clock className="h-5 w-5" />
                                Agendamentos
                            </h3>
                            <div className="space-y-2">
                                {visibleSlots.map((slot, index) => {
                                    const slotDate = parseISO(slot.date);
                                    const isSlotPast = isPast(slotDate);

                                    return (
                                        <Card
                                            key={slot.id}
                                            className={`p-3 ${isSlotPast ? 'bg-gray-100 border-gray-300' : 'bg-white'}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    {isSlotPast ? (
                                                        <CheckCircle2 className="h-5 w-5 text-gray-500" />
                                                    ) : (
                                                        <Circle className="h-5 w-5 text-blue-500" />
                                                    )}
                                                    <div>
                                                        <p className={`font-medium ${isSlotPast ? 'text-gray-600' : 'text-gray-900'}`}>
                                                            {format(slotDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                                                        </p>
                                                        <p className={`text-sm ${isSlotPast ? 'text-gray-500' : 'text-gray-600'}`}>
                                                            {slot.time.substring(0, 5)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isSlotPast && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            Realizada
                                                        </Badge>
                                                    )}
                                                    {slot.isInaugural ? (
                                                        <Badge
                                                            variant="default"
                                                            className="bg-blue-600 text-white"
                                                        >
                                                            <CreditCard className="h-3 w-3 mr-1" />
                                                            Inaugural
                                                        </Badge>
                                                    ) : (
                                                        (() => {
                                                            const isSlotPast = isPast(slotDate);
                                                            const paymentStatus = slot.isPaid 
                                                                ? 'Pago' 
                                                                : (isSlotPast ? 'Vencido' : 'Pendente');
                                                            const badgeVariant = slot.isPaid ? "default" : (isSlotPast ? "destructive" : "outline");
                                                            const badgeClass = slot.isPaid 
                                                                ? "bg-green-600 text-white" 
                                                                : (isSlotPast ? "bg-red-600 text-white" : "");
                                                            
                                                            return (
                                                                <Badge
                                                                    variant={badgeVariant}
                                                                    className={badgeClass}
                                                                >
                                                                    <CreditCard className="h-3 w-3 mr-1" />
                                                                    {paymentStatus}
                                                                </Badge>
                                                            );
                                                        })()
                                                    )}
                                                </div>
                                            </div>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Documento (apenas para presencial) */}
                        {slotType === 'presential' && (
                            <Card className="p-6 bg-gray-100 border-gray-300 border-dashed">
                                <div className="flex flex-col items-center justify-center text-center space-y-2">
                                    <FileText className="h-8 w-8 text-gray-400" />
                                    <p className="text-sm font-medium text-gray-600">Documento do Paciente</p>
                                    <p className="text-xs text-gray-500">Em breve: Upload de documentos</p>
                                </div>
                            </Card>
                        )}

                        <Separator />

                        {/* Rodapé com informações adicionais */}
                        <div className="text-xs text-muted-foreground text-center">
                            <p>ID do Contrato: {contractId}</p>
                        </div>
                    </div>
                )}
            </DialogContent>

            {/* Dialog de Visualização do Contrato Pendente */}
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

            {/* Dialog de Revisão de Contrato */}
            {selectedContractId && (
                <RecurrenceReviewDialog
                    isOpen={reviewContractOpen}
                    onClose={() => {
                        setReviewContractOpen(false);
                        setSelectedContractId(null);
                        setContractSlotTime('');
                        // Após salvar/editar no "Rever Contrato", recarregar pendências
                        // para atualizar o alerta de débitos imediatamente.
                        loadPendingContracts();
                    }}
                    groupId={selectedContractId}
                    slotTime={contractSlotTime}
                />
            )}
        </Dialog>
    );
}
