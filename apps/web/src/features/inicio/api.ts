import type { PanelInicio } from '@grupoes/shared'
import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const panelInicioQuery = queryOptions({ queryKey: ['inicio'], queryFn: () => api<PanelInicio>('/inicio'), staleTime: 60_000, refetchOnWindowFocus: true })
