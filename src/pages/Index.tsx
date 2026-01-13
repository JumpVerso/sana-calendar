import { useState, useEffect, useMemo, useRef } from "react";
import { WeekSelector } from "@/components/WeekSelector";
import { DayNavigator } from "@/components/DayNavigator";
import { DayColumn } from "@/components/DayColumn";
import { TimeSlot, EventType } from "@/components/TimeSlotCard";
import { startOfWeek, addDays, format, addWeeks, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import logoCintia from "@/assets/logo-cintia.png";
import { Button } from "@/components/ui/button";
import { Clock, ChevronLeft, ChevronRight, Calendar, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useTimeSlots } from "@/hooks/useTimeSlots";
import { PRICE_TABLE } from "@/constants/business-rules";
import { slotsAPI } from "@/api/slotsAPI";
import { useSettings } from "@/hooks/useSettings";
import { BlockDayDialog } from "@/components/BlockDayDialog";
import { Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const { appConfig } = useSettings();
  const { toast } = useToast();
  const [blockDayDialogOpen, setBlockDayDialogOpen] = useState(false);
  const [blockDayDialogDate, setBlockDayDialogDate] = useState<Date | null>(null);
  const [isBlockingDay, setIsBlockingDay] = useState(false);

  // Generate hours dynamically based on settings
  const HOURS = useMemo(() => {
    const start = appConfig?.startHour ?? 6;
    const end = appConfig?.endHour ?? 22;
    const hours = [];

    for (let i = start; i < end; i++) {
      const hourStr = i.toString().padStart(2, '0');
      hours.push(`${hourStr}:00`);
      hours.push(`${hourStr}:30`);
    }
    // Add the end hour itself if we want it inclusive, but usually it's "up to"
    // The previous array went up to 22:00 from 06:00.
    // If end is 22, loop < 22 goes to 21:30.
    // We need to check if the last item should be valid.
    // Original: 06:00 ... 22:00.
    // So if start=6, end=22, we want to include 22:00.

    // Let's assume endHour is INCLUSIVE for the start of the last slot?
    // "22" usually means ends AT 22:00 (so last slot is 21:30-22:00)? 
    // BUT the original array had "22:00".
    // If I have a slot at 22:00, it ends at 22:30.
    // Let's stick to the behavior: startHour to endHour INCLUSIVE.

    const endStr = end.toString().padStart(2, '0');
    hours.push(`${endStr}:00`);

    return hours;
  }, [appConfig?.startHour, appConfig?.endHour]);

  const { timeSlots, loading: slotsLoading, saveTimeSlot, deleteTimeSlot, updateFlowStatus, refreshSlots } = useTimeSlots(currentDate);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const weekStart = useMemo(() => startOfWeek(currentDate, {
    locale: ptBR,
    weekStartsOn: 1
  }), [currentDate]);
  const weekDays = useMemo(() => Array.from({
    length: 7
  }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const [weekData, setWeekData] = useState<TimeSlot[][]>([]);

  // Initialize weekData when HOURS changes or on mount
  useEffect(() => {
    setWeekData(Array.from({ length: 7 }, () =>
      HOURS.map(time => ({
        time,
        type: null,
        valor: "",
        preco: "",
        status: ""
      }))
    ));
  }, [HOURS]);

  const isRemoteUpdate = useRef(false);

  // Load slots from database
  // Transformar timeSlots (da API) em weekData (formato do componente)
  useEffect(() => {
    if (!slotsLoading && Object.keys(timeSlots).length >= 0) {
      const newWeekData = weekDays.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const daySlots: TimeSlot[] = [];
        let nextSkipTime: string | null = null;

        // Helper to add minutes to time string "HH:MM"
        const addMinutes = (time: string, mins: number) => {
          const [h, m] = time.split(':').map(Number);
          const date = new Date();
          date.setHours(h, m + mins);
          return format(date, 'HH:mm');
        };

        HOURS.forEach((time) => {
          const key = `${dateStr}-${time}`;
          const slotsAtTime = timeSlots[key] || [];

          // Se devemos pular este horário devido a um slot anterior de 1h
          if (nextSkipTime === time) {
            // Verifica se REALMENTE existe um slot aqui (conflito). Se existir, mostramos o conflito.
            if (slotsAtTime.length > 0) {
              daySlots.push(...slotsAtTime);
              // Se o conflito também for 1h, pulamos o próximo
              if (slotsAtTime.some(s => s.type !== null)) {
                nextSkipTime = addMinutes(time, 30);
              }
            } else {
              // Reset skip time since we skipped the placeholder
              nextSkipTime = null;
            }
            return;
          }

          if (slotsAtTime.length > 0) {
            daySlots.push(...slotsAtTime);

            // Assumindo que slots preenchidos duram 1h (pula o próximo slot de 30min)
            // Lógica ajustada: Apenas Online e Presencial ocupam 1h visualmente (single slot database)
            // Atividades Pessoais agora são 30min (ocupam apenas o próprio slot), a menos que criem 2 slots.
            const hasLongDurationSlot = slotsAtTime.some(s => s.type === 'online' || s.type === 'presential');

            // Se for Double Slot (dois slots no mesmo horário), também mantemos 1h visualmente? 
            // O código anterior assumia qualquer tipo !== null.
            // Para 'personal', queremos 30min.
            // Se tivermos um Double Slot (2 slots), geralmente é Online+Presencial ou algo assim. 
            // Mas se for Personal 1h (implementado como sequencial), não terá 2 slots no MESMO horário.
            // Se for Personal Double (Simultâneo - legado?), talvez deva manter. 
            // Mas assumindo a nova regra: Personal = 30m.

            // Manter compatibilidade com Double Slots que não sejam Personal puro?
            // Se slotsAtTime.length > 1, é um DoubleSlotCard. DoubleSlotCard deve ter altura de 1h?
            // Os cards de DoubleSlotCard assumem altura full. Se a linha for 30m, fica cortado?
            // O Index define a altura da linha como h-[60px].
            // Se pularmos, temos 120px virtuais.

            // Vamos manter a regra de 1h A MENOS QUE seja Personal Single.
            const isPersonalSingle = slotsAtTime.length === 1 && slotsAtTime[0].type === 'personal';

            if (!isPersonalSingle && slotsAtTime.some(s => s.type !== null)) {
              nextSkipTime = addMinutes(time, 30);
            }
          } else {
            // Se não há slots e não estamos pulando: placeholder
            daySlots.push({
              time,
              type: null,
              valor: "",
              preco: "",
              status: ""
            });
          }
        });

        return daySlots;
      });

      isRemoteUpdate.current = true;
      setWeekData(newWeekData);
    } else if (slotsLoading) {
      // Quando começar a carregar, limpar dados antigos
      setWeekData(Array.from({ length: 7 }, () =>
        HOURS.map(time => ({
          time,
          type: null,
          valor: "",
          preco: "",
          status: ""
        }))
      ));
    }
  }, [timeSlots, slotsLoading, weekDays]);

  // Função para salvar slots críticos imediatamente (sem debounce)
  const saveCriticalSlots = (dayIndex: number, daySlots: TimeSlot[]) => {
    const dateStr = format(weekDays[dayIndex], "yyyy-MM-dd");
    const slotsByTime: Record<string, TimeSlot[]> = {};
    daySlots.forEach((slot) => {
      if (!slotsByTime[slot.time]) {
        slotsByTime[slot.time] = [];
      }
      slotsByTime[slot.time].push(slot);
    });

    // Salva apenas slots críticos (com status importante ou tipo definido)
    Object.entries(slotsByTime).forEach(([time, slots]) => {
      slots.forEach((slot, siblingOrder) => {
        if (slot.type) {
          // Status críticos: CONTRATADO, RESERVADO, CONFIRMADO
          const isCritical = ['CONTRATADO', 'RESERVADO', 'CONFIRMADO'].includes(slot.status);
          if (isCritical) {
            saveTimeSlot(dateStr, time, slot, siblingOrder);
          }
        }
      });
    });
  };

  // SIMPLIFICADO: Não há mais debounce nem salvamentos críticos
  // O salvamento acontece imediatamente quando o usuário faz uma mudança
  // via handleSlotUpdate

  const handleSlotUpdate = async (dayIndex: number, slotIndex: number, updatedSlot: TimeSlot, createSiblingType?: EventType) => {
    const dateStr = format(weekDays[dayIndex], "yyyy-MM-dd");
    const time = updatedSlot.time;

    try {
      // Se está criando horário duplo
      // Se está criando horário duplo ou sequencial
      if (createSiblingType) {
        if (createSiblingType === 'personal') {
          // 1h Personal Activity -> Create 2 sequential slots (Duration)
          // Slot 1: Current Time
          await saveTimeSlot(dateStr, time, updatedSlot);

          // Slot 2: Current Time + 30m
          const [h, m] = time.split(':').map(Number);
          const nextTimeDate = new Date();
          nextTimeDate.setHours(h, m + 30);
          const nextTimeStr = format(nextTimeDate, 'HH:mm');

          // Create next slot (ensure it's a new slot, remove ID)
          const nextSlot = { ...updatedSlot, id: undefined, time: nextTimeStr };
          await saveTimeSlot(dateStr, nextTimeStr, nextSlot);
        } else {
          // Original logic for Simultaneous Double Slots (Online/Presential)
          await slotsAPI.createDoubleSlot({
            date: dateStr,
            time,
            slot1Type: updatedSlot.type!,
            slot2Type: createSiblingType,
            priceCategory: updatedSlot.valor || 'padrao',
            status: updatedSlot.status,
          });
        }
        return;
      }

      // Se está deletando (type null)
      if (!updatedSlot.type && updatedSlot.id) {
        await deleteTimeSlot(dateStr, time, updatedSlot.id);
        return;
      }

      // Atualizar ou criar via API
      await saveTimeSlot(dateStr, time, updatedSlot);

    } catch (error: any) {
      console.error('Erro ao atualizar slot:', error);
      throw error;
    }
  };


  // Função para contar slots do dia
  const getDaySlotCounts = (dayIndex: number) => {
    const dateStr = format(weekDays[dayIndex], "yyyy-MM-dd");
    let emptyCount = 0;
    let reservedCount = 0;

    Object.entries(timeSlots).forEach(([key, slots]) => {
      if (key.startsWith(dateStr + "-")) {
        slots.forEach(slot => {
          const isVago = !slot.type || slot.type === null || slot.status === 'Vago' || slot.status === 'VAGO';
          const isReserved = slot.status === 'RESERVADO' || slot.status === 'CONFIRMADO' || slot.status === 'CONTRATADO';
          
          if (isVago) {
            emptyCount++;
          } else if (isReserved) {
            reservedCount++;
          }
        });
      }
    });

    return { emptyCount, reservedCount };
  };

  // Estado para armazenar dias bloqueados
  const [blockedDays, setBlockedDays] = useState<Set<string>>(new Set());

  // Buscar dias bloqueados ao carregar a semana
  useEffect(() => {
    const fetchBlockedDays = async () => {
      try {
        const { blockedDaysAPI } = await import('@/api/blockedDaysAPI');
        const startDate = format(weekDays[0], "yyyy-MM-dd");
        const endDate = format(weekDays[6], "yyyy-MM-dd");
        const blocked = await blockedDaysAPI.getBlockedDaysInRange(startDate, endDate);
        const blockedDates = new Set(blocked.map(bd => bd.date));
        setBlockedDays(blockedDates);
      } catch (error) {
        console.error('Erro ao buscar dias bloqueados:', error);
      }
    };

    if (weekDays.length === 7) {
      fetchBlockedDays();
    }
  }, [weekDays]);

  // Função para verificar se dia está bloqueado
  const isDayBlocked = (dayIndex: number) => {
    const dateStr = format(weekDays[dayIndex], "yyyy-MM-dd");
    return blockedDays.has(dateStr);
  };

  // Função para abrir dialog de bloqueio
  const handleOpenBlockDayDialog = (dayIndex: number) => {
    setBlockDayDialogDate(weekDays[dayIndex]);
    setBlockDayDialogOpen(true);
  };

  // Função para bloquear o dia
  const handleBlockDay = async () => {
    if (!blockDayDialogDate) return;

    try {
      setIsBlockingDay(true);
      const dateStr = format(blockDayDialogDate, "yyyy-MM-dd");
      
      // Bloquear dia usando slotsService (deleta slots vagos)
      await slotsAPI.blockDay(dateStr);
      
      // Atualizar lista de dias bloqueados
      const { blockedDaysAPI } = await import('@/api/blockedDaysAPI');
      const startDate = format(weekDays[0], "yyyy-MM-dd");
      const endDate = format(weekDays[6], "yyyy-MM-dd");
      const blocked = await blockedDaysAPI.getBlockedDaysInRange(startDate, endDate);
      const blockedDates = new Set(blocked.map(bd => bd.date));
      setBlockedDays(blockedDates);
      
      toast({
        title: "Dia bloqueado",
        description: `O dia ${format(blockDayDialogDate, "dd/MM/yyyy", { locale: ptBR })} foi bloqueado com sucesso.`,
      });

      await refreshSlots(true);
      setBlockDayDialogOpen(false);
      setBlockDayDialogDate(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao bloquear dia",
        description: error.message || "Ocorreu um erro ao bloquear o dia.",
      });
    } finally {
      setIsBlockingDay(false);
    }
  };

  // Função para desbloquear o dia
  const handleUnblockDay = async () => {
    if (!blockDayDialogDate) return;

    try {
      setIsBlockingDay(true);
      const dateStr = format(blockDayDialogDate, "yyyy-MM-dd");
      
      // Desbloquear dia
      const { blockedDaysAPI } = await import('@/api/blockedDaysAPI');
      await blockedDaysAPI.unblockDay(dateStr);
      
      // Atualizar lista de dias bloqueados
      const startDate = format(weekDays[0], "yyyy-MM-dd");
      const endDate = format(weekDays[6], "yyyy-MM-dd");
      const blocked = await blockedDaysAPI.getBlockedDaysInRange(startDate, endDate);
      const blockedDates = new Set(blocked.map(bd => bd.date));
      setBlockedDays(blockedDates);
      
      toast({
        title: "Dia desbloqueado",
        description: `O dia ${format(blockDayDialogDate, "dd/MM/yyyy", { locale: ptBR })} foi desbloqueado com sucesso.`,
      });

      await refreshSlots(true);
      setBlockDayDialogOpen(false);
      setBlockDayDialogDate(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao desbloquear dia",
        description: error.message || "Ocorreu um erro ao desbloquear o dia.",
      });
    } finally {
      setIsBlockingDay(false);
    }
  };

  const handleRemoveSlot = async (dayIndex: number, slotIndex: number) => {
    const daySlots = [...weekData[dayIndex]];
    const slotToRemove = daySlots[slotIndex];
    const time = slotToRemove.time;
    const dateStr = format(weekDays[dayIndex], "yyyy-MM-dd");

    // Se o slot tem tipo e ID, deletar do banco
    if (slotToRemove.type && slotToRemove.id) {
      console.log(`🗑️ Deletando slot do banco: ${slotToRemove.id}`);
      try {
        await deleteTimeSlot(dateStr, time, slotToRemove.id);
      } catch (error) {
        console.error("Erro ao deletar slot:", error);
        return; // Não remove da UI se falhar
      }
    }

    setWeekData(prev => {
      const newData = [...prev];
      const currentDaySlots = [...newData[dayIndex]];

      // Remove o slot da memória
      currentDaySlots.splice(slotIndex, 1);

      // Regra: Se todos os slots do mesmo horário estão vazios, manter apenas 1
      const slotsAtTime = currentDaySlots.filter(s => s.time === time);
      const allEmpty = slotsAtTime.every(s => !s.type);

      if (allEmpty && slotsAtTime.length > 1) {
        // Remove slots vazios extras, mantendo apenas o primeiro
        const emptyIndices = currentDaySlots
          .map((s, i) => ({ slot: s, index: i }))
          .filter(({ slot }) => slot.time === time && !slot.type)
          .map(({ index }) => index)
          .sort((a, b) => b - a); // Ordena do maior para o menor para remover do final

        // Remove todos exceto o primeiro
        emptyIndices.slice(1).forEach(index => {
          currentDaySlots.splice(index, 1);
        });
      }

      newData[dayIndex] = currentDaySlots;
      return newData;
    });
  };

  const scrollToDay = (index: number) => {
    const targetIndex = Math.max(0, index - 1);
    const element = document.getElementById(`day-card-${targetIndex}`);
    const container = document.getElementById('day-navigator');
    if (element && container) {
      const scrollLeft = element.offsetLeft - container.offsetLeft;
      container.scrollTo({
        left: scrollLeft,
        behavior: 'smooth'
      });
    }
  };

  const handleDayClick = (index: number) => {
    setActiveDayIndex(index);
    scrollToDay(index);
  };

  const handleBackToNow = () => {
    const now = new Date();
    setCurrentDate(now);

    // Find the index of today in the current week view
    const todayIndex = (now.getDay() + 6) % 7;
    setActiveDayIndex(todayIndex);

    // Scroll day navigator (mobile only)
    setTimeout(() => {
      scrollToDay(todayIndex);
    }, 100);

    // Scroll to current time
    const scrollToCurrentTime = (attempts = 0) => {
      const currentHour = now.getHours();
      const targetHour = Math.max(6, Math.min(currentHour, 22));
      const timeString = `${String(targetHour).padStart(2, '0')}:00`;
      const element = document.getElementById(`time-${todayIndex}-${timeString}`);

      if (element) {
        const headerHeight = window.innerWidth >= 768 ? 275 : 200;
        const rect = element.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const elementTop = rect.top + scrollTop;
        const offsetPosition = elementTop - headerHeight;

        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: 'smooth'
        });
      } else if (attempts < 10) {
        setTimeout(() => scrollToCurrentTime(attempts + 1), 150);
      }
    };

    const delay = window.innerWidth >= 768 ? 400 : 200;
    setTimeout(() => scrollToCurrentTime(), delay);
  };

  const handleWeekChange = (newDate: Date) => {
    // Limpar dados da semana anterior imediatamente para evitar bordas "fantasma"
    setWeekData(Array.from({ length: 7 }, () =>
      HOURS.map(time => ({
        time,
        type: null,
        valor: "",
        preco: "",
        status: ""
      }))
    ));
    setCurrentDate(newDate);
    setActiveDayIndex(0);
    setTimeout(() => scrollToDay(0), 50);
  };

  // Initial scroll to today on mount
  useEffect(() => {
    setTimeout(() => {
      const now = new Date();
      const todayIndex = (now.getDay() + 6) % 7;
      if (activeDayIndex === 0 && todayIndex !== 0) {
        setActiveDayIndex(todayIndex);
      }
      scrollToDay(todayIndex);
    }, 500);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 bg-background border-b shadow-sm">
        <div className="max-w-[1700px] mx-auto px-2 sm:px-4">
          {/* Logo, Title and Config Button */}
          <div className="relative flex flex-col gap-2 py-4 border-b">
            <Link to="/config" className="absolute top-4 right-0 z-10">
              <Button
                variant="outline"
                size="sm"
                className="whitespace-nowrap flex items-center gap-1"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Configurações</span>
              </Button>
            </Link>
            <div className="flex flex-col items-center">
              <img src={logoCintia} alt="Cintia Parisotto Psicóloga" className="h-16 sm:h-20 mb-1 object-contain" />
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Agenda Semanal
              </h1>
            </div>
          </div>

          {/* Week Navigation Block - Desktop */}
          <div className="hidden items-center gap-3 justify-center py-3 md:flex md:flex-col">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => handleWeekChange(subWeeks(currentDate, 1))} className="shrink-0">
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0 text-primary" />
                <span className="font-semibold text-base">
                  {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
                </span>
              </div>

              <Button variant="outline" size="icon" onClick={() => handleWeekChange(addWeeks(currentDate, 1))} className="shrink-0">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button variant="outline" size="sm" onClick={handleBackToNow} className="shrink-0">
              <Clock className="mr-2 h-4 w-4" />
              Agora
            </Button>
          </div>

          {/* Mobile: Week selector, "Voltar para Hoje" button and day navigator */}
          <div className="md:hidden pb-4">
            <WeekSelector currentDate={currentDate} onDateChange={handleWeekChange} />
            <div className="mt-4 space-y-2">
              <Button variant="outline" className="w-full bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary hover:text-primary focus:text-primary active:text-primary focus:bg-primary/10" onClick={handleBackToNow}>
                <Clock className="mr-2 h-4 w-4" />
                Voltar para Hoje
              </Button>

              <DayNavigator days={weekDays} activeDayIndex={activeDayIndex} onDayClick={handleDayClick} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: Single day view */}
      <div className="md:hidden max-w-[600px] mx-auto px-4 py-6">
        <div className="animate-fade-in" key={`mobile-${format(weekStart, "yyyy-MM-dd")}-${activeDayIndex}`}>
          <DayColumn date={weekDays[activeDayIndex]} slots={weekData[activeDayIndex]} dayIndex={activeDayIndex} onSlotUpdate={handleSlotUpdate} onRemoveSlot={handleRemoveSlot} isLoading={slotsLoading} />
        </div>
      </div>

      {/* Desktop: All days in a grid */}
      <div className="hidden md:block w-full px-2 py-6 overflow-x-auto">
        <div className="grid grid-cols-[80px_repeat(7,1fr)] max-w-full border-t border-l">
          {/* Time Column Header */}
          <div className="bg-background border-b border-r p-2 flex items-center justify-center sticky left-0 top-0 z-20 h-[92px]">
            <div className="text-sm font-bold text-muted-foreground uppercase text-center">
              Horário
            </div>
          </div>

          {/* Day Headers */}
          {weekDays.map((day, index) => {
            const isToday = format(new Date(), "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
            const blocked = isDayBlocked(index);
            return (
              <div 
                key={`header-${index}`} 
                onClick={() => handleOpenBlockDayDialog(index)}
                className={`border-b border-r p-2 text-center h-[92px] flex flex-col justify-center items-center cursor-pointer transition-colors hover:bg-muted/50 ${
                  isToday ? "bg-primary/5" : blocked ? "bg-gray-100" : "bg-white"
                }`}
                title={blocked ? "Dia bloqueado - Clique para ver detalhes" : "Clique para trancar o dia"}
              >
                <div className="text-[10px] font-medium text-muted-foreground uppercase truncate">
                  {format(day, "EEE", { locale: ptBR })}
                </div>
                <div className="flex items-center gap-1">
                  <div className={`text-xl font-bold ${isToday ? "text-primary" : blocked ? "text-gray-600" : "text-foreground"}`}>
                    {format(day, "dd")}
                  </div>
                  {blocked && <Lock className="h-3 w-3 text-gray-600" />}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {format(day, "MM/yy", { locale: ptBR })}
                </div>
              </div>
            );
          })}

          {/* Time Column Body */}
          <div className="border-r border-b bg-white">
            {HOURS.map((time, idx) => {
              // Render fixed height time labels
              return (
                <div key={`time-col-${time}-${idx}`} className="h-[60px] flex items-center justify-center border-b text-xs font-semibold text-muted-foreground bg-slate-50">
                  {time}
                </div>
              );
            })}
          </div>

          {/* Days Columns Body */}
          {weekDays.map((day, index) => {
            const isToday = format(new Date(), "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
            const weekKey = format(weekStart, "yyyy-MM-dd");
            return (
              <div key={`${weekKey}-${index}`} className={`border-r border-b min-w-0 ${isToday ? "bg-primary/5" : "bg-white"}`}>
                <div className="p-0">
                  <DayColumn
                    date={day}
                    slots={weekData[index] || []}
                    dayIndex={index}
                    onSlotUpdate={handleSlotUpdate}
                    onRemoveSlot={handleRemoveSlot}
                    isLoading={slotsLoading}
                    isBlocked={isDayBlocked(index)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Block Day Dialog */}
      {blockDayDialogDate && (
        <BlockDayDialog
          isOpen={blockDayDialogOpen}
          onClose={() => {
            setBlockDayDialogOpen(false);
            setBlockDayDialogDate(null);
          }}
          onConfirm={handleBlockDay}
          onUnblock={handleUnblockDay}
          date={blockDayDialogDate}
          emptySlotsCount={getDaySlotCounts(weekDays.findIndex(d => format(d, "yyyy-MM-dd") === format(blockDayDialogDate, "yyyy-MM-dd"))).emptyCount}
          reservedSlotsCount={getDaySlotCounts(weekDays.findIndex(d => format(d, "yyyy-MM-dd") === format(blockDayDialogDate, "yyyy-MM-dd"))).reservedCount}
          isLoading={isBlockingDay}
          isBlocked={isDayBlocked(weekDays.findIndex(d => format(d, "yyyy-MM-dd") === format(blockDayDialogDate, "yyyy-MM-dd")))}
        />
      )}
    </div>
  );
};

export default Index;
