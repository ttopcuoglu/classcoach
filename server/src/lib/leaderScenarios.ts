import { coversEverything, type LeaderArea, type LeaderLevel, type LeaderProfile } from './leaderLevels.ts'

// Leader's Corner's curated bank, in code rather than the Scenario table: it
// is small, written by hand, and has to stay out of every teacher listing and
// school tally that reads Scenario. Each scenario belongs to exactly one
// level, and the server hands a person only their own level's — so an
// assistant principal cannot open a superintendent's board scenario by
// guessing its id. Within a level, `area` and `evaluator` narrow it further
// to the person's own responsibilities (see scenariosFor).
//
// Ids are stable: a LeaderAttempt keeps curatedId, so renaming one would
// orphan its history. Edit the text freely; never reuse an id for a
// different situation.

export type LeaderAudience = 'families' | 'students' | 'staff' | 'community' | 'up_the_chain'

export const LEADER_AUDIENCES: readonly { value: LeaderAudience; label: string }[] = [
  { value: 'families', label: 'Families' },
  { value: 'students', label: 'Students' },
  { value: 'staff', label: 'Staff' },
  { value: 'community', label: 'Board & community' },
  { value: 'up_the_chain', label: 'Your supervisor' },
]

export type LeaderScenario = {
  id: string
  level: LeaderLevel
  audience: LeaderAudience
  // Only for leaders responsible for this area. Absent = every leader at the level.
  area?: LeaderArea
  // true = only leaders who formally evaluate staff; false = only those who
  // don't (the scenario turns on having no evaluation authority). Absent = both.
  evaluator?: boolean
  title: string
  text: string
}

export const LEADER_SCENARIOS: readonly LeaderScenario[] = [
  // ---- District ----
  {
    id: 'district-budget-cut',
    level: 'district',
    audience: 'community',
    title: 'Presenting a budget cut',
    text: 'You are presenting next year’s budget to the school board. It cuts two elementary art positions to protect class sizes. A board member interrupts in the public session: “Families were promised the arts would be protected. Why should anyone trust this district’s promises?” The room is full and it is being streamed.',
  },
  {
    id: 'district-board-data',
    level: 'district',
    audience: 'community',
    title: 'A board member challenges your data',
    text: 'During a public board meeting, a board member holds up a printout. “Your own numbers show reading scores went down at two schools. You said this program was working. Were you misleading us?” The numbers are real, but they leave out that those two schools started the program late.',
  },
  {
    id: 'district-closure-forum',
    level: 'district',
    audience: 'community',
    title: 'A heated forum on a school closure',
    text: 'You are hosting a community forum on a proposal to merge two schools. A parent at the microphone says: “You decided this months ago. This meeting is for show. My kids will be bused across town and nobody up there cares.” People applaud. The board has not voted yet.',
  },
  {
    id: 'district-viral-post',
    level: 'district',
    audience: 'community',
    title: 'A viral post about a school',
    text: 'A post claiming a high school “ignored a fight that sent a student to the hospital” has been shared thousands of times overnight. Some details are wrong and some you cannot discuss. A local reporter calls asking for comment by noon, and several board members are texting you.',
  },
  {
    id: 'district-union-opening',
    level: 'district',
    audience: 'staff',
    title: 'Opening a hard negotiation',
    text: 'You are meeting with the teachers’ union president before contract talks. The district cannot fund the raise they are asking for. The president opens with: “Our people are leaving for the district next door. If you come in with another freeze, we’re done talking.”',
  },
  {
    id: 'district-principal-results',
    level: 'district',
    audience: 'staff',
    title: 'A school is not improving fast enough',
    text: 'You are meeting with a second-year principal whose school has not moved on attendance or reading after a year of support. They are well liked by staff. They begin: “I know the numbers aren’t there yet, but the culture is so much better. I just need more time.”',
  },

  // ---- Building ----
  {
    id: 'building-teacher-change',
    level: 'building',
    audience: 'families',
    title: 'A parent demands a teacher change',
    text: 'A parent has already met with the teacher and the assistant principal. Now they are in your office: “My son hates that class. That teacher has it out for him. I want him moved by Monday, or I’m going to the superintendent.” Your schedule has no open seat in another section.',
  },
  {
    id: 'building-parent-group',
    level: 'building',
    audience: 'families',
    title: 'A group of parents complains about a teacher',
    text: 'Four parents asked for a meeting together about the same 4th-grade teacher. One says: “We’ve compared notes. Homework is never returned, our kids are anxious, and we want to know what you’re going to do about it.” You have concerns of your own about this teacher, which are a personnel matter.',
  },
  {
    id: 'building-non-renewal',
    level: 'building',
    audience: 'staff',
    title: 'Telling a teacher they won’t be renewed',
    text: 'You are meeting with a first-year teacher to tell them their contract will not be renewed. You have documented observations and support plans. They do not know yet. They sit down and say, smiling: “Is this about next year’s schedule? I had some ideas.”',
  },
  {
    id: 'building-veteran-pushback',
    level: 'building',
    audience: 'staff',
    title: 'A strong teacher pushes back on a priority',
    text: 'At a faculty meeting you introduce a school-wide focus on student discussion. A respected 20-year veteran says in front of everyone: “With respect, we’ve seen a new initiative every year. My results are strong. Why should I change what works?” Several teachers nod.',
  },
  {
    id: 'building-crisis-message',
    level: 'building',
    audience: 'families',
    title: 'First message to families after an incident',
    text: 'This afternoon a student brought a knife to school. It was found before anyone was hurt, and police were called. Rumors are already on social media. You need to send families a message within the hour. You cannot share the student’s identity or the discipline outcome.',
  },
  {
    id: 'building-tell-superintendent',
    level: 'building',
    audience: 'up_the_chain',
    title: 'Telling the superintendent first',
    text: 'You just learned that a teacher posted something inappropriate about students online, and a parent has screenshots. It will reach the district one way or another. You are calling the superintendent before they hear it from someone else.',
  },

  // ---- Assistant ----
  {
    id: 'assistant-suspension-meeting',
    level: 'assistant',
    audience: 'families',
    area: 'student_life',
    title: 'A suspension meeting with a parent who feels their child is targeted',
    text: 'You are meeting with a parent about a two-day suspension for a fight. The parent says: “Every time something happens, it’s my daughter who gets punished. The other girl started it and nothing happened to her. This school has a problem with my child.” You cannot discuss the other student’s consequence.',
  },
  {
    id: 'assistant-repeat-conference',
    level: 'assistant',
    audience: 'students',
    area: 'student_life',
    title: 'A repeat-behavior conference, student present',
    text: 'A 7th grader is in your office for the fourth referral this month for leaving class. Their grandmother is with them. The student will not look up and says only: “I don’t care. Just suspend me.” The grandmother says, “See? This is what I deal with at home too.”',
  },
  {
    id: 'assistant-phone-call',
    level: 'assistant',
    audience: 'families',
    area: 'student_life',
    title: 'An angry parent over a phone confiscation',
    text: 'A parent calls, already shouting: “You took my son’s phone? That phone is how I reach him. If something happens and I can’t reach him, that’s on you. I’m coming to get it right now.” School policy says phones are returned at the end of the day.',
  },
  {
    id: 'assistant-restorative',
    level: 'assistant',
    audience: 'students',
    area: 'student_life',
    title: 'A restorative conversation after a conflict',
    text: 'You are leading a restorative conversation between two 9th graders after a fight that started over something posted online. Both agreed to meet. Five minutes in, one says: “This is stupid. She knows what she did,” and pushes back from the table.',
  },
  {
    id: 'assistant-referrals',
    level: 'assistant',
    audience: 'staff',
    area: 'student_life',
    title: 'A teacher who sends too many referrals',
    text: 'One teacher has written more office referrals this quarter than the rest of the grade level combined, mostly for minor disruptions. When you bring it up, they say: “If you backed me up instead of sending them right back, I wouldn’t have to keep writing them.”',
  },
  {
    id: 'assistant-attendance',
    level: 'assistant',
    audience: 'families',
    area: 'student_life',
    title: 'A chronic-absence meeting',
    text: 'A 10th grader has missed 22 days this semester. You are meeting with their mother, who works nights. She says: “I wake him up before I leave. I can’t make him get on the bus. What do you want me to do?” She looks exhausted and close to tears.',
  },

  // ---- Assistant: academics ----
  {
    id: 'assistant-grade-dispute',
    level: 'assistant',
    audience: 'families',
    area: 'academics',
    title: 'A parent disputes a final grade',
    text: 'A parent emails and then shows up in person about their daughter’s C+ in chemistry. “That grade costs her the honors scholarship. Two of the labs were graded unfairly and the teacher won’t even answer me. I want it changed to a B.” The school has a grade-appeal process, and you have not yet looked at the gradebook.',
  },
  {
    id: 'assistant-not-graduating',
    level: 'assistant',
    audience: 'families',
    area: 'academics',
    title: 'Telling a family their senior may not graduate',
    text: 'It is March. A senior is failing English 12 and is two credits short. You are meeting with the student and their father, who has already bought tickets for relatives to fly in for graduation. He says: “Nobody told us anything until now. How is that possible?” Progress reports did go home.',
  },
  {
    id: 'assistant-placement-request',
    level: 'assistant',
    audience: 'families',
    area: 'academics',
    title: 'A parent wants their child moved into an advanced class',
    text: 'A parent wants their son placed in 8th-grade Algebra I. He did not meet the placement criteria and his current teacher does not recommend it. The parent says: “He’s bored, that’s why his grades are low. Other kids got in with lower scores. Who do I talk to about this?”',
  },
  {
    id: 'assistant-curriculum-pushback',
    level: 'assistant',
    audience: 'staff',
    area: 'academics',
    title: 'A department pushes back on common assessments',
    text: 'You are rolling out common unit assessments in the social studies department this year — a decision the principal has already made. At the first department meeting, a teacher says: “So now we all teach to the same test? This is how you kill good teaching,” and two others agree.',
  },

  // ---- Assistant: evaluators ----
  {
    id: 'assistant-eval-conference',
    level: 'assistant',
    audience: 'staff',
    evaluator: true,
    title: 'A teacher disagrees with their evaluation',
    text: 'You are holding a post-observation conference. Two of your ratings for this teacher are below proficient, and your evidence is specific. Before you finish the first one, they say: “You were in my room for twenty minutes, on the day after a fire drill. That’s not my teaching and you know it.”',
  },
  {
    id: 'assistant-support-plan',
    level: 'assistant',
    audience: 'staff',
    evaluator: true,
    title: 'Placing a teacher on a support plan',
    text: 'After two observations and several conversations, you are meeting a teacher to start a formal support plan with clear goals and a timeline. They are respected by students and have been at the school eight years. They say: “A plan? So this is how it starts. Just tell me if you’re trying to push me out.”',
  },

  // ---- Teacher-leader ----
  {
    id: 'teacher-leader-veteran-feedback',
    level: 'teacher_leader',
    audience: 'staff',
    title: 'Feedback to a veteran teacher',
    text: 'You are new as department head. After a visit, you want to talk with a teacher who has been there 15 years about how little students talked during the lesson. Before you start, they say: “I’ve been teaching since before you finished college. What exactly are you here to tell me?”',
  },
  {
    id: 'teacher-leader-ignores-decision',
    level: 'teacher_leader',
    audience: 'staff',
    evaluator: false,
    title: 'A colleague ignores a team decision',
    text: 'Your team agreed to give a common unit assessment. One teacher gave their own test instead, so the team’s data is incomplete. When you ask about it, they shrug: “Mine was better aligned. Nobody made it mandatory.” You have no evaluation authority over them.',
  },
  {
    id: 'teacher-leader-plc',
    level: 'teacher_leader',
    audience: 'staff',
    title: 'A PLC where two people dominate',
    text: 'In your weekly PLC, two teachers do most of the talking and the rest stay quiet. Today one of them cuts off a newer teacher mid-sentence: “That won’t work with our kids, trust me.” The newer teacher stops talking and looks down.',
  },
  {
    id: 'teacher-leader-defensive',
    level: 'teacher_leader',
    audience: 'staff',
    evaluator: false,
    title: 'A teacher is defensive after an observation',
    text: 'You are debriefing a coaching visit with a second-year teacher. You start with what went well, and they interrupt: “Just tell me what I did wrong. Is this going to my evaluation?” It is not — your visits are separate from evaluation.',
  },
  {
    id: 'teacher-leader-overwhelmed',
    level: 'teacher_leader',
    audience: 'staff',
    title: 'A new teacher is overwhelmed',
    text: 'A first-year teacher you mentor stays after a meeting and says quietly: “I’m behind on grading, I cry in my car most days, and I don’t think I’m cut out for this. Please don’t tell the principal.”',
  },
  {
    id: 'teacher-leader-tell-principal',
    level: 'teacher_leader',
    audience: 'up_the_chain',
    title: 'Telling the principal an initiative isn’t working',
    text: 'The principal asked you to lead the rollout of a new curriculum in your department. Three months in, teachers are skipping parts of it and student work has not improved. The principal is proud of it and has presented it to the district. You have a meeting with them tomorrow.',
  },

  // ---- Teacher-leader: evaluators ----
  {
    id: 'teacher-leader-two-hats',
    level: 'teacher_leader',
    audience: 'staff',
    evaluator: true,
    title: 'Evaluating a teacher you have been coaching',
    text: 'You coached a teacher all fall, and they told you openly what they were struggling with. Now you have to write their formal evaluation, and one area will be rated below proficient. When they read it, they say: “I trusted you. I told you those things so you would help me, not so you could write me up.”',
  },
  {
    id: 'teacher-leader-eval-question',
    level: 'teacher_leader',
    audience: 'staff',
    evaluator: true,
    title: '“Is this going on my evaluation?”',
    text: 'You are debriefing a visit with a second-year teacher. You start with what went well, and they interrupt: “Just tell me what I did wrong. Is this going on my evaluation?” As their supervisor, what you saw today can count toward it.',
  },
  {
    id: 'teacher-leader-supervisor-data',
    level: 'teacher_leader',
    audience: 'staff',
    evaluator: true,
    area: 'academics',
    title: 'Unit results are far behind the rest of the team',
    text: 'You supervise the 6th-grade math team. On the last common assessment, one teacher’s classes scored well below everyone else’s, for the second unit in a row. You have scheduled a conversation. They open with: “My kids are the hardest group in the grade. Everyone knows that.”',
  },
  {
    id: 'teacher-leader-curriculum-ignored',
    level: 'teacher_leader',
    audience: 'staff',
    area: 'academics',
    title: 'A teacher is not using the adopted curriculum',
    text: 'The district adopted a new ELA curriculum this year. On three visits, one teacher has been teaching their own novel unit instead. When you raise it, they say: “The new curriculum is scripted and my students are bored by it. My unit works. Do you want engaged kids or compliance?”',
  },
]

export function scenariosForLevel(level: LeaderLevel): LeaderScenario[] {
  return LEADER_SCENARIOS.filter((s) => s.level === level)
}

function fits(s: LeaderScenario, who: LeaderProfile): boolean {
  if (s.level !== who.level.value) return false
  if (coversEverything(who.level.value)) return true
  if (s.area && !who.areas.includes(s.area)) return false
  if (s.evaluator !== undefined && s.evaluator !== who.evaluates) return false
  return true
}

// The scenarios this person can open: their level's, narrowed to their own
// areas and to whether they evaluate staff.
export function scenariosFor(who: LeaderProfile): LeaderScenario[] {
  return LEADER_SCENARIOS.filter((s) => fits(s, who))
}

/// The scenario, only when it is this person's. Anyone else's id is not found,
/// not forbidden — no reason to confirm another level's scenario exists.
export function findScenarioFor(id: unknown, who: LeaderProfile): LeaderScenario | null {
  return LEADER_SCENARIOS.find((s) => s.id === id && fits(s, who)) ?? null
}

export function audienceLabel(value: string | null | undefined): string | null {
  return LEADER_AUDIENCES.find((a) => a.value === value)?.label ?? null
}
