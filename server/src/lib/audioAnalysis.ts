// Deterministic, heuristic instructional analysis over a diarized
// transcript. Nothing here calls Claude or makes a judgment call about
// tone/appropriateness — it only counts and flags patterns. Every count is
// a suggestion for the coach to confirm or edit, never a final verdict.
// Phrase lists are exported so they stay easy to tune without touching the
// analysis logic itself.

export type Segment = {
  speakerLabel: string // "Teacher" | "Student" (or a raw pre-tag label)
  startSec: number
  endSec: number
  text: string
}

export type Highlight = { label: string; timestampSec: number; excerpt: string; durationSec?: number }
export type Phase = { label: string; startSec: number; endSec: number }
export type QuestionLogEntry = {
  timestampSec: number
  type: 'recall' | 'higher_order'
  waitTimeSec: number | null
  text: string
  followUps: { timestampSec: number; text: string }[]
}

export type AnalysisResult = {
  teacherTalkPct: number | null
  studentTalkPct: number | null
  questionCount: number
  higherOrderPct: number | null
  avgWaitTimeSec: number | null
  cfuCount: number
  metricsDetail: {
    totalDurationSec: number
    teacherTalkSec: number
    studentTalkSec: number
    studentVoiceSegments: number
    longestTeacherMonologueSec: number
    recallQuestionCount: number
    higherOrderQuestionCount: number
    followUpQuestionCount: number
    redirectionCount: number
    transitionCount: number
    directiveCount: number
    positivePhraseCount: number
    correctivePhraseCount: number
    positiveToCorrectiveRatio: number | null
    genericFeedbackCount: number
    specificFeedbackCount: number
    nameMentionCount: number
  }
  highlights: Highlight[]
  phases: Phase[]
  questionLog: QuestionLogEntry[]
}

export const RECALL_STARTERS = [
  'what is', 'what are', 'what was', 'define', 'list the', 'name the',
  'who is', 'who was', 'when did', 'where is', 'how many', 'what does',
]

export const HIGHER_ORDER_STARTERS = [
  'why', 'how would', 'how might', 'how does', 'explain', 'what would happen if',
  'what if', 'why do you think', 'what evidence', 'compare', 'justify',
  'defend your', 'how could', 'what could',
]

export const CFU_PHRASES = [
  'thumbs up', 'thumbs down', 'turn and talk', 'on a scale of',
  'raise your hand if', 'show me with your fingers', 'talk to your partner',
  'fist to five',
]

export const REDIRECTION_PHRASES = [
  'eyes up here', 'eyes on me', 'stop talking', 'focus up', 'put that away',
  "let's go", 'settle down', 'quiet please', 'i need everyone', 'voices off',
]

export const TRANSITION_PHRASES = [
  'okay, next', 'ok, next', "let's move on", 'put that away and get out',
  'take out your', 'get out your', 'moving on', "let's transition", 'next up',
  "alright, let's",
]

// Task-instruction language — distinct from TRANSITION_PHRASES (which is
// about switching between activities), this is about giving a direction
// for the current task. Count only — never a judgment of clarity.
export const DIRECTIVE_PHRASES = [
  'open your', 'turn to page', 'get into groups', 'work with your partner',
  'hand in your', 'line up', 'write down', 'copy this down',
  'raise your hand when', "when you're done",
]

export const POSITIVE_PHRASES = [
  'good job', 'nice work', 'well done', 'great job', 'awesome', 'i like how',
  'excellent', 'great point', 'love that', 'nice thinking',
]

export const CORRECTIVE_PHRASES = [
  'not quite', "that's not right", 'try again', 'incorrect', "let's rethink",
  'not exactly', 'close, but', "that's not it",
]

// Lesson Content — keyword/phrase-matched flags and quotes only, never a
// score. "Found" vs "not found" is still a confident result once a phase
// has actually been captured; only a too-short/missing Opening phase makes
// the stated-objective check itself unavailable (mirrors the same
// phase-coverage judgment used for Session Phases elsewhere in this
// report — see reportConfidence.ts on the frontend for why 30s is the
// floor for "meaningfully captured").
const MIN_PHASE_DURATION_SEC = 30
const MAX_CONNECTION_QUOTES = 3
const MAX_VOCABULARY_QUOTES = 5
const MAX_TOPIC_TERMS = 6

export type LessonContentResult = {
  topicTerms: string[]
  statedObjective: { found: boolean | null; quote: string | null; timestampSec: number | null }
  connections: { quote: string; timestampSec: number }[]
  vocabulary: { quote: string; timestampSec: number }[]
  subject: string | null
}

export const OBJECTIVE_PHRASES = [
  'today we are going to', "today we're going to", 'our goal for today', 'our objective',
  'learning target', 'by the end of class', 'by the end of today', 'you will be able to',
  'we will be able to', 'the goal of this lesson', "today's objective",
]

export const CONNECTION_PHRASES = [
  'in real life', 'remember when we', 'this is like', 'think about a time when',
  'connects to', 'last week we', 'you might have seen', 'similar to when',
  'reminds you of', 'have you ever',
]

export const VOCABULARY_PHRASES = [
  'the word means', 'is defined as', 'vocabulary word', 'key term',
  'in other words', 'that means', 'the definition of', 'means that',
]

const TOPIC_TERM_STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'have', 'they', 'what', 'when', 'where', 'which',
  'your', 'about', 'going', 'because', 'would', 'could', 'should', 'there', 'their',
  'okay', 'right', 'just', 'like', 'want', 'know', 'think', 'good', 'time', 'today',
  'were', 'been', 'does', 'each', 'some', 'into', 'only', 'over', 'then', 'them',
  'these', 'those', 'very', 'will', 'yeah', 'gonna', 'kind', 'sure', 'here',
])

function extractTopicTerms(segments: Segment[]): string[] {
  const counts = new Map<string, { count: number; display: string }>()
  for (const segment of segments) {
    const words = segment.text.match(/[A-Za-z][A-Za-z'-]{3,}/g) ?? []
    for (const raw of words) {
      const lower = raw.toLowerCase()
      if (TOPIC_TERM_STOPWORDS.has(lower)) continue
      const entry = counts.get(lower)
      if (entry) entry.count++
      else counts.set(lower, { count: 1, display: raw })
    }
  }
  return Array.from(counts.values())
    .filter((v) => v.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TOPIC_TERMS)
    .map((v) => v.display)
}

function detectStatedObjective(segments: Segment[], phases: Phase[]): LessonContentResult['statedObjective'] {
  const opening = phases.find((p) => p.label === 'Opening')
  if (!opening || opening.endSec - opening.startSec < MIN_PHASE_DURATION_SEC) {
    return { found: null, quote: null, timestampSec: null }
  }
  const openingTeacherSegments = segments.filter(
    (s) => s.speakerLabel === 'Teacher' && s.startSec >= opening.startSec && s.startSec < opening.endSec,
  )
  for (const segment of openingTeacherSegments) {
    if (countPhraseMatches(segment.text, OBJECTIVE_PHRASES) > 0) {
      return { found: true, quote: segment.text, timestampSec: segment.startSec }
    }
  }
  return { found: false, quote: null, timestampSec: null }
}

function detectPhraseQuotes(
  segments: Segment[],
  phrases: string[],
  max: number,
  extraPattern?: RegExp,
): { quote: string; timestampSec: number }[] {
  const results: { quote: string; timestampSec: number }[] = []
  for (const segment of segments) {
    if (segment.speakerLabel !== 'Teacher') continue
    if (countPhraseMatches(segment.text, phrases) > 0 || extraPattern?.test(segment.text)) {
      results.push({ quote: segment.text, timestampSec: segment.startSec })
      if (results.length >= max) break
    }
  }
  return results
}

// "X means Y" / "X is called Y" are two of the most common ways a teacher
// actually defines a term out loud — much more common than the fixed
// phrases above, so these get a dedicated pattern rather than relying on
// substring matching alone.
const VOCABULARY_PATTERN = /\b[a-z]+ (?:means|is called)\b/i

// Subject detection for Content Specialist Notes — keyword-frequency only,
// never a confident guess. "World language" is deliberately not included:
// a class conducted in the target language wouldn't produce meaningful
// English keyword hits, making it undetectable (not just unreliable) by
// this method.
const SUBJECT_KEYWORDS: Record<string, string[]> = {
  math: [
    'equation', 'fraction', 'multiply', 'divide', 'algebra', 'geometry', 'variable',
    'numerator', 'denominator', 'decimal', 'percent',
  ],
  ela: [
    'character', 'theme', 'plot', 'author', 'paragraph', 'metaphor', 'narrator',
    'protagonist', 'stanza', 'main idea',
  ],
  science: [
    'hypothesis', 'experiment', 'cell', 'molecule', 'ecosystem', 'organism',
    'reaction', 'photosynthesis', 'energy', 'force',
  ],
  social_studies: [
    'government', 'economy', 'constitution', 'democracy', 'revolution',
    'civilization', 'amendment', 'geography',
  ],
  arts: [
    'rhythm', 'melody', 'composition', 'canvas', 'palette', 'choreography',
    'brushstroke', 'instrument',
  ],
}

function detectSubject(segments: Segment[]): string | null {
  const counts: Record<string, number> = {}
  for (const segment of segments) {
    for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
      counts[subject] = (counts[subject] ?? 0) + countPhraseMatches(segment.text, keywords)
    }
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const [topSubject, topCount] = ranked[0] ?? [null, 0]
  const runnerUpCount = ranked[1]?.[1] ?? 0
  if (topSubject && topCount >= 3 && topCount >= runnerUpCount * 2) return topSubject
  return null
}

// The grounding material handed to a Claude call for Content Specialist
// Notes — teacher segments only, long enough to carry actual content (not
// "okay" or "yes"), excluding pure classroom-management language. Claude is
// only ever allowed to reference one of these by number, never write or
// echo quote text itself, so a hallucinated excerpt is structurally
// impossible.
export function buildContentExhibits(segments: Segment[]): { text: string; timestampSec: number }[] {
  const ordered = [...segments].sort((a, b) => a.startSec - b.startSec)
  const exhibits: { text: string; timestampSec: number }[] = []
  for (const segment of ordered) {
    if (segment.speakerLabel !== 'Teacher') continue
    const wordCount = segment.text.trim().split(/\s+/).filter(Boolean).length
    if (wordCount < 6) continue
    if (countPhraseMatches(segment.text, REDIRECTION_PHRASES) > 0) continue
    if (countPhraseMatches(segment.text, TRANSITION_PHRASES) > 0) continue
    exhibits.push({ text: segment.text, timestampSec: segment.startSec })
    if (exhibits.length >= 40) break
  }
  return exhibits
}

export function detectLessonContent(segments: Segment[], phases: Phase[]): LessonContentResult {
  const ordered = [...segments].sort((a, b) => a.startSec - b.startSec)
  return {
    topicTerms: extractTopicTerms(ordered),
    statedObjective: detectStatedObjective(ordered, phases),
    connections: detectPhraseQuotes(ordered, CONNECTION_PHRASES, MAX_CONNECTION_QUOTES),
    vocabulary: detectPhraseQuotes(ordered, VOCABULARY_PHRASES, MAX_VOCABULARY_QUOTES, VOCABULARY_PATTERN),
    subject: detectSubject(ordered),
  }
}

const NAME_MENTION_PATTERN = /\b[A-Z][a-z]+\b/g

function countPhraseMatches(text: string, phrases: string[]): number {
  const lowerText = text.toLowerCase()
  return phrases.reduce((count, phrase) => (lowerText.includes(phrase) ? count + 1 : count), 0)
}

function findMatchedPhrase(text: string, phrases: string[]): string | null {
  const lowerText = text.toLowerCase()
  return phrases.find((phrase) => lowerText.includes(phrase)) ?? null
}

function splitSentences(text: string): { sentence: string; endedWithQuestion: boolean }[] {
  const parts = text.split(/([.?!]+)/)
  const sentences: { sentence: string; endedWithQuestion: boolean }[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i]?.trim()
    if (!sentence) continue
    sentences.push({ sentence, endedWithQuestion: (parts[i + 1] ?? '').includes('?') })
  }
  return sentences
}

function classifyQuestion(sentence: string): 'higher_order' | 'recall' | null {
  const s = sentence.toLowerCase()
  if (HIGHER_ORDER_STARTERS.some((p) => s.startsWith(p) || s.includes(` ${p}`))) return 'higher_order'
  if (RECALL_STARTERS.some((p) => s.startsWith(p))) return 'recall'
  return null
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function analyzeTranscript(segments: Segment[]): AnalysisResult {
  const ordered = [...segments].sort((a, b) => a.startSec - b.startSec)
  const totalDurationSec = ordered.length ? Math.max(...ordered.map((s) => s.endSec)) : 0

  let teacherTalkSec = 0
  let studentTalkSec = 0
  let studentVoiceSegments = 0

  let currentMonologueSec = 0
  let currentMonologueStartSec = 0
  let currentMonologueText = ''
  const monologueCandidates: { durationSec: number; startSec: number; text: string }[] = []

  let questionCount = 0
  let recallQuestionCount = 0
  let higherOrderQuestionCount = 0
  let followUpQuestionCount = 0

  let cfuCount = 0
  let redirectionCount = 0
  let redirectionStreak = 0
  let transitionCount = 0
  let directiveCount = 0
  const lastDirectiveSeenAt = new Map<string, number>()
  let repeatedInstructionHighlightTaken = false
  let positivePhraseCount = 0
  let correctivePhraseCount = 0
  let genericFeedbackCount = 0
  let specificFeedbackCount = 0
  let nameMentionCount = 0

  const waitTimes: number[] = []
  const highlights: Highlight[] = []
  const transitionIndexes: number[] = []
  const questionLog: QuestionLogEntry[] = []

  let lastTeacherQuestionEndSec: number | null = null
  let prevTeacherAskedFollowingStudent = false
  const waitCandidates: { wait: number; segment: Segment }[] = []
  let redirectionHighlightTaken = false
  let probingHighlightTaken = false
  let lastRootQuestionEntry: QuestionLogEntry | null = null
  let lastQuestionEntryForWait: QuestionLogEntry | null = null

  ordered.forEach((segment, index) => {
    const duration = Math.max(0, segment.endSec - segment.startSec)
    const isTeacher = segment.speakerLabel === 'Teacher'

    if (isTeacher) {
      if (currentMonologueSec === 0) currentMonologueStartSec = segment.startSec
      teacherTalkSec += duration
      currentMonologueSec += duration
      currentMonologueText = segment.text
    } else {
      studentTalkSec += duration
      studentVoiceSegments++
      if (currentMonologueSec > 0) {
        monologueCandidates.push({ durationSec: currentMonologueSec, startSec: currentMonologueStartSec, text: currentMonologueText })
      }
      currentMonologueSec = 0
    }

    if (lastTeacherQuestionEndSec !== null) {
      const wait = segment.startSec - lastTeacherQuestionEndSec
      if (wait >= 0) {
        waitTimes.push(wait)
        waitCandidates.push({ wait, segment })
        if (lastQuestionEntryForWait) lastQuestionEntryForWait.waitTimeSec = round(wait, 2)
      }
      lastTeacherQuestionEndSec = null
      lastQuestionEntryForWait = null
    }

    const precedingWasStudent = index > 0 && ordered[index - 1].speakerLabel !== 'Teacher'

    if (isTeacher) {
      if (countPhraseMatches(segment.text, CFU_PHRASES) > 0) cfuCount++

      const redirectionHits = countPhraseMatches(segment.text, REDIRECTION_PHRASES)
      if (redirectionHits > 0) {
        redirectionCount += redirectionHits
        redirectionStreak++
      } else {
        redirectionStreak = 0
      }
      if (redirectionStreak >= 2 && !redirectionHighlightTaken) {
        highlights.push({ label: 'Redirection cluster', timestampSec: segment.startSec, excerpt: segment.text })
        redirectionHighlightTaken = true
      }

      if (countPhraseMatches(segment.text, TRANSITION_PHRASES) > 0) {
        transitionCount++
        transitionIndexes.push(index)
      }

      const directivePhrase = findMatchedPhrase(segment.text, DIRECTIVE_PHRASES)
      if (directivePhrase) {
        directiveCount++
        const lastSeen = lastDirectiveSeenAt.get(directivePhrase)
        if (lastSeen != null && segment.startSec - lastSeen <= 90 && !repeatedInstructionHighlightTaken) {
          highlights.push({ label: 'Repeated instruction', timestampSec: segment.startSec, excerpt: segment.text })
          repeatedInstructionHighlightTaken = true
        }
        lastDirectiveSeenAt.set(directivePhrase, segment.startSec)
      }

      positivePhraseCount += countPhraseMatches(segment.text, POSITIVE_PHRASES)
      correctivePhraseCount += countPhraseMatches(segment.text, CORRECTIVE_PHRASES)

      if (precedingWasStudent) {
        const wordCount = segment.text.trim().split(/\s+/).filter(Boolean).length
        const referencesContent = /\b(because|since|so that|which|specifically)\b/i.test(segment.text)
        if (wordCount <= 4 && !referencesContent) genericFeedbackCount++
        else if (wordCount > 4) specificFeedbackCount++
      }

      let askedQuestionThisSegment = false
      splitSentences(segment.text).forEach(({ sentence, endedWithQuestion }) => {
        const classification = classifyQuestion(sentence)
        if (!endedWithQuestion && !classification) return

        questionCount++
        askedQuestionThisSegment = true
        if (classification === 'higher_order') higherOrderQuestionCount++
        else recallQuestionCount++

        const entry: QuestionLogEntry = {
          timestampSec: segment.startSec,
          type: classification === 'higher_order' ? 'higher_order' : 'recall',
          waitTimeSec: null,
          text: sentence.trim(),
          followUps: [],
        }

        if (precedingWasStudent && prevTeacherAskedFollowingStudent) {
          followUpQuestionCount++
          // Push the entry itself (not a copy) so a wait-time assigned to it
          // later actually sticks — followUps is typed narrower but the
          // extra fields are harmless via structural typing.
          if (lastRootQuestionEntry) lastRootQuestionEntry.followUps.push(entry)
          if (!probingHighlightTaken) {
            highlights.push({ label: 'Follow-up / probing question', timestampSec: segment.startSec, excerpt: segment.text })
            probingHighlightTaken = true
          }
        } else {
          questionLog.push(entry)
          lastRootQuestionEntry = entry
        }
        lastQuestionEntryForWait = entry
      })

      prevTeacherAskedFollowingStudent = askedQuestionThisSegment && precedingWasStudent
      if (askedQuestionThisSegment) lastTeacherQuestionEndSec = segment.endSec

      const nameMentions = segment.text.match(NAME_MENTION_PATTERN)
      if (nameMentions) nameMentionCount += nameMentions.length
    } else {
      prevTeacherAskedFollowingStudent = false
    }
  })

  if (currentMonologueSec > 0) {
    monologueCandidates.push({ durationSec: currentMonologueSec, startSec: currentMonologueStartSec, text: currentMonologueText })
  }

  const longestWait = waitCandidates.length
    ? waitCandidates.reduce((best, candidate) => (candidate.wait > best.wait ? candidate : best))
    : null
  const longestMonologue = monologueCandidates.length
    ? monologueCandidates.reduce((best, candidate) => (candidate.durationSec > best.durationSec ? candidate : best))
    : null
  const longestTeacherMonologueSec = longestMonologue?.durationSec ?? 0

  if (longestWait) {
    highlights.push({
      label: 'Longest wait time',
      timestampSec: longestWait.segment.startSec,
      excerpt: longestWait.segment.text,
      durationSec: round(longestWait.wait, 1),
    })
  }
  if (longestMonologue) {
    highlights.push({
      label: 'Longest uninterrupted teacher monologue',
      timestampSec: longestMonologue.startSec,
      excerpt: longestMonologue.text,
      durationSec: round(longestMonologue.durationSec, 1),
    })
  }

  const phases = buildPhases(ordered, transitionIndexes, totalDurationSec)

  const avgWaitTimeSec = waitTimes.length
    ? round(waitTimes.reduce((sum, w) => sum + w, 0) / waitTimes.length, 2)
    : null

  return {
    teacherTalkPct: totalDurationSec > 0 ? round((teacherTalkSec / totalDurationSec) * 100) : null,
    studentTalkPct: totalDurationSec > 0 ? round((studentTalkSec / totalDurationSec) * 100) : null,
    questionCount,
    higherOrderPct: questionCount > 0 ? round((higherOrderQuestionCount / questionCount) * 100) : null,
    avgWaitTimeSec,
    cfuCount,
    metricsDetail: {
      totalDurationSec: round(totalDurationSec),
      teacherTalkSec: round(teacherTalkSec),
      studentTalkSec: round(studentTalkSec),
      studentVoiceSegments,
      longestTeacherMonologueSec: round(longestTeacherMonologueSec),
      recallQuestionCount,
      higherOrderQuestionCount,
      followUpQuestionCount,
      redirectionCount,
      transitionCount,
      directiveCount,
      positivePhraseCount,
      correctivePhraseCount,
      positiveToCorrectiveRatio: correctivePhraseCount > 0 ? round(positivePhraseCount / correctivePhraseCount, 2) : null,
      genericFeedbackCount,
      specificFeedbackCount,
      nameMentionCount,
    },
    highlights: highlights.slice(0, 5),
    phases,
    questionLog,
  }
}

// Splits the session into rough phases at detected transition markers. With
// no markers found, falls back to a proportional Opening/Instruction/Work
// Time/Closing split — a starting point only, since the coach can drag the
// boundaries afterward.
function buildPhases(ordered: Segment[], transitionIndexes: number[], totalDurationSec: number): Phase[] {
  if (totalDurationSec <= 0) return []

  const boundarySecs = transitionIndexes
    .map((i) => ordered[i]?.startSec)
    .filter((sec): sec is number => sec !== undefined && sec > 0 && sec < totalDurationSec)

  if (boundarySecs.length === 0) {
    const marks = [0, totalDurationSec * 0.1, totalDurationSec * 0.6, totalDurationSec * 0.9, totalDurationSec]
    const labels = ['Opening', 'Instruction', 'Work Time', 'Closing']
    return labels.map((label, i) => ({ label, startSec: round(marks[i]), endSec: round(marks[i + 1]) }))
  }

  const bounds = [0, ...Array.from(new Set(boundarySecs)).sort((a, b) => a - b), totalDurationSec]
  return bounds.slice(0, -1).map((startSec, i) => {
    const endSec = bounds[i + 1]
    const label = i === 0 ? 'Opening' : i === bounds.length - 2 ? 'Closing' : 'Instruction'
    return { label, startSec: round(startSec), endSec: round(endSec) }
  })
}
