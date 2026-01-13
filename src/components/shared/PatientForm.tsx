import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PatientFormProps {
    name: string;
    onNameChange: (value: string) => void;
    phone: string;
    onPhoneChange: (value: string) => void;
    email?: string;
    onEmailChange?: (value: string) => void;
    emailError?: string;
    readOnly?: boolean;
    autoFocus?: boolean;
    showEmail?: boolean;
}

export const formatPhone = (value: string) => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '');

    // Limita a 11 dígitos
    const limited = numbers.slice(0, 11);

    // Formata: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
    if (limited.length <= 2) {
        return limited;
    } else if (limited.length <= 6) {
        return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;
    } else if (limited.length <= 10) {
        return `(${limited.slice(0, 2)}) ${limited.slice(2, 6)}-${limited.slice(6)}`;
    } else {
        return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7)}`;
    }
};

export const validateEmail = (email: string): boolean => {
    if (!email.trim()) return true; // Email é opcional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

export function PatientForm({
    name,
    onNameChange,
    phone,
    onPhoneChange,
    email = "",
    onEmailChange,
    emailError,
    readOnly = false,
    autoFocus = false,
    showEmail = true
}: PatientFormProps) {

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;
        const formatted = formatPhone(rawValue);
        onPhoneChange(formatted);
    };

    return (
        <div className="grid gap-4">
            {/* Nome Field */}
            <div className="grid gap-2">
                <Label htmlFor="patient-name">
                    Nome Completo {readOnly ? "" : <span className="text-red-500">*</span>}
                </Label>
                {readOnly ? (
                    <div className="px-3 py-2 bg-slate-50 rounded-md border border-slate-200 text-sm font-medium text-slate-900">
                        {name || 'Não informado'}
                    </div>
                ) : (
                    <Input
                        id="patient-name"
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        placeholder="Nome completo"
                        autoFocus={autoFocus}
                        className="bg-white"
                    />
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Telefone Field */}
                <div className="grid gap-2">
                    <Label htmlFor="patient-phone">
                        Telefone {readOnly ? "" : <span className="text-red-500">*</span>}
                    </Label>
                    {readOnly ? (
                        <div className="px-3 py-2 bg-slate-50 rounded-md border border-slate-200 text-sm font-medium text-slate-900">
                            {phone || 'Não informado'}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <Input
                                id="patient-phone"
                                type="tel"
                                value={phone}
                                onChange={handlePhoneChange}
                                placeholder="(00) 00000-0000"
                                className="bg-white"
                            />
                            {phone && phone.replace(/\D/g, '').length < 10 && (
                                <p className="text-[10px] text-red-500 font-medium">Mínimo 10 dígitos</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Email Field */}
                {showEmail && onEmailChange && (
                    <div className="grid gap-2">
                        <Label htmlFor="patient-email">Email (opcional)</Label>
                        {readOnly ? (
                            <div className="px-3 py-2 bg-slate-50 rounded-md border border-slate-200 text-sm font-medium text-slate-900">
                                {email || 'Não informado'}
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <Input
                                    id="patient-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => onEmailChange(e.target.value)}
                                    placeholder="exemplo@email.com"
                                    className={`bg-white ${emailError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                                />
                                {emailError && (
                                    <p className="text-[10px] text-red-500 font-medium">{emailError}</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
