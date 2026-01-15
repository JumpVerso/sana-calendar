import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TimeSlot } from "@/components/TimeSlotCard";
import { startOfWeek, endOfWeek, format } from "date-fns";
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
    // Priorizar a semana atual (evita múltiplos GETs desnecessários em bulk)
    queryClient.invalidateQueries({ queryKey: slotsKeys.week(startDate, endDate), exact: true });
  };

  // Função para invalidar e aguardar refetch (usada após mutações)
  const invalidateAndRefetch = async () => {
    await queryClient.invalidateQueries({ queryKey: slotsKeys.week(startDate, endDate), exact: true });
    await refetch();
  };

  // ✅ REALTIME: Subscrever a mudanças na tabela time_slots
  useEffect(() => {
    const debounceRef = { current: null as null | ReturnType<typeof setTimeout> };

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
          // Debounce: bulk cria N eventos -> 1 invalidation/refetch da semana visível
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            invalidateSlots();
          }, 300);
        }
      )
      .subscribe((status, err) => {
        console.log("🔌 Realtime status:", status);
        if (status === 'SUBSCRIBED') {
          console.log("✅ Conectado ao canal de mudanças do DB!");
        }
        if (status === 'CHANNEL_ERROR') {
          console.error("❌ Erro no canal Realtime:", err);
          toast({
            variant: "destructive",
            title: "Erro de Conexão",
            description: "Falha ao estabelecer conexão com o Banco de Dados. Tente recarregar a página.",
          });
        }
        if (status === 'TIMED_OUT') {
          console.error("❌ Timeout no Realtime - Verifique sua conexão.");
        }
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
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
