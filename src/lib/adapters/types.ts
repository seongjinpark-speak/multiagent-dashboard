import type { DashboardState } from '@/types'

export interface DashboardAdapter {
  readonly name: string
  readState(): Promise<DashboardState>
  getWatchPaths(): readonly string[]
}
