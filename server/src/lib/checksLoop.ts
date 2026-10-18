import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { CfuLogEntry, Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import { fractionOf, mmss, placeWithWindow, teacherSpeech, windowRows, type Placed } from './heldOpen.ts'

// Whether each check for understanding was a real one: who it asked, and
// whether the teacher acted on what came back.
//
// A count of "does that make sense?" says little — students nod. A real
// check gets an answer from everyone, and the teacher does something with
// it: reteaches, regroups, or moves on because the room has it. Both halves
// are in the teacher's own words — "boards up", "show me on your fingers";
// "I'm seeing a lot of B's, let's go back" — so this needs no student voice.
//
// Classifies the lesson's existing checks (cfuLog) rather than finding new
// ones, as lib/heldOpen.ts does for questions. A check acted on silently —
// whiteboards scanned, plan changed without a word — leaves nothing to read,
// and the report says so.

/// How long after a check the teacher's response is looked for: scanning
/// boards or circulating can take a minute or two before anything is said.
export const CHECK_WINDOW_SEC = 150

export type CheckLoop = {
  /// everyone: every student had to show or say an answer (boards, fingers,
  ///   everyone writes, turn and tell a partner, an exit ticket).
  /// few: put to the room and answered by volunteers or one named student.
  /// asked_if_understood: asked whether they understood ("does that make
  ///   sense?", "any questions?", "everyone good?").
  /// not_a_check: not a check after all — rhetorical, logistics, a direction.
  who: 'everyone' | 'few' | 'asked_if_understood' | 'not_a_check'
  /// Where the teacher acted on what came back: adjusted (reteach, go back,
  /// regroup, address what they saw) or confirmed (said the room had it and
  /// moved on because of it). Null when nothing said shows they did.
  acted: { how: 'adjusted' | 'confirmed'; text: string | null; atSec: number } | null
}

type PreparedCheck = Placed & { n: number; i: number; text: string }

export function prepareChecks(cfuLog: CfuLogEntry[], segments: Segment[]): PreparedCheck[] {
  const speech = teacherSpeech(segments)
  const out: PreparedCheck[] = []
  cfuLog.forEach((entry, i) => {
    const placed = placeWithWindow(entry.text, entry.timestampSec, speech, CHECK_WINDOW_SEC)
    if (placed) out.push({ n: out.length + 1, i, text: entry.text, ...placed })
  })
  return out
}

const SYSTEM_PROMPT = `You are reading short stretches of a classroom recording. Each starts with a moment where the teacher checked for understanding (C), followed by the teacher's numbered lines (L) and marks where someone else spoke. L0, when present, is what the teacher said right after it in the same breath. "…" inside a line marks words left out because they may be someone else's.

For each check, do two things.

1. WHO. Say who the check asked:
- everyone — every student has to show or say an answer: "boards up", "show me on your fingers", "thumbs up or down", "everyone write one sentence", "turn and tell your partner", "everyone say it together", an exit ticket.
- few — put to the room and answered by volunteers or by one named student: "who can tell me…", "Jayden, what do you think?".
- asked_if_understood — asks whether they understand rather than for an answer: "does that make sense?", "any questions?", "everyone good?", "are we clear?".
- not_a_check — not a check after all: rhetorical and talked straight through, logistics, a direction, or asking one student for help.
If not_a_check, write nothing more for that check.

2. ACTED. Find the teacher's first line that shows they acted on what the check showed them, if any:
- adjusted — they respond to what they saw or heard and change course: reteach, go back, explain again a different way, regroup or pull a group, or address a mistake they noticed ("I'm seeing a lot of B's, let's look at this again", "a few of you are mixing up…").
- confirmed — they say the room has it and move on because of that ("looks like most of you got it, let's keep going", "good, everyone has it").
A plain "okay", moving on without referring to what came back, or praising one student's answer is NOT acting on the check. If no line shows it, write nothing for ACTED.
For acted, copy the words that show it, under 15 words, EXACTLY as written in that line.

Write nothing outside this tag:
<checks>
C1 | everyone
L3 | adjusted | I'm seeing a lot of B's, let's look at this again
C2 | asked_if_understood
C3 | few
L1 | confirmed | good, looks like you've got it
C4 | not_a_check
</checks>`

export function checksPrompt(checks: PreparedCheck[]): string {
  return checks.map((c) => [`C${c.n} [${mmss(c.startSec)}] ${c.text}`, ...windowRows(c)].join('\n')).join('\n\n')
}

const WHO = ['everyone', 'few', 'asked_if_understood', 'not_a_check'] as const

/// The read's answer, one CheckLoop per check it covered. A check it said
/// nothing about is absent and stays unread.
export function parseChecks(text: string, checks: PreparedCheck[]): Map<number, CheckLoop> {
  const out = new Map<number, CheckLoop>()
  const body = extractTag(text, 'checks')
  if (!body) return out
  type Block = { n: number; who: CheckLoop['who']; acted: string[] | null }
  let current: Block | null = null
  const blocks: Block[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    const c = line.match(/^C(\d+)\s*\|\s*([\w-]+)/i)
    if (c) {
      const who = WHO.find((w) => w === c[2].toLowerCase().replace(/-/g, '_'))
      current = who ? { n: Number(c[1]), who, acted: null } : null
      if (current) blocks.push(current)
      continue
    }
    if (current && !current.acted && /^L\d+\s*\|/i.test(line)) current.acted = line.split('|').map((p) => p.trim())
  }
  for (const block of blocks) {
    const check = checks.find((c) => c.n === block.n)
    if (!check || out.has(check.n)) continue
    if (block.who === 'not_a_check' || !block.acted) {
      out.set(check.n, { who: block.who, acted: null })
      continue
    }
    const [lRef, howRaw = '', ...rest] = block.acted
    const line = check.lines.find((l) => l.n === Number(lRef.replace(/^L/i, '')))
    const how = howRaw.toLowerCase().includes('adjust') ? 'adjusted' : howRaw.toLowerCase().includes('confirm') ? 'confirmed' : null
    if (!line || !how) {
      out.set(check.n, { who: block.who, acted: null })
      continue
    }
    const phrase = rest.join('|').trim().replace(/^["“]|["”]$/g, '')
    const where = phrase ? fractionOf(phrase, line.text) : null
    out.set(check.n, {
      who: block.who,
      acted: {
        how,
        text: where ? phrase : null,
        atSec: Math.round((line.startSec + (line.endSec - line.startSec) * (where?.from ?? 0)) * 10) / 10,
      },
    })
  }
  return out
}

/// The checks log with `loop` on every check the read covered. Null when the
/// read failed, so a caller keeps what it had.
export async function readChecksLoop(
  cfuLog: CfuLogEntry[],
  segments: Segment[],
): Promise<(CfuLogEntry & { loop?: CheckLoop })[] | null> {
  const checks = prepareChecks(cfuLog, segments)
  if (checks.length === 0) return cfuLog
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: checksPrompt(checks) }],
    })
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    const loops = parseChecks(text, checks)
    return cfuLog.map((entry, i) => {
      const c = checks.find((x) => x.i === i)
      const loop = c ? loops.get(c.n) : undefined
      return loop ? { ...entry, loop } : entry
    })
  } catch (error) {
    console.error('[checksLoop] read failed:', error)
    return null
  }
}
