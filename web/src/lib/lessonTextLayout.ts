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
export type LessonActivity = { t: 'activity'; title: string | null; minutes: string | null; rows: LessonRow[]; notes: LeadBlock[] }
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
// lead-in on its own line, set bold by splitLead.
const ROLE = /^(teacher(?: prompt| says| does| moves)?|students?(?: task| do| does)?)\s*:\s*(.*)$/i

function roleOf(label: string): LessonRole {
  return label.toLowerCase().startsWith('teacher') ? 'teacher' : 'students'
}

function niceLabel(label: string): string {
  return label.trim().toLowerCase().startsWith('teacher') ? 'Teacher' : 'Students'
}

export function readHeading(line: string): { title: string; minutes: string } | null {
  const trimmed = line.trim()
  if (ROLE.test(trimmed)) return null
  for (const re of HEADING) {
    const m = trimmed.match(re)
    if (m) return { title: m[1].replace(/[:\s]+$/, '').trim(), minutes: m[2].replace(/\s+/g, '') }
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
      activity = { t: 'activity', title: heading.title, minutes: heading.minutes, rows: [], notes: [] }
      continue
    }
    // A role line says something: "Teacher:" left blank, or "Teacher: Ms.
    // Rivera", is a form field to fill in, not a line of the lesson.
    const roleMatch = line.match(ROLE)
    const role = roleMatch && roleMatch[2].trim().split(/\s+/).length >= 4 ? roleMatch : null
    if (role) {
      closeProse()
      if (!activity) activity = { t: 'activity', title: null, minutes: null, rows: [], notes: [] }
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
  // A phrase, not a single quoted word ("cells"), which is a term, not a line to say.
  const re = /("[^"\n]*\S\s+\S[^"\n]*"|“[^”\n]*\S\s+\S[^”\n]*”)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), quote: false })
    out.push({ text: m[0], quote: true })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), quote: false })
  return out
}
