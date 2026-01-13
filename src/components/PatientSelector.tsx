import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { patientsAPI, type Patient } from "@/api/patientsAPI";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhone } from "./shared/PatientForm";

interface PatientSelectorProps {
    selectedPatientId?: string;
    onPatientSelect: (patient: Patient | null) => void;
}

export function PatientSelector({
    selectedPatientId,
    onPatientSelect,
}: PatientSelectorProps) {
    const [open, setOpen] = useState(false);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(false);
    const [showNewPatientForm, setShowNewPatientForm] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Formulário de novo paciente
    const [newName, setNewName] = useState("");
    const [newPhone, setNewPhone] = useState("");
    const [newEmail, setNewEmail] = useState("");

    useEffect(() => {
        loadPatients();
    }, []);

    const loadPatients = async () => {
        try {
            setLoading(true);
            const data = await patientsAPI.listPatients();
            setPatients(data);
        } catch (error) {
            console.error('Erro ao carregar pacientes:', error);
        } finally {
            setLoading(false);
        }
    };

    const selectedPatient = patients.find(p => p.id === selectedPatientId);

    // Filtrar pacientes baseado na busca
    const filteredPatients = patients.filter(patient => {
        const searchLower = searchQuery.toLowerCase();
        return (
            patient.name.toLowerCase().includes(searchLower) ||
            patient.phone?.toLowerCase().includes(searchLower) ||
            patient.email?.toLowerCase().includes(searchLower)
        );
    });

    const handleNewPatientSubmit = async () => {
        if (!newName.trim()) return;

        // Validar telefone: só envia se tiver pelo menos 10 dígitos ou vazio
        const phoneDigits = newPhone.replace(/\D/g, '');
        const validPhone = phoneDigits.length >= 10 ? newPhone.trim() : undefined;

        try {
            // Criar o paciente via API
            const newPatient = await patientsAPI.createPatient({
                name: newName,
                phone: validPhone,
                email: newEmail.trim() || undefined,
                privacyTermsAccepted: false
            });

            // Adicionar à lista local
            setPatients(prev => [newPatient, ...prev]);

            // Selecionar automaticamente
            onPatientSelect(newPatient);

            // Limpar formulário e fechar
            setNewName("");
            setNewPhone("");
            setNewEmail("");
            setShowNewPatientForm(false);
        } catch (error: any) {
            console.error('Erro ao criar paciente:', error);

            // Tratar erro de telefone duplicado (código 23505 do PostgreSQL)
            if (error.code === '23505') {
                if (error.message?.includes('patients_phone_key')) {
                    alert('⚠️ Este telefone já está cadastrado!\n\nPor favor, use um número diferente ou busque o paciente existente na lista.');
                } else if (error.message?.includes('patients_email_key')) {
                    alert('⚠️ Este email já está cadastrado!\n\nPor favor, use um email diferente ou busque o paciente existente na lista.');
                } else {
                    alert('⚠️ Estes dados já estão cadastrados!\n\nVerifique se este paciente já existe na lista.');
                }
            } else {
                // Outros erros
                alert('Erro ao criar paciente. Verifique os dados e tente novamente.');
            }
        }
    };

    if (showNewPatientForm) {
        return (
            <div className="space-y-4 p-5 border-2 rounded-lg bg-gradient-to-br from-blue-50 to-slate-50 border-blue-200">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-base text-blue-900">✨ Novo Paciente</h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setShowNewPatientForm(false);
                            setNewName("");
                            setNewPhone("");
                            setNewEmail("");
                        }}
                        className="hover:bg-blue-100"
                    >
                        Cancelar
                    </Button>
                </div>

                <div className="space-y-4">
                    <div>
                        <Label htmlFor="new-name" className="text-sm font-semibold">Nome *</Label>
                        <Input
                            id="new-name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Nome completo"
                            className="mt-1.5 h-11"
                            autoFocus
                        />
                    </div>

                    <div>
                        <Label htmlFor="new-phone" className="text-sm font-semibold">Telefone</Label>
                        <Input
                            id="new-phone"
                            type="tel"
                            value={newPhone}
                            onChange={(e) => setNewPhone(formatPhone(e.target.value))}
                            placeholder="(00) 00000-0000"
                            className="mt-1.5 h-11"
                        />
                        {newPhone && newPhone.replace(/\D/g, '').length > 0 && newPhone.replace(/\D/g, '').length < 10 && (
                            <p className="text-xs text-red-500 mt-1">Telefone incompleto (mínimo 10 dígitos)</p>
                        )}
                    </div>

                    <div>
                        <Label htmlFor="new-email" className="text-sm font-semibold">Email</Label>
                        <Input
                            id="new-email"
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="email@exemplo.com"
                            className="mt-1.5 h-11"
                        />
                    </div>

                    <Button
                        onClick={handleNewPatientSubmit}
                        className="w-full h-11 bg-blue-600 hover:bg-blue-700"
                        disabled={
                            !newName.trim() ||
                            (newPhone.length > 0 && newPhone.replace(/\D/g, '').length < 10)
                        }
                    >
                        <UserPlus className="mr-2 h-4 w-4" />
                        Cadastrar Paciente
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <Label className="text-sm font-semibold">Paciente</Label>
            <Popover
                open={open}
                onOpenChange={(isOpen) => {
                    setOpen(isOpen);
                    if (!isOpen) setSearchQuery("");
                }}
            >
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between h-11 hover:bg-blue-50 hover:border-blue-300 hover:text-foreground cursor-pointer"
                    >
                        {selectedPatient
                            ? selectedPatient.name
                            : "Selecione um paciente..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder="Buscar paciente..."
                            className="h-11"
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                        />
                        <CommandList className="max-h-[350px]" onWheel={(e) => e.stopPropagation()}>
                            <CommandEmpty>
                                {loading ? "Carregando..." : "Nenhum paciente encontrado."}
                            </CommandEmpty>
                            <CommandGroup>
                                <CommandItem
                                    onSelect={() => {
                                        setShowNewPatientForm(true);
                                        setOpen(false);
                                    }}
                                    className="text-blue-600 font-semibold cursor-pointer hover:bg-blue-50 py-3"
                                >
                                    <UserPlus className="mr-2 h-5 w-5" />
                                    Cadastrar novo paciente
                                </CommandItem>
                            </CommandGroup>
                            <CommandGroup heading="Pacientes Cadastrados">
                                {filteredPatients.map((patient) => (
                                    <CommandItem
                                        key={patient.id}
                                        value={`${patient.name} ${patient.phone || ''} ${patient.email || ''}`}
                                        onSelect={() => {
                                            onPatientSelect(patient);
                                            setOpen(false);
                                        }}
                                        className="cursor-pointer hover:bg-slate-50 py-3"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-5 w-5 text-blue-600",
                                                selectedPatientId === patient.id
                                                    ? "opacity-100"
                                                    : "opacity-0"
                                            )}
                                        />
                                        <div className="flex flex-col flex-1">
                                            <span className="font-semibold text-sm">{patient.name}</span>
                                            {patient.phone && (
                                                <span className="text-xs text-muted-foreground">
                                                    📱 {patient.phone}
                                                </span>
                                            )}
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}
