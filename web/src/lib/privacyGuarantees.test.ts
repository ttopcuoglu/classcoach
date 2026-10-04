import { expect, test } from 'vitest'
import audioCoachingSource from '../pages/AudioCoaching.tsx?raw'
import guideLessonDebriefSource from '../pages/GuideLessonDebrief.tsx?raw'
import guideTalkItThroughSource from '../pages/GuideTalkItThrough.tsx?raw'
import guideSource from '../pages/Guide.tsx?raw'
import landingSource from '../pages/Landing.tsx?raw'
import talkItThroughExportSource from '../pages/TalkItThroughExport.tsx?raw'
import talkToMeSource from '../pages/TalkToMe.tsx?raw'
import termsSource from '../pages/Terms.tsx?raw'

// "Keep every existing privacy guarantee and its wording" is a constraint on
// the consolidation, and it is the one constraint nothing else in the codebase
// can enforce. These sentences are inline JSX inside the two largest pages in
// the app (AudioCoaching.tsx is 5,600 lines) — exactly the kind of prose that
// gets softened, merged or dropped while the surrounding markup is rearranged,
// with no type error and no visual reviewer noticing that "discarded
// immediately" became "not stored long-term".
//
// They are promises about what the product does with a recording of a real
// classroom full of children. A refactor is allowed to move them; it is not
// allowed to reword them. If a sentence legitimately needs to move to a
// different file, update the location here deliberately — that edit is the
// point, because it forces someone to re-read the promise and confirm it is
// still true.
//
// The sources arrive through Vite's `?raw` rather than being read off disk, so
// deleting or renaming one of these pages is a build error here rather than a
// test failure with a path in the message — and the test file needs no Node
// types, which `tsconfig.app.json` deliberately keeps out of the app.
//
// Matching is on words, not bytes: whitespace is collapsed (these sentences
// wrap across JSX lines and reflow freely) and both apostrophe forms are
// folded together, since the codebase mixes ' and ’ for the same word.

function normalize(source: string): string {
  return source.replace(/[‘’]/g, "'").replace(/\s+/g, ' ')
}

/// Asserts on a boolean rather than with `toContain`, so a failure prints the
/// missing sentence and where it belongs — not a diff against the whole
/// source, which for AudioCoaching.tsx is 190KB of unreadable output that
/// buries the one line that matters.
function expectPhrase(where: string, source: string, phrase: string) {
  expect(
    normalize(source).includes(phrase),
    `${where} no longer contains, verbatim:\n  "${phrase}"`,
  ).toBe(true)
}

/// Each guarantee, and the screen that has to carry it.
const GUARANTEES: { what: string; source: string; phrase: string }[] = [
  {
    what: 'the Lesson Debrief intro',
    source: audioCoachingSource,
    phrase:
      'Record a class period, get a transcript, and see a coaching report. Audio is never saved — only the text.',
  },
  {
    what: 'the consent step before recording',
    source: audioCoachingSource,
    phrase:
      "Audio is never saved — it's sent once for transcription and discarded immediately. Only the text transcript is kept.",
  },
  {
    what: 'the Lesson Debrief report footer',
    source: audioCoachingSource,
    phrase:
      "Audio is never saved — it's sent once for transcription and discarded immediately. Only the transcript and these insights are kept.",
  },
  {
    what: 'the Talk It Through voice session',
    source: talkToMeSource,
    phrase: 'Your voice is never saved — only the conversation text.',
  },
  {
    what: "the printed Talk It Through report's footer",
    source: talkItThroughExportSource,
    phrase: 'Your voice was never saved — only this text.',
  },
  {
    what: "the Lesson Debrief guide's plan note",
    source: guideLessonDebriefSource,
    phrase: "Your audio is never saved — it's transcribed and then discarded.",
  },
  {
    what: "the Talk It Through guide's plan note",
    source: guideTalkItThroughSource,
    phrase: 'Your voice is never saved — only the conversation text.',
  },
]

for (const { what, source, phrase } of GUARANTEES) {
  test(`the privacy guarantee on ${what} is still worded exactly as it was`, () => {
    expectPhrase(what, source, phrase)
  })
}

// Audio and voice are the two guarantees a teacher is most likely to be asked
// about by a colleague or an administrator, so "never saved" has to keep
// appearing in the places a teacher actually looks before they press record or
// start talking — not only in Terms.
test('both recording surfaces still say "never saved" on the screen itself', () => {
  expectPhrase('Lesson Debrief', audioCoachingSource, 'Audio is never saved')
  expectPhrase('Talk It Through', talkToMeSource, 'Your voice is never saved')
})

// The Deepgram model-training opt-out and the in-memory-only processing
// promise are the legal backing for the sentences above. They live in Terms,
// which no part of the consolidation should touch — so a change here means
// something went wrong.
test('the Terms still carry the Deepgram opt-out and the in-memory-only promise', () => {
  expectPhrase('Terms', termsSource, "submitted audio is never used to improve Deepgram's models")
  expectPhrase('Terms', termsSource, 'Original audio recordings are never stored')
})

// Teachers are told repeatedly that the coach never scores them. The private
// 1-5 ratings that power growth trends exist on four models, and the promise
// that they are never surfaced is what makes them acceptable.
// Ask & Practice's own guide went with the page it described, taking its
// wording of this promise with it. The promise itself has to survive that, so
// it is pinned where it still lives.
test('the never-scored promise survives', () => {
  expectPhrase('the landing page', landingSource, 'never scored, never shared')
  expectPhrase(
    "the teacher's guide",
    guideSource,
    'no grade, rank, or evaluation is ever shown to you',
  )
})
