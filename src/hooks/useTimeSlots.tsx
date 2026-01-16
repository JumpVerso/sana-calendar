import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TimeSlot } from "@/components/TimeSlotCard";
import { addWeeks, endOfWeek, format, parseISO, startOfWeek, subWeeks } from "date-fns";
import { slotsAPI } from "@/api/slotsAPI";
import { supabase } from "@/integrations/supabase/client";
import { useSlotsQuery, slotsKeys } from "@/hooks/useSlotsQuery";

export const useTimeSlots = (currentDate: Date) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const startDate = format(weekStart, "yyyy-MM-dd");
  const endDate = format(weekEnd, "yyyy-MM-dd");

  // Adjacent weeks (para cache/prefetch e realtime)
  const prevWeekStart = subWeeks(weekStart, 1);
  const prevWeekEnd = endOfWeek(prevWeekStart, { weekStartsOn: 1 });
  const prevStartDate = format(prevWeekStart, "yyyy-MM-dd");
  const prevEndDate = format(prevWeekEnd, "yyyy-MM-dd");

  const nextWeekStart = addWeeks(weekStart, 1);
  const nextWeekEnd = endOfWeek(nextWeekStart, { weekStartsOn: 1 });
  const nextStartDate = format(nextWeekStart, "yyyy-MM-dd");
  const nextEndDate = format(nextWeekEnd, "yyyy-MM-dd");

  // Usar React Query para buscar slots com cache automático
  const { data: slotsData, isLoading, refetch } = useSlotsQuery(startDate, endDate);

  // Agrupar slots por date-time (memoizado)
  const timeSlots = useMemo(() => {
    if (!slotsData) return {};
    
    const grouped: Record<string, TimeSlot[]> = {};
    slotsData.forEach((slot) => {
      const key = `${slot.date}-${slot.time}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(slot as TimeSlot);
    });
    return grouped;
  }, [slotsData]);

  // Função para invalidar cache (usada pelo Realtime)
  const invalidateSlots = () => {
    // Invalidar semana atual + adjacentes (para manter prefetch consistente)
    const ranges: Array<[string, string]> = [
      [startDate, endDate],
      [prevStartDate, prevEndDate],
      [nextStartDate, nextEndDate],
    ];

    ranges.forEach(([s, e]) => {
      queryClient.invalidateQueries({ queryKey: slotsKeys.week(s, e), exact: true });
    });

    // Se as semanas adjacentes já estão no cache, atualizar em background
    // (assim navegação fica instantânea mesmo após mudanças via Realtime).
    const maybePrefetchIfCached = (s: string, e: string) => {
      const key = slotsKeys.week(s, e);
      const state = queryClient.getQueryState(key);
      if (!state) return;
      // prefetchQuery respeita cache e roda em background
      queryClient.prefetchQuery({
        queryKey: key,
        queryFn: () => slotsAPI.getSlots(s, e),
        staleTime: 5 * 60 * 1000,
      });
    };

    maybePrefetchIfCached(prevStartDate, prevEndDate);
    maybePrefetchIfCached(nextStartDate, nextEndDate);
  };

  // Função para invalidar e aguardar refetch (usada após mutações)
  const invalidateAndRefetch = async () => {
    await queryClient.invalidateQueries({ queryKey: slotsKeys.week(startDate, endDate), exact: true });
    await refetch();
  };

  // ✅ REALTIME: Subscrever a mudanças na tabela time_slots
  useEffect(() => {
    const debounceRef = { current: null as null | ReturnType<typeof setTimeout> };
    const pendingRanges = new Set<string>();
    let errorToastTimeout: ReturnType<typeof setTimeout> | null = null;
    let isErrorShowing = false;

    const addRangeForDateStr = (dateStr: string) => {
      const d = parseISO(dateStr);
      const ws = startOfWeek(d, { weekStartsOn: 1 });
      const we = endOfWeek(d, { weekStartsOn: 1 });
      const s = format(ws, "yyyy-MM-dd");
      const e = format(we, "yyyy-MM-dd");
      pendingRanges.add(`${s}|${e}`);
    };

    const extractDateStrFromPayload = (payload: any): string | null => {
      // Preferir coluna date se existir
      const directDate = payload?.new?.date || payload?.old?.date;
      if (typeof directDate === 'string' && directDate.length >= 10) return directDate.substring(0, 10);

      // Fallback para start_time/startTime
      const st =
        payload?.new?.start_time ||
        payload?.old?.start_time ||
        payload?.new?.startTime ||
        payload?.old?.startTime;

      if (typeof st === 'string' && st) {
        try {
          return format(parseISO(st), "yyyy-MM-dd");
        } catch {
          return null;
        }
      }

      return null;
    };

    const channel = supabase
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        {
          event: "*", // Escutar INSERT, UPDATE, DELETE
          schema: "public",
          table: "time_slots",
        },
        (payload) => {
          console.log("🔔 Realtime update received:", payload);

          // Guardar a semana afetada (mesmo que seja bem longe da semana atual)
          const affectedDate = extractDateStrFromPayload(payload);
          if (affectedDate) addRangeForDateStr(affectedDate);

          // Debounce: bulk cria N eventos -> 1 invalidation/refetch da semana visível
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            // Sempre invalida atual±1 (prefetch UX)
            invalidateSlots();

            // E também invalida semanas realmente afetadas pelos eventos recebidos
            if (pendingRanges.size > 0) {
              pendingRanges.forEach((k) => {
                const [s, e] = k.split('|');
                queryClient.invalidateQueries({ queryKey: slotsKeys.week(s, e), exact: true });
              });
              pendingRanges.clear();
            }
          }, 300);
        }
      )
      .subscribe((status, err) => {
        console.log("🔌 Realtime status:", status);
        if (status === 'SUBSCRIBED') {
          console.log("✅ Conectado ao canal de mudanças do DB!");
          
          // Se estava mostrando erro mas reconectou, cancelar o toast
          if (errorToastTimeout) {
            clearTimeout(errorToastTimeout);
            errorToastTimeout = null;
          }
          isErrorShowing = false;
        }
        if (status === 'CHANNEL_ERROR') {
          console.error("❌ Erro no canal Realtime:", err);
          
          // Só mostrar toast se o erro persistir por mais de 5 segundos
          // (Supabase Realtime tem reconexão automática, então erros temporários se resolvem sozinhos)
          if (!isErrorShowing) {
            errorToastTimeout = setTimeout(() => {
              // Só mostra se ainda estiver em erro após 5 segundos
              toast({
                variant: "destructive",
                title: "Erro de Conexão",
                description: "Falha ao estabelecer conexão com o Banco de Dados. Tentando reconectar...",
              });
              isErrorShowing = true;
            }, 5000); // Espera 5 segundos antes de mostrar o erro
          }
        }
        if (status === 'TIMED_OUT') {
          console.error("❌ Timeout no Realtime - Verifique sua conexão.");
          // Timeout também espera antes de mostrar erro
          if (!isErrorShowing) {
            errorToastTimeout = setTimeout(() => {
              toast({
                variant: "destructive",
                title: "Conexão Perdida",
                description: "Conexão com o Banco de Dados foi interrompida. Tentando reconectar...",
              });
              isErrorShowing = true;
            }, 5000);
          }
        }
        if (status === 'CLOSED') {
          // Conexão fechada (pode ser reconexão em andamento)
          console.log("🔌 Conexão Realtime fechada (pode estar reconectando...)");
        }
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (errorToastTimeout) clearTimeout(errorToastTimeout);
      supabase.removeChannel(channel);
    };
  }, [startDate, endDate, queryClient, toast]);

  // SIMPLIFICADO: Todas as operações usam a API com invalidação de cache
  const saveTimeSlot = async (
    date: string,
    time: string,
    slot: TimeSlot,
    siblingOrder: number = 0
  ) => {
    try {
      if (slot.id) {
        // Update via API
        await slotsAPI.updateSlot(slot.id, {
          type: slot.type,
          valor: slot.valor,
          preco: slot.preco,
          status: slot.status,
          patientName: slot.patientName,
          patientPhone: slot.patientPhone,
          patientEmail: slot.patientEmail || undefined,
          patientId: slot.patientId,
          flow_status: (slot.flow_status as 'Enviado' | null) || undefined,
          groupId: slot.groupId,
          isPaid: slot.isPaid,
          isInaugural: slot.isInaugural,
          reminders: slot.reminders,
          duration: slot.type === 'personal' ? slot.duration : undefined,
        });
      } else {
        // Create via API
        // Para atividades pessoais: valor = nome da atividade (vai para status/personalActivity)
        // Para comerciais: valor = categoria de preço (padrao, promocional, emergencial)
        const isPersonal = slot.type === 'personal';
        await slotsAPI.createSlot({
          date,
          time,
          eventType: slot.type!,
          priceCategory: isPersonal ? (slot.duration || '30m') : (slot.valor || undefined),
          // `preco` é mantido como centavos (string). Enviar como number (centavos) quando existir.
          price: slot.preco ? Number(String(slot.preco).replace(/\D/g, "")) : undefined,
          status: isPersonal ? slot.valor : (slot.status || undefined), // Nome da atividade vai em status para pessoal
          duration: isPersonal ? slot.duration : undefined,
          patientId: slot.patientId,
          patientName: slot.patientName,
          patientPhone: slot.patientPhone,
          patientEmail: slot.patientEmail || undefined,
          contractId: slot.groupId, // Frontend usa groupId, backend espera contractId
          isPaid: slot.isPaid,
          isInaugural: slot.isInaugural,
          reminderOneHour: slot.reminders?.oneHour,
          reminderTwentyFourHours: slot.reminders?.twentyFourHours,
        });
      }

      // ✅ Invalidar cache e aguardar refetch para feedback visual do slot
      await invalidateAndRefetch();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error.message,
      });
      throw error;
    }
  };

  const deleteTimeSlot = async (date: string, time: string, slotId?: string) => {
    try {
      if (!slotId) {
        throw new Error("ID do slot é obrigatório para deletar");
      }

      await slotsAPI.deleteSlot(slotId);

      // ✅ Invalidar cache e aguardar refetch para feedback visual do slot
      await invalidateAndRefetch();
      console.log("✅ Slot deletado via API");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao remover",
        description: error.message,
      });
      throw error;
    }
  };

  const updateFlowStatus = async (slotId: string, flowStatus: string) => {
    try {
      await slotsAPI.updateSlot(slotId, { flow_status: flowStatus as 'Enviado' | null });
      await invalidateAndRefetch();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar flow",
        description: error.message,
      });
    }
  };

  // Função para forçar refresh (compatibilidade com código existente)
  const refreshSlots = async (silent = false) => {
    await refetch();
  };

  return {
    timeSlots,
    loading: isLoading,
    saveTimeSlot,
    deleteTimeSlot,
    refreshSlots,
    updateFlowStatus,
  };
};
