import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { TimeSlot } from "@/components/TimeSlotCard";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { slotsAPI } from "@/api/slotsAPI";
import { supabase } from "@/integrations/supabase/client";

export const useTimeSlots = (currentDate: Date) => {
  const [timeSlots, setTimeSlots] = useState<Record<string, TimeSlot[]>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

  const loadTimeSlots = async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      const startDate = format(weekStart, "yyyy-MM-dd");
      const endDate = format(weekEnd, "yyyy-MM-dd");

      // Chamar API backend em vez de Supabase direto
      const data = await slotsAPI.getSlots(startDate, endDate);

      // Agrupar por date-time
      const grouped: Record<string, TimeSlot[]> = {};

      data.forEach((slot) => {
        const key = `${slot.date}-${slot.time}`;
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(slot);
      });

      setTimeSlots(grouped);
    } catch (error: any) {
      console.error("Error loading time slots:", error);
      if (!silent) setTimeSlots({});

      toast({
        variant: "destructive",
        title: "Erro ao carregar horários",
        description: error.message || "Erro desconhecido",
      });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeSlots();

    // ✅ REALTIME: Subscrever a mudanças na tabela time_slots
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
          // Recarregar slots silenciosamente para garantir consistência
          // (Poderíamos otimizar atualizando o estado local diretamente, mas reload é mais seguro para consistência complexa de 'irmãos')
          loadTimeSlots(true);
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
            description: "Falha ao conectar no Realtime. Tente recarregar.",
          });
        }
        if (status === 'TIMED_OUT') {
          console.error("❌ Timeout no Realtime - Verifique sua conexão.");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    format(weekStart, "yyyy-MM-dd"), // String estável em vez de objeto Date
    format(weekEnd, "yyyy-MM-dd")
  ]);

  // SIMPLIFICADO: Todas as operações agora chamam a API
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
          patientEmail: slot.patientEmail || undefined, // Converter null para undefined
          patientId: slot.patientId, // Adicionar patientId
          flow_status: (slot.flow_status as 'Enviado' | null) || undefined,
          groupId: slot.groupId,
          reminders: slot.reminders,
          duration: slot.type === 'personal' ? slot.duration : undefined,
        });
      } else {
        // Create via API
        await slotsAPI.createSlot({
          date,
          time,
          eventType: slot.type!,
          priceCategory: slot.valor || undefined,
          status: slot.status || undefined, // Incluir status (para atividades pessoais)
          duration: slot.type === 'personal' ? slot.duration : undefined,
          patientId: slot.patientId,
          patientName: slot.patientName,
          patientPhone: slot.patientPhone,
          patientEmail: slot.patientEmail || undefined, // Converter null para undefined
        });
      }

      // ✅ RECARREGAR MANUALMENTE após salvar
      await loadTimeSlots(true);
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

      // ✅ RECARREGAR MANUALMENTE após deletar
      await loadTimeSlots(true);
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
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar flow",
        description: error.message,
      });
    }
  };

  return {
    timeSlots,
    loading,
    saveTimeSlot,
    deleteTimeSlot,
    refreshSlots: loadTimeSlots,
    updateFlowStatus,
  };
};
