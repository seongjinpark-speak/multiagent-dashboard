# STATUS.md — Latest Updates

## Session: 2026-02-12

### Session-Based Agent Status (Major)

Replaced JSON-only status derivation with real-time Claude session JSONL reading.

- **`src/lib/session-reader.ts`** (new) — Reads `~/.claude/projects/<encoded-path>/<session-id>.jsonl` and `<session-id>/subagents/agent-*.jsonl` to derive agent activity from file modification times.
- **Status lifecycle**: `working` (< 2 min since last write) -> `completed` (2-5 min) -> `idle` (> 5 min)
- **Agent name extraction**: Parses `"You are **mamh-data-engineer**, ..."` from the first user message in JSONL to match subagent session hashes to MAMH registry names.
- **Task extraction**: Reads `## Ticket M4-T02: ...` from the prompt for currentTask.
- **Last action**: Reads last 16KB of active session files to extract the most recent tool call (e.g., `Edit loaders/timit_loader.py`).

### Done -> Idle Lifecycle

- **`src/lib/watcher.ts`** — Added 15-second periodic re-evaluation timer. Re-reads adapter state even when no files change, but only emits SSE updates when agent statuses actually differ (via `hasStatusChanged` diffing).
- Agents now walk from Done zone to Idle zone automatically when the 5-minute threshold is crossed.

### Agent Name Matching Fix

- **Root cause**: Session JSONL files use hash-based `agentId` (e.g., `a1d8cc3`) while MAMH registry uses full names (e.g., `mamh-eval-engineer`). Previous lookup always missed.
- **Fix**: `session-reader.ts` now extracts `agentName` from the `"You are X, ..."` prompt. MAMH adapter matches on `agentName` first, falls back to `agentId` hash.
- **Regex fix**: Updated pattern to handle markdown bold (`**name**`) and "specializing in" prompt variants.

### Activity Log Improvements

- **File-based timestamps**: Comms output files now use `stat.mtime` instead of missing `Date` fields or `new Date()` fallback. Decisions use file mtime when header has date-only format.
- **Date display**: `formatTimestamp` now shows `Feb 11 14:47:35` for non-today events, just `14:47:35` for today.
- **Session activity events**: New `buildSessionActivityEvents()` generates rich activity entries from session data, including lead orchestrator status and subagent task/action details.
- **Role tags**: Activity events show `[data-eng][mamh-data-engineer]` with short role prefix in blue.

### 2x2 Grid Layout

- **`src/app/page.tsx`** — Restructured from 60/40 split to `grid-cols-[3fr_2fr] grid-rows-2`: Village (top-left), Monitor (top-right), Tickets (bottom-left), Activity (bottom-right).
- All panels have sticky headers with scrollable content areas.

### Village Renderer

- **`src/components/village/renderer.ts`** — Zone-based renderer always shows all 3 zones (Working, Idle, Done). Empty zones render with 40% opacity.
- Walking animations between zones with easeInOut interpolation over 90 frames (~1.5s).
- Zone labels use white text with drop shadow for readability on any background.
- Deleted old files: `sprites.ts`, `layout.ts`, `environment.ts`, `animation.ts`.

### Ticket Tracker

- **`src/components/tickets/ticket-tracker.tsx`** (new) — Click-to-expand milestone/ticket detail views with [Home] navigation.
- Milestone completion cross-referencing from `mamh-state.json` `milestoneCompletions` field.
- Fixed ticket filename parsing for `M2-T01.md` patterns and `M1.json` inline milestone files.

### Claude Stats Fix

- **`src/lib/claude-stats.ts`** — Falls back to `lastComputedDate` data when today has no entries in `stats-cache.json`.

### SSE Auto-Refresh

- **`src/lib/sse.ts`** — 30-second auto-refresh: if no SSE events received for 30s, client reconnects to get fresh state.

### Files Changed

| File | Change |
|------|--------|
| `src/lib/session-reader.ts` | New — session JSONL reader with agentName, currentTask, lastAction |
| `src/lib/watcher.ts` | Added periodic re-evaluation timer + status diffing |
| `src/lib/adapters/mamh.ts` | Session-based status, agentName matching, milestone completions, activity enrichment |
| `src/lib/adapters/claude-code.ts` | Rewritten to use session reader, rich activity summaries |
| `src/lib/claude-stats.ts` | Stale data fallback |
| `src/lib/format.ts` | Date-aware timestamp formatting |
| `src/lib/constants.ts` | Added PERIODIC_REEVAL_MS |
| `src/lib/sse.ts` | 30s auto-refresh |
| `src/app/page.tsx` | 2x2 grid layout |
| `src/components/village/renderer.ts` | New zone-based renderer with walking transitions |
| `src/components/village/village-canvas.tsx` | Rewritten to use renderer.ts |
| `src/components/tickets/ticket-tracker.tsx` | New — milestone/ticket detail views |
| `src/components/activity/activity-event.tsx` | Role tags, type icons, agent prefix stripping |
| `src/components/activity/activity-panel.tsx` | Sticky header, passes agents for role lookup |
| `src/components/monitor/monitor-panel.tsx` | Sticky header |

### Known Limitations

- Compact session files (`agent-acompact-*.jsonl`) lose the original prompt, so `agentName` is null. These fall back to ticket-based status.
- Some MAMH registry names may differ from session prompt names if the registry was updated (e.g., `mamh-eval-engineer` in session vs `mamh-eval-scientist` in registry).
- Milestone completion timestamps from `mamh-state.json` use midnight UTC values — no time-of-day precision.
