import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useKitchenTickets(params: { status?: string } = {}) {
  return useQuery({
    queryKey: ['kitchen-tickets', params],
    queryFn: () => api.getKitchenTickets(params),
    staleTime: 1000 * 5, // 5 seconds - refresh frequently for KDS
    refetchInterval: 1000 * 10, // Auto-refresh every 10 seconds
  });
}

export function useBumpTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.bumpTicket(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-tickets'] });
    },
  });
}
