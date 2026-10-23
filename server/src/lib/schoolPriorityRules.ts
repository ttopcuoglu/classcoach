// Coaching Priorities: the rules, with no database in them, so each one can be
// tested on its own. See docs/coaching-priorities.md.
//
// Two ideas run through all of it. A school's guidance only ever reaches a
// teacher's coaching after that teacher chose it, at the version they chose.
// And nothing about that choice is ever handed back to the school.

export const MAX_ACTIVE_PRIORITIES = 2

export const PRIORITY_STATUSES = ['draft', 'active', 'archived'] as const
export type PriorityStatus = (typeof PRIORITY_STATUSES)[number]

/// A teacher's answer. "later" is "Maybe later": never asked again for this
/// version, and off. Only "on" brings the focus into coaching.
export const CHOICE_STATES = ['on', 'paused', 'off', 'later'] as const
export type ChoiceState = (typeof CHOICE_STATES)[number]

export function isChoiceState(value: unknown): value is ChoiceState {
  return typeof value === 'string' && (CHOICE_STATES as readonly string[]).includes(value)
}

export const GUIDANCE_FIELDS = ['name', 'purpose', 'looksLike', 'whenItFits', 'ideas', 'whenNotToUse'] as const
export type GuidanceField = (typeof GUIDANCE_FIELDS)[number]
export type Guidance = Record<GuidanceField, string>

/// Short on purpose: this text goes into every coaching prompt of every
/// teacher who turns it on, and a page of it would crowd out the teacher's own
/// question.
export const GUIDANCE_LIMITS: Record<GuidanceField, number> = {
  name: 60,
  purpose: 400,
  looksLike: 600,
  whenItFits: 600,
  ideas: 600,
  whenNotToUse: 600,
}

export const GUIDANCE_LABELS: Record<GuidanceField, string> = {
  name: 'Name',
  purpose: 'Purpose',
  looksLike: 'What it looks like',
  whenItFits: 'When it fits',
  ideas: 'Ideas teachers could consider',
  whenNotToUse: 'When it may not fit',
}

/// Wording that turns guidance into an order, or into watching teachers. The
/// feature is ideas a teacher chose to hear, so either is refused, with a
/// reason the admin can act on. Not exhaustive — the coaching prompt says the
/// same thing to the model — but it catches the plain cases at the door.
const DIRECTIVE_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\b(tell|make|require|force|order|instruct|remind)\s+(them|teachers?|staff|everyone)\b/i,
    reason: 'It reads as an instruction to teachers. Describe the strategy and when it helps instead.',
  },
  { pattern: /\b(you|they|teachers?|staff)\s+(must|have to|need to|are required to)\b/i, reason: 'It reads as a requirement. Wivoza only offers ideas a teacher chose to hear.' },
  { pattern: /\b(mandatory|non-negotiable|compliance|comply)\b/i, reason: 'It reads as a requirement. Wivoza only offers ideas a teacher chose to hear.' },
  {
    // Narrow on purpose: "check whether students understand" and "students
    // monitor their own progress" are good guidance, so only phrasings about
    // teachers or the school knowing who did what are refused.
    pattern: /\b(report(s|ing)?\s+(back|to me|to us|on (teachers?|who|staff))|let (me|us|the office) know (if|whether|who)|track (whether|who|which)|monitor (teachers?|staff|who|whether)|check (who|which teachers?)|flag (teachers?|anyone|who))\b/i,
    reason: 'It asks Wivoza to report on teachers. Wivoza never tells the school who uses this or how.',
  },
  { pattern: /\b(stop|quit|no more)\s+(lecturing|talking|doing)\b/i, reason: 'It tells teachers what to stop. Describe what the strategy looks like instead.' },
]

export type GuidanceCheck = { ok: true; guidance: Guidance } | { ok: false; field: GuidanceField | null; error: string }

/// Trims, caps and checks guidance before it is saved or published.
///
/// `memberNames` is the school's roster. A teacher's name in guidance would
/// single that teacher out in everyone's coaching, so any whole-word match of
/// a first or last name (three letters or more) is refused.
export function checkGuidance(input: Partial<Record<GuidanceField, unknown>>, memberNames: (string | null)[]): GuidanceCheck {
  const guidance = {} as Guidance
  for (const field of GUIDANCE_FIELDS) {
    const raw = input[field]
    const value = typeof raw === 'string' ? raw.trim().replace(/\s+\n/g, '\n') : ''
    if (!value) return { ok: false, field, error: `${GUIDANCE_LABELS[field]} is empty.` }
    if (value.length > GUIDANCE_LIMITS[field]) {
      return { ok: false, field, error: `${GUIDANCE_LABELS[field]} is too long (${value.length} of ${GUIDANCE_LIMITS[field]} characters).` }
    }
    guidance[field] = value
  }

  const names = nameTokens(memberNames)
  for (const field of GUIDANCE_FIELDS) {
    const text = guidance[field]
    for (const { pattern, reason } of DIRECTIVE_PATTERNS) {
      if (pattern.test(text)) return { ok: false, field, error: `${GUIDANCE_LABELS[field]}: ${reason}` }
    }
    const words = text.toLowerCase().match(/[\p{L}'-]+/gu) ?? []
    const hit = words.find((w) => names.has(w))
    if (hit) {
      return {
        ok: false,
        field,
        error: `${GUIDANCE_LABELS[field]} mentions "${hit}", which is the name of someone on your staff. Guidance goes to every teacher who chooses it, so it can't name anyone.`,
      }
    }
  }
  return { ok: true, guidance }
}

/// Words that are names but also everyday English would block ordinary
/// guidance ("Will", "Grace", "Hope", "Mark"), so they are let through.
const COMMON_WORDS = new Set([
  'will', 'grace', 'hope', 'mark', 'may', 'june', 'april', 'august', 'rose', 'faith', 'joy', 'bill', 'sky',
  'young', 'king', 'long', 'white', 'black', 'brown', 'green', 'gray', 'grey', 'hill', 'wood', 'park', 'bell',
  'rich', 'case', 'cross', 'lane', 'love', 'more', 'ray', 'reed', 'sage', 'summer', 'winter', 'woods', 'the', 'and',
])

function nameTokens(memberNames: (string | null)[]): Set<string> {
  const tokens = new Set<string>()
  for (const full of memberNames) {
    for (const part of (full ?? '').toLowerCase().split(/[\s.,]+/)) {
      if (part.length >= 3 && !COMMON_WORDS.has(part)) tokens.add(part)
    }
  }
  return tokens
}

export type PriorityForFocus = {
  id: string
  organizationId: string
  status: string
  version: number
  startsOn: Date | null
  endsOn: Date | null
}

export type ChoiceForFocus = { state: string; version: number } | null

/// Whether one priority belongs in this teacher's coaching right now. Every
/// condition must hold; anything missing or unexpected is a no.
export function focusApplies(
  priority: PriorityForFocus,
  choice: ChoiceForFocus,
  teacherOrganizationId: string | null,
  now: Date,
): boolean {
  if (!choice || choice.state !== 'on') return false
  if (choice.version !== priority.version) return false
  if (priority.status !== 'active') return false
  if (!teacherOrganizationId || priority.organizationId !== teacherOrganizationId) return false
  if (priority.startsOn && now < startOfDay(priority.startsOn)) return false
  if (priority.endsOn && now >= endOfDay(priority.endsOn)) return false
  return true
}

/// Whether to show the teacher the invitation: an active priority they have
/// not answered at its current version. "Maybe later" and "Off" are answers,
/// so they are not asked again — until the school changes what it means.
export function needsChoice(priority: PriorityForFocus, choice: ChoiceForFocus, now: Date): boolean {
  if (priority.status !== 'active') return false
  if (priority.endsOn && now >= endOfDay(priority.endsOn)) return false
  if (!choice) return true
  return choice.version !== priority.version
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
function endOfDay(d: Date): Date {
  return new Date(startOfDay(d).getTime() + 24 * 60 * 60 * 1000)
}
