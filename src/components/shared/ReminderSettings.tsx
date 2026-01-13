import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface ReminderSettingsProps {
    reminderOneHour: boolean;
    setReminderOneHour: (checked: boolean) => void;
    reminderTwentyFourHours: boolean;
    setReminderTwentyFourHours: (checked: boolean) => void;
    readOnly?: boolean;
}

export function ReminderSettings({
    reminderOneHour,
    setReminderOneHour,
    reminderTwentyFourHours,
    setReminderTwentyFourHours,
    readOnly = false
}: ReminderSettingsProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
                <div className="space-y-0.5">
                    <Label className="text-base">Lembrete 1 hora antes</Label>
                    <p className="text-sm text-muted-foreground">
                        Enviar mensagem 1 hora antes da sessão
                    </p>
                </div>
                <Switch
                    checked={reminderOneHour}
                    onCheckedChange={setReminderOneHour}
                    disabled={readOnly}
                />
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
                <div className="space-y-0.5">
                    <Label className="text-base">Lembrete 24 horas antes</Label>
                    <p className="text-sm text-muted-foreground">
                        Enviar mensagem 1 dia antes da sessão
                    </p>
                </div>
                <Switch
                    checked={reminderTwentyFourHours}
                    onCheckedChange={setReminderTwentyFourHours}
                    disabled={readOnly}
                />
            </div>
        </div>
    );
}
