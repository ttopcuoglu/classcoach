// Which of the four surfaces a saved item belongs to, and the topic it is
// tagged with — derived at read time from the row itself, never stored.
//
// This is the whole migration contract for the nine-tool -> four-surface
// consolidation. A teacher with 97 conversations, 23 assignments and 12 plans
// keeps every one of them: nothing is copied, moved or rewritten, the rows are
// re-read under new labels. The cost of deriving instead of storing is this
// file; the cost of storing would have been a backfill over eight tables plus
// a dual-write on every create path, where a single missed writer leaves an
// item that exists but can never be found again.
//
// Nothing here reads the database. Every function takes the handful of fields
// that actually decide the answer, so the mapping is testable without a
// Postgres connection and `/api/work` can select narrowly.

import { focusAreaForSubCategory } from './focusAreas.ts'

export type WorkSurface = 'talk_it_through' | 'practice' | 'look_it_over' | 'lesson_debrief'

export const WORK_SURFACES: readonly WorkSurface[] = [
  'talk_it_through',
  'practice',
  'look_it_over',
  'lesson_debrief',
]

/// The models that can produce a work item, with only the fields that change
/// which surface it lands on. `model` is the Prisma model name in camelCase,
/// so a caller can't pass a row from one table under another's name.
export type WorkRecord =
  | { model: 'debrief' }
  | { model: 'parentMessage' }
  | { model: 'conversationPlan' }
  | { model: 'scenarioAttempt' }
  | { model: 'conversationPrep'; source: string | null }
  | { model: 'lessonPlan'; mode: string | null }
  | { model: 'assignmentCoachSession' }
  | { model: 'audioSession' }
  | { model: 'review' }

/// Where this item shows up in My Work, and which surface's filter chip
/// selects it.
///
/// Three of these answers are not the obvious one, and each follows the
/// consolidation's own mapping rather than the tool that produced the row:
///
///   - Every `Debrief` lands on Talk It Through, including the ones whose
///     `source` is `"ask_tab"`. Ask was merged into Talk It Through, so its
///     history belongs there; `source` still records which door it came
///     through, it just no longer decides where it lives.
///   - `ParentMessage` and `ConversationPlan` — the old Write a Message and
///     Prepare for a Meeting — are Talk It Through items. Those are no longer
///     tools a teacher opens; they are things produced at the end of a
///     conversation, so their history reads as conversations too.
///   - `LessonPlan` splits on mode. Generate Ideas became "ask the coach for a
///     sample plan", so a `"generated"` row is a Talk It Through item, while
///     Get Feedback and Review a Presentation became document reviews.
export function surfaceFor(record: WorkRecord): WorkSurface {
  switch (record.model) {
    case 'debrief':
    case 'parentMessage':
    case 'conversationPlan':
      return 'talk_it_through'

    case 'scenarioAttempt':
      return 'practice'

    case 'audioSession':
      return 'lesson_debrief'

    case 'review':
    case 'assignmentCoachSession':
      // Assignment Coach's mode is deliberately not consulted: both `review`
      // and `redesign_ai` are Look It Over items, because "Redesign for
      // meaningful AI use" stopped being a separate tool and became an action
      // taken from an assignment's review result.
      return 'look_it_over'

    case 'conversationPrep':
      // "Practice a Conversation" merged into Practice; "Review My
      // Communication" became Look It Over with type = Message. Anything that
      // isn't explicitly practice is a review: the column defaults to
      // "review", older rows used "real" for the same thing (see the
      // redesign_communications migration), and a row whose source somehow
      // went missing is far likelier to be a review than a role-play.
      return record.source === 'practice' ? 'practice' : 'look_it_over'

    case 'lessonPlan':
      // An unrecognized mode reads as a document review — the same
      // fall-back-to-Review choice Assignment Coach's workspace already makes
      // for its retired modes. It keeps the item reachable instead of hiding
      // it behind a surface filter that nothing matches.
      return record.mode === 'generated' ? 'talk_it_through' : 'look_it_over'
  }
}

/// The topic tag for a saved item, or null when the row carries nothing to
/// tag it with.
///
/// `focusArea` and `category` are the two columns that already hold taxonomy
/// values, on `Debrief` and `Scenario`. Four of the seven topics
/// (`teaching_and_learning`, `classroom_management`, `parent_communication`,
/// `professionalism`) are the pre-existing focus-area values unchanged, which
/// is why no stored row needs rewriting to acquire a topic.
///
/// The `category` fall-back is what rescues the oldest rows: everything
/// written before the focus-area axis existed has a null `focusArea` and one
/// of the six original behavior categories, each of which identifies its area
/// on its own. Without this they would all show up untagged.
export function topicFor(row: {
  focusArea?: string | null
  category?: string | null
}): string | null {
  if (row.focusArea) return row.focusArea
  return focusAreaForSubCategory(row.category)?.value ?? null
}
