import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import { confirmInterruptions, findClusters, findEpisodes, inScopeSegments, parseBids, type AttentionBid } from './escalation.ts'
import { safeToQuote } from './quoteSafety.ts'
import { canClaimAbsence, capturedShare } from './transcriptCoverage.ts'

// Every case here comes from a real failure found by running this against
// stored lessons, not from imagining what might break. The arithmetic is in
// the code precisely because the model's version of it drifted between runs,
// so the arithmetic is what gets pinned down.

function bid(timestampSec: number, rung: AttentionBid['rung'], quote = 'Keep it down, everybody.'): AttentionBid {
  return { timestampSec, rung, quote, backReference: false, expectation: 'talking', interrupts: false }
}

test('two asks is not a cluster, three is', () => {
  assert.equal(findClusters([bid(0, 'attention'), bid(10, 'behaviour')]).length, 0)
  assert.equal(findClusters([bid(0, 'attention'), bid(10, 'behaviour'), bid(20, 'named')]).length, 1)
})

test('asks spread beyond the window are not a run, however many there are', () => {
  const spread = [bid(0, 'attention'), bid(60, 'attention'), bid(120, 'attention'), bid(180, 'attention')]
  assert.equal(findClusters(spread).length, 0)
})

test('the climb is measured against the highest rung, not the last one', () => {
  // The real shape of one lesson at 13:14: a consequence, then a student
  // separated, then back to a consequence. Comparing first to last called
  // this flat, which is the opposite of what happened.
  const run = [bid(794, 'consequence'), bid(825, 'removal'), bid(835, 'consequence')]
  const [cluster] = findClusters(run)
  assert.equal(cluster.topRung, 'removal')
  assert.equal(cluster.climbed, true)
})

test('a run that never climbs says so', () => {
  const [cluster] = findClusters([bid(0, 'behaviour'), bid(5, 'behaviour'), bid(10, 'behaviour')])
  assert.equal(cluster.climbed, false)
  assert.equal(cluster.topRung, 'behaviour')
})

test('the most severe run comes first, because only one is shown', () => {
  const bids = [
    bid(0, 'attention'), bid(5, 'attention'), bid(10, 'attention'),
    bid(600, 'consequence'), bid(605, 'removal'), bid(610, 'behaviour'),
  ]
  const clusters = findClusters(bids)
  assert.equal(clusters.length, 2)
  assert.equal(clusters[0].topRung, 'removal')
  assert.equal(clusters[0].startSec, 600)
})

test('the quote shown is the one at the top rung', () => {
  const run = [
    bid(0, 'behaviour', 'Gotta keep it down, everybody.'),
    bid(5, 'removal', "We're not working together today."),
    bid(10, 'behaviour', 'Working alone on this one.'),
  ]
  assert.equal(findClusters(run)[0].quote, "We're not working together today.")
})

test('a top-rung quote too garbled to attribute falls back to one that can be', () => {
  const run = [
    bid(0, 'behaviour', 'Gotta keep it down, everybody.'),
    bid(5, 'removal', 'the the student is is out'),
    bid(10, 'behaviour', 'Working alone on this one.'),
  ]
  const [cluster] = findClusters(run)
  assert.equal(cluster.topRung, 'removal')
  assert.equal(cluster.quote, 'Gotta keep it down, everybody.')
})

test('when nothing in a run can be quoted, the moment still stands', () => {
  const run = [bid(0, 'behaviour', 'shut up'), bid(5, 'removal', 'shut it now'), bid(10, 'behaviour', 'the the the')]
  const [cluster] = findClusters(run)
  assert.equal(cluster.quote, null)
  assert.equal(cluster.topRung, 'removal')
})

// --- what we will not put in a teacher's mouth -----------------------------

test('language we will not attribute on the strength of a room mic', () => {
  // A real transcript has this teacher saying "Shut up" in two different
  // lessons, and another has "River, ice forward, buddy" for "eyes forward".
  // Being right most of the time is not good enough inside an accusation.
  assert.equal(safeToQuote('Shut up, all of you.'), false)
  assert.equal(safeToQuote('Gotta keep it down, everybody.'), true)
})

test('doubled words read as transcription noise, not speech', () => {
  assert.equal(safeToQuote('we are working working on the questions'), false)
})

test('a fragment too short to carry its own context is not quoted', () => {
  assert.equal(safeToQuote('And quiet.'), false)
})

// --- coverage: the asymmetry that matters ----------------------------------

test('coverage is the share of the recording that became speech', () => {
  const share = capturedShare({ teacherTalkSec: 129, studentTalkSec: 73, totalDurationSec: 1375 })
  assert.ok(share != null && Math.round(share * 100) === 15)
})

test('a recording the microphone largely lost cannot be called a calm room', () => {
  // The 15% lesson: the teacher remembered redirecting the class around ten
  // times in a window the transcript has nothing in at all.
  assert.equal(canClaimAbsence(0.15), false)
  assert.equal(canClaimAbsence(0.67), true)
})

test('nothing to divide by is not the same as nothing captured', () => {
  assert.equal(capturedShare({ teacherTalkSec: 0, studentTalkSec: 0, totalDurationSec: 0 }), null)
  assert.equal(canClaimAbsence(null), false)
})

// --- scope: the teacher the diarizer misfiled ------------------------------

function seg(speakerLabel: string, text: string, startSec = 0): Segment {
  return { speakerLabel, startSec, endSec: startSec + 3, text }
}

test('unmistakable teacher register counts even when labelled a student', () => {
  // Escalation happens during group work, which is when the teacher walks
  // away from the phone and her voice picks up a second speaker tag.
  const segments = [seg('Teacher', 'So what is the unit rate here?', 0), seg('Student', 'Eyes up front, please.', 10)]
  const scoped = inScopeSegments(segments)
  assert.equal(scoped.length, 2)
  assert.ok(scoped.every((s) => s.speakerLabel === 'Teacher'))
})

test('ordinary student speech stays out of scope', () => {
  const segments = [seg('Teacher', 'What did you get for number four?', 0), seg('Student', 'I got one point five.', 10)]
  assert.equal(inScopeSegments(segments).length, 1)
})

// --- parsing the model's reply ---------------------------------------------

const TRANSCRIPT: Segment[] = [
  seg('Teacher', 'Gotta keep it down, everybody.', 100),
  seg('Teacher', "We're not working together today.", 110),
]

test('a bid the teacher never said is dropped', () => {
  const reply = '<bids>\nI will be calling your mother tonight. @ 2:00 | consequence | no\n</bids>'
  assert.deepEqual(parseBids(reply, TRANSCRIPT), [])
})

test('a paragraph of teaching is not a bid, however it is labelled', () => {
  // One run tagged a long stretch of ordinary teaching as a REMOVAL, which
  // was enough to make a cluster claim a student had been separated.
  const long = 'Alright. What did I do? What did I even do to start with? ' +
    "That's right. We're just gonna take this one step at a time and see where it goes from here, okay?"
  const segments = [...TRANSCRIPT, seg('Teacher', long, 120)]
  const reply = `<bids>\n${long} @ 2:00 | removal | no\n</bids>`
  assert.deepEqual(parseBids(reply, segments), [])
})

test('the same moment at the same rung is counted once', () => {
  const reply =
    '<bids>\n' +
    'Gotta keep it down, everybody. @ 1:40 | behaviour | no\n' +
    'Gotta keep it down, everybody. @ 1:40 | behaviour | no\n' +
    '</bids>'
  assert.equal(parseBids(reply, TRANSCRIPT).length, 1)
})

test('NONE is a real answer', () => {
  assert.deepEqual(parseBids('<bids>\nNONE\n</bids>', TRANSCRIPT), [])
})

test('the timestamp comes from the transcript, not the model', () => {
  const reply = '<bids>\nGotta keep it down, everybody. @ 9:99 | behaviour | no\n</bids>'
  assert.equal(parseBids(reply, TRANSCRIPT)[0].timestampSec, 100)
})

test('a back-reference is read from the words, and only when flagged', () => {
  const reply =
    '<bids>\n' +
    "We're not working together today. @ 1:50 | removal | yes\n" +
    'Gotta keep it down, everybody. @ 1:40 | behaviour | no\n' +
    '</bids>'
  const bids = parseBids(reply, TRANSCRIPT)
  assert.equal(bids.length, 2)
  // Sorted by when they happened, not the order the model listed them.
  assert.equal(bids[0].timestampSec, 100)
  assert.equal(bids[0].backReference, false)
  assert.equal(bids[1].backReference, true)
})

// Keeping learning on track. One reminder tells a teacher little; the
// findings are the stretches where reminders came as a pattern.

function ask(timestampSec: number, over: Partial<AttentionBid> = {}): AttentionBid {
  return { ...bid(timestampSec, 'behaviour'), ...over }
}

test('reminders spread across a lesson about different things are routine, not a finding', () => {
  const bids = [
    ask(60, { expectation: 'talking' }),
    ask(400, { expectation: 'devices' }),
    ask(900, { expectation: 'work' }),
  ]
  assert.deepEqual(findEpisodes(bids), [])
})

test('the same expectation coming back within a stretch is a finding', () => {
  const bids = [ask(100), ask(190), ask(280)]
  const [episode] = findEpisodes(bids)
  assert.equal(episode.expectation, 'talking')
  assert.equal(episode.quickRepeats, false)
  assert.equal(episode.interruptedExplanation, false)
})

test('one break in an explanation is routine; two in the same stretch are a pattern', () => {
  assert.deepEqual(findEpisodes([ask(100, { interrupts: true, expectation: 'other' })]), [])
  const [episode] = findEpisodes([
    ask(100, { interrupts: true, expectation: 'other' }),
    ask(170, { interrupts: true, expectation: 'attention' }),
  ])
  assert.equal(episode.interruptedExplanation, true)
  assert.equal(episode.expectation, null)
})

test('the lead moment is an interruption when that is the pattern', () => {
  const [episode] = findEpisodes([
    ask(100, { quote: 'Keep it down over there.' }),
    ask(150, { quote: 'Gotta keep it down, everybody.', interrupts: true }),
    ask(200, { quote: 'One voice, please, one voice.', interrupts: true }),
  ])
  assert.equal(episode.lead.timestampSec, 150)
  assert.equal(episode.more.length, 2)
})

test('the strongest pattern comes first', () => {
  const episodes = findEpisodes([
    ask(0), ask(5), ask(10),
    ask(900, { interrupts: true }), ask(960, { interrupts: true }), ask(1020),
  ])
  assert.equal(episodes[0].startSec, 900)
})

const tseg = (startSec: number, text: string): Segment => ({ startSec, endSec: startSec + 5, speakerLabel: 'Teacher', text })

test('an interruption needs teaching on both sides of the ask', () => {
  const claimed = ask(100, { quote: 'Gotta keep it down, everybody.', interrupts: true })
  // Resumed in the same breath — the real shape at 20:16 of the history lesson.
  const same = [
    tseg(80, 'So the best idea we have is that climate change caused the people who lived here to move.'),
    tseg(100, 'Gotta keep it down, everybody. So climate change basically caused the people to move away from the river.'),
  ]
  assert.equal(confirmInterruptions([claimed], same)[0].interrupts, true)
  // Nothing said after it: the explanation was not resumed, whatever the model thought.
  const stopped = [tseg(80, 'So the best idea we have is that climate change caused the people to move.'), tseg(100, 'Gotta keep it down, everybody.')]
  assert.equal(confirmInterruptions([claimed], stopped)[0].interrupts, false)
})

test('five-column bid lines carry the expectation and the interruption', () => {
  const segments = [tseg(10, 'Put your phone away, please.')]
  const [b] = parseBids('<bids>\nPut your phone away, please. @ 0:10 | behaviour | devices | no | no\n</bids>', segments)
  assert.equal(b.expectation, 'devices')
  assert.equal(b.interrupts, false)
  assert.equal(b.backReference, false)
})

test('"like I said" joins the earlier ask about the same thing, minutes back', () => {
  const bids = [
    ask(275, { expectation: 'devices' }),
    ask(735, { expectation: 'talking', quote: 'I want it to be silent. That is my expectation.' }),
    ask(1010, { expectation: 'talking', backReference: true, quote: 'Like I said, independent and silent people.' }),
  ]
  const [episode] = findEpisodes(bids)
  assert.equal(episode.backReference, true)
  assert.equal(episode.lead.timestampSec, 1010)
  assert.deepEqual(episode.more.map((m) => m.timestampSec), [735])
})
