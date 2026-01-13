import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, Clock, Video, MapPin, User2, Pencil, X, Check, MessageSquare } from "lucide-react";
import { PatientForm, validateEmail } from "./shared/PatientForm";
import { PatientSelector } from "./PatientSelector";
import { type Patient } from "@/api/patientsAPI";
import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

import { formatCentsToBRL } from "@/lib/utils";

interface PatientInfoDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (patientName: string, patientPhone: string, patientEmail?: string, patientId?: string) => void;
    initialName?: string;
    initialPhone?: string;
    initialEmail?: string;
    initialPatientId?: string; // ID do paciente para edição
    initialPrivacyTermsAccepted?: boolean;
    statusType: string;
    // Informações do slot para visualização
    slotDate?: string;
    slotTime?: string;
    slotType?: 'online' | 'presential' | 'personal' | null;
    slotPrice?: number; // Preço em centavos
    flowStatus?: string;
    isCreation?: boolean;
}

export const PatientInfoDialog = ({
    isOpen,
    onClose,
    onSave,
    initialName = "",
    initialPhone = "",
    initialEmail = "",
    initialPatientId, // Novo parâmetro
    initialPrivacyTermsAccepted,
    statusType,
    slotDate,
    slotTime,
    slotType,
    slotPrice,
    flowStatus,
    isCreation = false
}: PatientInfoDialogProps) => {
    const [patientName, setPatientName] = useState(initialName);
    const [patientPhone, setPatientPhone] = useState(initialPhone);
    const [patientEmail, setPatientEmail] = useState(initialEmail);
    const [emailError, setEmailError] = useState("");
    const [isEditingPatientData, setIsEditingPatientData] = useState(false);

    // Estado para gerenciar seleção de paciente
    const [selectedPatientId, setSelectedPatientId] = useState<string | undefined>(initialPatientId);
    const [showNewPatientForm, setShowNewPatientForm] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setPatientName(initialName);
            setPatientPhone(initialPhone);
            setPatientEmail(initialEmail);
            setEmailError("");
            // Preservar o patientId ao abrir o modal
            setSelectedPatientId(initialPatientId);
            setShowNewPatientForm(false);
        }
    }, [isOpen, initialName, initialPhone, initialEmail, initialPatientId]);

    const handleEmailChange = (value: string) => {
        setPatientEmail(value);
        if (value && !validateEmail(value)) {
            setEmailError("Email inválido");
        } else {
            setEmailError("");
        }
    };

    const isFormValid = () => {
        const hasName = patientName.trim() !== "";
        const hasPhone = patientPhone.replace(/\D/g, '').length >= 10; // Mínimo 10 dígitos
        const emailValid = !patientEmail.trim() || validateEmail(patientEmail);
        return hasName && hasPhone && emailValid;
    };

    const handleSave = () => {
        if (isFormValid()) {
            onSave(patientName.trim(), patientPhone.trim(), patientEmail.trim() || undefined, selectedPatientId);
            onClose();
        }
    };

    const handleSavePatientData = () => {
        if (isFormValid()) {
            onSave(patientName.trim(), patientPhone.trim(), patientEmail.trim() || undefined, selectedPatientId);
            setIsEditingPatientData(false);
        }
    };

    const handleCancelEdit = () => {
        setPatientName(initialName);
        setPatientPhone(initialPhone);
        setPatientEmail(initialEmail);
        setEmailError("");
        setIsEditingPatientData(false);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isFormValid()) {
            handleSave();
        }
    };

    const getTitle = () => {
        if (isCreation) return "Criando Reserva";
        if (statusType === "CONTRATADO") return "Informações do Contrato";
        if (statusType === "RESERVADO") return "Informações da Reserva";
        if (statusType === "CONFIRMADO") return "Informações da Confirmação";
        return "Editar Informações";
    };

    const isReadOnly = !isCreation && statusType !== 'Vago' && statusType !== 'VAGO';

    const getTypeLabel = () => {
        if (slotType === 'online') return 'Online';
        if (slotType === 'presential') return 'Presencial';
        if (slotType === 'personal') return 'Pessoal';
        return 'Não definido';
    };

    const getTypeIcon = () => {
        if (slotType === 'online') return <Video className="h-4 w-4" />;
        if (slotType === 'presential') return <MapPin className="h-4 w-4" />;
        if (slotType === 'personal') return <User2 className="h-4 w-4" />;
        return null;
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'Não definido';
        try {
            return format(parseISO(dateStr), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
        } catch {
            return dateStr;
        }
    };

    // Handler para seleção de paciente existente
    const handlePatientSelect = (patient: Patient | null) => {
        if (patient) {
            setSelectedPatientId(patient.id);
            setPatientName(patient.name);
            setPatientPhone(patient.phone || "");
            setPatientEmail(patient.email || "");
            setShowNewPatientForm(false);
        } else {
            setSelectedPatientId(undefined);
            setPatientName("");
            setPatientPhone("");
            setPatientEmail("");
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl">
                        {getTitle()}
                    </DialogTitle>
                    <DialogDescription>
                        {isCreation
                            ? "Preencha as informações para criar a reserva."
                            : isReadOnly
                                ? "Visualize as informações do agendamento."
                                : "Preencha os dados do paciente para confirmar o agendamento."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {isReadOnly && (
                        <>
                            {/* Dados do Paciente - PRIMEIRO */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between pb-2 border-b">
                                    <h3 className="font-semibold text-base">👤 Dados do Paciente</h3>
                                    {!isEditingPatientData ? (
                                        !(statusType === 'RESERVADO' || statusType === 'CONFIRMADO') && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setIsEditingPatientData(true)}
                                                className="h-8 gap-2"
                                            >
                                                <Pencil className="h-4 w-4" />
                                                Editar
                                            </Button>
                                        )
                                    ) : (
                                        <div className="flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleCancelEdit}
                                                className="h-8 gap-2"
                                            >
                                                <X className="h-4 w-4" />
                                                Cancelar
                                            </Button>
                                            <Button
                                                variant="default"
                                                size="sm"
                                                onClick={handleSavePatientData}
                                                disabled={!isFormValid()}
                                                className="h-8 gap-2"
                                            >
                                                <Check className="h-4 w-4" />
                                                Salvar
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                <PatientForm
                                    name={patientName}
                                    onNameChange={setPatientName}
                                    phone={patientPhone}
                                    onPhoneChange={setPatientPhone}
                                    email={patientEmail}
                                    onEmailChange={handleEmailChange}
                                    emailError={emailError}
                                    readOnly={!isEditingPatientData}
                                />
                            </div>

                            {/* Informações do Agendamento - DEPOIS */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b">
                                    <h3 className="font-semibold text-base">📅 Informações do Agendamento</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Tipo de Consulta */}
                                    <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg border border-blue-200">
                                        <div className="p-2 bg-white rounded-md">
                                            {getTypeIcon()}
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-xs text-blue-700 font-medium">Tipo de Consulta</Label>
                                            <p className="text-base font-semibold text-blue-900 capitalize mt-1">{getTypeLabel()}</p>
                                        </div>
                                    </div>

                                    {/* Preço */}
                                    {slotPrice && (
                                        <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg border border-green-200">
                                            <div className="p-2 bg-white rounded-md">
                                                <span className="text-xl">💰</span>
                                            </div>
                                            <div className="flex-1">
                                                <Label className="text-xs text-green-700 font-medium">Valor da Consulta</Label>
                                                <p className="text-base font-semibold text-green-900 mt-1">{formatCentsToBRL(slotPrice)}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Data */}
                                    <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg border border-purple-200">
                                        <div className="p-2 bg-white rounded-md">
                                            <Calendar className="h-5 w-5 text-purple-600" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-xs text-purple-700 font-medium">Data</Label>
                                            <p className="text-sm font-semibold text-purple-900 capitalize mt-1 leading-tight">{formatDate(slotDate)}</p>
                                        </div>
                                    </div>

                                    {/* Horário */}
                                    <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-lg border border-orange-200">
                                        <div className="p-2 bg-white rounded-md">
                                            <Clock className="h-5 w-5 text-orange-600" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-xs text-orange-700 font-medium">Horário</Label>
                                            <p className="text-base font-semibold text-orange-900 mt-1">{slotTime || 'Não definido'}</p>
                                        </div>
                                    </div>

                                    {/* Status do Flow */}
                                    <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-teal-50 to-teal-100/50 rounded-lg border border-teal-200 col-span-1 md:col-span-2">
                                        <div className="p-2 bg-white rounded-md">
                                            <MessageSquare className="h-5 w-5 text-teal-600" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-xs text-teal-700 font-medium">Status do Flow</Label>
                                            <p className="text-base font-semibold text-teal-900 mt-1">{flowStatus || 'Não enviado'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Termos de Privacidade - MANTIDO apenas em read-only */}
                            <div className={`flex items-center space-x-3 p-4 rounded-lg border-2 ${initialPrivacyTermsAccepted
                                ? 'bg-green-50 border-green-300'
                                : 'bg-red-50 border-red-300'
                                }`}>
                                <Checkbox
                                    id="privacy-terms"
                                    checked={initialPrivacyTermsAccepted}
                                    disabled
                                    className={initialPrivacyTermsAccepted ? 'data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600' : ''}
                                />
                                <div className="grid gap-1 leading-none flex-1">
                                    <Label
                                        htmlFor="privacy-terms"
                                        className={`text-sm font-semibold leading-none ${initialPrivacyTermsAccepted ? 'text-green-800' : 'text-red-800'
                                            }`}
                                    >
                                        Termos de Privacidade
                                    </Label>
                                    <p className={`text-sm font-medium ${initialPrivacyTermsAccepted ? 'text-green-700' : 'text-red-700'
                                        }`}>
                                        {initialPrivacyTermsAccepted
                                            ? "✓ Paciente aceitou os termos de privacidade"
                                            : "✗ Paciente não aceitou os termos de privacidade"}
                                    </p>
                                </div>
                            </div>
                        </>
                    )}

                    {!isReadOnly && (
                        <>
                            {/* Dados do Paciente - PRIMEIRO e sempre editável */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b">
                                    <h3 className="font-semibold text-base">👤 Dados do Paciente</h3>
                                </div>

                                {/* Seletor de Paciente ou Formulário */}
                                {isCreation ? (
                                    <PatientSelector
                                        selectedPatientId={selectedPatientId}
                                        onPatientSelect={handlePatientSelect}
                                    />
                                ) : (
                                    <div onKeyDown={handleKeyPress}>
                                        <PatientForm
                                            name={patientName}
                                            onNameChange={setPatientName}
                                            phone={patientPhone}
                                            onPhoneChange={setPatientPhone}
                                            email={patientEmail}
                                            onEmailChange={handleEmailChange}
                                            emailError={emailError}
                                            autoFocus
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Informações do Slot - ABAIXO, read-only */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b">
                                    <h3 className="font-semibold text-base">📅 Informações do Agendamento</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Tipo de Consulta */}
                                    <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg border border-blue-200">
                                        <div className="p-2 bg-white rounded-md">
                                            {getTypeIcon()}
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-xs text-blue-700 font-medium">Tipo de Consulta</Label>
                                            <p className="text-base font-semibold text-blue-900 capitalize mt-1">{getTypeLabel()}</p>
                                        </div>
                                    </div>

                                    {/* Preço */}
                                    {slotPrice && (
                                        <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg border border-green-200">
                                            <div className="p-2 bg-white rounded-md">
                                                <span className="text-xl">💰</span>
                                            </div>
                                            <div className="flex-1">
                                                <Label className="text-xs text-green-700 font-medium">Valor da Consulta</Label>
                                                <p className="text-base font-semibold text-green-900 mt-1">{formatCentsToBRL(slotPrice)}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Data */}
                                    <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg border border-purple-200">
                                        <div className="p-2 bg-white rounded-md">
                                            <Calendar className="h-5 w-5 text-purple-600" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-xs text-purple-700 font-medium">Data</Label>
                                            <p className="text-sm font-semibold text-purple-900 capitalize mt-1 leading-tight">{formatDate(slotDate)}</p>
                                        </div>
                                    </div>

                                    {/* Horário */}
                                    <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-lg border border-orange-200">
                                        <div className="p-2 bg-white rounded-md">
                                            <Clock className="h-5 w-5 text-orange-600" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-xs text-orange-700 font-medium">Horário</Label>
                                            <p className="text-base font-semibold text-orange-900 mt-1">{slotTime || 'Não definido'}</p>
                                        </div>
                                    </div>

                                    {/* Status do Flow - HIDE IF isCreation */}
                                    {!isCreation && (
                                        <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-teal-50 to-teal-100/50 rounded-lg border border-teal-200 col-span-1 md:col-span-2">
                                            <div className="p-2 bg-white rounded-md">
                                                <MessageSquare className="h-5 w-5 text-teal-600" />
                                            </div>
                                            <div className="flex-1">
                                                <Label className="text-xs text-teal-700 font-medium">Status do Flow</Label>
                                                <p className="text-base font-semibold text-teal-900 mt-1">{flowStatus || 'Não enviado'}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className="flex flex-row gap-2 justify-end">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        size="lg"
                        className="w-full sm:w-auto"
                    >
                        {isReadOnly || isCreation ? 'Fechar' : 'Cancelar'}
                    </Button>
                    {!isReadOnly && (
                        <Button
                            onClick={handleSave}
                            disabled={!isFormValid()}
                            size="lg"
                            className="w-full sm:w-auto"
                        >
                            Confirmar Reserva
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
