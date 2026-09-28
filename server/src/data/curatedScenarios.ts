import type { DIFFICULTY_LEVELS, GRADE_BANDS } from '../lib/scenarioCategories.ts'

export type CuratedScenario = {
  text: string
  focusArea: string
  category: string
  gradeBand: (typeof GRADE_BANDS)[number]
  difficulty: (typeof DIFFICULTY_LEVELS)[number]
  subject?: string
}

// Hand-written fallback bank: used when scenario generation can't reach
// Claude (missing key, network failure, rate limit) and for local dev/testing
// without burning API calls.
//
// Every focus area needs entries, not just classroom management: the fallback
// no longer relaxes past the area (see curatedFallback.ts), so an area with an
// empty bank fails loudly instead of quietly handing a teacher who asked to
// practice grading a scenario about a student refusing to move seats.
export const CURATED_SCENARIOS: CuratedScenario[] = [
  // defiance
  {
    text: 'During clean-up time, a student refuses to put away the blocks they were using and says, "No, I\'m not done!" when you ask a second time.',
    focusArea: 'classroom_management',
    category: 'defiance',
    gradeBand: 'K-5',
    difficulty: 'beginner',
  },
  {
    text: "A student is asked to put away a handheld game console during independent work. They slide it under their leg and say, \"I wasn't playing it, I was just holding it.\" When you ask again, they roll their eyes but don't move.",
    focusArea: 'classroom_management',
    category: 'defiance',
    gradeBand: '6-8',
    difficulty: 'beginner',
  },
  {
    text: 'You ask a student to move to their assigned seat after they wandered over to sit with a friend. The student crosses their arms and says, "This is stupid, I\'m not moving," loud enough for nearby students to hear.',
    focusArea: 'classroom_management',
    category: 'defiance',
    gradeBand: '6-8',
    difficulty: 'intermediate',
  },
  {
    text: 'A student refuses to remove their hood despite a dress code reminder. When you ask a second time, they say, "You don\'t tell me what to wear," and keep working with the hood up.',
    focusArea: 'classroom_management',
    category: 'defiance',
    gradeBand: '9-12',
    difficulty: 'advanced',
  },

  // disengagement
  {
    text: "During independent reading time, a student is flipping through the pages of their book without actually reading, and says, \"I don't want to read this one,\" when you check in.",
    focusArea: 'classroom_management',
    category: 'disengagement',
    gradeBand: 'K-5',
    difficulty: 'beginner',
  },
  {
    text: "A student has put their head down on the desk and hasn't touched the assignment in ten minutes. When you crouch down to check in, they mumble, \"I don't get it and I don't care,\" without looking up.",
    focusArea: 'classroom_management',
    category: 'disengagement',
    gradeBand: '6-8',
    difficulty: 'beginner',
  },
  {
    text: "During a class discussion, one student stares out the window and doesn't respond when called on. When you ask if everything's okay, they just shrug.",
    focusArea: 'classroom_management',
    category: 'disengagement',
    gradeBand: '9-12',
    difficulty: 'intermediate',
  },
  {
    text: 'A student has been scrolling on their laptop instead of working on the group project for the past fifteen minutes. When a groupmate asks for help, the student says, "Just do it, I don\'t care about this grade anyway."',
    focusArea: 'classroom_management',
    category: 'disengagement',
    gradeBand: '9-12',
    difficulty: 'advanced',
  },

  // peer_conflict
  {
    text: 'Two students both grab the same crayon at the art table and start pulling on it, with one shouting, "I had it first!"',
    focusArea: 'classroom_management',
    category: 'peer_conflict',
    gradeBand: 'K-5',
    difficulty: 'beginner',
  },
  {
    text: 'Two students accuse each other of cheating off a quiz, and their voices are rising as the rest of the class starts to notice. One says, "She\'s lying, I saw her looking at my paper first!"',
    focusArea: 'classroom_management',
    category: 'peer_conflict',
    gradeBand: '6-8',
    difficulty: 'intermediate',
  },
  {
    text: 'During a group project, one student says another "always ruins everything" loud enough for the group to hear, and the other student shoves their chair back and says, "Whatever, do it yourself then."',
    focusArea: 'classroom_management',
    category: 'peer_conflict',
    gradeBand: '6-8',
    difficulty: 'beginner',
  },
  {
    text: "Two students who used to be friends aren't speaking after a disagreement outside of class, and it's spilling into partner work — one refuses to sit next to the other and asks loudly to switch seats.",
    focusArea: 'classroom_management',
    category: 'peer_conflict',
    gradeBand: '9-12',
    difficulty: 'advanced',
  },

  // disruption
  {
    text: "A student keeps making animal noises during story time, and a couple of nearby classmates start giggling instead of listening.",
    focusArea: 'classroom_management',
    category: 'disruption',
    gradeBand: 'K-5',
    difficulty: 'beginner',
  },
  {
    text: 'A student keeps tapping a pencil loudly on the desk and making comments under their breath during a quiet reading period, drawing giggles from nearby classmates.',
    focusArea: 'classroom_management',
    category: 'disruption',
    gradeBand: '6-8',
    difficulty: 'beginner',
  },
  {
    text: "While you're giving instructions, a student in the back starts a side conversation that spreads to two more students, and it's getting hard for others to hear you.",
    focusArea: 'classroom_management',
    category: 'disruption',
    gradeBand: '9-12',
    difficulty: 'intermediate',
  },
  {
    text: 'A student keeps making sarcastic comments in response to your questions during a lecture, and a few classmates start laughing along, derailing the discussion.',
    focusArea: 'classroom_management',
    category: 'disruption',
    gradeBand: '9-12',
    difficulty: 'advanced',
  },

  // transitions
  {
    text: "When it's time to line up for recess, several students are still wandering around the room instead of forming a line, and one starts wrestling a friend for a spot near the front.",
    focusArea: 'classroom_management',
    category: 'transitions',
    gradeBand: 'K-5',
    difficulty: 'beginner',
  },
  {
    text: "It's taking nearly five minutes for students to settle down after coming in from lunch, and several are still wandering between desks instead of sitting down when you start the warm-up.",
    focusArea: 'classroom_management',
    category: 'transitions',
    gradeBand: '6-8',
    difficulty: 'beginner',
  },
  {
    text: "When you ask the class to switch from group work to independent work, one group keeps talking and doesn't notice the rest of the class has already moved on.",
    focusArea: 'classroom_management',
    category: 'transitions',
    gradeBand: '6-8',
    difficulty: 'intermediate',
  },
  {
    text: 'Students are slow to put away phones and materials when the bell signals a transition to a lab activity, and a few keep chatting instead of gathering supplies.',
    focusArea: 'classroom_management',
    category: 'transitions',
    gradeBand: '9-12',
    difficulty: 'advanced',
  },

  // technology_misuse
  {
    text: "During computer center time, a student switches away from the reading app to a game app when they think you're not looking.",
    focusArea: 'classroom_management',
    category: 'technology_misuse',
    gradeBand: 'K-5',
    difficulty: 'beginner',
  },
  {
    text: 'A student is texting under the desk during independent work, glancing up occasionally to check if you\'re watching.',
    focusArea: 'classroom_management',
    category: 'technology_misuse',
    gradeBand: '6-8',
    difficulty: 'beginner',
  },
  {
    text: 'You notice a student has a game open in a second browser tab during a research assignment on the classroom laptops.',
    focusArea: 'classroom_management',
    category: 'technology_misuse',
    gradeBand: '9-12',
    difficulty: 'intermediate',
  },
  {
    text: 'A student is airdropping memes to classmates during a test, and a few students nearby start quietly laughing at their screens.',
    focusArea: 'classroom_management',
    category: 'technology_misuse',
    gradeBand: '9-12',
    difficulty: 'advanced',
  },

  // --- teaching_and_learning: delivery ---
  {
    text: 'You have explained regrouping in subtraction twice, once with base-ten blocks and once on the board. You ask "who\'s got it?" and eleven hands go up out of twenty-four. The other thirteen are looking at their papers.',
    focusArea: 'teaching_and_learning',
    category: 'checking_understanding',
    gradeBand: 'K-5',
    difficulty: 'beginner',
  },
  {
    text: 'Four minutes into your explanation of how a bill becomes a law, you notice two students have stopped writing and one is staring at the clock. You still have three steps to go and eight minutes of class left.',
    focusArea: 'teaching_and_learning',
    category: 'pacing_chunking',
    gradeBand: '6-8',
    difficulty: 'intermediate',
  },
  {
    text: 'You ask an open question about the ending of the novel. The same three students answer, as they have all week. When you wait, the silence stretches and one of the three jumps in to fill it.',
    focusArea: 'teaching_and_learning',
    category: 'questioning_discussion',
    gradeBand: '9-12',
    difficulty: 'intermediate',
  },
  {
    text: 'You are mid-way through a worked example on the board when a student asks, "But why does the sign flip there?" It is a genuinely good question, it is not what today\'s objective is about, and you have nine minutes left to get the class to independent practice.',
    focusArea: 'teaching_and_learning',
    category: 'explaining_clearly',
    gradeBand: '9-12',
    difficulty: 'advanced',
  },

  // --- teaching_and_learning: content ---
  {
    text: 'A student explains that plants get their food from the soil, "like how we get food from the fridge." Three other students nod. Your unit on photosynthesis starts tomorrow.',
    focusArea: 'teaching_and_learning',
    category: 'misconceptions',
    gradeBand: 'K-5',
    difficulty: 'beginner',
    subject: 'Science',
  },
  {
    text: 'When you ask why 1/3 is bigger than 1/4, a student says, "Because 4 is bigger than 3, so fourths are bigger." She can shade the right fraction bars correctly every time.',
    focusArea: 'teaching_and_learning',
    category: 'misconceptions',
    gradeBand: '6-8',
    difficulty: 'intermediate',
    subject: 'Math',
  },
  {
    text: 'Your students can balance chemical equations reliably. When you ask one why the atoms have to balance, he says, "Because that\'s the rule for getting the answer right." Nobody in the room offers anything else.',
    focusArea: 'teaching_and_learning',
    category: 'explaining_clearly',
    gradeBand: '9-12',
    difficulty: 'advanced',
    subject: 'Science',
  },

  // --- teaching_and_learning: feedback & grading ---
  {
    text: 'A narrative has vivid ideas, a real ending, and spelling errors in nearly every sentence. Your rubric has separate rows for ideas and conventions, and the total lands it at the same score as a dull, clean piece you graded ten minutes ago.',
    focusArea: 'teaching_and_learning',
    category: 'feedback_and_grading',
    gradeBand: 'K-5',
    difficulty: 'intermediate',
  },
  {
    text: 'A student has a 96 and a 91 on the two unit tests and four missing homework assignments. The gradebook shows a 71. Report cards are due Friday.',
    focusArea: 'teaching_and_learning',
    category: 'feedback_and_grading',
    gradeBand: '6-8',
    difficulty: 'advanced',
  },
  {
    text: 'A student emails: "I got a 78 on the essay and my friend got an 88 and we basically wrote the same thing. Can you explain what the difference is?" You reread both. They are not the same, but the rubric language does not obviously show why.',
    focusArea: 'teaching_and_learning',
    category: 'feedback_and_grading',
    gradeBand: '9-12',
    difficulty: 'intermediate',
  },
  {
    text: 'You have thirty-one lab reports to return before the unit test on Thursday, and about forty minutes tonight. Last time you wrote full comments on every one and saw no evidence anyone read them.',
    focusArea: 'teaching_and_learning',
    category: 'feedback_and_grading',
    gradeBand: '9-12',
    difficulty: 'beginner',
  },

  // --- parent_communication ---
  {
    text: 'A parent emails: "Maya says she asked you for help three times today and you told her to figure it out herself. That is not what I expect from her teacher. Please explain." You remember the day differently, and you were with a small group at the time.',
    focusArea: 'parent_communication',
    category: 'difficult_parent_email',
    gradeBand: 'K-5',
    difficulty: 'intermediate',
  },
  {
    text: 'A parent sits down at conferences, before you have said anything, and opens with: "I just want to say up front that I think this class moves too fast and he is not the only one struggling."',
    focusArea: 'parent_communication',
    category: 'conferences',
    gradeBand: '6-8',
    difficulty: 'intermediate',
  },
  {
    text: 'You are calling a parent to say their daughter is likely to fail the semester unless the next two assignments come in. Thirty seconds in, the parent says quietly, "She told me she was passing."',
    focusArea: 'parent_communication',
    category: 'delivering_hard_news',
    gradeBand: '9-12',
    difficulty: 'advanced',
  },
  {
    text: 'A parent replies to your positive email about their son with: "Thanks, but what I really need to know is why he is not in the advanced group. He was last year."',
    focusArea: 'parent_communication',
    category: 'building_partnership',
    gradeBand: '6-8',
    difficulty: 'beginner',
  },

  // --- professionalism ---
  {
    text: 'In front of the whole class, your co-teacher says, "Actually, let\'s do it the way I showed you yesterday" and starts re-explaining the task differently. Students look between the two of you.',
    focusArea: 'professionalism',
    category: 'co_teaching',
    gradeBand: 'K-5',
    difficulty: 'intermediate',
  },
  {
    text: 'In a department meeting, your chair says the team will give the same common assessment in the same week, and you think the test does not match what your students have actually been taught. Three colleagues have already nodded.',
    focusArea: 'professionalism',
    category: 'talking_with_admin',
    gradeBand: '6-8',
    difficulty: 'advanced',
  },
  {
    text: 'A colleague you share a student with says, in the workroom, "Oh, him — I gave up on that one in September." Two other teachers are within earshot.',
    focusArea: 'professionalism',
    category: 'disagreeing_with_a_peer',
    gradeBand: '9-12',
    difficulty: 'intermediate',
  },
  {
    text: 'Your PLC has forty-five minutes. Twenty of them have gone to a conversation about the bell schedule, and the student work you all agreed to look at is still in a folder on the table.',
    focusArea: 'professionalism',
    category: 'team_and_plc_time',
    gradeBand: '6-8',
    difficulty: 'beginner',
  },
]
