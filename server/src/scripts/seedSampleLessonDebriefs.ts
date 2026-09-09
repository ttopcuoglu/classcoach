import 'dotenv/config'
import { analyzeTranscript, detectLessonContent, type Segment } from '../lib/audioAnalysis.ts'
import { prisma } from '../lib/prisma.ts'

const TEACHER_EMAIL = process.argv[2] ?? 'test-teacher-a@example.com'

type Line = { speaker: 'Teacher' | 'Student'; text: string; duration: number; gapAfter?: number }

// Scripted lines read faster than a real, elaborating classroom
// conversation would — stretch each line's spoken duration so the
// resulting teacher/student talk split lands somewhere realistic instead
// of being swamped by the natural pauses between short turns.
const SPEECH_SCALE = 2.3

function buildSegments(lines: Line[]): Segment[] {
  const segments: Segment[] = []
  let t = 0
  for (const line of lines) {
    const duration = line.duration * SPEECH_SCALE
    segments.push({ speakerLabel: line.speaker, startSec: t, endSec: t + duration, text: line.text })
    t += duration + (line.gapAfter ?? 1.5)
  }
  return segments
}

// A ~24-minute 6th-grade math lesson on fractions. Deliberately not
// perfect — a couple of corrective moments, an unresolved higher-order
// question, and a below-3s average wait time — so the report shows real,
// mixed evidence rather than an unrealistically flawless class.
const MATH_LINES: Line[] = [
  { speaker: 'Teacher', text: "Good morning everyone, eyes up here please, let's get started.", duration: 4 },
  { speaker: 'Teacher', text: 'Today we are going to learn how fractions represent equal parts of a whole.', duration: 5 },
  { speaker: 'Teacher', text: 'By the end of today you will be able to identify the numerator and denominator in any fraction.', duration: 6 },
  { speaker: 'Student', text: 'Ms. Rivera, is this going to be on the quiz on Friday?', duration: 3 },
  { speaker: 'Teacher', text: "Great question, yes it will be, so let's make sure we really understand it today.", duration: 4 },
  { speaker: 'Teacher', text: 'Think about a time when you split a pizza with your friends, that is just like dividing into fractions in real life.', duration: 6 },
  { speaker: 'Student', text: 'Oh yeah, like when I split a pizza in half with my brother!', duration: 3 },
  { speaker: 'Teacher', text: 'Exactly, nice connection. Who is able to tell me what denominator means?', duration: 4, gapAfter: 3.5 },
  { speaker: 'Student', text: 'Um, is it the bottom number?', duration: 2.5 },
  { speaker: 'Teacher', text: "Great job, Jordan, that's exactly right.", duration: 2.5 },
  { speaker: 'Teacher', text: "Okay, next let's dig into some practice problems together.", duration: 3 },

  { speaker: 'Teacher', text: 'The word numerator means the top number in a fraction.', duration: 4 },
  { speaker: 'Teacher', text: 'The denominator is defined as the total number of equal parts in the whole.', duration: 5 },
  { speaker: 'Teacher', text: 'What is the top number of a fraction called?', duration: 3, gapAfter: 1.8 },
  { speaker: 'Student', text: 'The numerator!', duration: 1.5 },
  { speaker: 'Teacher', text: 'Nice work explaining that.', duration: 2 },
  { speaker: 'Teacher', text: 'What are the two parts of a fraction called?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'Numerator and denominator.', duration: 2 },
  { speaker: 'Teacher', text: 'Define numerator in your own words.', duration: 2.5, gapAfter: 2.5 },
  { speaker: 'Student', text: "It's the number on top that tells how many parts you have.", duration: 3.5 },
  { speaker: 'Teacher', text: 'Excellent thinking there.', duration: 2 },
  { speaker: 'Teacher', text: 'Name the fraction that represents half of this circle.', duration: 3, gapAfter: 2.2 },
  { speaker: 'Student', text: 'One half?', duration: 1.5 },
  { speaker: 'Teacher', text: 'How many equal parts make up this whole?', duration: 3, gapAfter: 1.5 },
  { speaker: 'Student', text: 'Four equal parts.', duration: 2 },
  { speaker: 'Teacher', text: 'What does the numerator tell us?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'How many parts we have out of the whole.', duration: 3 },
  { speaker: 'Teacher', text: 'What is one half plus one half?', duration: 3, gapAfter: 1.2 },
  { speaker: 'Student', text: 'One whole!', duration: 1.5 },
  { speaker: 'Teacher', text: 'Turn and talk to your partner about what a fraction represents.', duration: 4, gapAfter: 45 },
  { speaker: 'Teacher', text: "Thumbs up if that makes sense, thumbs down if you're still confused.", duration: 4, gapAfter: 3 },
  { speaker: 'Student', text: 'Thumbs up!', duration: 1.5 },
  { speaker: 'Teacher', text: 'Why do you think we need a common denominator when we add fractions?', duration: 4, gapAfter: 4.5 },
  { speaker: 'Student', text: "Um, I'm not sure.", duration: 2 },
  { speaker: 'Teacher', text: "Not quite, let's rethink that together.", duration: 3 },
  { speaker: 'Teacher', text: 'How would you explain a fraction to a first grader?', duration: 3.5, gapAfter: 3 },
  { speaker: 'Student', text: 'Maybe like sharing candy equally?', duration: 2.5 },
  { speaker: 'Teacher', text: 'Great point, I like how you connected it to something real.', duration: 3.5 },
  { speaker: 'Teacher', text: 'What would happen if the denominator was zero?', duration: 3.5, gapAfter: 3.5 },
  { speaker: 'Student', text: "That would be weird, you can't divide by zero.", duration: 3 },
  { speaker: 'Teacher', text: 'How does this connect to what we learned about division last week?', duration: 4, gapAfter: 3 },
  { speaker: 'Student', text: 'Fractions are kind of like division problems.', duration: 3 },
  { speaker: 'Teacher', text: 'How could you prove that one half is greater than one third?', duration: 4, gapAfter: 3.5 },
  { speaker: 'Student', text: 'Maybe draw two circles and compare them?', duration: 3 },
  { speaker: 'Teacher', text: 'Explain why one third is bigger than one fourth even though four is bigger than three.', duration: 5, gapAfter: 4 },
  { speaker: 'Student', text: 'Because when you split something into fewer pieces, each piece is bigger.', duration: 3.5 },
  { speaker: 'Teacher', text: 'Compare fractions and decimals, how are they similar?', duration: 3.5, gapAfter: 4 },
  { speaker: 'Student', text: 'They both show parts of a whole?', duration: 2.5 },
  { speaker: 'Teacher', text: 'Maria, can you give it a try on the board?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'Sure, I think it is three fourths.', duration: 3 },
  { speaker: 'Teacher', text: "That's not right, try again.", duration: 2 },
  { speaker: 'Student', text: 'Oh wait, I mean two thirds.', duration: 2.5 },
  { speaker: 'Teacher', text: 'Nice work explaining that.', duration: 2 },
  { speaker: 'Teacher', text: 'Let us move on to group work now.', duration: 3 },

  { speaker: 'Teacher', text: 'Take out your fraction bars from your desk.', duration: 3 },
  { speaker: 'Teacher', text: 'Work with your partner on problems one through five.', duration: 3.5 },
  { speaker: 'Student', text: 'Which page are they on?', duration: 2 },
  { speaker: 'Teacher', text: 'Page thirty two, write down your answer in your math journal.', duration: 4 },
  { speaker: 'Student', text: 'I think number two is one fourth.', duration: 2.5 },
  { speaker: 'Student', text: 'Wait, I got three eighths for that one.', duration: 2.5, gapAfter: 150 },
  { speaker: 'Teacher', text: 'Voices off for a second, quiet please, let us check in.', duration: 4 },
  { speaker: 'Teacher', text: "Great job everyone, I'm hearing some really strong thinking.", duration: 3.5 },
  { speaker: 'Teacher', text: 'Okay, let us come back together.', duration: 2.5 },
  { speaker: 'Teacher', text: 'Who can share one thing they learned about fractions today?', duration: 3.5, gapAfter: 3 },
  { speaker: 'Student', text: "That the denominator can't be zero.", duration: 2.5 },
  { speaker: 'Teacher', text: "Awesome, that's such an important point.", duration: 3 },
  {
    speaker: 'Teacher',
    text: "Tomorrow we'll practice adding fractions with the same denominator, so make sure you remember what a numerator and denominator are.",
    duration: 6,
  },
]

// A ~21-minute 7th-grade ELA lesson on character analysis, for a second
// sample and to give My Growth a real two-session trend to plot.
const ELA_LINES: Line[] = [
  { speaker: 'Teacher', text: 'Good morning, eyes up here, let us begin.', duration: 3 },
  { speaker: 'Teacher', text: 'Today we are going to analyze how the main character changes across the story.', duration: 5 },
  { speaker: 'Teacher', text: 'By the end of today you will be able to explain how a character trait drives the plot.', duration: 6 },
  { speaker: 'Teacher', text: 'Remember when we talked about the protagonist last week, this connects directly to that.', duration: 5 },
  { speaker: 'Student', text: 'Yeah, the one who felt like he did not belong.', duration: 3 },
  { speaker: 'Teacher', text: 'Nice work remembering that, exactly right.', duration: 2.5 },
  { speaker: 'Teacher', text: 'The word protagonist means the main character the story follows.', duration: 4 },
  { speaker: 'Teacher', text: 'Theme is defined as the underlying message the author wants us to understand.', duration: 5 },
  { speaker: 'Teacher', text: 'What is the protagonist of our story called?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'Marcus.', duration: 1.5 },
  { speaker: 'Teacher', text: 'What are the two traits Marcus shows at the beginning of the story?', duration: 4, gapAfter: 2.5 },
  { speaker: 'Student', text: 'He seems nervous and quiet.', duration: 2.5 },
  { speaker: 'Teacher', text: 'Define theme in your own words.', duration: 2.5, gapAfter: 3 },
  { speaker: 'Student', text: 'It is like the big lesson or message of the story.', duration: 3.5 },
  { speaker: 'Teacher', text: 'Excellent thinking there.', duration: 2 },
  { speaker: 'Teacher', text: 'Name the character who challenges Marcus the most.', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'Coach Ellis?', duration: 1.5 },
  { speaker: 'Teacher', text: 'How many major decisions does Marcus make in chapter three?', duration: 4, gapAfter: 2 },
  { speaker: 'Student', text: 'I think two.', duration: 1.5 },
  { speaker: 'Teacher', text: 'What does the author want us to feel during the tryout scene?', duration: 4, gapAfter: 2.5 },
  { speaker: 'Student', text: 'Nervous, like Marcus is.', duration: 2 },
  { speaker: 'Teacher', text: 'Turn and talk to your partner about how Marcus changes.', duration: 4, gapAfter: 45 },
  { speaker: 'Teacher', text: 'Raise your hand if you can name one way Marcus is different by the end.', duration: 4, gapAfter: 3 },
  { speaker: 'Student', text: 'He speaks up for himself now.', duration: 2.5 },
  { speaker: 'Teacher', text: 'Why do you think the author chose to have Marcus fail before he succeeds?', duration: 5, gapAfter: 4.5 },
  { speaker: 'Student', text: 'Maybe to show that failing is part of getting better?', duration: 3 },
  { speaker: 'Teacher', text: 'Great point, I like how you connected that to a bigger idea.', duration: 3.5 },
  { speaker: 'Teacher', text: 'How would you describe Marcus if you only had one word?', duration: 4, gapAfter: 3.5 },
  { speaker: 'Student', text: 'Determined.', duration: 1.5 },
  { speaker: 'Teacher', text: 'What would happen if Coach Ellis had given up on Marcus early on?', duration: 4.5, gapAfter: 4 },
  { speaker: 'Student', text: 'Marcus probably would have quit the team too.', duration: 3 },
  { speaker: 'Teacher', text: 'How does the setting of the story affect how Marcus feels?', duration: 4, gapAfter: 3 },
  { speaker: 'Student', text: 'It feels lonely because he is new to the school.', duration: 3 },
  { speaker: 'Teacher', text: 'How could you prove that Marcus is the true protagonist and not Coach Ellis?', duration: 4.5, gapAfter: 4 },
  { speaker: 'Student', text: 'Because the whole story follows his choices and feelings.', duration: 3 },
  { speaker: 'Teacher', text: 'Explain why the theme of perseverance matters in this story.', duration: 4.5, gapAfter: 4 },
  { speaker: 'Student', text: 'Because Marcus only succeeds by not giving up.', duration: 3 },
  { speaker: 'Teacher', text: 'Compare Marcus at the start and end of the story, how is he different?', duration: 4, gapAfter: 4 },
  { speaker: 'Student', text: 'He starts scared and ends confident.', duration: 2.5 },
  { speaker: 'Teacher', text: 'Priya, can you find a quote that shows that change?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'Maybe the part where he says he is not afraid anymore.', duration: 3 },
  { speaker: 'Teacher', text: "That's not quite it, try again.", duration: 2 },
  { speaker: 'Student', text: 'Oh, maybe the line about stepping onto the field on his own.', duration: 3 },
  { speaker: 'Teacher', text: 'Nice work finding that.', duration: 2 },
  { speaker: 'Teacher', text: 'Okay, next let us move into small group work.', duration: 3 },

  { speaker: 'Teacher', text: 'Get out your character analysis worksheet.', duration: 3 },
  { speaker: 'Teacher', text: 'Work with your partner to find two more quotes that show change.', duration: 4 },
  { speaker: 'Student', text: 'Do they have to be from the same chapter?', duration: 2.5 },
  { speaker: 'Teacher', text: 'No, any chapter, write down the page number too.', duration: 3.5 },
  { speaker: 'Student', text: 'I found one on page forty.', duration: 2, gapAfter: 150 },
  { speaker: 'Teacher', text: 'Focus up, let us wrap up this part.', duration: 3 },
  { speaker: 'Teacher', text: 'Great job everyone, some really thoughtful quotes today.', duration: 3 },
  { speaker: 'Teacher', text: 'Who can share one quote that shows how Marcus changed?', duration: 3.5, gapAfter: 3 },
  { speaker: 'Student', text: 'The one about stepping onto the field on his own.', duration: 2.5 },
  { speaker: 'Teacher', text: "Awesome, that's such a strong example.", duration: 3 },
  {
    speaker: 'Teacher',
    text: 'Tomorrow we will look at how the setting connects to the theme, so keep your worksheet handy.',
    duration: 5.5,
  },
]

// A ~20-minute 5th-grade science lesson on energy flow through ecosystems.
const SCIENCE_LINES: Line[] = [
  { speaker: 'Teacher', text: 'Good morning everyone, eyes up here please, let us get started.', duration: 4 },
  { speaker: 'Teacher', text: 'Today we are going to explore how energy moves through an ecosystem.', duration: 5 },
  { speaker: 'Teacher', text: 'By the end of today you will be able to explain how energy transfers between organisms.', duration: 6 },
  { speaker: 'Teacher', text: 'Think about a time when you saw a nature show with a food chain, that connects directly to what we are studying today.', duration: 6 },
  { speaker: 'Student', text: 'Oh, like lions eating zebras and stuff?', duration: 3 },
  { speaker: 'Teacher', text: 'Exactly, nice connection. Who is able to tell me what an ecosystem is?', duration: 4, gapAfter: 3.5 },
  { speaker: 'Student', text: 'Is it like all the living things in one place?', duration: 3 },
  { speaker: 'Teacher', text: "Great job, Diego, that's exactly right.", duration: 2.5 },
  { speaker: 'Teacher', text: "Okay, next let's dig into some practice problems together.", duration: 3 },

  { speaker: 'Teacher', text: 'The word ecosystem means all the living and nonliving things interacting in an area.', duration: 5 },
  { speaker: 'Teacher', text: 'An organism is defined as any living thing in that system.', duration: 4 },
  { speaker: 'Teacher', text: 'What is an ecosystem?', duration: 3, gapAfter: 1.8 },
  { speaker: 'Student', text: 'All the living and nonliving things in an area.', duration: 3 },
  { speaker: 'Teacher', text: 'Nice work explaining that.', duration: 2 },
  { speaker: 'Teacher', text: 'What are the living parts of an ecosystem called?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'Organisms.', duration: 1.5 },
  { speaker: 'Teacher', text: 'Define producer in your own words.', duration: 2.5, gapAfter: 2.5 },
  { speaker: 'Student', text: 'It is something that makes its own energy, like a plant.', duration: 3.5 },
  { speaker: 'Teacher', text: 'Excellent thinking there.', duration: 2 },
  { speaker: 'Teacher', text: 'Name one organism that lives in a pond ecosystem.', duration: 3, gapAfter: 2.2 },
  { speaker: 'Student', text: 'A frog?', duration: 1.5 },
  { speaker: 'Teacher', text: 'How many trophic levels are usually in a food chain?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'Maybe three or four?', duration: 2 },
  { speaker: 'Teacher', text: 'What does the sun provide to plants in an ecosystem?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'Energy, so they can grow.', duration: 2.5 },
  { speaker: 'Teacher', text: 'What is the role of a decomposer?', duration: 3, gapAfter: 1.5 },
  { speaker: 'Student', text: 'It breaks down dead stuff.', duration: 2 },
  { speaker: 'Teacher', text: 'Turn and talk to your partner about how energy moves through an ecosystem.', duration: 4, gapAfter: 45 },
  { speaker: 'Teacher', text: "Thumbs up if that makes sense, thumbs down if you're still confused.", duration: 4, gapAfter: 3 },
  { speaker: 'Student', text: 'Thumbs up!', duration: 1.5 },
  { speaker: 'Teacher', text: 'Why do you think removing one organism could affect the whole ecosystem?', duration: 4.5, gapAfter: 4.5 },
  { speaker: 'Student', text: "Um, I'm not totally sure.", duration: 2 },
  { speaker: 'Teacher', text: "Not quite, let's rethink that together.", duration: 3 },
  { speaker: 'Teacher', text: 'How would you explain energy transfer to a younger student?', duration: 4, gapAfter: 3 },
  { speaker: 'Student', text: 'Maybe like passing a snack down a line of friends?', duration: 3 },
  { speaker: 'Teacher', text: 'Great point, I like how you connected it to the food web.', duration: 3.5 },
  { speaker: 'Teacher', text: 'What would happen if all the producers in an ecosystem died?', duration: 4, gapAfter: 3.5 },
  { speaker: 'Student', text: 'Everything else would eventually run out of energy too.', duration: 3.5 },
  { speaker: 'Teacher', text: 'How does energy move differently through a food web versus a food chain?', duration: 4.5, gapAfter: 3 },
  { speaker: 'Student', text: 'A food web has more connections than one straight line.', duration: 3 },
  { speaker: 'Teacher', text: 'How could you prove that decomposers are important to an ecosystem?', duration: 4, gapAfter: 3.5 },
  { speaker: 'Student', text: 'Maybe show what happens if nothing ever broke down.', duration: 3 },
  { speaker: 'Teacher', text: 'Explain why energy decreases as it moves up each trophic level.', duration: 5, gapAfter: 4 },
  { speaker: 'Student', text: 'Because some energy is lost as heat at each step.', duration: 3.5 },
  { speaker: 'Teacher', text: 'Compare a healthy ecosystem and a damaged one, how are they different?', duration: 4, gapAfter: 4 },
  { speaker: 'Student', text: 'A healthy one has more balance between organisms.', duration: 3 },
  { speaker: 'Teacher', text: 'Diego, can you give it a try on the board?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'Sure, I think producers come first.', duration: 3 },
  { speaker: 'Teacher', text: "That's not right, try again.", duration: 2 },
  { speaker: 'Student', text: 'Oh wait, I mean the sun comes first.', duration: 2.5 },
  { speaker: 'Teacher', text: 'Nice work explaining that.', duration: 2 },
  { speaker: 'Teacher', text: 'Let us move on to group work now.', duration: 3 },

  { speaker: 'Teacher', text: 'Take out your ecosystem diagram from your desk.', duration: 3 },
  { speaker: 'Teacher', text: 'Work with your partner on the food web worksheet.', duration: 3.5 },
  { speaker: 'Student', text: 'Which ecosystem are we using?', duration: 2 },
  { speaker: 'Teacher', text: 'The pond one, write down your answer in your science journal.', duration: 4 },
  { speaker: 'Student', text: 'I think the frog eats the insect.', duration: 2.5 },
  { speaker: 'Student', text: 'Wait, I put the heron above the frog.', duration: 2.5, gapAfter: 150 },
  { speaker: 'Teacher', text: 'Voices off for a second, quiet please, let us check in.', duration: 4 },
  { speaker: 'Teacher', text: "Great job everyone, I'm hearing some really strong thinking.", duration: 3.5 },
  { speaker: 'Teacher', text: 'Okay, let us come back together.', duration: 2.5 },
  { speaker: 'Teacher', text: 'Who can share one thing they learned about ecosystems today?', duration: 3.5, gapAfter: 3 },
  { speaker: 'Student', text: 'That energy decreases as it moves up the chain.', duration: 3 },
  { speaker: 'Teacher', text: "Awesome, that's such an important point.", duration: 3 },
  {
    speaker: 'Teacher',
    text: "Tomorrow we'll build our own food web, so make sure you remember what a producer and a decomposer are.",
    duration: 6,
  },
]

// A ~20-minute 8th-grade social studies lesson on the U.S. Constitution.
const SOCIAL_STUDIES_LINES: Line[] = [
  { speaker: 'Teacher', text: 'Good morning everyone, eyes up here please, let us get started.', duration: 4 },
  { speaker: 'Teacher', text: 'Today we are going to learn how the Constitution divides power in our government.', duration: 5 },
  { speaker: 'Teacher', text: 'By the end of today you will be able to explain how checks and balances work.', duration: 6 },
  { speaker: 'Teacher', text: 'Think about a time when you and your friends made a group decision, that connects to how our government checks power.', duration: 6 },
  { speaker: 'Student', text: 'Oh, like when we vote on what game to play at recess?', duration: 3 },
  { speaker: 'Teacher', text: 'Exactly, nice connection. Who is able to tell me what the Constitution is?', duration: 4, gapAfter: 3.5 },
  { speaker: 'Student', text: 'Is it the document that sets up our government?', duration: 3 },
  { speaker: 'Teacher', text: "Great job, Amara, that's exactly right.", duration: 2.5 },
  { speaker: 'Teacher', text: "Okay, next let's dig into some practice problems together.", duration: 3 },

  { speaker: 'Teacher', text: 'The word amendment means a formal change to the Constitution.', duration: 4 },
  { speaker: 'Teacher', text: 'Democracy is defined as a government run by the people.', duration: 4 },
  { speaker: 'Teacher', text: 'What is the Constitution?', duration: 3, gapAfter: 1.8 },
  { speaker: 'Student', text: 'The document that sets up our government.', duration: 3 },
  { speaker: 'Teacher', text: 'Nice work explaining that.', duration: 2 },
  { speaker: 'Teacher', text: 'What are the three branches of government called?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'Executive, legislative, and judicial.', duration: 2.5 },
  { speaker: 'Teacher', text: 'Define amendment in your own words.', duration: 2.5, gapAfter: 2.5 },
  { speaker: 'Student', text: 'It is when you officially change part of the Constitution.', duration: 3.5 },
  { speaker: 'Teacher', text: 'Excellent thinking there.', duration: 2 },
  { speaker: 'Teacher', text: 'Name one right protected by the First Amendment.', duration: 3, gapAfter: 2.2 },
  { speaker: 'Student', text: 'Freedom of speech?', duration: 1.5 },
  { speaker: 'Teacher', text: 'Who is the head of the executive branch?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'The president.', duration: 1.5 },
  { speaker: 'Teacher', text: 'How many branches of government are there?', duration: 3, gapAfter: 1.5 },
  { speaker: 'Student', text: 'Three.', duration: 1.2 },
  { speaker: 'Teacher', text: 'What does the legislative branch do?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'It makes the laws.', duration: 2 },
  { speaker: 'Teacher', text: 'Turn and talk to your partner about why checks and balances matter.', duration: 4, gapAfter: 45 },
  { speaker: 'Teacher', text: 'Raise your hand if you can name one branch of government.', duration: 4, gapAfter: 3 },
  { speaker: 'Student', text: 'The judicial branch!', duration: 1.5 },
  { speaker: 'Teacher', text: 'Why do you think the founders divided power into three branches?', duration: 4.5, gapAfter: 4.5 },
  { speaker: 'Student', text: "Um, I'm not totally sure.", duration: 2 },
  { speaker: 'Teacher', text: "Not quite, let's rethink that together.", duration: 3 },
  { speaker: 'Teacher', text: 'How would you explain checks and balances to a younger student?', duration: 4, gapAfter: 3 },
  { speaker: 'Student', text: 'Maybe like no one person gets to make all the rules?', duration: 3 },
  { speaker: 'Teacher', text: 'Great point, I like how you connected that to a bigger idea.', duration: 3.5 },
  { speaker: 'Teacher', text: 'What would happen if one branch had too much power?', duration: 4, gapAfter: 3.5 },
  { speaker: 'Student', text: 'It could make unfair decisions with no one to stop it.', duration: 3 },
  { speaker: 'Teacher', text: 'How does an amendment change how our government works?', duration: 4, gapAfter: 3 },
  { speaker: 'Student', text: 'It updates the rules as our country changes.', duration: 3 },
  { speaker: 'Teacher', text: 'How could you prove that the Constitution still matters today?', duration: 4.5, gapAfter: 4 },
  { speaker: 'Student', text: 'We still use it to settle arguments about our rights.', duration: 3 },
  { speaker: 'Teacher', text: 'Explain why democracy depends on citizens participating.', duration: 4.5, gapAfter: 4 },
  { speaker: 'Student', text: 'Because the government only reflects the people who show up.', duration: 3 },
  { speaker: 'Teacher', text: 'Compare a democracy and a monarchy, how are they different?', duration: 4, gapAfter: 4 },
  { speaker: 'Student', text: 'A monarchy has one ruler, a democracy has the people deciding.', duration: 3 },
  { speaker: 'Teacher', text: 'Amara, can you give it a try on the board?', duration: 3, gapAfter: 2 },
  { speaker: 'Student', text: 'Sure, I think the judicial branch makes the laws.', duration: 3 },
  { speaker: 'Teacher', text: "That's not right, try again.", duration: 2 },
  { speaker: 'Student', text: 'Oh wait, I mean the legislative branch makes the laws.', duration: 2.5 },
  { speaker: 'Teacher', text: 'Nice work explaining that.', duration: 2 },
  { speaker: 'Teacher', text: 'Let us move on to group work now.', duration: 3 },

  { speaker: 'Teacher', text: 'Get out your Constitution packet.', duration: 3 },
  { speaker: 'Teacher', text: 'Work with your partner on the branches of government chart.', duration: 3.5 },
  { speaker: 'Student', text: 'Which branch goes in the first box?', duration: 2 },
  { speaker: 'Teacher', text: 'Executive, write down your answer in your social studies notebook.', duration: 4 },
  { speaker: 'Student', text: 'I think the Senate is legislative.', duration: 2.5 },
  { speaker: 'Student', text: 'Wait, I put the Supreme Court under judicial.', duration: 2.5, gapAfter: 150 },
  { speaker: 'Teacher', text: 'Voices off for a second, quiet please, let us check in.', duration: 4 },
  { speaker: 'Teacher', text: "Great job everyone, I'm hearing some really strong thinking.", duration: 3.5 },
  { speaker: 'Teacher', text: 'Okay, let us come back together.', duration: 2.5 },
  { speaker: 'Teacher', text: 'Who can share one thing they learned about government today?', duration: 3.5, gapAfter: 3 },
  { speaker: 'Student', text: 'That no branch is supposed to have all the power.', duration: 3 },
  { speaker: 'Teacher', text: "Awesome, that's such an important point.", duration: 3 },
  {
    speaker: 'Teacher',
    text: "Tomorrow we'll look at real amendments, so make sure you remember what democracy and amendment mean.",
    duration: 6,
  },
]

async function seedSession(
  teacherId: string,
  lines: Line[],
  meta: { classSubject: string; gradeLevel: string; period: string; daysAgo: number },
) {
  const segments = buildSegments(lines)
  const durationSec = Math.round(Math.max(...segments.map((s) => s.endSec)))
  const analysis = analyzeTranscript(segments)
  const lessonContent = detectLessonContent(segments, analysis.phases)

  const sessionDate = new Date(Date.now() - meta.daysAgo * 24 * 60 * 60 * 1000)

  const session = await prisma.audioSession.create({
    data: {
      userId: teacherId,
      teacherName: null,
      classSubject: meta.classSubject,
      period: meta.period,
      gradeLevel: meta.gradeLevel,
      sessionDate,
      consentConfirmed: true,
      status: 'analyzed',
      durationSec,
      teacherTalkPct: analysis.teacherTalkPct,
      studentTalkPct: analysis.studentTalkPct,
      questionCount: analysis.questionCount,
      higherOrderPct: analysis.higherOrderPct,
      avgWaitTimeSec: analysis.avgWaitTimeSec,
      cfuCount: analysis.cfuCount,
      metricsDetail: analysis.metricsDetail,
      highlights: analysis.highlights,
      phases: analysis.phases,
      questionLog: analysis.questionLog,
      lessonContent,
      createdAt: sessionDate,
      updatedAt: sessionDate,
    },
  })

  await prisma.transcriptSegment.createMany({
    data: segments.map((s) => ({
      sessionId: session.id,
      speakerLabel: s.speakerLabel,
      rawSpeakerTag: s.speakerLabel,
      startSec: s.startSec,
      endSec: s.endSec,
      text: s.text,
    })),
  })

  return { id: session.id, durationSec, questionCount: analysis.questionCount, higherOrderPct: analysis.higherOrderPct, subject: lessonContent.subject }
}

const LESSONS: { lines: Line[]; meta: { classSubject: string; gradeLevel: string; period: string; daysAgo: number } }[] = [
  { lines: MATH_LINES, meta: { classSubject: 'Math 6', gradeLevel: '6th', period: '2nd period', daysAgo: 5 } },
  { lines: ELA_LINES, meta: { classSubject: 'ELA 7', gradeLevel: '7th', period: '4th period', daysAgo: 1 } },
  { lines: SCIENCE_LINES, meta: { classSubject: 'Science 5', gradeLevel: '5th', period: '3rd period', daysAgo: 10 } },
  {
    lines: SOCIAL_STUDIES_LINES,
    meta: { classSubject: 'Social Studies 8', gradeLevel: '8th', period: '1st period', daysAgo: 3 },
  },
]

const teacher = await prisma.user.findUnique({ where: { email: TEACHER_EMAIL } })
if (!teacher) {
  console.error(`No user found with email ${TEACHER_EMAIL}`)
  process.exit(1)
}

// Safe to re-run: skip any subject already seeded for this teacher, so
// running this script again ("seed a couple more") only adds what's new
// instead of duplicating existing sample sessions.
const existingSubjects = new Set(
  (await prisma.audioSession.findMany({ where: { userId: teacher.id }, select: { classSubject: true } })).map(
    (s) => s.classSubject,
  ),
)

const results = []
for (const lesson of LESSONS) {
  if (existingSubjects.has(lesson.meta.classSubject)) {
    results.push({ classSubject: lesson.meta.classSubject, skipped: 'already seeded' })
    continue
  }
  results.push(await seedSession(teacher.id, lesson.lines, lesson.meta))
}

console.log(JSON.stringify({ teacher: TEACHER_EMAIL, sessions: results }, null, 2))
await prisma.$disconnect()
