import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TimeSlotCard, TimeSlot, EventType } from "./TimeSlotCard";
import { DoubleSlotCard } from "./DoubleSlotCard";
import { RecurrenceDialog } from "./RecurrenceDialog";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ResolvedConflict } from "./RecurrenceCalendar";

interface DayColumnProps {
  date: Date;
  slots: TimeSlot[];
  dayIndex: number;
  onSlotUpdate: (dayIndex: number, slotIndex: number, updatedSlot: TimeSlot, createSiblingType?: EventType) => void | Promise<void>;
  onRemoveSlot: (dayIndex: number, slotIndex: number) => void | Promise<void>;
  isLoading?: boolean;
  isBlocked?: boolean; // Indica se o dia está bloqueado
}

export const DayColumn = ({ date, slots = [], dayIndex, onSlotUpdate, onRemoveSlot, isLoading = false, isBlocked = false }: DayColumnProps) => {
  const isToday = format(new Date(), "yyyy-MM-dd") === format(date, "yyyy-MM-dd");

  const { toast } = useToast();

  const [recurrenceDialogOpen, setRecurrenceDialogOpen] = useState(false);
  const [recurrenceSlotId, setRecurrenceSlotId] = useState<string | null>(null);
  const [recurrencePatientName, setRecurrencePatientName] = useState<string>("");
  const [recurrencePatientPhone, setRecurrencePatientPhone] = useState<string>("");
  const [recurrencePatientEmail, setRecurrencePatientEmail] = useState<string>("");
  const [recurrencePrivacyTermsAccepted, setRecurrencePrivacyTermsAccepted] = useState<boolean>(false);
  const [recurrenceIndices, setRecurrenceIndices] = useState<[number, number] | null>(null);

  const [recurrenceSlotTime, setRecurrenceSlotTime] = useState<string>("");

  // Helper para gerar ID de grupo (UUID válido)
  const generateGroupId = () => {
    return crypto.randomUUID();
  };

  const handleRequestRecurrence = (slotId: string, patientName: string, patientPhone: string | undefined, patientEmail: string | undefined, privacyTermsAccepted: boolean | undefined, index: number, time: string) => {
    setRecurrenceSlotId(slotId);
    setRecurrencePatientName(patientName);
    setRecurrencePatientPhone(patientPhone || "");
    setRecurrencePatientEmail(patientEmail || "");
    setRecurrencePrivacyTermsAccepted(privacyTermsAccepted || false);
    setRecurrenceIndices([dayIndex, index]);
    setRecurrenceSlotTime(time);
    setRecurrenceDialogOpen(true);
  };

  const slotsByTime = slots.reduce((acc, slot, originalIndex) => {
    if (!acc[slot.time]) {
      acc[slot.time] = [];
    }
    acc[slot.time].push({ slot, index: originalIndex });
    return acc;
  }, {} as Record<string, { slot: TimeSlot; index: number }[]>);



  // Helper function to check if a time slot should be skipped
  const shouldSkipSlot = (time: string, slotsByTime: Record<string, { slot: TimeSlot; index: number }[]>) => {
    const sortedTimes = Object.keys(slotsByTime).sort();
    const timeIndex = sortedTimes.indexOf(time);
    if (timeIndex <= 0) return false;

    // Converte hora atual para minutos
    const [h, m] = time.split(':').map(Number);
    const timeMin = h * 60 + m;

    // Check intervals T-30, T-60, T-90
    for (const diff of [30, 60, 90]) {
      const prevTimeMin = timeMin - diff;
      if (prevTimeMin < 0) continue;

      const prevH = Math.floor(prevTimeMin / 60);
      const prevM = prevTimeMin % 60;
      const prevTimeStr = `${String(prevH).padStart(2, '0')}:${String(prevM).padStart(2, '0')}`;

      const prevSlots = slotsByTime[prevTimeStr];
      if (prevSlots) {
        for (const { slot } of prevSlots) {
          if (slot.type === 'personal') {
            let duration = 30;
            if (slot.duration === '2h' || slot.duration === '120m') duration = 120;
            if (slot.duration === '1h30' || slot.duration === '90m') duration = 90;
            if (slot.duration === '1h' || slot.duration === '60m') duration = 60;

            // Logic: if prevSlot duration > diff, it overlaps current slot
            if (duration > diff) return true;
          }
        }
      }
    }
    return false;
  };

  // Helper function to calculate max available duration starting from a specific time
  const calculateMaxDuration = (startTime: string, slotsByTime: Record<string, { slot: TimeSlot; index: number }[]>) => {
    const [h, m] = startTime.split(':').map(Number);
    let currentMinutes = h * 60 + m;
    let maxDuration = 30; // Minimo sempre 30 se o slot existe

    // Check availability for next blocks: 60, 90, 120
    // We check T+30, T+60, T+90
    // If T+30 is FREE, max can be 60.
    // If T+60 is FREE, max can be 90.
    // If T+90 is FREE, max can be 120.

    for (let check = 30; check <= 120; check += 30) {
      const checkMinutes = currentMinutes + check;
      const checkH = Math.floor(checkMinutes / 60);
      const checkM = checkMinutes % 60;
      const checkTimeStr = `${String(checkH).padStart(2, '0')}:${String(checkM).padStart(2, '0')}`;

      const slotsAtTime = slotsByTime[checkTimeStr];

      // If no slot exists at this time (end of day), we cannot extend further
      if (!slotsAtTime || slotsAtTime.length === 0) break;

      // Check if ANY slot at this time is occupied
      const isOccupied = slotsAtTime.some(({ slot }) => slot.type !== null || (slot.status && slot.status !== 'Vago' && slot.status !== 'VAGO'));

      if (isOccupied) {
        break; // Stop extending
      } else {
        maxDuration += 30;
      }
    }

    // Cap at 120m (2h) as that's our UI limit
    return Math.min(maxDuration, 120);
  };

  // Se o dia está bloqueado, renderizar com estilo bloqueado mas ainda mostrar os slots que não podem ser removidos
  const blockedClass = isBlocked ? 'bg-gray-50' : '';
  
  return (
    <div className={`w-full space-y-0 relative ${blockedClass}`}>
      {isBlocked && (
        <div className="absolute -top-[25px] left-1 z-1EVE 0 pointer-events-none">
          <div className="bg-orange-100 px-1 py-0.5 rounded text-xs font-semibold text-orange-800 border border-orange-300 shadow-sm">
            🔒 Dia Bloqueado
          </div>
        </div>
      )}
      {Object.entries(slotsByTime).sort().map(([time, timeSlots]) => {
        if (shouldSkipSlot(time, slotsByTime)) {
          return null;
        }

        const maxDuration = calculateMaxDuration(time, slotsByTime);

        const [slotHour, slotMinute] = (time || '00:00').split(':').map(Number);

        // Calcular se é o slot atual (intervalo de 30m)
        const now = new Date();
        const currentMinutesTotal = now.getHours() * 60 + now.getMinutes();
        const slotStartMinutes = slotHour * 60 + slotMinute;
        // Assumindo grid de 30m
        const isCurrentSlot = isToday && (currentMinutesTotal >= slotStartMinutes && currentMinutesTotal < slotStartMinutes + 30);

        const hasContratado = timeSlots.some(({ slot }) => slot.status === 'CONTRATADO');
        const hasPersonal = timeSlots.some(({ slot }) => slot.type === 'personal');
        const hasFilledSlots = timeSlots.some(({ slot }) => slot.type !== null);
        const allEmpty = timeSlots.every(({ slot }) => !slot.type);

        let visibleTimeSlots = timeSlots;

        if (hasContratado) {
          visibleTimeSlots = timeSlots.filter(({ slot }) => slot.status === 'CONTRATADO');
        } else if (hasPersonal) {
          visibleTimeSlots = timeSlots.filter(({ slot }) => slot.type === 'personal');
        } else if (hasFilledSlots) {
          visibleTimeSlots = timeSlots.filter(({ slot }) => slot.type !== null);
        } else if (allEmpty) {
          // Se o dia está bloqueado e o slot está vazio, ainda mostra para visualizar que está bloqueado
          visibleTimeSlots = isBlocked ? timeSlots.slice(0, 1) : timeSlots.slice(0, 1);
        }

        const isFilled = visibleTimeSlots.some(({ slot }) => slot.type !== null);
        
        // Se o dia está bloqueado e o slot está vazio, marcar como indisponível visualmente
        const isBlockedEmpty = isBlocked && allEmpty && !isFilled;

        // Regra de altura: 
        const isPersonalSingle = visibleTimeSlots.length === 1 && visibleTimeSlots[0].slot.type === 'personal';

        // Default base height for a generic slot cell is 60px (for 30m).
        // If filled with non-personal (commercial), usually it takes 120px (1h).
        // Personal slots vary: 30m -> 60px, 60m -> 120px, 90m -> 180px, 120m -> 240px.

        let calculatedHeight = 60; // Base 60px
        let zIndexClass = 'z-10';

        if (isPersonalSingle) {
          const slot = visibleTimeSlots[0].slot;
          let duration = 30;
          if (slot.duration === '2h' || slot.duration === '120m') duration = 120;
          else if (slot.duration === '1h30' || slot.duration === '90m') duration = 90;
          else if (slot.duration === '1h' || slot.duration === '60m') duration = 60;

          // Height formula: (duration / 30) * 60
          calculatedHeight = (duration / 30) * 60;
          if (duration > 30) zIndexClass = 'z-20';
        } else if (isFilled) {
          calculatedHeight = 120; // Standard commercial slot is 1h = 120px? Or 60px?
          // Previously: (isFilled && !isPersonalSingle) || isLongPersonal ? 'h-[120px]' : 'h-[60px]'
          // So yes, filled commercial is 120px.
        }

        const isLongPersonal = isPersonalSingle && (visibleTimeSlots[0].slot.duration !== '30m' && !!visibleTimeSlots[0].slot.duration);


        // Padding logic: Personal Single slots remove vertical padding to allow clean centering of the 40px card
        // Only for COMPACT (30m) personal slots.
        const paddingClass = isPersonalSingle && !isLongPersonal
          ? 'py-0 pl-3 pr-2'
          : (visibleTimeSlots.length > 1 ? 'p-2 pl-3 pr-2' : 'p-2 pl-3');

        // Check if next 30m slot exists and is occupied (blocking 1h creation)
        const [h, m] = (time || '00:00').split(':').map(Number);
        const nextTimeDate = new Date();
        nextTimeDate.setHours(h, m + 30);
        const nextTime = format(nextTimeDate, 'HH:mm');
        const nextSlots = slotsByTime[nextTime];

        // Block 1h only when CREATING in an empty cell:
        // 1. Next slot (T+30) doesn't exist (end of day)
        // 2. Next slot has ANY occupied slot (type !== null)
        //
        // When editing an existing slot, we should not show "(Bloqueado: Conflito)" for its own cell.
        const isOneHourBlocked = !isFilled && (!nextSlots || nextSlots.some(({ slot }) => slot.type !== null));

        return (
          <div
            key={time}
            id={`time-${dayIndex}-${time}`}
            style={{ height: `${calculatedHeight}px` }}
            className={`relative transition-colors duration-200 border-b border-border ${
              isBlockedEmpty
                ? 'bg-gray-200 border-gray-300 opacity-60'
                : isCurrentSlot
                ? 'bg-primary/10 border-l-4 border-l-primary shadow-sm'
                : 'border-l-4 border-l-transparent hover:bg-slate-50'
            } ${paddingClass} ${zIndexClass}`}
          >
            {/* Render artificial grid line for 1h slots (at 50% height) - Hide for 30min personal slots */}
            {/* Render artificial grid lines for longer slots */}
            {calculatedHeight > 60 && Array.from({ length: Math.floor(calculatedHeight / 60) - 1 }).map((_, i) => (
              <div
                key={`divider-${i}`}
                className="absolute left-0 right-0 border-b border-border z-0 pointer-events-none"
                style={{ top: `${(i + 1) * 60}px` }}
              />
            ))}

            {isCurrentSlot && (
              <span className="absolute left-0 -top-3 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-tr-md rounded-br-md shadow-sm z-10">
                AGORA
              </span>
            )}

            {visibleTimeSlots.length > 1 ? (
              <DoubleSlotCard
                slots={visibleTimeSlots.map(({ slot }) => slot)}
                dayIndex={dayIndex}
                slotIndices={visibleTimeSlots.map(({ index }) => index)}
                date={date}
                onUpdate={(absoluteIndex, updatedSlot, createSiblingType) => {
                  if (updatedSlot.status === 'CONTRATADO' && updatedSlot.id) {
                    handleRequestRecurrence(updatedSlot.id, updatedSlot.patientName || "", updatedSlot.patientPhone, updatedSlot.patientEmail, updatedSlot.privacyTermsAccepted, absoluteIndex, updatedSlot.time);
                    return;
                  }
                  return onSlotUpdate(dayIndex, absoluteIndex, updatedSlot, createSiblingType);
                }}
                onRemove={(slotIndex) => onRemoveSlot(dayIndex, slotIndex)}
                isOneHourBlocked={isOneHourBlocked}
                isBlocked={isBlocked}
              />
            ) : (
              visibleTimeSlots.map(({ slot, index }) => (
                <TimeSlotCard
                  key={`${dayIndex}-${index}`}
                  slot={slot}
                  date={date}
                  dayIndex={dayIndex}
                  slotIndex={index}
                  isDouble={false}
                  onUpdate={(updatedSlot, createSiblingType) => {
                    if (updatedSlot.status === 'CONTRATADO' && updatedSlot.id) {
                      handleRequestRecurrence(updatedSlot.id, updatedSlot.patientName || "", updatedSlot.patientPhone, updatedSlot.patientEmail, updatedSlot.privacyTermsAccepted, index, updatedSlot.time);
                      return;
                    }
                    return onSlotUpdate(dayIndex, index, updatedSlot, createSiblingType);
                  }}
                  onRemove={() => onRemoveSlot(dayIndex, index)}
                  isLoading={isLoading}
                  isOneHourBlocked={isOneHourBlocked}
                  maxDuration={maxDuration}
                  isBlocked={isBlocked}
                  isLastSlotOfContract={slot.isLastSlotOfContract}
                  needsRenewal={slot.needsRenewal}
                />
              ))
            )}
          </div>
        );
      })}


      <RecurrenceDialog
        key={recurrenceSlotId || 'closed'}
        isOpen={recurrenceDialogOpen}
        slotId={recurrenceSlotId}
        initialName={recurrencePatientName}
        initialPhone={recurrencePatientPhone}
        initialEmail={recurrencePatientEmail}
        initialPrivacyTermsAccepted={recurrencePrivacyTermsAccepted}
        slotDate={format(date, 'yyyy-MM-dd')}
        slotTime={recurrenceSlotTime}
        onClose={() => {
          setRecurrenceDialogOpen(false);
          setRecurrenceSlotId(null);
          setRecurrenceIndices(null);
        }}
        onConfirm={async (frequency, dates, occurrenceCount, patientName, patientPhone, patientEmail, payments, inaugurals, conflicts, reminders, resolvedConflicts) => {
          if (frequency === 'individual') {
            if (recurrenceIndices && recurrenceSlotId) {
              const [dIdx, sIdx] = recurrenceIndices;
              const originalSlot = slots[sIdx];
              if (originalSlot) {
                const isPaid = payments && dates && dates.length > 0 ? payments[dates[0]] : false;
                const isInaugural = inaugurals && dates && dates.length > 0 ? inaugurals[dates[0]] : false;

                // Gerar ID de grupo para permitir revisão futura
                const newGroupId = generateGroupId();

                const updatedSlot = {
                  ...originalSlot,
                  status: 'CONTRATADO',
                  patientName: patientName,
                  patientPhone: patientPhone,
                  patientEmail: patientEmail,
                  isPaid: isPaid,
                  isInaugural: isInaugural,
                  groupId: newGroupId,
                  reminders: reminders
                };
                await onSlotUpdate(dIdx, sIdx, updatedSlot as TimeSlot);
                toast({ title: "Agendamento Confirmado", description: "Agendamento individual criado com sucesso." });
              }
            }
          } else {
            // CRIAÇÃO DE CONTRATO RECORRENTE - LÓGICA SIMPLIFICADA
            const { slotsAPI } = await import('@/api/slotsAPI');
            const originalSlot = slots.find(s => s.id === recurrenceSlotId);

            if (!recurrenceSlotId || !originalSlot) {
              toast({
                variant: "destructive",
                title: "Erro",
                description: "Slot original não encontrado"
              });
              return;
            }

            // Preparar array de slots com data e hora
            const slotsToCreate: Array<{ date: string; time: string }> = [];

            if (dates) {
              for (const date of dates) {
                const isConflict = conflicts?.includes(date);
                const resolved = resolvedConflicts?.find(r => r.originalDate === date);

                if (resolved) {
                  // Conflito resolvido: usar nova data e horário escolhidos
                  slotsToCreate.push({
                    date: resolved.newDate,
                    time: resolved.newTime
                  });
                } else if (!isConflict) {
                  // Data sem conflito: usar horário original
                  slotsToCreate.push({
                    date: date,
                    time: originalSlot.time
                  });
                }
              }
            }

            // Verificar conflitos não resolvidos
            const unresolvedConflicts = conflicts?.filter(c =>
              !resolvedConflicts?.some(r => r.originalDate === c)
            ) || [];

            if (unresolvedConflicts.length > 0) {
              toast({
                variant: "destructive",
                title: "Conflitos Pendentes",
                description: `Existem ${unresolvedConflicts.length} conflito(s) que precisam ser resolvidos antes de continuar.`
              });
              return;
            }

            // UMA ÚNICA REQUISIÇÃO com todos os slots
            try {
              const result = await slotsAPI.createRecurringSlots({
                originalSlotId: recurrenceSlotId,
                frequency,
                range: 'current_and_next_month',
                slots: slotsToCreate,
                patientName: patientName,
                patientPhone: patientPhone,
                patientEmail: patientEmail,
                occurrenceCount: occurrenceCount,
                payments: payments,
                inaugurals: inaugurals,
                reminders: reminders
              });

              toast({
                title: "Contrato Criado",
                description: `${result.createdCount} agendamento(s) criado(s) com sucesso!`
              });
            } catch (err: any) {
              toast({
                variant: "destructive",
                title: "Erro ao Criar Contrato",
                description: err.message
              });
            }
          }
          setRecurrenceDialogOpen(false);
        }}
      />
    </div>
  );
};
