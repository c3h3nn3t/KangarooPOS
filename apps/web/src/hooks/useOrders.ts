import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, CreateOrderRequest } from '../lib/api';

export function useOrders(params: { status?: string; date?: string } = {}) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => api.getOrders(params),
    staleTime: 1000 * 30, // 30 seconds
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOrderRequest) => api.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.updateOrderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
