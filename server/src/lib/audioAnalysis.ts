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

export type Highlight = { label: string; timestampSec: number; excerpt: string }
export type Phase = { label: string; startSec: number; endSec: number }

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
    positivePhraseCount: number
    correctivePhraseCount: number
    positiveToCorrectiveRatio: number | null
    genericFeedbackCount: number
    specificFeedbackCount: number
    nameMentionCount: number
  }
  highlights: Highlight[]
  phases: Phase[]
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

export const POSITIVE_PHRASES = [
  'good job', 'nice work', 'well done', 'great job', 'awesome', 'i like how',
  'excellent', 'great point', 'love that', 'nice thinking',
]

export const CORRECTIVE_PHRASES = [
  'not quite', "that's not right", 'try again', 'incorrect', "let's rethink",
  'not exactly', 'close, but', "that's not it",
]

const NAME_MENTION_PATTERN = /\b[A-Z][a-z]+\b/g

function countPhraseMatches(text: string, phrases: string[]): number {
  const lowerText = text.toLowerCase()
  return phrases.reduce((count, phrase) => (lowerText.includes(phrase) ? count + 1 : count), 0)
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
  let positivePhraseCount = 0
  let correctivePhraseCount = 0
  let genericFeedbackCount = 0
  let specificFeedbackCount = 0
  let nameMentionCount = 0

  const waitTimes: number[] = []
  const highlights: Highlight[] = []
  const transitionIndexes: number[] = []

  let lastTeacherQuestionEndSec: number | null = null
  let prevTeacherAskedFollowingStudent = false
  const waitCandidates: { wait: number; segment: Segment }[] = []
  let redirectionHighlightTaken = false
  let probingHighlightTaken = false

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
      }
      lastTeacherQuestionEndSec = null
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

        if (precedingWasStudent && prevTeacherAskedFollowingStudent) {
          followUpQuestionCount++
          if (!probingHighlightTaken) {
            highlights.push({ label: 'Follow-up / probing question', timestampSec: segment.startSec, excerpt: segment.text })
            probingHighlightTaken = true
          }
        }
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
    })
  }
  if (longestMonologue) {
    highlights.push({
      label: 'Longest uninterrupted teacher monologue',
      timestampSec: longestMonologue.startSec,
      excerpt: longestMonologue.text,
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
      positivePhraseCount,
      correctivePhraseCount,
      positiveToCorrectiveRatio: correctivePhraseCount > 0 ? round(positivePhraseCount / correctivePhraseCount, 2) : null,
      genericFeedbackCount,
      specificFeedbackCount,
      nameMentionCount,
    },
    highlights: highlights.slice(0, 5),
    phases,
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
