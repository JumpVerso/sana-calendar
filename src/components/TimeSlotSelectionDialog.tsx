import * as React from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, Forward } from "lucide-react";

interface TimeSlotSelectionDialogProps {
    open: boolean;
    onClose: () => void;
    date: string; // Data no formato YYYY-MM-DD
    currentTime: string; // Horário atual no formato HH:mm
    onSelectTime: (time: string) => void;
    onSkip: () => void;
    canSkip?: boolean;
}

// Gerar opções de horário (8h às 20h com intervalos de 30min)
const generateTimeOptions = () => {
    const times: string[] = [];
    for (let hour = 8; hour <= 20; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
            const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            times.push(time);
        }
    }
    return times;
};

const timeOptions = generateTimeOptions();

export function TimeSlotSelectionDialog({
    open,
    onClose,
    date,
    currentTime,
    onSelectTime,
    onSkip,
    canSkip = true,
}: TimeSlotSelectionDialogProps) {
    const formattedDate = date ? format(parseISO(date), "dd 'de' MMMM - EEEE", { locale: ptBR }) : '';
    const [selectedTime, setSelectedTime] = React.useState<string>(currentTime);

    // Atualizar selectedTime quando currentTime mudar
    React.useEffect(() => {
        setSelectedTime(currentTime);
    }, [currentTime]);

    const handleConfirmTime = () => {
        onSelectTime(selectedTime);
        onClose();
    };

    const handleSkip = () => {
        onSkip();
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-primary" />
                        Configurar Horário
                    </DialogTitle>
                    <DialogDescription className="capitalize">
                        {formattedDate}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Selecione o horário:</Label>
                        <Select value={selectedTime} onValueChange={setSelectedTime}>
                            <SelectTrigger>
                                <SelectValue placeholder="Escolha um horário" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[200px]">
                                {timeOptions.map((time) => (
                                    <SelectItem key={time} value={time}>
                                        🕐 {time}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button
                        onClick={handleConfirmTime}
                        className="w-full"
                        disabled={!selectedTime}
                    >
                        Confirmar Horário
                    </Button>

                    {canSkip && (
                        <>
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">ou</span>
                                </div>
                            </div>

                            <Button
                                onClick={handleSkip}
                                variant="outline"
                                className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                            >
                                <Forward className="h-4 w-4 mr-2" />
                                PULAR ESTA SEMANA
                            </Button>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>
                        Cancelar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
