# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Real-time monitoring dashboard for AI agent teams. Displays a pixel-art "Agent Village" with animated characters walking between Working/Idle/Done zones, alongside a monitor panel, ticket tracker, and activity log. Built with Next.js 15 App Router.

## Commands

```bash
npm run dev          # Development server (port 3000)
npm run build        # Production build
npm test             # Run unit tests (vitest)
npm run test:watch   # Watch mode tests
npx tsc --noEmit     # Type check
```

## Architecture

### Data flow

```
File system (.mamh/ or ~/.claude/)
  -> chokidar (FileWatcher, 100ms debounce + 15s periodic re-eval)
  -> DashboardAdapter.readState() -> DashboardState
  -> SSE stream (/api/events, 15s heartbeat)
  -> EventSource in browser (useDashboardSSE hook, 30s auto-refresh)
  -> React components re-render
```

### Adapter pattern

All data reading goes through `DashboardAdapter` interface (`src/lib/adapters/types.ts`):

```typescript
interface DashboardAdapter {
  readonly name: string
  readState(): Promise<DashboardState>
  getWatchPaths(): readonly string[]
}
```

Two implementations:
- **MamhAdapter** (`src/lib/adapters/mamh.ts`) — reads `.mamh/` directory (registry, state, tickets, comms) + session JSONL files for real-time status
- **ClaudeCodeAdapter** (`src/lib/adapters/claude-code.ts`) — reads `~/.claude/` session JSONL files

Auto-detection in `src/app/api/events/route.ts`: if `MAMH_PROJECT_DIR/.mamh/` exists, use MAMH adapter; otherwise Claude Code adapter.

### Session reader (`src/lib/session-reader.ts`)

Reads Claude Code session JSONL files for real-time agent activity:
- **Location**: `~/.claude/projects/<encoded-project-path>/<session-id>.jsonl` (main) + `<session-id>/subagents/agent-*.jsonl` (subagents)
- **Status derivation**: File modification time — `<2min` = working, `2-5min` = completed, `>5min` = idle
- **Agent name extraction**: Parses `"You are **mamh-data-engineer**, ..."` from first user message (handles both plain and markdown bold)
- **Task extraction**: Reads `## Ticket M4-T02: ...` from prompt
- **Last action**: Reads last 16KB of active files for most recent tool_use call

### Central type: DashboardState

Defined in `src/types/index.ts`. All adapters produce this, all components consume it:

```
DashboardState
  |- agents: Agent[]         (id, role, status, color, sessionId)
  |- tickets: Ticket[]       (id, title, agentId, milestone, status)
  |- activity: ActivityEvent[] (timestamp, type, summary)
  |- project: ProjectState   (name, phase, milestone, ticketsSummary)
  |- resources: ResourceUsage (daily/weekly tokens, context window)
  |- messages: Message[]     (from, to, content)
  +- error: string | null
```

### UI layout (2x2 grid)

```
+---------------------+------------------+
|                     |  Monitor Panel   |
|   Agent Village     |  (task counts,   |
|   (canvas, 3fr)     |   usage bars,    |
|                     |   context gauge) |
+---------------------+------------------+
|   Ticket Tracker    |  Activity Log    |
|   (milestones,      |  (event feed,    |
|    click-to-expand) |   agent filter)  |
+---------------------+------------------+
```

### Village renderer (`src/components/village/renderer.ts`)

- Three zones always visible (Working, Idle, Done), side by side
- Empty zones rendered with 40% opacity
- Walking animations between zones using position tracking Map + easeInOut interpolation
- Status-specific animations: chopping/hammering/digging (working), Zzz (idle), sparkles (done)
- Lead agent gets a crown; all agents have colored hats matching their palette

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/types/index.ts` | All shared TypeScript interfaces |
| `src/lib/session-reader.ts` | Reads Claude JSONL for agent activity, task, last action |
| `src/lib/adapters/mamh.ts` | MAMH adapter — registry, tickets, comms, session matching |
| `src/lib/adapters/claude-code.ts` | Claude Code adapter for non-MAMH sessions |
| `src/lib/adapters/types.ts` | `DashboardAdapter` interface |
| `src/lib/watcher.ts` | Chokidar singleton + 15s periodic re-eval with status diffing |
| `src/lib/claude-stats.ts` | Reads `~/.claude/stats-cache.json` for token usage |
| `src/lib/sse.ts` | `useDashboardSSE()` client hook (EventSource + 30s auto-refresh) |
| `src/lib/constants.ts` | Agent colors, token limits, thresholds, intervals |
| `src/lib/format.ts` | `formatTokenCount`, `formatResetTimer`, `formatTimestamp` (date-aware) |
| `src/lib/mock-data.ts` | Realistic mock `DashboardState` (`USE_MOCK_DATA=true`) |
| `src/app/api/events/route.ts` | SSE endpoint, auto-selects adapter |
| `src/app/page.tsx` | 2x2 grid layout wiring all panels |
| `src/components/village/renderer.ts` | Zone-based canvas renderer with walking transitions |
| `src/components/village/village-canvas.tsx` | Canvas React component + animation loop |
| `src/components/tickets/ticket-tracker.tsx` | Milestone/ticket detail views with navigation |
| `src/components/activity/activity-event.tsx` | Event row with role tags + type icons |

## Conventions

- **Immutability**: All types use `readonly` properties. State objects are never mutated.
- **Adapter pattern**: Adding a new data source = implement `DashboardAdapter` interface.
- **Server/client split**: Adapters, watcher, session-reader are server-only. Components are `'use client'`.
- **Zod validation**: All JSON files from `.mamh/` are validated with zod schemas before use.
- **Canvas rendering**: All pixel art is programmatic (no external images). Zone-based renderer in `renderer.ts`.
- **Error handling**: File reads use `readFileSafe()` and `.catch(() => [])` patterns — missing files never crash.
- **Dark theme**: `bg-gray-950 text-gray-100` throughout. CSS vars in `globals.css`.
- **Sticky headers**: All panels use `flex h-full flex-col` with `shrink-0` header and `flex-1 overflow-y-auto` body.

## MAMH Agent Matching

MAMH registry uses names like `mamh-data-engineer`. Session JSONL files use hash-based `agentId` like `a1d8cc3`. The session reader extracts `agentName` from the prompt ("You are **mamh-data-engineer**, ...") and the MAMH adapter matches on `agentName` first, then falls back to `agentId`.

Compact session files (`agent-acompact-*.jsonl`) lose the original prompt, so `agentName` is null — these fall back to ticket-based status derivation.

## Testing

Tests live in `src/lib/__tests__/`. Run with `npm test`.

- `format.test.ts` — token formatting, timestamps, session ID truncation
- `adapters/mamh.test.ts` — both registry formats, missing `.mamh/` directory

Uses vitest with `vi.mock('fs/promises')` for file system mocking.

## Environment Variables

Set in `.env.local`:

| Variable | Default | Description |
|----------|---------|-------------|
| `MAMH_PROJECT_DIR` | `process.cwd()` | Project directory to monitor |
| `CLAUDE_HOME` | `~/.claude` | Claude home directory for stats |
| `USE_MOCK_DATA` | `false` | Use mock data instead of real files |

## Adding a New Adapter

1. Create `src/lib/adapters/my-adapter.ts` implementing `DashboardAdapter`
2. Update adapter selection logic in `src/app/api/events/route.ts`
3. Add watch paths for the new data source
4. Map source data to `DashboardState` types
