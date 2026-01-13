import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useRef } from "react";
import { TimeSlot, EventType } from "./TimeSlotCard";
import { Trash2, CalendarPlus } from "lucide-react";
import { PERSONAL_ACTIVITIES, PRICE_CATEGORIES } from "@/constants/business-rules";
import { useSettings } from "@/hooks/useSettings";
import { formatCentsToNumberString, parseCurrencyInputToCents } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { PatientSelector } from "./PatientSelector";
import { Patient } from "@/api/patientsAPI";
import { BulkPersonalActivityDialog } from "./BulkPersonalActivityDialog";
import { format } from "date-fns";

interface TimeSlotDialogProps {
  slot: TimeSlot;
  isOpen: boolean;
  onClose: () => void;
  onSave: (slot: TimeSlot, createSiblingType?: EventType) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
  isOneHourBlocked?: boolean;
  maxDuration?: number;
  date?: string; // Data do slot no formato YYYY-MM-DD
}

// Moved logic to TimeSlotForm to lazy load settings
export const TimeSlotDialog = ({ slot, isOpen, onClose, onSave, onRemove, isOneHourBlocked, maxDuration, date }: TimeSlotDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        {isOpen && <TimeSlotForm slot={slot} onClose={onClose} onSave={onSave} onRemove={onRemove} isOneHourBlocked={isOneHourBlocked} maxDuration={maxDuration} date={date} />}
      </DialogContent>
    </Dialog>
  );
};

interface TimeSlotFormProps {
  slot: TimeSlot;
  onClose: () => void;
  onSave: (slot: TimeSlot, createSiblingType?: EventType) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
  isOneHourBlocked?: boolean;
  maxDuration?: number;
  date?: string;
}

const TimeSlotForm = ({ slot, onClose, onSave, onRemove, isOneHourBlocked, maxDuration, date }: TimeSlotFormProps) => {
  const [editedSlot, setEditedSlot] = useState<TimeSlot>(slot);
  const [siblingTypeToCreate, setSiblingTypeToCreate] = useState<EventType>(null);
  const { priceConfig, appConfig, activities, loading } = useSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [withPatient, setWithPatient] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Initial setup (effectively replaces the useEffect reset since we mount on open)
  // No need for useEffect reset logic!


  const handleSave = async () => {
    try {
      setIsSaving(true);

      let finalSlot = { ...editedSlot };

      // Se optou por já reservar para um paciente (e não é pessoal)
      if (withPatient && !isPersonal && selectedPatient) {
        finalSlot.status = "RESERVADO";
        finalSlot.patientId = selectedPatient.id;
        finalSlot.patientName = selectedPatient.name;
        finalSlot.patientPhone = selectedPatient.phone;
        // Só definir patientEmail se não for null (converter null para undefined)
        finalSlot.patientEmail = selectedPatient.email || undefined;
      }

      await onSave(finalSlot, siblingTypeToCreate);
      onClose();
    } catch (error) {
      console.error("Erro ao salvar:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      setIsSaving(true);
      // Lógica Inteligente:
      // Se estamos em horário duplo (onRemove existe), DELETAR o slot.
      // Isso evita deixar slots vazios na memória que podem causar problemas de duplicação.
      if (onRemove) {
        await onRemove();
        onClose();
      } else {
        // Se estamos em horário simples, apenas LIMPAR os dados (mantém o slot vazio)
        const clearedSlot: TimeSlot = {
          ...slot,
          type: null,
          valor: "",
          preco: "",
          status: "",
          flow_status: null,
        };
        await onSave(clearedSlot);
        onClose();
      }
    } catch (error) {
      console.error("Erro ao limpar:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (onRemove) {
      try {
        setIsSaving(true);
        await onRemove();
        onClose();
      } catch (error) {
        console.error("Erro ao remover:", error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const updatePrice = (type: EventType, category: string) => {
    if (!type || type === "personal") return "";

    const config = priceConfig.find(
      (p) => p.modality === type && p.category === (category as any),
    );
    return config?.value || "";
  };

  const handleTypeChange = (value: string) => {
    if (value === 'double') {
      // Configure current as Online and schedule creation of Presential sibling
      const newSlot = {
        ...editedSlot,
        type: 'online' as EventType,
        valor: "padrao",
        status: "Vago",
        preco: String(updatePrice('online', "padrao")),
        // Limpar dados do paciente ao criar novo slot
        patientName: undefined,
        patientPhone: undefined,
        flow_status: null, // Limpar status do flow
      };

      setEditedSlot(newSlot);
      setSiblingTypeToCreate('presential');
      return;
    }

    setSiblingTypeToCreate(null);
    let newSlot = {
      ...editedSlot,
      type: value as EventType,
      // Limpar dados do paciente ao criar novo slot (só manter se status requerer)
      patientName: undefined,
      patientPhone: undefined,
      flow_status: null, // Limpar status do flow
    };

    if (value === 'personal') {
      newSlot.valor = ""; // Clear category
      newSlot.preco = ""; // Clear price
      // Default to first activity from DB or empty string. Handle loading state?
      // usage of PERSONAL_ACTIVITIES fallback here ensures at least something is selected if DB empty/loading
      newSlot.status = activities.length > 0 ? activities[0].label : (PERSONAL_ACTIVITIES[0]);
    } else {
      newSlot.valor = "padrao"; // Default category
      newSlot.status = "Vago"; // Default status
      newSlot.preco = String(updatePrice(value as EventType, "padrao"));
    }

    setEditedSlot(newSlot);
  };

  const getAvailableCategories = (type: EventType) => {
    if (!type || type === "personal") return PRICE_CATEGORIES;

    const onlyOnlineEmergencial = appConfig?.only_online_emergencial ?? true;

    if (type === "presential" && onlyOnlineEmergencial) {
      // Presencial não tem emergencial quando regra estiver ativa
      return PRICE_CATEGORIES.filter((cat) => cat.value !== "emergencial");
    }
    return PRICE_CATEGORIES;
  };

  const handleCategoryChange = (value: string) => {
    const newPrice = updatePrice(editedSlot.type, value);
    setEditedSlot({ ...editedSlot, valor: value, preco: String(newPrice) });
    // A sincronização com o sibling será feita no handleSlotUpdate do Index.tsx
  };

  const isPersonal = editedSlot.type === "personal";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Agendamento - {slot.time}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>Tipo de Evento</Label>
          <Select
            value={(siblingTypeToCreate && editedSlot.type !== 'personal') ? 'double' : (editedSlot.type || "")}
            onValueChange={handleTypeChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">Atividade Pessoal</SelectItem>
              <SelectItem value="online" disabled={isOneHourBlocked} className={isOneHourBlocked ? "text-muted-foreground" : ""}>
                Disponibilizar Online {isOneHourBlocked && "(Bloqueado: Conflito)"}
              </SelectItem>
              <SelectItem value="presential" disabled={isOneHourBlocked} className={isOneHourBlocked ? "text-muted-foreground" : ""}>
                Disponibilizar Presencial {isOneHourBlocked && "(Bloqueado: Conflito)"}
              </SelectItem>
              <SelectItem value="double" disabled={isOneHourBlocked} className={isOneHourBlocked ? "text-muted-foreground" : ""}>
                Online + Presencial {isOneHourBlocked && "(Bloqueado: Conflito)"}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {editedSlot.type && (
          <>
            {isPersonal ? (
              // Personal Flow
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Duração</Label>
                  <Select
                    value={editedSlot.duration || '30m'}
                    onValueChange={(value) => {
                      setSiblingTypeToCreate(null); // No sibling for varying personal durations
                      setEditedSlot({ ...editedSlot, duration: value });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a duração" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30m">30 minutos</SelectItem>
                      <SelectItem value="1h" disabled={isOneHourBlocked || (maxDuration !== undefined && maxDuration < 60)} className={(isOneHourBlocked || (maxDuration !== undefined && maxDuration < 60)) ? "text-muted-foreground" : ""}>
                        1 hora {(isOneHourBlocked || (maxDuration !== undefined && maxDuration < 60)) && "(Indisponível)"}
                      </SelectItem>
                      <SelectItem value="1h30" disabled={isOneHourBlocked || (maxDuration !== undefined && maxDuration < 90)} className={(isOneHourBlocked || (maxDuration !== undefined && maxDuration < 90)) ? "text-muted-foreground" : ""}>
                        1 hora e 30 min {(isOneHourBlocked || (maxDuration !== undefined && maxDuration < 90)) && "(Indisponível)"}
                      </SelectItem>
                      <SelectItem value="2h" disabled={isOneHourBlocked || (maxDuration !== undefined && maxDuration < 120)} className={(isOneHourBlocked || (maxDuration !== undefined && maxDuration < 120)) ? "text-muted-foreground" : ""}>
                        2 horas {(isOneHourBlocked || (maxDuration !== undefined && maxDuration < 120)) && "(Indisponível)"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Atividade</Label>
                  <Select
                    value={editedSlot.status}
                    onValueChange={(value) => setEditedSlot({ ...editedSlot, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a atividade" />
                    </SelectTrigger>
                    <SelectContent>
                      {activities.map((activity) => (
                        <SelectItem key={activity.id} value={activity.label}>
                          {activity.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setBulkDialogOpen(true)}
                  >
                    <CalendarPlus className="h-4 w-4 mr-2" />
                    Criar em Lote
                  </Button>
                </div>
              </div>
            ) : (
              // Commercial Flow
              <>
                <div className="space-y-2">
                  <Label>Categoria (Valor)</Label>
                  <Select
                    value={editedSlot.valor}
                    onValueChange={handleCategoryChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableCategories(editedSlot.type).map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Preço</Label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      R$
                    </span>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      className="pl-7"
                      value={formatCentsToNumberString(editedSlot.preco)}
                      onChange={(e) => {
                        const digits = parseCurrencyInputToCents(e.target.value);
                        setEditedSlot({ ...editedSlot, preco: digits });
                      }}
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {/* Status is always "Vago" for commercial slots - no user input needed */}
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Input
                    value={editedSlot.status || "Vago"}
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                </div>

                {/* Flow Status Display */}
                {slot.flow_status && (
                  <div className="space-y-2">
                    <Label>Status do Flow</Label>
                    <Input
                      value={slot.flow_status}
                      disabled
                      className="bg-purple-50 text-purple-700 font-medium border-purple-200 cursor-not-allowed"
                    />
                  </div>
                )}

                {/* Opção de Reservar Já */}
                <div className="pt-2 space-y-4 border-t mt-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="with-patient"
                      checked={withPatient}
                      onCheckedChange={setWithPatient}
                      disabled={!!siblingTypeToCreate}
                    />
                    <Label htmlFor="with-patient" className={!!siblingTypeToCreate ? "text-muted-foreground" : ""}>
                      {!!siblingTypeToCreate ? "Indisponível para horário duplo" : "Já reservar para um paciente"}
                    </Label>
                  </div>

                  {withPatient && !siblingTypeToCreate && (
                    <div className="pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                      <PatientSelector
                        selectedPatientId={selectedPatient?.id}
                        onPatientSelect={setSelectedPatient}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-end">
        {/* Caso especial: horário duplo com bloco totalmente vazio (sem tipo escolhido ainda) */}
        {onRemove && !slot.type && !editedSlot.type ? (
          // Layout para horário duplo vazio: apenas Cancelar + Remover
          <div className="flex gap-2 w-full sm:w-auto sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="flex-1 sm:flex-none"
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              className="flex-1 sm:flex-none"
              disabled={isSaving}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remover Horário Duplo
            </Button>
          </div>
        ) : (
          <>
            {slot.type && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClear}
                className="w-full sm:w-auto"
                disabled={isSaving}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Limpar
              </Button>
            )}
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" onClick={onClose} className="flex-1 sm:flex-none" disabled={isSaving}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} className="flex-1 sm:flex-none" disabled={isSaving}>
                {isSaving ? (
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                ) : (
                  "Disponibilizar"
                )}
              </Button>
            </div>
          </>
        )}
      </DialogFooter>

      {/* Bulk Personal Activity Dialog */}
      <BulkPersonalActivityDialog
        isOpen={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        onConfirm={() => {
          setBulkDialogOpen(false);
          onClose();
        }}
        activity={editedSlot.status || activities[0]?.label || 'Atividade Pessoal'}
        duration={editedSlot.duration || '30m'}
        initialDate={date}
        initialTime={slot.time}
      />
    </>
  );
};
