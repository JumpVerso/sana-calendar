import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Calendar, Clock, User, AlertTriangle, RefreshCw, Loader2, Check, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useState } from "react";
import { renewalsAPI, RenewalPreview } from "@/api/renewalsAPI";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

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
    const [editMode, setEditMode] = useState(false);
    const [editDate, setEditDate] = useState('');
    const [editTime, setEditTime] = useState('');
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

    const handleConfirm = async () => {
        try {
            setSubmitting(true);

            const adjustments = editMode ? { date: editDate, time: editTime } : undefined;
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

                        {/* Alerta de sem disponibilidade */}
                        {noAvailability && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Sem Disponibilidade</AlertTitle>
                                <AlertDescription>
                                    Não há horários disponíveis em {suggestedDate ? format(parseISO(suggestedDate), "dd/MM/yyyy") : ''}.
                                    Por favor, selecione outra data manualmente.
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
                                    {sessions.map((session, idx) => (
                                        <div key={idx} className="flex items-center justify-between py-2 border-b border-purple-200 last:border-0">
                                            <div className="flex items-center gap-2 text-purple-800">
                                                <span className="font-semibold text-sm">
                                                    {format(parseISO(session.date), "dd/MM (EEE)", { locale: ptBR })}
                                                </span>
                                                <span className="text-sm">às</span>
                                                <span className="font-semibold text-sm">{session.time}</span>
                                            </div>
                                            {session.timeWasChanged && (
                                                <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                                                    Deslizado
                                                </Badge>
                                            )}
                                            {session.noAvailability && (
                                                <Badge variant="outline" className="text-red-600 border-red-300 text-xs">
                                                    Sem vaga
                                                </Badge>
                                            )}
                                        </div>
                                    ))}
                                    <p className="text-xs text-purple-600 mt-2">
                                        ⚠️ Múltiplas sessões - edição individual não disponível
                                    </p>
                                </div>
                            ) : editMode ? (
                                <div className="space-y-3">
                                    <div>
                                        <Label htmlFor="edit-date" className="text-purple-700">Data</Label>
                                        <Input
                                            id="edit-date"
                                            type="date"
                                            value={editDate}
                                            onChange={(e) => setEditDate(e.target.value)}
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="edit-time" className="text-purple-700">Horário</Label>
                                        <Input
                                            id="edit-time"
                                            type="time"
                                            value={editTime}
                                            onChange={(e) => setEditTime(e.target.value)}
                                            className="mt-1"
                                        />
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setEditMode(false);
                                            setEditDate(suggestedDate);
                                            setEditTime(suggestedTime);
                                        }}
                                    >
                                        Cancelar Edição
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-purple-800">
                                            <Calendar className="h-4 w-4" />
                                            <span className="font-semibold">
                                                {suggestedDate ? format(parseISO(suggestedDate), "EEEE, dd 'de' MMMM", { locale: ptBR }) : ''}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-purple-800">
                                            <Clock className="h-4 w-4" />
                                            <span className="font-semibold">{suggestedTime}</span>
                                            {timeWasChanged && (
                                                <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                                                    Alterado
                                                </Badge>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditMode(true)}
                                            className="text-purple-600 hover:text-purple-800"
                                        >
                                            Editar
                                        </Button>
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
                        disabled={submitting || loading || noAvailability}
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
        </Dialog>
    );
}
