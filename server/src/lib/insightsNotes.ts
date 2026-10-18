import { createHash } from 'node:crypto'
import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import { addressedNames, type Segment } from './audioAnalysis.ts'
import { flattenTeacherSpeech, normalizeForMatch } from './lessonObjective.ts'

// The coach notes for the v3 Insights page: per section, a warm lead, a
// little more behind "Read more", one thing to keep and one to try — with the
// line it is about rewritten.
//
// Written from the findings and their quotes ONLY. The page computes those
// (web/src/lib/insightsModel.ts) and sends them; nothing here sees the
// transcript beyond the quotes, so a note can only speak to what the page
// shows. Every note is then checked before it is stored, and one that fails is
// written again once and otherwise replaced by a plain sentence from the top
// finding. A note that says something the evidence does not is worse than a
// plain one.

/// Bumped when the prompt or the checks change, so stored notes are rewritten.
export const NOTES_VERSION = 7

export const SECTION_KEYS = ['talk_pace', 'questioning', 'clarity', 'climate', 'content_lens'] as const
export type SectionKey = (typeof SECTION_KEYS)[number]

export type NotesEvidence = {
  id: string
  tag: string
  polarity: 'strength' | 'growth' | 'neutral'
  quote: string
  /// m:ss
  time: string
  /// A specialist's reading of the line, for content notes.
  why?: string
}

export type NotesFinding = {
  key: string
  label: string
  state: 'measured' | 'confirmed_none' | 'unavailable'
  value: string | null
  caveat?: string
  evidence: NotesEvidence[]
}

export type NotesSection = {
  key: SectionKey
  title: string
  context?: string
  findings: NotesFinding[]
  /// Content Lens only: the general "where students often get stuck" items,
  /// in order, so a note can link one to the line it bears on.
  stuck?: string[]
}
export type NotesInput = { sections: NotesSection[] }

export type SectionNote = {
  lead: string | null
  more: string[]
  findingRefs: string[]
  keep: { evidenceId: string; text: string } | null
  try: { evidenceId: string; text: string; rewrite: string } | null
  /// A general "where students get stuck" item and the Take it further line
  /// it bears on. Content Lens only.
  guidanceLinks: { stuckIndex: number; evidenceId: string }[]
  /// 'template' when the written note failed its checks twice.
  source: 'model' | 'template' | 'unavailable'
}

export type InsightsNotes = {
  version: number
  inputHash: string
  generatedAt: string
  sections: Record<SectionKey, SectionNote>
}

// --- the input --------------------------------------------------------------

const LIMITS = { findings: 10, evidence: 8, text: 400, label: 80 }

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null
}

/// The page's findings, checked for shape and size. Anything malformed is
/// dropped rather than passed to the model.
export function parseNotesInput(body: unknown): NotesInput | { error: string } {
  const raw = (body ?? {}) as { sections?: unknown }
  if (!Array.isArray(raw.sections)) return { error: 'sections missing' }
  const sections: NotesSection[] = []
  for (const s of raw.sections as Record<string, unknown>[]) {
    const key = s?.key as SectionKey
    if (!SECTION_KEYS.includes(key) || sections.some((x) => x.key === key)) continue
    const findings: NotesFinding[] = []
    for (const f of (Array.isArray(s.findings) ? s.findings : []).slice(0, LIMITS.findings) as Record<string, unknown>[]) {
      const fkey = str(f?.key, 40)
      const label = str(f?.label, LIMITS.label)
      const state = f?.state
      if (!fkey || !/^[a-z_]+$/.test(fkey) || !label) continue
      if (state !== 'measured' && state !== 'confirmed_none' && state !== 'unavailable') continue
      const evidence: NotesEvidence[] = []
      for (const e of (Array.isArray(f.evidence) ? f.evidence : []).slice(0, LIMITS.evidence) as Record<string, unknown>[]) {
        const id = str(e?.id, 60)
        const quote = str(e?.quote, LIMITS.text)
        const time = typeof e?.time === 'string' && /^\d{1,3}:\d{2}$/.test(e.time) ? e.time : null
        const polarity = e?.polarity
        if (!id || !quote || !time || (polarity !== 'strength' && polarity !== 'growth' && polarity !== 'neutral')) continue
        evidence.push({
          id,
          tag: str(e.tag, LIMITS.label) ?? '',
          polarity,
          quote,
          time,
          ...(str(e.why, LIMITS.text) ? { why: str(e.why, LIMITS.text)! } : {}),
        })
      }
      findings.push({
        key: fkey,
        label,
        state,
        value: str(f.value, 60),
        ...(str(f.caveat, 120) ? { caveat: str(f.caveat, 120)! } : {}),
        evidence,
      })
    }
    const stuck = (Array.isArray(s.stuck) ? s.stuck : []).slice(0, 3).map((x) => str(x, LIMITS.text)).filter((x): x is string => !!x)
    sections.push({
      key,
      title: str(s.title, 60) ?? key,
      ...(str(s.context, LIMITS.text) ? { context: str(s.context, LIMITS.text)! } : {}),
      findings,
      ...(key === 'content_lens' && stuck.length > 0 ? { stuck } : {}),
    })
  }
  return sections.length > 0 ? { sections } : { error: 'no usable sections' }
}

/// Every quote checked against the teacher's own speech in this lesson before
/// the model sees it. The page already did this; the server does not take its
/// word for it, because what the model is given is what a note can quote.
export function keepTeacherQuotes(input: NotesInput, segments: Segment[]): NotesInput {
  const { flat } = flattenTeacherSpeech(segments)
  return {
    sections: input.sections.map((s) => ({
      ...s,
      findings: s.findings.map((f) => ({
        ...f,
        evidence: f.evidence.filter((e) => flat.includes(normalizeForMatch(e.quote))),
      })),
    })),
  }
}

/// The same findings always give the same hash, so notes are written once and
/// rewritten only when what they are about changes.
export function hashNotesInput(input: NotesInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16)
}

// --- the checks -------------------------------------------------------------

export const LEAD_MAX_WORDS = 35
export const MORE_MAX_WORDS = 120
export const KEEP_TRY_MAX_WORDS = 25
export const REWRITE_MAX_WORDS = 30

const BANNED = /\b(poor|poorly|weak|weakness|failed|fail(?:s|ing)?|should have|ineffective|lacked|lacking|struggled|struggling)\b/i
/// Claims about students' minds or experience. Allowed in general guidance,
/// never in a note about this lesson.
const STUDENT_STATE =
  /\bstudents?\s+(?:were|was|felt|feel|seemed|seem|understood|understand|engaged|enjoyed|learned|got it|grasped|loved|were confused|were bored)\b/i
/// What this report does not measure, so a note may not speak to it.
const UNMEASURED =
  /\b(?:student (?:voice|talk|participation)|room (?:in the lesson )?for students?|students? (?:had|got) (?:room|space|the floor)|(?:floor|question) stayed open|stayed open|landed with)\b/i
const RUBRIC = /\b(?:domain|component)\s+\d|\b[1-4][a-f]\b/i

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/// Curly and straight quotes and apostrophes, spacing, and letter case treated
/// as the same. Case because a quote picked up mid-sentence starts in lower
/// case ("that one just takes longer") where the line starts a sentence; every
/// word and its order still has to match.
function canon(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase()
}

/// Text inside quotation marks, two words or more — a quoted single word is a
/// term, not a claim about speech.
export function quotedSpans(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/[“"]([^”"]+)[”"]/g)) {
    const span = m[1].trim().replace(/[.,;:!?…]+$/, '')
    if (words(span) >= 2) out.push(span)
  }
  return out
}

function numbersIn(text: string): string[] {
  // Times first, so "13:08" is one token and not 13 and 08.
  return [...text.matchAll(/\d{1,3}:\d{2}|\d+(?:\.\d+)?/g)].map((m) => m[0])
}

/// What is wrong with a section's note, or nothing.
export function checkSectionNote(note: SectionNote, section: NotesSection): string[] {
  const errors: string[] = []
  const evidence = section.findings.flatMap((f) => f.evidence)
  const byId = new Map(evidence.map((e) => [e.id, e]))
  const quotes = evidence.map((e) => canon(e.quote))
  const keys = new Set(section.findings.map((f) => f.key))

  const prose = [note.lead ?? '', ...note.more, note.keep?.text ?? '', note.try?.text ?? '']
  const proseText = prose.join(' ')

  if (!note.lead && !sectionUnavailable(section)) errors.push('no lead, though the section has findings')
  if (note.lead && words(note.lead) > LEAD_MAX_WORDS) errors.push(`lead is ${words(note.lead)} words`)
  // A note that stops mid-sentence passed every other check once
  // ("…including inviting a student to").
  for (const text of [note.lead ?? '', ...note.more]) {
    if (text && !/[.!?…]["”’)]*$/.test(text.trim())) errors.push(`does not end as a sentence: "${text.slice(-30)}"`)
  }
  if (note.more.length > 2) errors.push(`${note.more.length} paragraphs behind Read more`)
  if (words(note.more.join(' ')) > MORE_MAX_WORDS) errors.push(`Read more is ${words(note.more.join(' '))} words`)
  if (note.lead && note.findingRefs.length === 0) errors.push('no finding_refs')
  for (const ref of note.findingRefs) if (!keys.has(ref)) errors.push(`unknown finding_ref ${ref}`)

  for (const span of [...prose, note.try?.rewrite ?? ''].flatMap(quotedSpans)) {
    // The rewrite is a suggested line, not a quote of the teacher, and may
    // contain dialogue of its own; only the prose has to quote exactly.
    if (note.try?.rewrite && note.try.rewrite.includes(span)) continue
    if (!quotes.some((q) => q.includes(canon(span)))) errors.push(`quote not in the evidence: "${span}"`)
  }

  // Numbers: from the findings this note refers to, or a time on one of the
  // section's lines. The rewrite is exempt — "finish in 8 minutes" is advice.
  const referenced = section.findings.filter((f) => note.findingRefs.includes(f.key))
  const allowed = new Set([
    ...referenced.flatMap((f) => numbersIn(`${f.value ?? ''} ${f.caveat ?? ''} ${f.label}`)),
    ...numbersIn(section.context ?? ''),
    ...evidence.map((e) => e.time),
    ...evidence.flatMap((e) => numbersIn(e.quote)),
    // A line's own label: "232 words a minute" on a fast stretch.
    ...evidence.flatMap((e) => numbersIn(e.tag)),
  ])
  for (const n of numbersIn(proseText)) if (!allowed.has(n)) errors.push(`number ${n} is not in the findings`)

  for (const text of [...prose, note.try?.rewrite ?? '']) {
    const banned = text.match(BANNED)
    if (banned) errors.push(`banned word "${banned[0]}"`)
    const state = text.match(STUDENT_STATE)
    if (state) errors.push(`claim about students: "${state[0]}"`)
    if (RUBRIC.test(text)) errors.push('rubric code')
    const unmeasured = text.match(UNMEASURED)
    if (unmeasured) errors.push(`speaks to something not measured: "${unmeasured[0]}"`)
  }

  // A student named in a note — even inside a quote of the teacher calling on
  // them — is a child's name in a document about someone else's teaching.
  const names = addressedNames(evidence.map((e) => e.quote))
  for (const text of [...prose, note.try?.rewrite ?? '']) {
    for (const name of names) {
      if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) errors.push(`names a student: ${name}`)
    }
  }

  if (note.keep) {
    const e = byId.get(note.keep.evidenceId)
    if (!e) errors.push('keep points at no evidence')
    else if (e.polarity === 'growth') errors.push('keep points at a growth line')
    if (words(note.keep.text) > KEEP_TRY_MAX_WORDS) errors.push('keep is too long')
  }
  if (note.try) {
    const e = byId.get(note.try.evidenceId)
    if (!e) errors.push('try points at no evidence')
    if (words(note.try.text) > KEEP_TRY_MAX_WORDS) errors.push('try is too long')
    if (words(note.try.rewrite) > REWRITE_MAX_WORDS) errors.push('rewrite is too long')
    if (e && canon(note.try.rewrite) === canon(e.quote)) errors.push('rewrite repeats the line')
    // A Try that only restates a specialist note already on the page says it twice.
    if (evidence.some((x) => x.why && canon(x.why) === canon(note.try!.text))) errors.push('try repeats a note')
  }
  return errors
}

/// A Keep or Try that points at the wrong kind of line, or at none, is dropped
/// rather than sinking the whole note: the page then shows its own Keep or
/// Try for that section, and the wrong pointer is never shown.
export function dropBadPointers(note: SectionNote, section: NotesSection): SectionNote {
  const byId = new Map(section.findings.flatMap((f) => f.evidence).map((e) => [e.id, e]))
  const keepLine = note.keep ? byId.get(note.keep.evidenceId) : undefined
  const tryLine = note.try ? byId.get(note.try.evidenceId) : undefined
  // A link holds only between a real stuck item and a real Take it further
  // line, once each; anything else is dropped and the two show unlinked.
  const further = new Set(section.findings.find((f) => f.key === 'take_it_further')?.evidence.map((e) => e.id) ?? [])
  const usedStuck = new Set<number>()
  const usedLine = new Set<string>()
  const guidanceLinks = (note.guidanceLinks ?? []).filter((l) => {
    const ok =
      Number.isInteger(l.stuckIndex) &&
      l.stuckIndex >= 0 &&
      l.stuckIndex < (section.stuck?.length ?? 0) &&
      further.has(l.evidenceId) &&
      !usedStuck.has(l.stuckIndex) &&
      !usedLine.has(l.evidenceId)
    if (ok) {
      usedStuck.add(l.stuckIndex)
      usedLine.add(l.evidenceId)
    }
    return ok
  })
  return {
    ...note,
    keep: note.keep && keepLine && keepLine.polarity !== 'growth' ? note.keep : null,
    try: note.try && tryLine ? note.try : null,
    guidanceLinks,
  }
}

/// Nothing to write about: every finding unavailable.
export function sectionUnavailable(section: NotesSection): boolean {
  return section.findings.length === 0 || section.findings.every((f) => f.state === 'unavailable')
}

/// The plain sentence a section gets when its note fails twice: the top
/// finding, as it is on the page.
export function templateNote(section: NotesSection): SectionNote {
  const top = section.findings.find((f) => f.state === 'measured' && f.value) ?? section.findings.find((f) => f.value)
  return {
    lead: top ? `${top.label}: ${top.value}.` : null,
    more: [],
    findingRefs: top ? [top.key] : [],
    keep: null,
    try: null,
    guidanceLinks: [],
    source: 'template',
  }
}

// --- the call ---------------------------------------------------------------

const SYSTEM_PROMPT = `You write the coach notes on a teacher's own lesson report. The teacher reads them alone, about their own teaching, and the notes are built only from what the recording heard the teacher say.

You are given, for each section of the report, its findings: a label, a value as shown on the page, and the teacher's own lines behind it, each with an id, a time, and whether it is a strength, a growth point, or neutral. That is everything you know about the lesson. Do not add anything else.

For each section write:
- lead: one or two sentences, at most ${LEAD_MAX_WORDS} words, always shown. Open with something the teacher did well, grounded in a finding.
- more: up to two short paragraphs, at most ${MORE_MAX_WORDS} words together, shown behind "Read more". At most one growth observation, phrased as an invitation ("worth trying", "one easy move"), never as a deficit.
- finding_refs: the keys of every finding the lead and more rely on.
- keep: the id of one strength or neutral line worth keeping, and one short sentence (at most ${KEEP_TRY_MAX_WORDS} words) on what it did.
- try: the id of one line to change — a growth line where there is one — one short sentence (at most ${KEEP_TRY_MAX_WORDS} words) on what to try, and a rewrite: that same line as the teacher could say it next time, at most ${REWRITE_MAX_WORDS} words, in their voice and register, specific to this lesson's content.

Rules. Every one is checked, and a note that breaks one is thrown away:
- Second person, warm, plain, like an experienced colleague. No headings, no lists, no markdown.
- Anything inside quotation marks must be copied exactly from one of the given lines. Quote sparingly and only short pieces.
- Use curly quotation marks “like this” around any quote, never straight double quotes.
- Every number you write must appear in the findings you list in finding_refs, or be one of the given times. No new numbers, no percentages, no rounding.
- Never describe what students thought, felt, understood, or how engaged they were. You can say what the teacher invited, asked, or gave room for; you cannot say what students did with it.
- Never say what happened after a line: whether anyone answered, whether a question stayed open or landed, whether students picked something up. The recording only shows what the teacher said.
- Never use: poor, weak, failed, should have, ineffective, lacked, struggled.
- No rubric codes or evaluation language.
- A finding marked unavailable was not measured: never treat it as zero or as a gap. A finding marked confirmed_none was looked for and not heard; you may say so plainly, once.
- Never use a student's name, even one that appears in a line; say "a student". Do not quote a line for the sake of a name in it.
- Your share of the recording says nothing about students. Do not read room, voice or participation into it.
- If a section has nothing to work with — every finding unavailable — return null for lead, keep and try, and empty lists.
- For the content section, do not repeat a specialist note's text as the try.
- guidance_links: content section only. It may list "stuck" items — general subject knowledge about where students often get stuck. Where one is about the same idea as a line in the take_it_further finding, link them: the item's position in the list (from 0) and that line's id. Only clear matches on the same idea; most lessons have none or one. Every other section: an empty list.`

/// One note's shape, described once. The format used to name each section as
/// its own property, repeating this five times; the API refused the grammar
/// that compiled to as too large. A list of notes tagged with their section
/// is the same answer at a fifth of the size.
const NOTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['section', 'lead', 'more', 'finding_refs', 'keep', 'try', 'guidance_links'],
  properties: {
    section: { type: 'string', enum: [...SECTION_KEYS] },
    lead: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    more: { type: 'array', items: { type: 'string' } },
    finding_refs: { type: 'array', items: { type: 'string' } },
    keep: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['evidence_id', 'text'],
          properties: { evidence_id: { type: 'string' }, text: { type: 'string' } },
        },
      ],
    },
    try: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['evidence_id', 'text', 'rewrite'],
          properties: { evidence_id: { type: 'string' }, text: { type: 'string' }, rewrite: { type: 'string' } },
        },
      ],
    },
    guidance_links: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['stuck_index', 'evidence_id'],
        properties: { stuck_index: { type: 'integer' }, evidence_id: { type: 'string' } },
      },
    },
  },
} as const

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['notes'],
  properties: { notes: { type: 'array', items: NOTE_SCHEMA } },
}

type RawNote = {
  section: string
  lead: string | null
  more: string[]
  finding_refs: string[]
  keep: { evidence_id: string; text: string } | null
  try: { evidence_id: string; text: string; rewrite: string } | null
  guidance_links?: { stuck_index: number; evidence_id: string }[]
}

export function toSectionNote(raw: RawNote): SectionNote {
  return {
    lead: raw.lead?.trim() || null,
    more: (raw.more ?? []).map((p) => p.trim()).filter(Boolean),
    findingRefs: raw.finding_refs ?? [],
    keep: raw.keep ? { evidenceId: raw.keep.evidence_id, text: raw.keep.text.trim() } : null,
    try: raw.try ? { evidenceId: raw.try.evidence_id, text: raw.try.text.trim(), rewrite: raw.try.rewrite.trim() } : null,
    guidanceLinks: (raw.guidance_links ?? []).map((l) => ({ stuckIndex: l.stuck_index, evidenceId: l.evidence_id })),
    source: 'model',
  }
}

async function requestNotes(
  input: NotesInput,
  keys: SectionKey[],
  /// Why each section's last note was refused, so the second attempt can fix
  /// it rather than repeat it.
  refused: Partial<Record<SectionKey, string[]>> = {},
): Promise<Record<string, RawNote> | null> {
  const feedback = Object.entries(refused)
    .filter(([, errors]) => errors && errors.length > 0)
    .map(([key, errors]) => `- ${key}: ${errors!.join('; ')}`)
    .join('\n')
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 6000,
    thinking: { type: 'disabled' },
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Write one note for each of these sections, tagged with its key: ${keys.join(', ')}.${
          feedback ? `\n\nYour previous notes for these sections were refused by the checks:\n${feedback}\nFix exactly those problems.` : ''
        }\n\n${JSON.stringify({ sections: input.sections.filter((s) => keys.includes(s.key)) })}`,
      },
    ],
  })
  if (response.stop_reason !== 'end_turn') {
    console.error(`[insightsNotes] stopped: ${response.stop_reason}`)
    return null
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  try {
    const notes = (JSON.parse(text) as { notes: RawNote[] }).notes ?? []
    // The first note for a section stands; a second one for it is ignored.
    const bySection: Record<string, RawNote> = {}
    for (const n of notes) if (!bySection[n.section]) bySection[n.section] = n
    return bySection
  } catch {
    console.error('[insightsNotes] reply was not JSON')
    return null
  }
}

/// One call for every section; sections whose note fails are asked for once
/// more, together, and any that fail again get the template sentence.
export async function writeInsightsNotes(input: NotesInput, inputHash: string): Promise<InsightsNotes> {
  const sections = {} as Record<SectionKey, SectionNote>
  const writable: SectionKey[] = []
  for (const s of input.sections) {
    if (sectionUnavailable(s)) {
      sections[s.key] = { lead: null, more: [], findingRefs: [], keep: null, try: null, guidanceLinks: [], source: 'unavailable' }
    } else {
      writable.push(s.key)
    }
  }

  let pending = writable
  let refused: Partial<Record<SectionKey, string[]>> = {}
  for (let attempt = 1; attempt <= 2 && pending.length > 0; attempt++) {
    let raw: Record<string, RawNote> | null = null
    try {
      raw = await requestNotes(input, pending, refused)
    } catch (error) {
      console.error('[insightsNotes] call failed:', error)
    }
    const failed: SectionKey[] = []
    const nextRefused: Partial<Record<SectionKey, string[]>> = {}
    for (const key of pending) {
      const section = input.sections.find((s) => s.key === key)!
      const note = raw?.[key] ? dropBadPointers(toSectionNote(raw[key]), section) : null
      const errors = note ? checkSectionNote(note, section) : ['no note came back']
      if (note && errors.length === 0) sections[key] = note
      else {
        console.warn(`[insightsNotes] ${key} attempt ${attempt} failed: ${errors.join('; ')}`)
        failed.push(key)
        nextRefused[key] = errors
      }
    }
    pending = failed
    refused = nextRefused
  }
  for (const key of pending) sections[key] = templateNote(input.sections.find((s) => s.key === key)!)

  return { version: NOTES_VERSION, inputHash, generatedAt: new Date().toISOString(), sections }
}
