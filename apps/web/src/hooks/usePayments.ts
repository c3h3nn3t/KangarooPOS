import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ProcessPaymentRequest } from '../lib/api';

export function useProcessPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ProcessPaymentRequest) => api.processPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useRefundPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      amount,
      reason,
    }: {
      id: string;
      amount?: number;
      reason?: string;
    }) => api.refundPayment(id, amount, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
