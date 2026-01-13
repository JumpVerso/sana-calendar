import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock, Unlock } from "lucide-react";

interface BlockDayDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onUnblock?: () => void;
    date: Date;
    emptySlotsCount: number;
    reservedSlotsCount: number;
    isLoading?: boolean;
    isBlocked?: boolean; // Indica se o dia já está bloqueado
}

export const BlockDayDialog = ({
    isOpen,
    onClose,
    onConfirm,
    onUnblock,
    date,
    emptySlotsCount,
    reservedSlotsCount,
    isLoading = false,
    isBlocked = false,
}: BlockDayDialogProps) => {
    const dateFormatted = format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

    if (isBlocked) {
        // Diálogo para desbloquear
        return (
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <Unlock className="h-5 w-5 text-green-600" />
                            <DialogTitle>Desbloquear Dia</DialogTitle>
                        </div>
                        <DialogDescription>
                            Deseja desbloquear o dia {dateFormatted}? Isso permitirá criar novos agendamentos nesta data.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                            <div className="text-xs text-green-800">
                                <strong>Informação:</strong> Após desbloquear, será possível criar novos horários neste dia. Os horários já reservados continuarão existindo.
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose} disabled={isLoading}>
                            Cancelar
                        </Button>
                        <Button onClick={onUnblock} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
                            {isLoading ? (
                                <div className="flex items-center gap-2">
                                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                                    Desbloqueando...
                                </div>
                            ) : (
                                <>
                                    <Unlock className="h-4 w-4 mr-2" />
                                    Desbloquear Dia
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    // Diálogo para bloquear
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <Lock className="h-5 w-5 text-orange-600" />
                        <DialogTitle>Trancar Dia Completo</DialogTitle>
                    </div>
                    <DialogDescription>
                        Esta ação bloqueará o dia {dateFormatted} para novos agendamentos.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="rounded-lg border p-4 space-y-3">
                        <div className="text-sm font-medium text-foreground">
                            O que será feito:
                        </div>
                        
                        <div className="space-y-2 text-sm">
                            <div className="flex items-start gap-2">
                                <span className="text-orange-600 font-bold">•</span>
                                <div>
                                    <span className="font-medium">{emptySlotsCount}</span> horário{emptySlotsCount !== 1 ? 's' : ''} vago{emptySlotsCount !== 1 ? 's' : ''} serão removido{emptySlotsCount !== 1 ? 's' : ''}
                                </div>
                            </div>
                            
                            <div className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">•</span>
                                <div>
                                    <span className="font-medium">{reservedSlotsCount}</span> horário{reservedSlotsCount !== 1 ? 's' : ''} reservado{reservedSlotsCount !== 1 ? 's' : ''}, confirmado{reservedSlotsCount !== 1 ? 's' : ''} ou contratado{reservedSlotsCount !== 1 ? 's' : ''} será{reservedSlotsCount !== 1 ? 'ão' : ''} mantido{reservedSlotsCount !== 1 ? 's' : ''}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                        <div className="text-xs text-orange-800">
                            <strong>Importante:</strong> Após trancar o dia, não será possível criar novos agendamentos nesta data.
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        Cancelar
                    </Button>
                    <Button onClick={onConfirm} disabled={isLoading} className="bg-orange-600 hover:bg-orange-700">
                        {isLoading ? (
                            <div className="flex items-center gap-2">
                                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                                Trancando...
                            </div>
                        ) : (
                            <>
                                <Lock className="h-4 w-4 mr-2" />
                                Trancar Dia
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
