/**
 * Reads Claude Code session JSONL files to determine agent activity.
 * Works for both MAMH (subagents in registry) and non-MAMH (Task tool subagents).
 *
 * Session structure:
 *   ~/.claude/projects/<encoded-project-path>/
 *     <session-id>.jsonl            ← main session
 *     <session-id>/subagents/       ← subagent sessions
 *       agent-<hash>.jsonl          ← each has agentId field
 */
import fs from 'fs/promises'
import path from 'path'
import { open } from 'fs/promises'

// Thresholds for status derivation from file modification time
const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000   // 2 minutes → working
const DONE_THRESHOLD_MS = 5 * 60 * 1000     // 5 minutes → done (celebration)
// Beyond DONE_THRESHOLD_MS → idle

export type SessionActivity = 'working' | 'completed' | 'idle'

export interface AgentSession {
  readonly agentId: string
  /** The agent name from the prompt (e.g. "mamh-eval-engineer"), distinct from agentId hash. */
  readonly agentName: string | null
  readonly sessionFile: string
  readonly lastModified: Date
  readonly activity: SessionActivity
  readonly model: string | null
  readonly role: string | null
  /** The ticket or task being worked on (e.g. "M4-T02: Wire Dataset Loaders"). */
  readonly currentTask: string | null
  /** Most recent tool call or action (e.g. "Edit src/data/pipeline.py"). */
  readonly lastAction: string | null
}

export interface MainSession {
  readonly sessionId: string
  readonly sessionFile: string
  readonly lastModified: Date
  readonly activity: SessionActivity
}

export interface SessionSnapshot {
  readonly mainSession: MainSession | null
  readonly subagents: readonly AgentSession[]
}

function deriveActivity(lastModified: Date): SessionActivity {
  const elapsed = Date.now() - lastModified.getTime()
  if (elapsed < ACTIVE_THRESHOLD_MS) return 'working'
  if (elapsed < DONE_THRESHOLD_MS) return 'completed'
  return 'idle'
}

/**
 * Read the first few lines from a JSONL file to extract metadata.
 * Reads only the first 8KB to stay fast on large files.
 */
async function readFirstMessage(filePath: string): Promise<{
  agentId: string | null
  agentName: string | null
  sessionId: string | null
  model: string | null
  role: string | null
  currentTask: string | null
}> {
  const result = { agentId: null as string | null, agentName: null as string | null, sessionId: null as string | null, model: null as string | null, role: null as string | null, currentTask: null as string | null }

  try {
    // Read only the first 8KB of the file
    const fh = await open(filePath, 'r')
    const buf = Buffer.alloc(8192)
    const { bytesRead } = await fh.read(buf, 0, 8192, 0)
    await fh.close()

    const chunk = buf.toString('utf-8', 0, bytesRead)
    const lines = chunk.split('\n').slice(0, 5)

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        if (msg.agentId && !result.agentId) {
          result.agentId = msg.agentId
        }
        if (msg.sessionId && !result.sessionId) {
          result.sessionId = msg.sessionId
        }
        if (msg.message?.model && !result.model) {
          result.model = msg.message.model
        }
        if (msg.message?.role === 'user' && !result.role) {
          const content = msg.message.content
          const text = typeof content === 'string'
            ? content
            : Array.isArray(content) && content[0]?.text
              ? content[0].text
              : ''
          // Match "You are mamh-data-engineer, ..." or "You are **mamh-data-engineer**, ..."
          const nameMatch = text.match(/You are \*{0,2}([\w-]+)\*{0,2},\s*(?:an?\s+)?(.+?)(?:\s+agent|\s+for|\s+specializ)/i)
          if (nameMatch) {
            if (!result.agentName) result.agentName = nameMatch[1]
            result.role = nameMatch[2]
          }
          // Extract ticket/task: "## Ticket M4-T02: Wire Dataset Loaders..."
          if (!result.currentTask) {
            const ticketMatch = text.match(/##\s+Ticket\s+(M\d+-T\d+):\s*(.+)/i)
            if (ticketMatch) {
              result.currentTask = `${ticketMatch[1]}: ${ticketMatch[2].trim()}`
            } else {
              // Generic task description from Task tool prompt
              const taskMatch = text.match(/(?:^|\n)(?:##\s+)?(?:Task|Goal|Description)[:\s]+(.{10,120})/i)
              if (taskMatch) {
                result.currentTask = taskMatch[1].trim().split('\n')[0]
              }
            }
          }
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file unreadable
  }

  return result
}

/**
 * Read the tail of a JSONL file to find the most recent tool call.
 * Returns a short description like "Edit src/data/pipeline.py" or "Bash: pytest tests/".
 */
async function readLastAction(filePath: string): Promise<string | null> {
  try {
    const fh = await open(filePath, 'r')
    const stat = await fh.stat()
    const tailSize = Math.min(16384, stat.size)
    const buf = Buffer.alloc(tailSize)
    const { bytesRead } = await fh.read(buf, 0, tailSize, Math.max(0, stat.size - tailSize))
    await fh.close()

    const chunk = buf.toString('utf-8', 0, bytesRead)
    const lines = chunk.split('\n')

    // Walk backwards to find the most recent tool_use
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim()
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        const content = msg.message?.content
        if (!Array.isArray(content)) continue

        for (const block of content) {
          if (block?.type !== 'tool_use') continue
          const tool = block.name ?? 'unknown'
          const inp = block.input ?? {}

          if (inp.file_path) {
            const short = inp.file_path.split('/').slice(-2).join('/')
            return `${tool} ${short}`
          }
          if (inp.command) {
            const cmd = (inp.command as string).slice(0, 80).split('\n')[0]
            return `Bash: ${cmd}`
          }
          if (inp.pattern) {
            return `${tool}: ${inp.pattern}`
          }
          if (inp.query) {
            return `${tool}: ${inp.query}`
          }
          return tool
        }

        // Also check for text summaries from the assistant
        if (msg.message?.role === 'assistant') {
          for (const block of content) {
            if (block?.type === 'text' && block.text?.length > 10) {
              const firstLine = block.text.trim().split('\n')[0].slice(0, 100)
              if (firstLine) return firstLine
            }
          }
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file unreadable
  }
  return null
}

function getProjectSessionDir(claudeHome: string, projectDir: string): string {
  const encoded = projectDir.replace(/\//g, '-')
  return path.join(claudeHome, 'projects', encoded)
}

/**
 * Find the most recently modified main session JSONL for this project.
 */
async function findActiveMainSession(sessionsDir: string): Promise<{
  sessionId: string
  filePath: string
  lastModified: Date
} | null> {
  const entries = await fs.readdir(sessionsDir).catch(() => [] as string[])

  let best: { sessionId: string; filePath: string; lastModified: Date } | null = null

  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue
    const filePath = path.join(sessionsDir, entry)
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat) continue

    if (!best || stat.mtime > best.lastModified) {
      best = {
        sessionId: entry.replace('.jsonl', ''),
        filePath,
        lastModified: stat.mtime,
      }
    }
  }

  return best
}

/**
 * Read all subagent sessions from the active main session's subagents directory.
 */
async function readSubagentSessions(sessionsDir: string, mainSessionId: string): Promise<AgentSession[]> {
  const subagentsDir = path.join(sessionsDir, mainSessionId, 'subagents')
  const files = await fs.readdir(subagentsDir).catch(() => [] as string[])

  const results: AgentSession[] = []
  // Process files newest first so we get the latest session for each agentId
  const fileStats: Array<{ file: string; mtime: Date }> = []

  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue
    const filePath = path.join(subagentsDir, file)
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat) continue
    fileStats.push({ file, mtime: stat.mtime })
  }

  // Sort newest first
  fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  const seenAgents = new Set<string>()

  for (const { file, mtime } of fileStats) {
    const filePath = path.join(subagentsDir, file)
    const meta = await readFirstMessage(filePath)
    const agentId = meta.agentId ?? file.replace('.jsonl', '')

    // Only keep the most recent session per agent
    if (seenAgents.has(agentId)) continue
    seenAgents.add(agentId)

    const activity = deriveActivity(mtime)
    // Only read last action for recently active sessions (avoid I/O on stale files)
    const lastAction = activity !== 'idle'
      ? await readLastAction(filePath)
      : null

    results.push({
      agentId,
      agentName: meta.agentName,
      sessionFile: filePath,
      lastModified: mtime,
      activity,
      model: meta.model,
      role: meta.role,
      currentTask: meta.currentTask,
      lastAction,
    })
  }

  return results
}

/**
 * Get a full snapshot of session activity for a project.
 */
export async function readSessionSnapshot(
  claudeHome: string,
  projectDir: string,
): Promise<SessionSnapshot> {
  const sessionsDir = getProjectSessionDir(claudeHome, projectDir)
  const main = await findActiveMainSession(sessionsDir)

  if (!main) {
    return { mainSession: null, subagents: [] }
  }

  const subagents = await readSubagentSessions(sessionsDir, main.sessionId)

  return {
    mainSession: {
      sessionId: main.sessionId,
      sessionFile: main.filePath,
      lastModified: main.lastModified,
      activity: deriveActivity(main.lastModified),
    },
    subagents,
  }
}
