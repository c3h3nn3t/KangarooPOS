import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useProducts(params: { categoryId?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => api.getProducts(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => api.getProduct(id),
    enabled: !!id,
  });
}
