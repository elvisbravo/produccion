import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // No reintentar errores del cliente (4xx): no se van a resolver solos.
      retry: (intentos, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && intentos < 2,
      refetchOnWindowFocus: true,
    },
  },
})
