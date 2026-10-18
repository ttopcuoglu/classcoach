// Deterministic, heuristic instructional analysis over a diarized
// transcript. Nothing here calls Claude or makes a judgment call about
// tone/appropriateness — it only counts and flags patterns. Every count is
// a suggestion for the coach to confirm or edit, never a final verdict.
// Phrase lists are exported so they stay easy to tune without touching the
// analysis logic itself.

import { longestTeacherStretch } from './teacherStretch.ts'

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
  /// The pause before a STUDENT answered. Null whenever no student was
  /// audible after the question, which on a room mic is most of the time —
  /// across real lessons this is set on 23 questions and null on 117.
  waitTimeSec: number | null
  /// How long before the TEACHER spoke again.
  ///
  /// Measurable on nearly every question, because it needs only the
  /// teacher's own voice. It is a different thing from waitTimeSec and must
  /// never be presented as the same: this span MAY CONTAIN a student
  /// response, audible or not, and the report has to say so. Where a student
  /// was audible in it, `studentAudibleInPause` records that, so the two
  /// cases can be told apart instead of averaged together.
  ///
  /// This is the number that shows a teacher asking and moving straight on.
  /// waitTimeSec cannot: it only exists where a student answered, which is
  /// by construction the times the wait worked.
  pauseSec: number | null
  studentAudibleInPause: boolean
  text: string
  followUps: { timestampSec: number; text: string }[]
}
// whatItChecked is a short, phrase-based gloss (see CFU_PHRASE_DESCRIPTIONS)
// — never a claim about the specific content of what was checked, since
// that would require actually understanding the question, not just
// matching a fixed phrase.
export type CfuLogEntry = { timestampSec: number; text: string; whatItChecked: string }
// One entry per teacher turn counted toward genericFeedbackCount/
// specificFeedbackCount — text is the teacher's own turn; the preceding
// student turn (for real evidence context) is recovered from the
// transcript itself via its timestamp, not duplicated here.
export type FeedbackLogEntry = { timestampSec: number; kind: 'generic' | 'specific'; text: string }
// One entry per task-instruction phrase match.
export type DirectiveLogEntry = { timestampSec: number; text: string }
// One entry per positive- or corrective-phrase match — mutually exclusive
// per teacher turn (a turn matching both is classified by whichever
// phrase list it hits first), so a "moment" of classroom-language tone
// stays one instance, not a double count.
export type ToneLogEntry = { timestampSec: number; kind: 'positive' | 'corrective'; text: string }
// One entry per redirection-phrase match.
export type RedirectionLogEntry = { timestampSec: number; text: string }

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
    /// Student answers heard right after a teacher question — the only
    /// answers a follow-up can be spotted after — and how many of them the
    /// teacher followed up on (at most once each, so it never exceeds the
    /// first). Absent on sessions analyzed before these were kept.
    answersHeardCount?: number
    answersFollowedUpCount?: number
    /// Every follow-up question, in order. Absent before it was kept; the
    /// highlights carry only the first.
    followUpLog?: { timestampSec: number; text: string }[]
    /// When each of those heard answers started, and whether the teacher
    /// followed it up. Absent before it was kept.
    answerLog?: { timestampSec: number; followed: boolean }[]
    /// Tasks that asked students to reason rather than follow steps — read
    /// from the transcript, so absent on sessions analyzed before that.
    thinkingTaskCount?: number
    // How many question → student-response intervals avgWaitTimeSec averages.
    waitTimeSampleCount: number
    /// How fast the teacher spoke, in words a minute of their OWN speaking
    /// time — not of the lesson. Absent on sessions analyzed before it
    /// existed, and null when there is too little teacher speech to divide by.
    ///
    /// The report had plenty of ways to say how LONG a teacher spoke and none
    /// to say how fast. Sixty-five per cent of a lesson at 170 words a minute
    /// and the same share at 230 are different experiences for a student, and
    /// nothing here could tell them apart.
    teacherWordsPerMinute?: number | null
    /// The pause after a student finishes answering, before the teacher
    /// speaks — "wait time 2". `avgWaitTimeSec` is wait time 1, the pause
    /// after the question.
    ///
    /// This is the half that was missing, and it explains a number the report
    /// has been showing without explaining: follow-up counts are near zero on
    /// most lessons, and a wait of three tenths of a second is why. There is
    /// no gap for a follow-up to live in.
    waitTime2Sec?: number | null
    waitTime2SampleCount?: number
    /// Median silence held after a question that nobody answered, and how
    /// many such questions there were. Absent on sessions analyzed before
    /// this existed.
    ///
    /// Measurable far more often than avgWaitTimeSec, which needs an audible
    /// student answer and so only ever describes the questions where waiting
    /// WORKED — 25 of them across real lessons, against 65 here.
    heldSilenceSec?: number | null
    heldSilenceSampleCount?: number
    /// When the first word was transcribed. A recording that caught nothing
    /// for its first four minutes is not a four-minute silence in the lesson,
    /// and the silence share says otherwise unless this is known.
    firstWordSec?: number | null
    /// The non-speech part of the recording, told apart by the loudness
    /// envelope: genuinely quiet seconds versus seconds with real sound in
    /// them that produced no transcript. Absent on every recording made
    /// before envelopes existed, and on any where the teacher's own speech
    /// could not be located well enough to calibrate against — in which case
    /// the report keeps the one combined "Silence or other" slice, which is
    /// the honest answer with nothing to split it by.
    quietSec?: number
    unresolvedSec?: number
    redirectionCount: number
    firstRedirectionTimestampSec: number | null
    transitionCount: number
    directiveCount: number
    positivePhraseCount: number
    correctivePhraseCount: number
    positiveToCorrectiveRatio: number | null
    genericFeedbackCount: number
    specificFeedbackCount: number
    nameMentionCount: number
    uniqueNameCount: number
  }
  highlights: Highlight[]
  phases: Phase[]
  questionLog: QuestionLogEntry[]
  cfuLog: CfuLogEntry[]
  feedbackLog: FeedbackLogEntry[]
  directiveLog: DirectiveLogEntry[]
  toneLog: ToneLogEntry[]
  redirectionLog: RedirectionLogEntry[]
}

export const RECALL_STARTERS = [
  'what is', 'what are', 'what was', 'define', 'list the', 'name the',
  'who is', 'who was', 'when did', 'where is', 'how many', 'what does',
]

// Distinctive multi-word phrases — safe to match anywhere in a sentence
// (e.g. after a filler like "Okay, why do you think..."), since a phrase
// this specific essentially never shows up mid-sentence in ordinary,
// non-interrogative classroom speech.
export const HIGHER_ORDER_STARTERS = [
  'how would', 'how might', 'how does', 'what would happen if',
  'what if', 'why do you think', 'what evidence',
  'defend your', 'how could', 'what could',
]

// Single, ambiguous words — trustworthy only when they open the sentence.
// Matched anywhere mid-sentence, these produce real false positives: "while
// I explain the next part" or "here's how we'll do this" aren't questions,
// but each contains one of these words. RECALL_STARTERS already applies
// this same sentence-initial-only rule; this list mirrors it.
export const HIGHER_ORDER_STARTERS_STRICT = ['why', 'explain', 'compare', 'justify']

export const CFU_PHRASES = [
  'thumbs up', 'thumbs down', 'turn and talk', 'on a scale of',
  'raise your hand if', 'show me with your fingers', 'talk to your partner',
  'fist to five',
  // Exit tickets. Only when said aloud — one on a slide, form, or handout
  // never shows up. "Before you leave" alone is too common ("…push in your
  // chairs"), so it only counts followed by answer/write, with or without
  // the comma transcription may add; "3-2-1" is left out because it's far
  // more often a countdown than the 3-2-1 exit routine.
  'exit ticket', 'exit slip', 'ticket out the door', 'ticket to leave',
  'before you leave, answer', 'before you leave answer',
  'before you leave, write', 'before you leave write',
]

// A short, generic description per matched phrase — never derived from
// the surrounding sentence's actual content, since a fixed phrase match
// can't tell what was being checked, only that a check-style move was
// made.
const CFU_PHRASE_DESCRIPTIONS: Record<string, string> = {
  'thumbs up': 'A quick individual signal check.',
  'thumbs down': 'A quick individual signal check.',
  'turn and talk': 'A peer discussion check.',
  'talk to your partner': 'A peer discussion check.',
  'on a scale of': 'A self-rated confidence check.',
  'raise your hand if': 'A show-of-hands check.',
  'show me with your fingers': 'A quick individual signal check.',
  'fist to five': 'A self-rated confidence check.',
  'exit ticket': 'An end-of-lesson written check.',
  'exit slip': 'An end-of-lesson written check.',
  'ticket out the door': 'An end-of-lesson written check.',
  'ticket to leave': 'An end-of-lesson written check.',
  'before you leave, answer': 'An end-of-lesson written check.',
  'before you leave answer': 'An end-of-lesson written check.',
  'before you leave, write': 'An end-of-lesson written check.',
  'before you leave write': 'An end-of-lesson written check.',
}

/// "let's go" was here and has been removed. Across all 25 real lessons it
/// was the ONLY phrase in this list that ever fired, and all four of its hits
/// were wrong: "Let's go real quick" moving to the last question, "So let's
/// go back to 1340 though" navigating content, "Let's go back to our car on
/// the ramp" mid-explanation, and "Let's go have some fun" from a recording
/// that was not a classroom. It also sits in buildContentExhibits' exclusion
/// list, so it was deleting genuine content talk from the evidence pool. Its
/// neighbours "let's move on" and "alright, let's" live in
/// TRANSITION_PHRASES, which is what "let's go" actually is.
export const REDIRECTION_PHRASES = [
  'eyes up here', 'eyes on me', 'eyes up front', 'stop talking', 'focus up',
  'put that away', 'settle down', 'quiet please', 'i need everyone', 'voices off',
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
// score. Only a recording too short to have a meaningful start (see
// reportConfidence.ts on the frontend for why 30s is the floor for
// "meaningfully captured") makes the stated-objective check unavailable.
const MIN_PHASE_DURATION_SEC = 30

/// Beyond this, a gap between a student finishing and the teacher speaking is
/// independent work, a transition or a recording artifact — not a teacher
/// deliberately leaving space, which is the only thing wait time 2 is about.
const WAIT_TIME_2_MAX_SEC = 30

/// Same ceiling, same reason: a longer gap after a question is independent
/// work, a transition, or a hole in the recording — not a teacher waiting.
const PAUSE_AFTER_QUESTION_MAX_SEC = 30

/// Below this much teacher speech, a words-a-minute figure is division by
/// noise: a few short turns and one mis-transcription move it enormously.
const MIN_TEACHER_SEC_FOR_RATE = 60

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}
// A detected Opening phase is often just the first 10% of the recording
// (the proportional fallback when no transition phrase is heard), which
// can end before a teacher states the objective — so the search always
// covers at least the first five minutes.
const OBJECTIVE_SEARCH_MIN_SEC = 5 * 60
const MAX_CONNECTION_QUOTES = 3
const MAX_VOCABULARY_QUOTES = 5
// A cloud reads better fuller than the old flat chip list's cap did.
const MAX_TOPIC_TERMS_PER_SPEAKER = 20

export type TopicTerm = { term: string; count: number }

export type LessonContentResult = {
  topicTerms: { teacher: TopicTerm[]; student: TopicTerm[] }
  statedObjective: {
    found: boolean | null
    quote: string | null
    timestampSec: number | null
    /// Which detector answered. 'phrase' is the fixed-phrase scan in this
    /// file; 'model' is `lessonObjective.ts` reading the whole transcript.
    /// Kept so the report can be honest about how it knows.
    source?: 'phrase' | 'model'
  }
  /// What the lesson covered, in one or two sentences. Null when no model
  /// read happened or the transcript was too fragmentary to say.
  summary?: string | null
  connections: { quote: string; timestampSec: number }[]
  vocabulary: { quote: string; timestampSec: number }[]
  /// The lesson's academic vocabulary and who used it — see keyTerms.ts.
  /// Absent on reports analyzed before this shipped, and when none was found.
  keyTerms?: { term: string; teacherCount: number; studentCount: number }[]
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
  // Contractions — conversational filler, not academic vocabulary, but the
  // extraction regex allows apostrophes so these otherwise slip through.
  "let's", "i'll", "i'm", "i've", "i'd", "we're", "we'll", "we've", "you're",
  "you'll", "you've", "they're", "they'll", "they've", "that's", "it's",
  "there's", "don't", "didn't", "doesn't", "isn't", "aren't", "wasn't",
  "weren't", "can't", "won't", "couldn't", "wouldn't", "shouldn't", "what's",
])

function extractTopicTerms(
  segments: Segment[],
  speakerLabel: 'Teacher' | 'Student',
  max = MAX_TOPIC_TERMS_PER_SPEAKER,
): TopicTerm[] {
  const counts = new Map<string, { count: number; display: string }>()
  for (const segment of segments) {
    if (segment.speakerLabel !== speakerLabel) continue
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
    .slice(0, max)
    .map((v) => ({ term: v.display, count: v.count }))
}

function detectStatedObjective(segments: Segment[], phases: Phase[]): LessonContentResult['statedObjective'] {
  const recordedSec = segments.length ? Math.max(...segments.map((s) => s.endSec)) : 0
  if (recordedSec < MIN_PHASE_DURATION_SEC) {
    return { found: null, quote: null, timestampSec: null }
  }
  // Everything below is the fallback path — see `lessonObjective.ts`, which
  // reads the whole transcript and overrides this when the model answers.
  const openingEndSec = phases.find((p) => p.label === 'Opening')?.endSec ?? 0
  const windowEndSec = Math.max(openingEndSec, OBJECTIVE_SEARCH_MIN_SEC)
  const openingTeacherSegments = segments.filter((s) => s.speakerLabel === 'Teacher' && s.startSec < windowEndSec)
  for (const segment of openingTeacherSegments) {
    if (countPhraseMatches(segment.text, OBJECTIVE_PHRASES) > 0) {
      return { found: true, quote: segment.text, timestampSec: segment.startSec, source: 'phrase' }
    }
  }
  return { found: false, quote: null, timestampSec: null, source: 'phrase' }
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
    topicTerms: {
      teacher: extractTopicTerms(ordered, 'Teacher'),
      student: extractTopicTerms(ordered, 'Student'),
    },
    statedObjective: detectStatedObjective(ordered, phases),
    connections: detectPhraseQuotes(ordered, CONNECTION_PHRASES, MAX_CONNECTION_QUOTES),
    vocabulary: detectPhraseQuotes(ordered, VOCABULARY_PHRASES, MAX_VOCABULARY_QUOTES, VOCABULARY_PATTERN),
    subject: detectSubject(ordered),
  }
}

// Capitalized words that are never a student being addressed: discourse
// markers, praise words, days, months, subjects, and ways of addressing the
// whole room.
export const NAME_MENTION_STOPWORDS = new Set([
  'okay', 'ok', 'so', 'now', 'well', 'great', 'good', 'alright', 'first',
  'next', 'then', 'today', 'yes', 'no', 'yeah', 'yep', 'nope', 'actually',
  'basically', 'obviously', 'remember', 'also', 'again', 'ready', 'here',
  'there', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may',
  'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'math', 'science', 'english', 'history', 'reading', 'writing', 'spelling',
  'thank', 'thanks', 'please', 'sorry', 'right', 'sure', 'cool', 'awesome',
  'perfect', 'excellent', 'exactly', 'correct', 'nice', 'wow', 'oh', 'um',
  'uh', 'hmm', 'hi', 'hey', 'hello', 'everyone', 'everybody', 'guys', 'class',
  'folks', 'friends', 'students', 'kids', 'boys', 'girls', 'sir', 'miss',
  'mister', 'teacher', 'let', 'lets', 'who', 'what', 'why', 'how', 'when',
  'where', 'which', 'if', 'but', 'and', 'or', 'because', 'however', 'anyway',
  'listen', 'look', 'wait', 'stop', 'go', 'come', 'raise', 'hands',
])

// Words that, right before a capitalized word, mark it as someone being
// spoken to: "Thank you, Sarah", "Go ahead Marcus", "Nice job, Aaliyah".
// Words that follow "Name," when the teacher is talking to that student
// ("Sarah, can you…", "Marcus, please sit") — and not when a lesson topic
// opens a sentence ("Egypt, however, …", "Hamlet, like Marcus, …").
const ADDRESS_FOLLOWERS = new Set([
  'can', 'could', 'would', 'will', 'do', 'did', 'are', 'what', 'why', 'how', 'where', 'who', 'when',
  'you', 'your', 'youre', 'please', 'go', 'come', 'let', 'tell', 'read', 'share', 'try', 'give',
  'eyes', 'stop', 'sit', 'put', 'thank', 'thanks', 'nice', 'great', 'good', 'excellent', 'i', 'thats',
  'yes', 'okay', 'ok', 'hands', 'look', 'listen', 'wait',
])

const ADDRESS_LEADS = new Set(['thanks', 'you', 'yes', 'ahead', 'nice', 'job', 'okay', 'ok', 'please', 'hi', 'hey', 'morning', 'right', 'sure', 'great', 'good'])

// Counting every capitalized word as a student's name badly over-counts:
// transcription capitalizes lesson content too — a character, a city, a
// historical figure — so a lecture with no students in the room could report
// dozens of "names". Teachers use a student's name to *address* them, so a
// word only counts when it is set off like direct address:
//   - it opens the sentence followed by a comma ("Sarah, can you…"),
//   - it closes the sentence after a comma ("What do you think, Sarah?"),
//   - or it follows an address phrase ("Thank you, Marcus", "Go ahead Jordan").
// Every other capitalized occurrence is tallied as content, and a word used
// more often as content than as address is dropped entirely (the novel's
// protagonist is not a student). Still a heuristic, not a roster — like every
// count in this file, a suggestion for the coach to confirm.
// A name as transcription writes it: capitalized, with at least one
// lowercase letter (so acronyms like DNA don't count), any Unicode letters
// (José, Zoë), and internal capitals, apostrophes, or hyphens (DeShawn,
// McKenzie, O'Brien, Mary-Kate). The old ASCII-only /^[A-Z][a-z]+$/ check
// silently dropped every one of these, and stripped "José" to "Jos".
const NAME_SHAPE = /^\p{Lu}(?=.*\p{Ll})\p{L}*(?:['’-]\p{L}+)*$/u
// Contractions of pronouns/verbs ("I'm", "They're") — not names.
const CONTRACTION_SUFFIX = /['’](?:m|re|ll|ve|d|t)$/i

function extractCapitalizedWords(text: string): { addressed: string[]; content: string[] } {
  const addressed: string[] = []
  const content: string[] = []
  for (const { sentence } of splitSentences(text)) {
    const words = sentence.split(/\s+/).filter(Boolean)
    for (let i = 0; i < words.length; i++) {
      const raw = words[i]
      // Trim surrounding punctuation, then a possessive ("Sarah's" → "Sarah").
      const cleaned = raw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').replace(/['’]s$/i, '')
      if (!NAME_SHAPE.test(cleaned) || CONTRACTION_SUFFIX.test(cleaned)) continue
      if (NAME_MENTION_STOPWORDS.has(cleaned.toLowerCase().replace(/['’]/g, ''))) continue
      const previous = i > 0 ? words[i - 1] : ''
      const previousWord = previous.replace(/[^A-Za-z]/g, '').toLowerCase()
      const last = i === words.length - 1
      const nextWord = (words[i + 1] ?? '').replace(/[^A-Za-z]/g, '').toLowerCase()
      const opensWithComma = i === 0 && raw.endsWith(',') && ADDRESS_FOLLOWERS.has(nextWord)
      const closesAfterComma = last && previous.endsWith(',')
      const afterAddressLead = i > 0 && ADDRESS_LEADS.has(previousWord) && (last || raw.endsWith(','))
      if (opensWithComma || closesAfterComma || afterAddressLead) addressed.push(cleaned)
      else if (i > 0) content.push(cleaned)
    }
  }
  return { addressed, content }
}

/// Every name the teacher addressed someone by, across the lesson — for
/// keeping students' names out of quotes shown in the report.
export function addressedNamesIn(segments: Segment[]): string[] {
  const names = new Set<string>()
  for (const s of segments) {
    if (s.speakerLabel !== 'Teacher') continue
    for (const name of extractCapitalizedWords(s.text).addressed) names.add(name)
  }
  return [...names]
}

// Session-level filter over every teacher segment's capitalized words.
function resolveNameMentions(addressed: string[], content: string[], hasStudentTalk: boolean): string[] {
  // No student voice anywhere means nobody was there to be called on.
  if (!hasStudentTalk) return []
  const contentCounts = new Map<string, number>()
  for (const word of content) contentCounts.set(word.toLowerCase(), (contentCounts.get(word.toLowerCase()) ?? 0) + 1)
  const addressedCounts = new Map<string, number>()
  for (const word of addressed) addressedCounts.set(word.toLowerCase(), (addressedCounts.get(word.toLowerCase()) ?? 0) + 1)
  return addressed.filter((word) => (contentCounts.get(word.toLowerCase()) ?? 0) <= (addressedCounts.get(word.toLowerCase()) ?? 0))
}

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

// Things a teacher says that Deepgram punctuates as questions because the
// pitch rose, and that no teacher would call a question: "Okay?", "Right?",
// the tag they drop at the end of a sentence to check the room is still with
// them. Counted as questions they inflate the denominator of the higher-order
// percentage, so a teacher with the habit is told their questioning is weaker
// than it was, and the sequence list fills with one-word entries whose
// question mark the display has already stripped.
//
// Only consulted when `classifyQuestion` found nothing, and only when the
// token is the WHOLE sentence — "Okay, what did we learn yesterday?" is one
// sentence, not a bare "okay", and stays a question.
const BARE_ACKNOWLEDGMENTS = new Set([
  'okay', 'ok', 'right', 'alright', 'all right', 'yeah', 'yes', 'yep', 'no',
  'sure', 'correct', 'good', 'hmm', 'huh', 'mhm', 'uh huh', 'mm hmm',
])

// Deliberately absent: "make sense" and "does that make sense". They are weak
// comprehension checks, but they are checks — a teacher who asks one is doing
// something the teacher who says "Okay?" is not.
function isBareAcknowledgment(sentence: string): boolean {
  const normalized = sentence
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  return BARE_ACKNOWLEDGMENTS.has(normalized)
}

// Words that open a question rather than a statement. Used to let a genuinely
// short question through the length rule below — "Any others?" is two words
// and is a real question; "Tomatoes?" is one word and is a teacher reading an
// ingredient list with a rising pitch.
//
// Only openers that can carry a WHOLE short question. Auxiliaries are
// deliberately absent: a real auxiliary question is three words anyway ("Do
// you agree?", "Is it yummy?") so it clears the length rule on its own, while
// listing them here rescued bare fragments like "have?" left behind when
// Deepgram split a sentence.
const INTERROGATIVE_OPENERS = [
  'what', 'why', 'how', 'who', 'when', 'where', 'which', 'whose',
  'any', 'anyone', 'anybody', 'questions',
]

function opensLikeAQuestion(sentence: string): boolean {
  const first = normalizeWords(sentence)[0]
  return first != null && INTERROGATIVE_OPENERS.includes(first)
}

function normalizeWords(sentence: string): string[] {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/// A question needs enough of itself to be one.
///
/// Deepgram punctuates rising pitch, and a teacher reading a list — "Tomato
/// paste? Bell peppers? Onions?" — scored one question per ingredient. The
/// same transcript also splits real questions across utterances, leaving
/// pieces like "have" and "it called" that each ended up counted.
///
/// So a fragment has to earn it: three words, or an opening that only a
/// question uses. "Any others?" passes on the second rule; "Tomatoes?" fails
/// both, which is the distinction the ear makes too.
const MIN_QUESTION_WORDS = 3

function hasEnoughToBeAQuestion(sentence: string): boolean {
  return normalizeWords(sentence).length >= MIN_QUESTION_WORDS || opensLikeAQuestion(sentence)
}

/// `endedWithQuestion` is passed in because two of these lists are openers a
/// teacher also uses for instructions. "Compare with your neighbours." and
/// "Explain your reasoning." are directives, not questions, and counting them
/// put instructions into the higher-order percentage — the single number a
/// teacher is most likely to read as a judgement about their teaching.
/// Deepgram splits on pauses, not sentences, so one spoken question routinely
/// arrives as two utterances — "So how" then "much of each ingredient does Mia
/// need?" Counting each piece that ends in a question mark turned one question
/// into one-and-a-fragment, and printed the fragment in the teacher's sequence
/// list as though that were what they said.
///
/// So a turn's text is carried forward until it actually ends a sentence, and
/// the whole thing is attributed to where it started. Only the question path
/// uses this: talk time and everything else still measure the real segments,
/// because a joined segment would silently count the pause between them as
/// speech.
const MAX_JOIN_GAP_SEC = 2

type PreparedSegment = { text: string; startSec: number }

function joinFragmentedSpeech(ordered: Segment[]): PreparedSegment[] {
  const prepared: PreparedSegment[] = []
  let carried = ''
  let carriedStart: number | null = null

  ordered.forEach((segment, index) => {
    const previous = ordered[index - 1]
    const continues =
      carried !== '' &&
      previous != null &&
      previous.speakerLabel === segment.speakerLabel &&
      segment.startSec - previous.endSec <= MAX_JOIN_GAP_SEC
    const text = continues ? `${carried} ${segment.text.trim()}`.trim() : segment.text.trim()
    const startSec = continues && carriedStart != null ? carriedStart : segment.startSec

    const next = ordered[index + 1]
    const nextContinues =
      next != null &&
      next.speakerLabel === segment.speakerLabel &&
      next.startSec - segment.endSec <= MAX_JOIN_GAP_SEC

    if (!/[.?!]\s*$/.test(text) && nextContinues) {
      carried = text
      carriedStart = startSec
      // Held back — it is the first half of something.
      prepared.push({ text: '', startSec: segment.startSec })
    } else {
      carried = ''
      carriedStart = null
      prepared.push({ text, startSec })
    }
  })

  return prepared
}

function classifyQuestion(sentence: string, endedWithQuestion: boolean): 'higher_order' | 'recall' | null {
  const s = sentence.toLowerCase()
  if (HIGHER_ORDER_STARTERS.some((p) => s.startsWith(p) || s.includes(` ${p}`))) return 'higher_order'
  if (endedWithQuestion && HIGHER_ORDER_STARTERS_STRICT.some((p) => s.startsWith(p))) return 'higher_order'
  if (RECALL_STARTERS.some((p) => s.startsWith(p))) return 'recall'
  return null
}

// Onboarding's live "read this aloud" demo — reuses the exact same
// sentence-splitting/classification/phrase-matching this file already uses
// for real session reports, so the detection is genuine, not staged.
export type DemoAnalysisTag = 'higher_order_question' | 'positive_language'

export function analyzeDemoClip(transcript: string): { highlightedText: string | null; tag: DemoAnalysisTag | null } {
  const sentences = splitSentences(transcript)
  for (const { sentence } of sentences) {
    if (classifyQuestion(sentence, true) === 'higher_order') {
      return { highlightedText: sentence, tag: 'higher_order_question' }
    }
  }
  for (const { sentence } of sentences) {
    if (findMatchedPhrase(sentence, POSITIVE_PHRASES)) {
      return { highlightedText: sentence, tag: 'positive_language' }
    }
  }
  return { highlightedText: null, tag: null }
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/// Fills in how long the teacher left each question hanging before speaking
/// again.
///
/// Exported because the question log is built TWICE: once by the phrase scan
/// here, and again by classroomMoves when Claude's read of the transcript
/// replaces it. The second build would otherwise drop these fields and the
/// measure would silently vanish on every lesson the model read succeeded
/// on — which is nearly all of them.
export function fillPauseAfterQuestion(questionLog: QuestionLogEntry[], ordered: Segment[]): void {
  for (const entry of questionLog) {
    // Needs speaker labels and end times, so it reads the raw ordered
    // segments rather than the joined `prepared` ones.
    const idx = ordered.findIndex((s) => s.endSec > entry.timestampSec)
    if (idx === -1 || ordered[idx].speakerLabel !== 'Teacher') continue
    // A question can sit inside a run of teacher segments; the pause starts
    // when the whole run ends, not when its first fragment does.
    //
    // Two consecutive teacher segments are ambiguous: one turn still running,
    // or the teacher speaking AGAIN after a pause. Walking over all of them
    // swallowed the second case entirely — a question the teacher answers
    // themselves came back with no pause at all, which is the very case this
    // measure exists to catch. MAX_JOIN_GAP_SEC is the transcript's own
    // definition of "still the same turn", so it decides here too.
    let endIdx = idx
    while (
      endIdx + 1 < ordered.length &&
      ordered[endIdx + 1].speakerLabel === 'Teacher' &&
      ordered[endIdx + 1].startSec - ordered[endIdx].endSec <= MAX_JOIN_GAP_SEC
    ) {
      endIdx++
    }
    const askedEnd = ordered[endIdx].endSec
    const rest = ordered.slice(endIdx + 1)
    const nextTeacher = rest.find((s) => s.speakerLabel === 'Teacher')
    if (!nextTeacher) continue
    const gap = nextTeacher.startSec - askedEnd
    // Beyond this the class has moved into independent work or the recording
    // has a hole in it; neither is a teacher holding a pause.
    if (gap < 0 || gap > PAUSE_AFTER_QUESTION_MAX_SEC) continue
    entry.pauseSec = Math.round(gap * 10) / 10
    entry.studentAudibleInPause = rest.some(
      (s) => s.speakerLabel !== 'Teacher' && s.startSec < nextTeacher.startSec,
    )
  }
}

/// The median silence the teacher held after a question when NOBODY answered.
///
/// Only the pauses with no audible student in them. A pause that contains an
/// answer is mostly the student talking — across real lessons those run to a
/// median of 6.0s against 3.9s for held silence, so averaging the two
/// produces a number that describes neither. This is the half the teacher
/// controls: they asked, no one spoke, and this is how long they left it.
///
/// Median rather than mean: one 28-second gap in a patchy recording would
/// otherwise carry a whole lesson.
export function heldSilenceFrom(questionLog: QuestionLogEntry[]): { sec: number | null; sampleCount: number } {
  const held = questionLog
    .filter((q) => q.pauseSec != null && !q.studentAudibleInPause)
    .map((q) => q.pauseSec as number)
    .sort((a, b) => a - b)
  if (held.length === 0) return { sec: null, sampleCount: 0 }
  return { sec: Math.round(held[Math.floor(held.length / 2)] * 10) / 10, sampleCount: held.length }
}

export function analyzeTranscript(segments: Segment[]): AnalysisResult {
  const ordered = [...segments].sort((a, b) => a.startSec - b.startSec)
  const prepared = joinFragmentedSpeech(ordered)
  const totalDurationSec = ordered.length ? Math.max(...ordered.map((s) => s.endSec)) : 0

  let teacherTalkSec = 0
  let studentTalkSec = 0
  let studentVoiceSegments = 0

  let questionCount = 0
  let recallQuestionCount = 0
  let higherOrderQuestionCount = 0
  let followUpQuestionCount = 0

  let cfuCount = 0
  const cfuLog: CfuLogEntry[] = []
  const feedbackLog: FeedbackLogEntry[] = []
  let redirectionCount = 0
  const redirectionLog: RedirectionLogEntry[] = []
  let redirectionStreak = 0
  let firstRedirectionTimestampSec: number | null = null
  let transitionCount = 0
  let directiveCount = 0
  const directiveLog: DirectiveLogEntry[] = []
  const lastDirectiveSeenAt = new Map<string, number>()
  let repeatedInstructionHighlightTaken = false
  let positivePhraseCount = 0
  let correctivePhraseCount = 0
  const toneLog: ToneLogEntry[] = []
  let genericFeedbackCount = 0
  let specificFeedbackCount = 0
  const addressedWords: string[] = []
  const contentWords: string[] = []

  const waitTimes: number[] = []
  const highlights: Highlight[] = []
  const transitionIndexes: number[] = []
  const questionLog: QuestionLogEntry[] = []

  let lastTeacherQuestionEndSec: number | null = null
  // A follow-up is a 3-turn pattern: teacher asks Q1, a student answers,
  // teacher asks Q2 building on that answer. awaitingStudentAnswer marks
  // "a teacher question just went out, no student has answered yet";
  // readyForFollowUp marks "a student just answered one" and survives
  // exactly through that one intervening student turn, so the *next*
  // teacher question — not the student segment itself — is what gets
  // checked and consumed.
  let awaitingStudentAnswer = false
  let readyForFollowUp = false
  let answersHeardCount = 0
  let answersFollowedUpCount = 0
  let followedThisAnswer = false
  const followUpLog: { timestampSec: number; text: string }[] = []
  const answerLog: { timestampSec: number; followed: boolean }[] = []
  const waitCandidates: { wait: number; segment: Segment }[] = []
  /// Wait time 2: a student turn ending, then the teacher's next turn. Capped
  /// at 30s because a longer gap is independent work or a recording artifact
  /// rather than a teacher holding a pause.
  const waitTime2s: number[] = []
  let teacherWords = 0
  let redirectionHighlightTaken = false
  let probingHighlightTaken = false
  let lastRootQuestionEntry: QuestionLogEntry | null = null
  let lastQuestionEntryForWait: QuestionLogEntry | null = null

  ordered.forEach((segment, index) => {
    const duration = Math.max(0, segment.endSec - segment.startSec)
    const isTeacher = segment.speakerLabel === 'Teacher'

    if (isTeacher) {
      teacherWords += countWords(segment.text)
      // The pause the teacher left after a student finished, before taking
      // the floor back.
      const previous = index > 0 ? ordered[index - 1] : null
      if (previous && previous.speakerLabel !== 'Teacher') {
        const gap = segment.startSec - previous.endSec
        if (gap >= 0 && gap <= WAIT_TIME_2_MAX_SEC) waitTime2s.push(gap)
      }
      teacherTalkSec += duration
    } else {
      studentTalkSec += duration
      studentVoiceSegments++
    }

    // Wait time is only ever question → *student* response. A teacher turn
    // right after the question isn't a measurable wait: the gap may be the
    // teacher pausing mid-thought, or a student answer too quiet to be
    // transcribed with the teacher then responding to it — either way,
    // counting it would report a number the audio doesn't support.
    if (lastTeacherQuestionEndSec !== null) {
      const wait = segment.startSec - lastTeacherQuestionEndSec
      if (!isTeacher && wait >= 0) {
        waitTimes.push(wait)
        waitCandidates.push({ wait, segment })
        if (lastQuestionEntryForWait) lastQuestionEntryForWait.waitTimeSec = round(wait, 2)
      }
      lastTeacherQuestionEndSec = null
      lastQuestionEntryForWait = null
    }

    const precedingWasStudent = index > 0 && ordered[index - 1].speakerLabel !== 'Teacher'

    if (isTeacher) {
      const cfuPhrase = findMatchedPhrase(segment.text, CFU_PHRASES)
      if (cfuPhrase) {
        cfuCount++
        cfuLog.push({
          timestampSec: segment.startSec,
          text: segment.text,
          whatItChecked: CFU_PHRASE_DESCRIPTIONS[cfuPhrase] ?? 'A verbal check for understanding.',
        })
      }

      const redirectionPhrase = findMatchedPhrase(segment.text, REDIRECTION_PHRASES)
      const redirectionHits = redirectionPhrase ? 1 : 0
      if (redirectionPhrase) {
        redirectionCount++
        redirectionLog.push({ timestampSec: segment.startSec, text: segment.text })
        redirectionStreak++
        if (firstRedirectionTimestampSec == null) firstRedirectionTimestampSec = segment.startSec
      } else {
        redirectionStreak = 0
      }
      if (redirectionStreak >= 2 && !redirectionHighlightTaken) {
        highlights.push({ label: 'Redirection cluster', timestampSec: segment.startSec, excerpt: segment.text })
        redirectionHighlightTaken = true
      }

      const transitionMatched = countPhraseMatches(segment.text, TRANSITION_PHRASES) > 0
      if (transitionMatched) {
        transitionCount++
        transitionIndexes.push(index)
      }

      const directivePhrase = findMatchedPhrase(segment.text, DIRECTIVE_PHRASES)
      if (directivePhrase) {
        directiveCount++
        directiveLog.push({ timestampSec: segment.startSec, text: segment.text })
        const lastSeen = lastDirectiveSeenAt.get(directivePhrase)
        if (lastSeen != null && segment.startSec - lastSeen <= 90 && !repeatedInstructionHighlightTaken) {
          highlights.push({ label: 'Repeated instruction', timestampSec: segment.startSec, excerpt: segment.text })
          repeatedInstructionHighlightTaken = true
        }
        lastDirectiveSeenAt.set(directivePhrase, segment.startSec)
      }

      // Positive/corrective are classified per turn, not summed per phrase
      // hit — a turn matching both is counted once, by whichever it hits
      // first, so "moments" of tone stay real instances, not phrase tallies.
      const positivePhrase = findMatchedPhrase(segment.text, POSITIVE_PHRASES)
      const correctivePhrase = !positivePhrase ? findMatchedPhrase(segment.text, CORRECTIVE_PHRASES) : null
      if (positivePhrase) {
        positivePhraseCount++
        toneLog.push({ timestampSec: segment.startSec, kind: 'positive', text: segment.text })
      } else if (correctivePhrase) {
        correctivePhraseCount++
        toneLog.push({ timestampSec: segment.startSec, kind: 'corrective', text: segment.text })
      }

      // A "feedback moment" is meant to capture the teacher responding to
      // what a student just said — not every teacher turn that happens to
      // follow one. Segments already accounted for as a different kind of
      // move (a CFU prompt, a redirection, a transition, a task directive,
      // or a new question of their own) are excluded here so they aren't
      // double-counted as feedback too.
      // Same test the question loop uses, guard included: a turn that is only
      // "Okay?" is no longer a question, so after a student answer it is what
      // it always was — a short, generic piece of feedback.
      const isQuestionSegment = splitSentences(prepared[index].text).some(
        ({ sentence, endedWithQuestion }) => {
          const classification = classifyQuestion(sentence, endedWithQuestion)
          if (!endedWithQuestion && !classification) return false
          if (!classification && isBareAcknowledgment(sentence)) return false
          return classification !== null || hasEnoughToBeAQuestion(sentence)
        },
      )
      const isFeedbackEligible =
        precedingWasStudent && !cfuPhrase && redirectionHits === 0 && !transitionMatched && !directivePhrase && !isQuestionSegment
      if (isFeedbackEligible) {
        const wordCount = segment.text.trim().split(/\s+/).filter(Boolean).length
        const referencesContent = /\b(because|since|so that|which|specifically)\b/i.test(segment.text)
        if (wordCount <= 4 && !referencesContent) {
          genericFeedbackCount++
          feedbackLog.push({ timestampSec: segment.startSec, kind: 'generic', text: segment.text })
        } else if (wordCount > 4) {
          specificFeedbackCount++
          feedbackLog.push({ timestampSec: segment.startSec, kind: 'specific', text: segment.text })
        }
      }

      let askedQuestionThisSegment = false
      let segmentEndsWithQuestion = false
      const sentences = splitSentences(prepared[index].text)
      sentences.forEach(({ sentence, endedWithQuestion }, sentenceIndex) => {
        const classification = classifyQuestion(sentence, endedWithQuestion)
        if (!endedWithQuestion && !classification) return
        // Before questionCount++, so one guard fixes the count, the
        // higher-order percentage and the sequence list at once.
        if (!classification && isBareAcknowledgment(sentence)) return
        if (!classification && !hasEnoughToBeAQuestion(sentence)) return
        if (sentenceIndex === sentences.length - 1) segmentEndsWithQuestion = true

        questionCount++
        askedQuestionThisSegment = true
        if (classification === 'higher_order') higherOrderQuestionCount++
        else recallQuestionCount++

        const entry: QuestionLogEntry = {
          timestampSec: prepared[index].startSec,
          type: classification === 'higher_order' ? 'higher_order' : 'recall',
          waitTimeSec: null,
          pauseSec: null,
          studentAudibleInPause: false,
          text: sentence.trim(),
          followUps: [],
        }

        if (precedingWasStudent && readyForFollowUp) {
          followUpQuestionCount++
          followUpLog.push({ timestampSec: round(segment.startSec, 1), text: sentence.trim() })
          if (!followedThisAnswer) {
            answersFollowedUpCount++
            followedThisAnswer = true
            if (answerLog.length > 0) answerLog[answerLog.length - 1].followed = true
          }
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

      // Whether or not this teacher turn used the follow-up opportunity, it
      // consumes it — the window is exactly one teacher turn wide.
      readyForFollowUp = false
      if (askedQuestionThisSegment) awaitingStudentAnswer = true
      // The wait clock starts at the segment's end, so it only means
      // anything when the question is what the segment ends on — for
      // "What's 3x? Okay, so..." the end-of-segment gap follows the
      // teacher's own continuation, not the question.
      if (segmentEndsWithQuestion) {
        lastTeacherQuestionEndSec = segment.endSec
      } else {
        lastQuestionEntryForWait = null
      }

      const capitalized = extractCapitalizedWords(segment.text)
      addressedWords.push(...capitalized.addressed)
      contentWords.push(...capitalized.content)
    } else {
      if (awaitingStudentAnswer) {
        answersHeardCount++
        answerLog.push({ timestampSec: round(segment.startSec, 1), followed: false })
      }
      readyForFollowUp = awaitingStudentAnswer
      followedThisAnswer = false
      awaitingStudentAnswer = false
    }
  })

  const nameMentions = resolveNameMentions(
    addressedWords,
    contentWords,
    ordered.some((segment) => segment.speakerLabel === 'Student'),
  )

  const longestWait = waitCandidates.length
    ? waitCandidates.reduce((best, candidate) => (candidate.wait > best.wait ? candidate : best))
    : null
  // Continuous talk only — see teacherStretch.ts for what used to be counted.
  const longestMonologue = longestTeacherStretch(ordered)
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
      excerpt: longestMonologue.opening,
      durationSec: round(longestMonologue.durationSec, 1),
    })
  }

  // How long the teacher left each question hanging before speaking again.
  //
  // A second pass rather than state threaded through the main loop: it needs
  // to look FORWARD from each question, and the loop only ever looks back.
  //
  // The gap is measured to the teacher's next turn, not to a student's, so
  // it exists for nearly every question instead of only the ones a student
  // audibly answered. Whether a student WAS audible inside it is recorded
  // rather than assumed — a silent gap and a gap containing an answer are
  // different facts and the report must not average them.
  fillPauseAfterQuestion(questionLog, ordered)
  const heldSilence = heldSilenceFrom(questionLog)

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
      answersHeardCount,
      answersFollowedUpCount,
      followUpLog,
      answerLog,
      waitTimeSampleCount: waitTimes.length,
      teacherWordsPerMinute:
        teacherTalkSec >= MIN_TEACHER_SEC_FOR_RATE ? Math.round((teacherWords / teacherTalkSec) * 60) : null,
      waitTime2Sec:
        waitTime2s.length > 0 ? round(waitTime2s.reduce((sum, w) => sum + w, 0) / waitTime2s.length, 1) : null,
      waitTime2SampleCount: waitTime2s.length,
      heldSilenceSec: heldSilence.sec,
      heldSilenceSampleCount: heldSilence.sampleCount,
      firstWordSec: ordered.length > 0 ? round(ordered[0].startSec, 1) : null,
      redirectionCount,
      firstRedirectionTimestampSec: firstRedirectionTimestampSec != null ? round(firstRedirectionTimestampSec, 1) : null,
      transitionCount,
      directiveCount,
      positivePhraseCount,
      correctivePhraseCount,
      positiveToCorrectiveRatio: correctivePhraseCount > 0 ? round(positivePhraseCount / correctivePhraseCount, 2) : null,
      genericFeedbackCount,
      specificFeedbackCount,
      nameMentionCount: nameMentions.length,
      uniqueNameCount: new Set(nameMentions.map((n) => n.toLowerCase())).size,
    },
    highlights: highlights.slice(0, 5),
    phases,
    questionLog,
    cfuLog,
    feedbackLog,
    directiveLog,
    toneLog,
    redirectionLog,
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
