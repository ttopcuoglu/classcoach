import { CORE_COACHING_RULES } from './coachPersona.ts'
import { carryOriginalPictures, themeFromContext } from './exportModels.ts'
import { findImage } from './imageSearch.ts'
import type { OriginalImage } from './originalImages.ts'
import { THEME_GUIDE, type SlideDeck } from './slidesPptx.ts'

// The prompt and finishing every generated deck shares, kept apart from the
// routes so a script can build the same deck without the database —
// see src/scripts/compareDecks.ts.

// Builds a classroom-ready deck that teaches a lesson the way its delivery
// coaching describes: the hook first, timed agenda, the lesson content,
// engagement checkpoints, the hard part explained, and a closing — with the
// teacher-facing delivery advice in the speaker notes.
export function buildLessonDeckPrompt(context: string[]): string {
  return `You are building a classroom-ready presentation the teacher will project while teaching this lesson. Below are the lesson plan and the delivery coaching Coach gave them (opening hook, pacing, engagement checkpoints, explaining the hard part, closing). Build the deck so it delivers the lesson the way that coaching describes:
- Slide 1 is the title slide.
- Right after it comes the opening hook, as the coaching describes it (a question, scenario, or image students respond to).
- An agenda slide with the timing the pacing advice gives, if it gives any.
- The lesson's content from the plan, in order — do now, teaching, guided and independent practice, a higher-order question, closure — one idea per slide, in student-facing wording that suits the grade.
- Engagement checkpoints: a prompt slide (turn-and-talk, quick check, whiteboard question) at each point the coaching recommends, with sentence starters.
- The hard part: one to three slides that explain or model the most confusing idea the way the coaching suggests, using steps, a comparison, or a visual.
- A closing slide (recap or exit ticket) as the coaching describes.
The speaker notes hold the teacher-facing delivery advice for that moment: how long to spend, what to say, where to pause, what to watch for.

Stay true to the plan. Do not invent facts, dates, statistics, quotes, or examples that aren't in the plan or the coaching; where a slide needs an example you can't know, write a plain placeholder and tell the teacher in the notes to add their own.

${DECK_LAYOUT_RULES}

${deckOutputFormat(LESSON_DECK_CHANGES_NOTE)}

Here is what you have to work with:
${context.join('\n\n')}
${CORE_COACHING_RULES}`
}

/// What the lesson deck is built from: the lesson's context line, the lesson
/// as prose, and the delivery coaching.
export function lessonDeckContext(
  plan: { subject: string | null; gradeLevel: string | null; objective: string | null; essentialQuestion: string | null },
  content: string,
  coaching: Record<string, string | null>,
): string[] {
  return [
    [plan.subject && `Subject: ${plan.subject}`, plan.gradeLevel && `Grade: ${plan.gradeLevel}`, plan.objective && `Objective: ${plan.objective}`, plan.essentialQuestion && `Essential question: ${plan.essentialQuestion}`]
      .filter(Boolean)
      .join('\n'),
    `The lesson plan:\n${content.trim()}`,
    `Coach's delivery coaching:\nOpening hook: ${coaching.openingHook ?? '—'}\n\nPacing and timing: ${coaching.pacing ?? '—'}\n\nEngagement checkpoints: ${coaching.engagementCheckpoints ?? '—'}\n\nExplaining the hard part: ${coaching.explainingTheHardPart ?? '—'}\n\nClosing: ${coaching.closing ?? '—'}`,
  ].filter(Boolean) as string[]
}

// The deck-building rules shared by every generator that builds a themed deck:
// the layouts (with the picture rules), the theme choice, and the exact output
// format that parseSlidesOutput reads.
export const DECK_LAYOUT_RULES = `Visuals matter. Use the layouts to make the deck genuinely visual, not walls of text:
- steps — a process, sequence, timeline, or cycle: each bullet is one short step (under 8 words), in order, at most 5.
- compare — two things side by side: the first bullet is "Left heading | Right heading", then one row per bullet as "left item | right item".
- visual — a slide that needs a picture, diagram, map, or chart that you cannot draw (anything the review's visuals section recommended, and any slide the teacher already gave an image). Put a specific description of exactly what to show in <visual> (for example "A labeled map of the routes from the South to Canada"), and keep the bullets short. Only ask for pictures of concrete, well-documented subjects: maps, diagrams, historical images, science and nature, landmarks, and places — for a map, name the region or say "political map". Wivoza will find and place a real, openly licensed picture from <image_query>: 2 to 5 search words (for example "Underground Railroad routes map", "water cycle diagram", "monarch butterfly life cycle") — nouns, places, and event names only. When a slide already has the teacher's own picture (the slides below mark it), use the visual layout for that slide and add <source_slide>N</source_slide> with that slide's original number: Wivoza will place the teacher's own picture on it, exactly as it was, so never replace it with a search. For a picture that would be personal or specific to their class and that you can't carry over, or a people, family, feelings, or classroom-scene picture prompt, leave <image_query> out and write "Add your own image here" in <visual>, because a random photo would not fit.
- keyterm — introducing a vocabulary word or key idea: the title is the word, bullets are its meaning and examples.
- prompt — a question, discussion, turn-and-talk, or check for understanding: the title is the question, bullets are optional sentence starters.
- split — a concept slide with 2-4 bullets beside a large icon.
- cards — lists, rules, agendas, activities (3-5 items).
- title — only the first slide.
Vary the layouts; never use the same layout on more than 2 slides in a row. Every slide gets one <icon>: a single emoji that fits the topic. Bullets are short (under 15 words). Put pacing advice, what to say aloud, and where to pause in <notes> (brief, and only where it helps). At most 30 slides.`

export const deckOutputFormat = (changesNote: string): string => `${THEME_GUIDE}

${changesNote}

Plain text only, no markdown. Respond with exactly this structure and nothing else:
<theme>history</theme>
<changes>
- Slide 2: what changed
</changes>
<slide>
<layout>cards</layout>
<icon>🌟</icon>
<title>Slide title</title>
<bullets>
- First bullet
- Second bullet
</bullets>
<visual>Only for the visual layout: what to show</visual>
<image_query>Only for the visual layout, for a NEW picture to find: search words</image_query>
<source_slide>Only when carrying over the teacher's own picture: the original slide number</source_slide>
<notes>Optional speaker note</notes>
</slide>`

export const LESSON_DECK_CHANGES_NOTE =
  'After the theme, list in <changes> 4 to 8 dash-prefixed lines showing where the delivery coaching is built into the deck, each one plain sentence naming the slide (for example "- Slide 2: opens with your hook question"). Only list what is actually in the deck.'


// Every generated deck gets the same finishing: fall back to a subject theme if
// Claude left the generic default, then find a real picture for each visual
// slide that asked for one (a miss leaves that slide's "add a picture" spot).
export async function finishDeck(
  deck: SlideDeck,
  subject: string | null,
  gradeLevel: string | null,
  originals: Map<number, OriginalImage> = new Map(),
): Promise<void> {
  carryOriginalPictures(deck, originals)
  if (deck.theme === 'wivoza') {
    const inferred = themeFromContext(subject, gradeLevel)
    if (inferred) deck.theme = inferred
  }
  await Promise.all(
    deck.slides
      .filter((slide) => slide.layout === 'visual' && slide.imageQuery && !slide.image)
      .slice(0, 8)
      .map(async (slide) => {
        slide.image = await findImage(slide.imageQuery as string)
      }),
  )
}

