import { textBlocks, type CopyBlock } from './lessonCopy'

// How a school-format section's text is laid out ON SCREEN. A section is one
// stored string ("Explore: Comparing specimens (10 min)\nTeacher: …\nStudents:
// …"), which used to be printed as one dense paragraph per activity. This
// reads the structure that is already in the words — activity titles with
// their minutes, Teacher / Students lines, a short lead-in before a colon — so
// the screen can show it. Copy, Word and Canvas still use the text as written:
// nothing here changes what leaves the page.

export type LessonRole = 'teacher' | 'students'
export type LessonRow = { role: LessonRole; label: string; blocks: CopyBlock[] }
/// Gradual release, when the activity is one of its three moves.
export type LessonPhase = 'i' | 'we' | 'you'
export type LessonActivity = {
  t: 'activity'
  title: string | null
  minutes: string | null
  phase: LessonPhase | null
  rows: LessonRow[]
  notes: LeadBlock[]
}
export type LessonProse = { t: 'prose'; blocks: LeadBlock[] }
export type LessonPart = LessonActivity | LessonProse
/// A paragraph may open with a short lead ("During the observation step,",
/// "Exit ticket:") that is worth setting apart; everything else is a block.
export type LeadBlock = CopyBlock | { t: 'lead'; lead: string; text: string }

const MINUTES = String.raw`(\d+(?:\s*[-–]\s*\d+)?)\s*(?:min|mins|minutes)\.?`
const HEADING = [
  new RegExp(String.raw`^(.{2,110}?)\s*[(\[]\s*${MINUTES}\s*[)\]]\s*:?\s*$`, 'i'),
  new RegExp(String.raw`^(.{2,110}?)\s*[—–-]\s*${MINUTES}\s*$`, 'i'),
  new RegExp(String.raw`^(.{2,110}?)\s*[:|,]\s*${MINUTES}\s*$`, 'i'),
]

// Only who does what. Any other label (Support:, Stretch:, Expected:) is a
// lead-in on its own line, set bold by splitLead. "T:", "S:" and "Ss:" are the
// shorthand many plans use; only in capitals, so a stray "s:" is not a role.
const ROLE = /^(teacher(?: prompt| says| does| moves| actions?| will| role)?|students?(?: task| do| does| actions?| will| role)?|T|S|Ss)\s*:\s*(.*)$/i
const SHORT_ROLE = /^(T|S|Ss)\s*:/

function matchRole(line: string): RegExpMatchArray | null {
  const m = line.match(ROLE)
  if (!m) return null
  if (m[1].length <= 2 && !SHORT_ROLE.test(line)) return null
  return m
}

/// Inside an activity, a sentence that opens with who does it ("Students
/// solve three problems…", "The teacher models…") is that person's line,
/// kept whole. Outside one it is just prose, so an objective such as
/// "Students will be able to…" is never turned into a line.
const SUBJECT = /^(?:the )?(teacher|students?)\s+(?!:)[a-z]/i

function roleOf(label: string): LessonRole {
  return label.toLowerCase().startsWith('t') ? 'teacher' : 'students'
}

// The named parts of a lesson: gradual release, the 5E model and the parts
// most school forms use. One of these at the start of a line, on its own or
// before a colon or dash, starts an activity even without minutes. ("Explain
// why a membrane…" is a sentence, not the Explain phase: it has no colon.)
const PHASE = /^(I do|We do|You do(?: together| alone| independently)?|Y['’]?all do|Do now|Warm[- ]?up|Hook|Launch|Engage|Explore|Explain|Elaborate|Extend|Evaluate|Mini[- ]?lesson|Direct instruction|Modell?ing|Guided practice|Independent practice|Work time|Closing|Closure|Wrap[- ]?up|Exit ticket)\b\s*(\([^)]*\))?\s*(?:([:–—-])\s*(.*))?$/i

export function phaseOf(title: string): LessonPhase | null {
  const t = title.trim().toLowerCase()
  if (/^i do\b/.test(t)) return 'i'
  if (/^we do\b/.test(t)) return 'we'
  if (/^(you do|y['’]?all do)\b/.test(t)) return 'you'
  return null
}

function niceLabel(label: string): string {
  return label.trim().toLowerCase().startsWith('t') ? 'Teacher' : 'Students'
}

export type Heading = { title: string; minutes: string | null; rest: string | null }

/// An activity's opening line: a title with its minutes, or a named lesson
/// part ("We Do", "Exit Ticket:"). When a part's name is followed by a whole
/// sentence ("I Do: Model the first problem aloud…"), the name is the title
/// and the sentence comes back as `rest`, the activity's first line.
export function readHeading(line: string): Heading | null {
  const trimmed = line.trim()
  if (matchRole(trimmed)) return null
  for (const re of HEADING) {
    const m = trimmed.match(re)
    if (m) return { title: m[1].replace(/[:\s]+$/, '').trim(), minutes: m[2].replace(/\s+/g, ''), rest: null }
  }
  const p = trimmed.match(PHASE)
  if (p && (p[3] || !p[4]) && !(p[3] === undefined && trimmed.length > p[1].length + (p[2]?.length ?? 0) + 1)) {
    const name = p[1].replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bDo\b/g, 'Do')
    const label = `${name}${p[2] ? ` ${p[2]}` : ''}`
    const rest = (p[4] ?? '').trim()
    if (!rest) return { title: label, minutes: null, rest: null }
    const short = rest.split(/\s+/).length <= 8 && !/[.!?]$/.test(rest)
    return short ? { title: `${label}: ${rest}`, minutes: null, rest: null } : { title: label, minutes: null, rest }
  }
  return null
}

/// "During the observation step, circulate…" → lead + rest; "Exit ticket
/// (used as …): In 2-3 sentences…" → lead + rest. Only short leads, so an
/// ordinary sentence that happens to contain a colon stays as it is.
export function splitLead(paragraph: string): LeadBlock {
  const during = paragraph.match(/^(During (?:the )?["“]?[^,]{2,60}?["”]? (?:step|part|activity|discussion|launch|share[- ]out),)\s+(.+)$/s)
  if (during) return { t: 'lead', lead: during[1], text: during[2] }
  const colon = paragraph.match(/^([^:.!?\n]{2,70}):\s+(.+)$/s)
  // Not before a quotation ("He said: "go now"" is a sentence, not a label),
  // and not when the lead is itself a long clause.
  if (colon && !/["“]/.test(colon[1]) && !/^["“]/.test(colon[2]) && colon[1].trim().split(/\s+/).length <= 9) {
    return { t: 'lead', lead: `${colon[1]}:`, text: colon[2] }
  }
  return { t: 'p', text: paragraph }
}

function proseOf(lines: string[]): LessonProse {
  const blocks = textBlocks(lines.join('\n')).flatMap((b): LeadBlock[] =>
    b.t === 'p' ? b.text.split('\n').map((line) => splitLead(line)) : [b],
  )
  return { t: 'prose', blocks }
}

/// The parts to draw for one section's text. A section with no activity titles
/// and no Teacher/Students lines comes back as prose only, which the screen
/// draws much as before, with leads set apart.
export function layoutLessonText(value: string | null | undefined): LessonPart[] {
  const text = (value ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) return []
  const lines = text.split('\n')
  const parts: LessonPart[] = []
  let prose: string[] = []
  let activity: LessonActivity | null = null
  let row: { role: LessonRole; label: string; lines: string[] } | null = null

  const closeRow = () => {
    if (activity && row) activity.rows.push({ role: row.role, label: row.label, blocks: textBlocks(row.lines.join('\n')) })
    row = null
  }
  const closeActivity = () => {
    closeRow()
    if (activity) parts.push(activity)
    activity = null
  }
  const closeProse = () => {
    if (prose.some((l) => l.trim())) parts.push(proseOf(prose))
    prose = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    const heading = readHeading(line)
    if (heading) {
      closeProse()
      closeActivity()
      activity = { t: 'activity', title: heading.title, minutes: heading.minutes, phase: phaseOf(heading.title), rows: [], notes: [] }
      if (heading.rest) {
        // "I Do: Teacher models…" — the sentence after the name is the first
        // line of the activity, and may itself name who does it.
        const inner = matchRole(heading.rest)
        const subject = heading.rest.match(SUBJECT)
        if (inner && inner[2].trim()) row = { role: roleOf(inner[1]), label: niceLabel(inner[1]), lines: [inner[2]] }
        else if (subject) row = { role: roleOf(subject[1]), label: niceLabel(subject[1]), lines: [heading.rest] }
        else activity.notes.push(splitLead(heading.rest))
      }
      continue
    }
    // A role line says something: "Teacher:" left blank, or "Teacher: Ms.
    // Rivera", is a form field to fill in, not a line of the lesson.
    const roleMatch = matchRole(line)
    const role = roleMatch && roleMatch[2].trim().split(/\s+/).length >= 3 ? roleMatch : null
    if (role) {
      closeProse()
      if (!activity) activity = { t: 'activity', title: null, minutes: null, phase: null, rows: [], notes: [] }
      closeRow()
      row = { role: roleOf(role[1]), label: niceLabel(role[1]), lines: role[2] ? [role[2]] : [] }
      continue
    }
    if (!line) {
      // A blank line ends an activity's last row but not the activity: what
      // follows a gap inside an activity is usually more of the same.
      if (row) closeRow()
      else if (!activity) prose.push('')
      continue
    }
    // A labelled line ("Look for: …") is its own entry, not more of the
    // Teacher or Students line above it.
    const labelled = (() => {
      const b = splitLead(line)
      return b.t === 'lead' && b.lead.endsWith(':')
    })()
    if (row && labelled) closeRow()
    const subject = activity && !labelled ? line.match(SUBJECT) : null
    if (subject) {
      closeRow()
      row = { role: roleOf(subject[1]), label: niceLabel(subject[1]), lines: [line] }
      continue
    }
    if (row) {
      row.lines.push(line)
    } else if (activity) {
      activity.notes.push(splitLead(line))
    } else {
      prose.push(line)
    }
  }
  closeActivity()
  closeProse()
  return parts
}

/// A teacher line's quoted words — what to actually say — set apart so the
/// eye can find them.
export function splitQuotes(text: string): { text: string; quote: boolean }[] {
  const out: { text: string; quote: boolean }[] = []
  // Something to say aloud, not a quoted term ("cells", "selectively
  // permeable"): three words or more, or a line that ends like speech.
  const spoken = (q: string) => q.slice(1, -1).trim().split(/\s+/).length >= 3 || /[?!.,]\s*$/.test(q.slice(1, -1))
  const re = /("[^"\n]+"|“[^”\n]+”)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (!spoken(m[0])) continue
    if (m.index! > last) out.push({ text: text.slice(last, m.index), quote: false })
    out.push({ text: m[0], quote: true })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), quote: false })
  return out
}
