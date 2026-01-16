import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { slotsAPI, TimeSlot } from "@/api/slotsAPI";
import { useToast } from "@/hooks/use-toast";

// Query keys factory para consistência
export const slotsKeys = {
  all: ['slots'] as const,
  week: (startDate: string, endDate: string) => ['slots', startDate, endDate] as const,
  contract: (contractId: string) => ['slots', 'contract', contractId] as const,
};

// Hook para buscar slots de uma semana
export function useSlotsQuery(startDate: string, endDate: string) {
  return useQuery({
    queryKey: slotsKeys.week(startDate, endDate),
    queryFn: () => slotsAPI.getSlots(startDate, endDate),
    staleTime: 5 * 60 * 1000, // 5 minutos
    // Mesmo com cache persistido, ao montar (inclusive após F5) refaz em background
    // para não ficar preso em valores antigos se perdeu evento de Realtime.
    refetchOnMount: "always",
    refetchOnReconnect: "always",
  });
}

// Hook para criar slot
export function useCreateSlotMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: Parameters<typeof slotsAPI.createSlot>[0]) => 
      slotsAPI.createSlot(data),
    onSuccess: () => {
      // Invalida todas as queries de slots para garantir consistência
      queryClient.invalidateQueries({ queryKey: slotsKeys.all });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao criar slot",
        description: error.message,
      });
    },
  });
}

// Hook para atualizar slot
export function useUpdateSlotMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TimeSlot> }) => 
      slotsAPI.updateSlot(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slotsKeys.all });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar slot",
        description: error.message,
      });
    },
  });
}

// Hook para deletar slot
export function useDeleteSlotMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => slotsAPI.deleteSlot(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slotsKeys.all });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao remover slot",
        description: error.message,
      });
    },
  });
}

// Hook para criar double slot
export function useCreateDoubleSlotMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: Parameters<typeof slotsAPI.createDoubleSlot>[0]) => 
      slotsAPI.createDoubleSlot(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slotsKeys.all });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao criar slot duplo",
        description: error.message,
      });
    },
  });
}

// Hook para criar slots em bulk (atividades pessoais)
export function useCreateBulkPersonalSlotsMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (slots: Parameters<typeof slotsAPI.createBulkPersonalSlots>[0]) => 
      slotsAPI.createBulkPersonalSlots(slots),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slotsKeys.all });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao criar atividades",
        description: error.message,
      });
    },
  });
}

// Hook para criar slots recorrentes
export function useCreateRecurringSlotsMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: Parameters<typeof slotsAPI.createRecurringSlots>[0]) => 
      slotsAPI.createRecurringSlots(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slotsKeys.all });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao criar recorrência",
        description: error.message,
      });
    },
  });
}

// Hook para atualizar contrato
export function useUpdateContractMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ contractId, data }: { contractId: string; data: Parameters<typeof slotsAPI.updateContract>[1] }) => 
      slotsAPI.updateContract(contractId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slotsKeys.all });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar contrato",
        description: error.message,
      });
    },
  });
}

// Hook para mudar horário de slot
export function useChangeSlotTimeMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ slotId, newDate, newTime }: { slotId: string; newDate: string; newTime: string }) => 
      slotsAPI.changeSlotTime(slotId, newDate, newTime),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slotsKeys.all });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao mudar horário",
        description: error.message,
      });
    },
  });
}

// Hook para bloquear dia
export function useBlockDayMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (date: string) => slotsAPI.blockDay(date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slotsKeys.all });
      queryClient.invalidateQueries({ queryKey: ['blocked-days'] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao bloquear dia",
        description: error.message,
      });
    },
  });
}

// Função utilitária para invalidar cache (para uso com Realtime)
export function useInvalidateSlots() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: slotsKeys.all });
  };
}
