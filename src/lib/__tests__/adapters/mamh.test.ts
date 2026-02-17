import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MamhAdapter } from '../../adapters/mamh'
import fs from 'fs/promises'
import path from 'path'

vi.mock('fs/promises')
vi.mock('../../claude-stats', () => ({
  readClaudeStats: vi.fn().mockResolvedValue({
    daily: { used: 472000, limit: 5000000, resetIn: '23h 18m' },
    weekly: { used: 472000, limit: 20000000, resetIn: '3d 23h' },
    contextWindow: { used: 43000, total: 200000, percentage: 22 },
    model: 'claude-opus-4-5',
    lastUpdated: '2026-02-12T17:00:00Z',
  }),
}))

const mockFs = vi.mocked(fs)

const PROJECT_DIR = '/test/project'
const MAMH_DIR = path.join(PROJECT_DIR, '.mamh')
const CLAUDE_HOME = '/home/.claude'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MamhAdapter', () => {
  const adapter = new MamhAdapter(PROJECT_DIR, CLAUDE_HOME)

  describe('getWatchPaths', () => {
    it('returns expected watch paths', () => {
      const paths = adapter.getWatchPaths()
      expect(paths).toContain(path.join(MAMH_DIR, 'state', 'mamh-state.json'))
      expect(paths).toContain(path.join(MAMH_DIR, 'agents', 'registry.json'))
      expect(paths).toContain(path.join(MAMH_DIR, 'session.json'))
    })
  })

  describe('readState with array registry format', () => {
    it('normalizes agents from array format', async () => {
      // .mamh dir exists
      mockFs.access.mockResolvedValue(undefined)

      // session.json
      mockFs.readFile.mockImplementation(async (filePath) => {
        const p = filePath.toString()
        if (p.endsWith('session.json')) {
          return JSON.stringify({
            projectName: 'test-project',
            description: 'Test',
            startedAt: '2026-02-12T17:00:00Z',
          })
        }
        if (p.endsWith('registry.json')) {
          return JSON.stringify({
            agents: [
              { id: 'agent-1', role: 'Engineer', modelTier: 'sonnet', status: 'active' },
              { id: 'agent-2', role: 'Scientist', modelTier: 'opus', status: 'active' },
            ],
            totalAgents: 2,
          })
        }
        if (p.endsWith('mamh-state.json')) {
          return JSON.stringify({
            phase: 3,
            status: 'executing',
            currentMilestone: 'M003',
            activeAgents: ['agent-1'],
            ticketsSummary: { total: 10, completed: 5, inProgress: 2, pending: 3 },
          })
        }
        throw new Error('File not found')
      })

      // No tickets or comms dirs
      mockFs.readdir.mockRejectedValue(new Error('ENOENT'))
      mockFs.stat.mockRejectedValue(new Error('ENOENT'))

      const state = await adapter.readState()

      expect(state.agents).toHaveLength(3) // lead + 2 subagents
      expect(state.agents[0].id).toBe('lead')
      expect(state.agents[0].role).toBe('Orchestrator (main session)')
      expect(state.agents[1].id).toBe('agent-1')
      expect(state.agents[1].color).toBe('blue')
      expect(state.agents[2].color).toBe('red')
      expect(state.project.name).toBe('test-project')
      expect(state.error).toBeNull()
    })
  })

  describe('readState with object registry format', () => {
    it('normalizes agents from object format', async () => {
      mockFs.access.mockResolvedValue(undefined)

      mockFs.readFile.mockImplementation(async (filePath) => {
        const p = filePath.toString()
        if (p.endsWith('session.json')) {
          return JSON.stringify({ projectName: 'phonetic-model' })
        }
        if (p.endsWith('registry.json')) {
          return JSON.stringify({
            agents: {
              'ml-scientist': { role: 'ML Research Scientist', model: 'opus' },
              'speech-scientist': { role: 'Speech Data Scientist', model: 'sonnet' },
            },
            version: 1,
          })
        }
        if (p.endsWith('mamh-state.json')) {
          return JSON.stringify({
            phase: 'executing',
            currentMilestone: 'M2',
            agentsSpawned: ['ml-scientist', 'speech-scientist'],
            startedAt: '2026-02-11T04:36:20Z',
          })
        }
        throw new Error('File not found')
      })

      mockFs.readdir.mockRejectedValue(new Error('ENOENT'))
      mockFs.stat.mockRejectedValue(new Error('ENOENT'))

      const state = await adapter.readState()

      expect(state.agents).toHaveLength(3) // lead + 2 subagents
      expect(state.agents[0].id).toBe('lead')
      expect(state.agents[1].id).toBe('ml-scientist')
      expect(state.agents[1].modelTier).toBe('opus')
      expect(state.agents[2].id).toBe('speech-scientist')
      expect(state.agents[2].modelTier).toBe('sonnet')
      expect(state.project.phase).toBe('executing')
    })
  })

  describe('readState with no .mamh dir', () => {
    it('returns error state', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'))

      const state = await adapter.readState()

      expect(state.error).toBe('No .mamh directory found')
      expect(state.agents).toHaveLength(0)
    })
  })
})
