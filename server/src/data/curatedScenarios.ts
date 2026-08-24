import type { GRADE_BANDS, SCENARIO_CATEGORIES } from '../lib/scenarioCategories.ts'

export type CuratedScenario = {
  text: string
  category: (typeof SCENARIO_CATEGORIES)[number]
  gradeBand: (typeof GRADE_BANDS)[number]
}

// Hand-written fallback bank: used when scenario generation can't reach
// Claude (missing key, network failure, rate limit) and for local dev/testing
// without burning API calls. 3 per category, 9/9 split across grade bands.
export const CURATED_SCENARIOS: CuratedScenario[] = [
  // defiance
  {
    text: "A student is asked to put away a handheld game console during independent work. They slide it under their leg and say, \"I wasn't playing it, I was just holding it.\" When you ask again, they roll their eyes but don't move.",
    category: 'defiance',
    gradeBand: '6-8',
  },
  {
    text: 'You ask a student to move to their assigned seat after they wandered over to sit with a friend. The student crosses their arms and says, "This is stupid, I\'m not moving," loud enough for nearby students to hear.',
    category: 'defiance',
    gradeBand: '6-8',
  },
  {
    text: 'A student refuses to remove their hood despite a dress code reminder. When you ask a second time, they say, "You don\'t tell me what to wear," and keep working with the hood up.',
    category: 'defiance',
    gradeBand: '9-12',
  },

  // disengagement
  {
    text: "A student has put their head down on the desk and hasn't touched the assignment in ten minutes. When you crouch down to check in, they mumble, \"I don't get it and I don't care,\" without looking up.",
    category: 'disengagement',
    gradeBand: '6-8',
  },
  {
    text: "During a class discussion, one student stares out the window and doesn't respond when called on. When you ask if everything's okay, they just shrug.",
    category: 'disengagement',
    gradeBand: '9-12',
  },
  {
    text: 'A student has been scrolling on their laptop instead of working on the group project for the past fifteen minutes. When a groupmate asks for help, the student says, "Just do it, I don\'t care about this grade anyway."',
    category: 'disengagement',
    gradeBand: '9-12',
  },

  // peer_conflict
  {
    text: 'Two students accuse each other of cheating off a quiz, and their voices are rising as the rest of the class starts to notice. One says, "She\'s lying, I saw her looking at my paper first!"',
    category: 'peer_conflict',
    gradeBand: '6-8',
  },
  {
    text: 'During a group project, one student says another "always ruins everything" loud enough for the group to hear, and the other student shoves their chair back and says, "Whatever, do it yourself then."',
    category: 'peer_conflict',
    gradeBand: '6-8',
  },
  {
    text: "Two students who used to be friends aren't speaking after a disagreement outside of class, and it's spilling into partner work — one refuses to sit next to the other and asks loudly to switch seats.",
    category: 'peer_conflict',
    gradeBand: '9-12',
  },

  // disruption
  {
    text: 'A student keeps tapping a pencil loudly on the desk and making comments under their breath during a quiet reading period, drawing giggles from nearby classmates.',
    category: 'disruption',
    gradeBand: '6-8',
  },
  {
    text: "While you're giving instructions, a student in the back starts a side conversation that spreads to two more students, and it's getting hard for others to hear you.",
    category: 'disruption',
    gradeBand: '9-12',
  },
  {
    text: 'A student keeps making sarcastic comments in response to your questions during a lecture, and a few classmates start laughing along, derailing the discussion.',
    category: 'disruption',
    gradeBand: '9-12',
  },

  // transitions
  {
    text: "It's taking nearly five minutes for students to settle down after coming in from lunch, and several are still wandering between desks instead of sitting down when you start the warm-up.",
    category: 'transitions',
    gradeBand: '6-8',
  },
  {
    text: "When you ask the class to switch from group work to independent work, one group keeps talking and doesn't notice the rest of the class has already moved on.",
    category: 'transitions',
    gradeBand: '6-8',
  },
  {
    text: 'Students are slow to put away phones and materials when the bell signals a transition to a lab activity, and a few keep chatting instead of gathering supplies.',
    category: 'transitions',
    gradeBand: '9-12',
  },

  // technology_misuse
  {
    text: 'A student is texting under the desk during independent work, glancing up occasionally to check if you\'re watching.',
    category: 'technology_misuse',
    gradeBand: '6-8',
  },
  {
    text: 'You notice a student has a game open in a second browser tab during a research assignment on the classroom laptops.',
    category: 'technology_misuse',
    gradeBand: '9-12',
  },
  {
    text: 'A student is airdropping memes to classmates during a test, and a few students nearby start quietly laughing at their screens.',
    category: 'technology_misuse',
    gradeBand: '9-12',
  },
]
