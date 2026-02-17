# Multi-Agent Dashboard

> **tl;dr** — Real-time monitoring dashboard for AI agent teams. Point it at a Claude Code project and watch a pixel-art "Agent Village" where characters walk between Working/Idle/Done zones as agents run. Includes ticket tracking, token usage monitoring, and a live activity log. Works with both [Takt](https://github.com/byseon/Takt) multi-agent orchestration and standalone Claude Code sessions.

## How It Works

```
Session JSONL files (Claude Code / Takt)
  -> chokidar file watcher (100ms debounce + 15s re-eval)
  -> DashboardAdapter.readState() -> DashboardState
  -> SSE stream (/api/events)
  -> EventSource in browser
  -> React components re-render
```

Agent status is derived from session file modification times: actively writing = **working**, quiet for 2-5 min = **completed**, quiet for 5+ min = **idle**. No agent-side instrumentation needed — it reads what Claude Code already writes.

## Features

- **Agent Village** — pixel-art canvas with three zones (Working, Idle, Done). Characters walk between zones with smooth transitions. Working agents chop/hammer/dig, idle agents sleep with Zzz, done agents celebrate with sparkles. Lead agent wears a crown.
- **Ticket Tracker** — milestone progress bars with click-to-expand ticket details. Tracks which agent is working on what.
- **Monitor Panel** — task counts (Working / Waiting / Completed), Claude Max daily/weekly token usage bars with threshold markers, context window gauge with color zones.
- **Activity Log** — timestamped event feed with role tags, type icons, per-agent filtering, and smart auto-scroll. Shows current task and last tool call for each agent.
- **Dual adapter support** — auto-detects Takt projects (reads `.takt/` state files) vs plain Claude Code (reads `~/.claude/` session data).
- **Real-time updates** — file system watching via chokidar, SSE streaming to browser, 15s periodic re-evaluation for time-based status transitions, 30s auto-refresh fallback.

## Quick Start

```bash
npm install

# Option 1: Mock data (no live project needed)
USE_MOCK_DATA=true npm run dev

# Option 2: Monitor a real project
cp .env.local.example .env.local   # edit TAKT_PROJECT_DIR
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

Create `.env.local` in the project root:

```bash
# Project directory to monitor.
# If it contains .takt/, the Takt adapter is used.
# Otherwise, the Claude Code adapter reads session data from CLAUDE_HOME.
TAKT_PROJECT_DIR=/path/to/your/project

# Claude home directory (default: ~/.claude)
CLAUDE_HOME=~/.claude

# Use mock data instead of real files (default: false)
USE_MOCK_DATA=false
```

### Adapter auto-detection

| Condition | Adapter | Data sources |
|-----------|---------|-------------|
| `TAKT_PROJECT_DIR/.takt/` exists | `TaktAdapter` | registry.json, takt-state.json, tickets/\*.md, comms/\*, session JSONL, stats-cache.json |
| No `.takt/` directory | `ClaudeCodeAdapter` | ~/.claude/projects/\*/\*.jsonl, stats-cache.json |

### Agent status lifecycle

| Elapsed since last write | Status | Village zone |
|--------------------------|--------|-------------|
| < 2 minutes | `working` | Working (tools animation) |
| 2-5 minutes | `completed` | Done (sparkles) |
| > 5 minutes | `idle` | Idle (Zzz) |

## UI Layout

```
+---------------------+------------------+
|                     |  Monitor Panel   |
|   Agent Village     |  (task counts,   |
|   (pixel-art        |   token usage,   |
|    canvas)          |   context gauge) |
+---------------------+------------------+
|   Ticket Tracker    |  Activity Log    |
|   (milestones,      |  (event feed,    |
|    click-to-expand) |   agent filter)  |
+---------------------+------------------+
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm test` | Run unit tests (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with Next.js ESLint |

## Tech Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript 5.7**
- **Tailwind CSS 4** (CSS-first config via `@tailwindcss/postcss`)
- **chokidar 4** — file system watching
- **zod 3** — runtime schema validation
- **HTML5 Canvas** — programmatic pixel art (no external images)
- **vitest** — unit testing

## Project Structure

```
src/
  app/
    api/events/route.ts     # SSE endpoint (auto-selects adapter)
    layout.tsx              # Root layout (dark theme)
    page.tsx                # 2x2 grid wiring all panels
    globals.css             # Tailwind + CSS vars
  components/
    village/
      village-canvas.tsx    # Canvas component + animation loop
      renderer.ts           # Zone-based renderer with walking transitions
    monitor/
      monitor-panel.tsx     # Task counts, usage bars, context gauge
      task-summary.tsx
      usage-bar.tsx
      context-gauge.tsx
    activity/
      activity-panel.tsx    # Event feed with filter + auto-scroll
      activity-event.tsx
      agent-filter.tsx
    tickets/
      ticket-tracker.tsx    # Milestone/ticket detail views
    connection-badge.tsx    # Online/Offline SSE indicator
    loading-screen.tsx      # Initial loading state
    error-boundary.tsx      # React error boundary
  lib/
    adapters/
      types.ts              # DashboardAdapter interface
      takt.ts               # Takt adapter
      claude-code.ts        # Claude Code adapter
    session-reader.ts       # Reads Claude JSONL for agent activity
    claude-stats.ts         # Reads stats-cache.json for token usage
    watcher.ts              # Chokidar singleton + periodic re-eval
    sse.ts                  # useDashboardSSE() client hook
    format.ts               # Token/time formatting utilities
    constants.ts            # Colors, limits, thresholds
    mock-data.ts            # Realistic mock DashboardState
    __tests__/              # Unit tests
  types/
    index.ts                # All shared TypeScript interfaces
```

## Architecture

### Adapter pattern

All data reading goes through the `DashboardAdapter` interface:

```typescript
interface DashboardAdapter {
  readonly name: string
  readState(): Promise<DashboardState>
  getWatchPaths(): readonly string[]
}
```

Two implementations exist: `TaktAdapter` for Takt-orchestrated projects and `ClaudeCodeAdapter` for standalone Claude Code sessions. Adding a new data source means implementing this interface and updating the auto-detection logic in the SSE route.

### Session reader

Reads Claude Code session JSONL files for real-time agent activity:
- **Location**: `~/.claude/projects/<encoded-project-path>/<session-id>.jsonl` (main) + `<session-id>/subagents/agent-*.jsonl` (subagents)
- **Agent name extraction**: Parses `"You are **takt-data-engineer**, ..."` from first user message
- **Task extraction**: Reads `## Ticket M4-T02: ...` from prompt
- **Last action**: Reads last 16KB of active files for most recent tool_use call

### Takt data formats

The Takt adapter handles two registry formats:

**Array format:**
```json
{ "agents": [{ "id": "takt-data-engineer", "role": "...", "modelTier": "sonnet" }] }
```

**Object format:**
```json
{ "agents": { "takt-ml-scientist": { "role": "...", "model": "opus" } } }
```

Both are normalized to a unified `Agent[]` via zod schema validation.

## Adding a New Adapter

1. Create `src/lib/adapters/my-adapter.ts` implementing `DashboardAdapter`
2. Update adapter selection logic in `src/app/api/events/route.ts`
3. Add watch paths for the new data source
4. Map source data to `DashboardState` types

## License

MIT
