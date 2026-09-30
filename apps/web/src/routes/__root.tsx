import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

export interface ContextoRouter {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<ContextoRouter>()({
  component: Outlet,
})
