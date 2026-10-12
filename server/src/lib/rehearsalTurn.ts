/// Which turns get more room, because a rehearsal needs it.
///
/// Sixty words is the right size for a spoken reply and the wrong size for a
/// reply that also has to offer a rehearsal. Measured on a teacher dreading a
/// parent call, Coach wrote eighty-nine words — the feeling, the advice, the
/// words to use, and then the offer — and the budget delivered the first
/// twenty-five. The teacher heard that their dread made sense and nothing
/// else. Lifting the cap for the short closing line does not rescue it
/// either: "...worth taking seriously. Want to try it?" has lost the thing
/// "it" referred to, which is worse than a clean stop.
///
/// A rehearsal is also the one place the prompt already says the reply rules
/// do not apply — "you are playing a person, so talk like one" — while the
/// word budget went on applying anyway.
///
/// Decided from the teacher's turn and the conversation so far, never from
/// the reply, because the budget is spent sentence by sentence while the
/// reply is still being written: by the time an offer appears at the end,
/// the cap has already closed.
import type { ChatMessage } from './coachingChat.ts'

/// About thirty-two seconds of speech, against nineteen for sixty words. The
/// ceiling is still a ceiling — this is not "as long as it likes" — and the
/// two-sentences-three-when-earned rule is untouched, so the extra room is
/// for a reply that genuinely has a conversation to set up, not for padding.
export const REHEARSAL_WORD_BUDGET = 100

/// A conversation the teacher is going to have to have. The rehearsal rule
/// fires on "words they will have to get out of their mouth", so these are
/// the ways teachers actually say that — an act of speaking, not merely the
/// presence of a parent or a principal in the sentence. "A parent emailed me
/// about homework" is not one of these; "I have to email her back" is.
const A_CONVERSATION_IS_COMING = [
  'the call', 'a call', 'call home', 'call her', 'call him', 'call them', 'phone call', 'on the phone',
  'have to call', 'need to call', 'calling her', 'calling him', 'calling them',
  'email her', 'email him', 'email them', 'email back', 'reply to', 'respond to', 'write back',
  'have to tell', 'need to tell', 'tell her', 'tell him', 'tell them', 'telling her', 'telling him', 'telling them',
  'say to her', 'say to him', 'say to them', 'what do i say', 'what should i say', 'how do i say',
  'talk to her', 'talk to him', 'talk to them', 'talk to the', 'speak to', 'sit down with',
  'conference', 'parent meeting', 'meeting with', 'iep meeting', 'the meeting',
  'confront', 'push back on', 'stand up to', 'apologize to', 'apologise to',
  'bring it up with', 'bring this up', 'address it with', 'ask her for', 'ask him for',
  'difficult conversation', 'hard conversation', 'awkward conversation', 'tough conversation',
]

/// Coach's own words when it offers to play the other person, or is already
/// playing them. Matched against what Coach has recently said rather than
/// what the teacher said, so a rehearsal in progress keeps its room for as
/// long as it runs.
const COACH_IS_REHEARSING = [
  "i'll play", 'i will play', "i'll be her", "i'll be him", "i'll be them", "i'll be the",
  "i'm her", "i'm him", "i'm his mom", "i'm her mom", "i'm the parent", 'as the parent', 'as her', 'as him',
  'want to practise', 'want to practice', "let's practise", "let's practice", 'practise it', 'practice it',
  'practise that', 'practice that', 'say it to me', 'try it on me', 'run it with me',
  'want to try it', 'out loud with me', 'back in character', 'out of character',
]

/// How far back a rehearsal counts as still running. Three of Coach's turns:
/// long enough to cover an offer, a yes, and the exchange that follows, short
/// enough that a rehearsal five turns ago is not still buying extra words.
const RECENT_COACH_TURNS = 3

function mentions(haystack: string, needles: string[]): boolean {
  const text = haystack.toLowerCase()
  return needles.some((needle) => text.includes(needle))
}

export function rehearsalInPlay(transcript: string, conversation: ChatMessage[]): boolean {
  if (mentions(transcript, A_CONVERSATION_IS_COMING)) return true
  const recent = conversation.filter((m) => m.role === 'assistant').slice(-RECENT_COACH_TURNS)
  return recent.some((m) => mentions(m.text, COACH_IS_REHEARSING))
}

/// The budget for this turn.
export function talkWordBudget(transcript: string, conversation: ChatMessage[], base: number): number {
  return rehearsalInPlay(transcript, conversation) ? REHEARSAL_WORD_BUDGET : base
}
