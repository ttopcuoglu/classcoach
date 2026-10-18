import { strict as assert } from 'node:assert'
import test from 'node:test'
import type { AudioSessionWithSegments, TranscriptSegment } from './api.ts'
import { buildInsightsModel, contextLines, MAX_QUOTE_WORDS, splitCoachNote, trimQuote } from './insightsModel.ts'

const seg = (speakerLabel: string, startSec: number, endSec: number, text: string): TranscriptSegment => ({
  id: `${speakerLabel}-${startSec}`,
  speakerLabel,
  rawSpeakerTag: speakerLabel === 'Teacher' ? 'Speaker 0' : 'Speaker 1',
  startSec,
  endSec,
  text,
})

test('a long line is cut to a boundary, and stays the teacher’s exact words', () => {
  const long =
    'So when you write the hook, you want the reader to see something right away. ' +
    'Think about the gym, the lights, the sound of the ball on the floor, and the crowd that is waiting for the shot to drop.'
  const { quote, cut } = trimQuote(long)
  assert.ok(long.startsWith(quote), 'an exact prefix, never stitched')
  assert.ok(quote.split(/\s+/).length <= MAX_QUOTE_WORDS)
  assert.equal(quote, 'So when you write the hook, you want the reader to see something right away.')
  assert.equal(cut, false)
  assert.deepEqual(trimQuote('Short and whole.'), { quote: 'Short and whole.', cut: false })
})

test('context is the teacher’s own line before and after, never a student’s', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Who has a character they just call my dad?'),
    seg('Student', 15, 17, 'Me, I do.'),
    seg('Teacher', 18, 22, 'Anybody else have a character who is unnamed?'),
    seg('Teacher', 23, 26, 'Okay, so you might use a pseudonym.'),
  ]
  // The quoted line is 18s; 23s is a separate line 1s later, so the run is
  // 18–26 and its neighbours are what came before it.
  const ctx = contextLines(segments, { segmentId: 'Teacher-18', endSegmentId: 'Teacher-18' })
  assert.equal(ctx.before?.text, 'Who has a character they just call my dad?', 'the student line is skipped')
  assert.equal(ctx.after?.text, 'Okay, so you might use a pseudonym.')
})

test('the coach note leads with its first sentence', () => {
  assert.deepEqual(splitCoachNote('You moved quickly. The middle was writing time.'), {
    lead: 'You moved quickly.',
    more: 'The middle was writing time.',
  })
  assert.equal(splitCoachNote('  '), null)
})

/// The teacher's lines, one per quote, spaced so none joins the next — the
/// model only shows words it can find in the transcript.
function said(...lines: [number, string][]): TranscriptSegment[] {
  return lines.map(([at, text]) => seg('Teacher', at, at + 3, text))
}

function lesson(over: Partial<AudioSessionWithSegments>): AudioSessionWithSegments {
  return {
    segments: [],
    metricsDetail: {},
    questionLog: null,
    cfuLog: null,
    feedbackLog: null,
    teachingMoves: null,
    lessonContent: null,
    contentNotes: null,
    nextSteps: null,
    durationSec: 900,
    teacherTalkPct: 40,
    ...over,
  } as unknown as AudioSessionWithSegments
}

test('every count is the evidence it shows', () => {
  const model = buildInsightsModel(
    lesson({
      segments: said(
        [10, 'What did we read yesterday?'],
        [40, 'Why would a name matter in a story?'],
        [88, 'Anybody else have a character who is unnamed?'],
        [302, 'Two minutes, write one hook, put it in the doc.'],
        [750, 'Okay, keep working on it everyone.'],
      ),
      questionLog: [
        { timestampSec: 10, type: 'recall', waitTimeSec: null, text: 'What did we read yesterday?', followUps: [] },
        { timestampSec: 40, type: 'higher_order', waitTimeSec: null, text: 'Why would a name matter in a story?', followUps: [] },
      ],
      teachingMoves: {
        invitations: [{ quote: 'Anybody else have a character who is unnamed?', timestampSec: 88 }],
        selfAnswered: [],
        directions: [
          { quote: 'Two minutes, write one hook, put it in the doc.', timestampSec: 302, parts: ['task', 'steps', 'time', 'product'] },
          { quote: 'Okay, keep working on it everyone.', timestampSec: 750, parts: ['task'] },
        ],
      },
    }),
  )
  const higher = model.questioning.findings.find((f) => f.key === 'higher_order_questions')!
  assert.equal(higher.value, '1 of 2')
  assert.equal(higher.evidence.length, 2)
  assert.equal(higher.featured?.full, 'Why would a name matter in a story?', 'a strength is featured')
  const dirs = model.clarity.findings.find((f) => f.key === 'directions')!
  assert.equal(dirs.value, '1 of 2 complete')
  assert.equal(dirs.evidence[0].polarity, 'strength', 'strengths come first')
  assert.match(model.clarity.keepTry.tryNext!.text, /steps, time, and product/)
  const inv = model.talk.findings.find((f) => f.key === 'invitations')!
  assert.equal(inv.value, '1')
  assert.equal(inv.showAllLabel, undefined, 'no "Show all" for one item')
})

test('a read that never ran is unavailable; one that found nothing is none', () => {
  const never = buildInsightsModel(lesson({ teachingMoves: null }))
  assert.equal(never.talk.findings[0].state, 'unavailable')
  assert.equal(never.talk.findings[0].value, null, 'never rendered as zero')
  const none = buildInsightsModel(lesson({ teachingMoves: { invitations: [] } }))
  assert.equal(none.talk.findings[0].state, 'confirmed_none')
  assert.equal(none.talk.findings[0].value, '0')
})

test('an unsafe line is withheld, never featured over a safe one', () => {
  const model = buildInsightsModel(
    lesson({
      segments: said([5, 'Shut up and listen, who has an idea?'], [9, 'Who else has a hook in mind?']),
      teachingMoves: {
        invitations: [
          { quote: 'Shut up and listen, who has an idea?', timestampSec: 5 },
          { quote: 'Who else has a hook in mind?', timestampSec: 9 },
        ],
      },
    }),
  )
  const inv = model.talk.findings[0]
  assert.equal(inv.featured?.full, 'Who else has a hook in mind?')
  assert.equal(inv.evidence.find((e) => e.timestampSec === 5)?.withheld, 'unsafe')
})

test('a quote that cannot be found word for word is counted but not shown', () => {
  const model = buildInsightsModel(
    lesson({
      segments: said([30, 'Who else has a hook in mind?']),
      // The model rewrote the line; nothing like it is in the transcript.
      teachingMoves: { invitations: [{ quote: 'Does anyone else want to share their hook with us?', timestampSec: 30 }] },
    }),
  )
  const inv = model.talk.findings[0]
  assert.equal(inv.value, '1', 'still counted — the moment was read')
  assert.equal(inv.evidence[0].withheld, 'unmatched')
  assert.equal(inv.evidence[0].segmentId, undefined)
})

test('a shown quote carries the line it came from, in the transcript’s exact words', () => {
  const model = buildInsightsModel(
    lesson({
      segments: said([30, 'Who else has a hook in mind? Just shout it.']),
      teachingMoves: { invitations: [{ quote: 'who else has a hook in mind', timestampSec: 30 }] },
    }),
  )
  const e = model.talk.findings[0].featured!
  assert.equal(e.full, 'Who else has a hook in mind?')
  assert.equal(e.segmentId, 'Teacher-30')
})

test('a line featured under one finding is not featured again in the same section', () => {
  const line = 'So who here knows what a transitional phrase is?'
  const model = buildInsightsModel(
    lesson({
      segments: said([22, line], [60, 'Does that make sense to everyone so far?']),
      questionLog: [{ timestampSec: 22, type: 'higher_order', waitTimeSec: null, text: line, followUps: [] }],
      cfuLog: [
        { timestampSec: 22, text: line, whatItChecked: 'a term' },
        { timestampSec: 60, text: 'Does that make sense to everyone so far?', whatItChecked: 'understanding' },
      ],
    }),
  )
  const higher = model.questioning.findings.find((f) => f.key === 'higher_order_questions')!
  const checks = model.questioning.findings.find((f) => f.key === 'spoken_checks')!
  assert.equal(higher.featured?.full, line)
  assert.equal(checks.featured?.full, 'Does that make sense to everyone so far?')
})

test('specialist notes read as "why it works" and "next move", and a linked one names its guidance', async () => {
  const { applyGuidanceLinks } = await import('./insightsModel.ts')
  const model = buildInsightsModel(
    lesson({
      segments: said([157, 'What options does the code provide for confidential or anonymous reporting?'], [118, 'Matches our prediction pretty perfectly.']),
      lessonContent: { subject: 'business', summary: 'Codes of conduct and ethics', connections: [], vocabulary: [], topicTerms: [], statedObjective: { found: false, quote: null, timestampSec: null } },
      contentNotes: {
        subject: 'business',
        notes: [
          { id: 'a', label: 'What worked', text: 'Checking predictions against a real code.', timestampSec: 118, excerpt: 'Matches our prediction pretty perfectly.' },
          { id: 'b', label: 'Where it could go further', text: 'Draw the line between the two terms.', timestampSec: 157, excerpt: 'What options does the code provide for confidential or anonymous reporting?' },
        ],
        misconceptions: ['Students often treat anonymous and confidential reporting as the same thing.'],
        rewrites: 1,
      },
    }),
  )
  const worked = model.content.findings.find((f) => f.key === 'what_worked')!
  assert.equal(worked.featured?.whyLabel, 'Why it works in business:')
  const further = model.content.findings.find((f) => f.key === 'take_it_further')!
  assert.equal(further.featured?.whyLabel, 'Next move:')
  assert.equal(model.content.rewritesLeft, 1)

  const linked = applyGuidanceLinks(model.content, [{ stuckIndex: 0, evidenceId: further.featured!.id }])
  const linkedLine = linked.findings.find((f) => f.key === 'take_it_further')!.featured!
  assert.match(linkedLine.linked!, /anonymous and confidential/)
  assert.equal(linked.guidance.stuckLinks[0], 157, 'the guidance points back at the moment')
})

test('a line cut mid-clause is not featured while a complete one is available', () => {
  const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
  const model = buildInsightsModel(
    lesson({
      segments: said([10, long], [20, 'Who else has a hook in mind?']),
      teachingMoves: {
        invitations: [
          { quote: long, timestampSec: 10 },
          { quote: 'Who else has a hook in mind?', timestampSec: 20 },
        ],
      },
    }),
  )
  const inv = model.talk.findings[0]
  assert.equal(inv.evidence.find((e) => e.timestampSec === 10)?.cut, true)
  assert.equal(inv.featured?.full, 'Who else has a hook in mind?')
})

test('held open sits right after higher-order questions, with answered-yourself beside it', () => {
  const keys = buildInsightsModel(lesson({})).questioning.findings.map((f) => f.key)
  assert.deepEqual(keys, ['higher_order_questions', 'held_open', 'self_answered', 'spoken_checks'])
  assert.ok(!buildInsightsModel(lesson({})).talk.findings.some((f) => f.key === 'fast_stretches'), 'fast stretches are gone')
})

test('held open: thinking questions only, typical is the median, self-answered left out', () => {
  const q = (timestampSec: number, type: 'recall' | 'higher_order', text: string, heldOpen?: object) => ({
    timestampSec, type, waitTimeSec: null, text, followUps: [], ...(heldOpen ? { heldOpen } : {}),
  })
  const closed = (sec: number) => ({ outcome: 'closed', questionType: 'explain', sec, closedBy: 'Yes, exactly.', closedAtSec: 0, how: 'confirmed' })
  const model = buildInsightsModel(
    lesson({
      segments: said(
        [10, 'What year was it signed?'],
        [40, 'Why would they sign it then?'],
        [100, 'How does that compare to France?'],
        [200, 'What would you have done?'],
        [300, 'Why is it red? Because of the iron.'],
      ),
      questionLog: [
        q(10, 'recall', 'What year was it signed?', closed(30)),
        q(40, 'higher_order', 'Why would they sign it then?', closed(2)),
        q(100, 'higher_order', 'How does that compare to France?', closed(9)),
        q(200, 'higher_order', 'What would you have done?', { outcome: 'open', questionType: 'opinion', sec: null, closedBy: null, closedAtSec: null, how: null }),
        q(300, 'higher_order', 'Why is it red?', closed(1)),
      ] as never,
      teachingMoves: { invitations: [], directions: [], selfAnswered: [{ quote: 'Why is it red? Because of the iron.', timestampSec: 300 }] } as never,
    }),
  )
  const held = model.questioning.findings.find((f) => f.key === 'held_open')!
  // 2, 9 and still-open (counted at 120): the recall question and the one
  // answered in the same breath are not thinking questions held open.
  assert.equal(held.state, 'measured')
  assert.equal(held.value, 'Typically 9s')
  assert.match(held.caveat ?? '', /^2 of 3 held 3s\+/)
  assert.match(held.caveat ?? '', /an estimate: recorded before voice checks/, 'no speaker confidence on these lines')
  assert.equal(model.questioning.heldOpen.length, 3)
  assert.equal(held.evidence.find((e) => e.full === 'Why would they sign it then?')?.polarity, 'growth')
  assert.equal(held.evidence.find((e) => e.full === 'What would you have done?')?.tag, 'Still open after 2 min')
})

test('held open: none and not-yet-read are told apart', () => {
  const recallOnly = buildInsightsModel(
    lesson({ questionLog: [{ timestampSec: 10, type: 'recall', waitTimeSec: null, text: 'What year?', followUps: [] }] }),
  ).questioning.findings.find((f) => f.key === 'held_open')!
  assert.equal(recallOnly.state, 'confirmed_none')
  assert.equal(recallOnly.note, 'No thinking questions this lesson.')
  const unread = buildInsightsModel(
    lesson({ questionLog: [{ timestampSec: 10, type: 'higher_order', waitTimeSec: null, text: 'Why?', followUps: [] }] }),
  ).questioning.findings.find((f) => f.key === 'held_open')!
  assert.equal(unread.state, 'unavailable')
  assert.equal(unread.note, 'This lesson was analyzed before this was read.')
})

test('held open: a question set as a task is listed but not timed', () => {
  const ho = (outcome: string, sec: number | null) => ({ outcome, questionType: 'explain', sec, closedBy: null, closedAtSec: null, how: null })
  const model = buildInsightsModel(
    lesson({
      segments: said([10, 'Why might a business have a code of conduct?'], [60, 'Why does that matter here?']).map((s) => ({
        ...s,
        speakerConfidence: [[s.text.split(' ').length, 0.8]] as [number, number][],
      })),
      questionLog: [
        { timestampSec: 10, type: 'higher_order', waitTimeSec: null, text: 'Why might a business have a code of conduct?', followUps: [], heldOpen: ho('task', 11) },
        { timestampSec: 60, type: 'higher_order', waitTimeSec: null, text: 'Why does that matter here?', followUps: [], heldOpen: ho('closed', 7) },
      ] as never,
    }),
  )
  const held = model.questioning.findings.find((f) => f.key === 'held_open')!
  assert.equal(held.value, 'Typically 7s')
  assert.match(held.caveat ?? '', /1 set as a task, not counted/)
  assert.doesNotMatch(held.caveat ?? '', /estimate/, 'voice-checked lines are not an estimate')
  assert.equal(model.questioning.heldOpen.length, 1, 'the task gets no bar')
})
