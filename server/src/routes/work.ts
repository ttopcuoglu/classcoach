import { Router } from 'express'
import { prisma } from '../lib/prisma.ts'
import { DOC_TYPE_LABELS, isDocType } from '../lib/reviewLenses.ts'
import { kindLabel, topicLabel } from '../lib/topics.ts'
import { surfaceFor, topicFor, WORK_SURFACES, type WorkSurface } from '../lib/workSurface.ts'

export const workRouter = Router()

// One history, across all four surfaces.
//
// Replaces nine per-tool lists. The old shape had a real cost beyond the
// duplication: a teacher who remembered writing something but not which tool
// they wrote it in had to go looking, tool by tool, and the thing they were
// looking for was often in the one they checked last.
//
// Nothing was migrated to build this. Surface and topic are derived at read
// time by `workSurface.ts` — which is why a teacher's 97 conversations, 23
// assignments and 12 plans all appear here without a backfill, and why a row
// written before any of this existed still lands in the right place.

type WorkItem = {
  id: string
  surface: WorkSurface
  /// What kind of thing this is, in a teacher's words — "Conversation",
  /// "Practice", "Lesson plan".
  kind: string
  title: string
  topic: string | null
  topicLabel: string | null
  saved: boolean
  createdAt: Date
  /// Where tapping it goes. Legacy items open their original result page,
  /// which still exists for exactly this reason — consolidating the
  /// navigation was never meant to make a teacher's own past work
  /// unreachable.
  href: string
}

/// First line of a free-text field, capped. A whole pasted document makes an
/// unreadable list; the first line is almost always what a teacher would have
/// called it.
function titleFrom(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const line = candidate?.split('\n').find((l) => l.trim())?.trim()
    if (line) return line.length > 120 ? `${line.slice(0, 117)}…` : line
  }
  return 'Untitled'
}

workRouter.get('/', async (req, res) => {
  const userId = req.user!.userId
  const { surface, topic, saved } = req.query
  const savedOnly = saved === 'true'

  // Nine reads rather than one join, because they are nine unrelated tables
  // and each is a small indexed query on userId. Run together, so the whole
  // list costs one round trip's worth of latency rather than nine.
  const [debriefs, attempts, preps, plans, messages, conversationPlans, assignments, sessions, reviews] =
    await Promise.all([
      prisma.debrief.findMany({
        where: { userId, ...(savedOnly ? { saved: true } : {}) },
        select: { id: true, incidentText: true, focusArea: true, category: true, saved: true, createdAt: true, source: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.scenarioAttempt.findMany({
        where: { userId, ...(savedOnly ? { saved: true } : {}) },
        select: {
          id: true,
          responseText: true,
          saved: true,
          createdAt: true,
          scenario: { select: { text: true, focusArea: true, category: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.conversationPrep.findMany({
        where: { userId, ...(savedOnly ? { saved: true } : {}) },
        select: { id: true, title: true, situationText: true, source: true, category: true, saved: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.lessonPlan.findMany({
        where: { userId, ...(savedOnly ? { saved: true } : {}) },
        select: { id: true, mode: true, objective: true, unitName: true, fileName: true, saved: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.parentMessage.findMany({
        where: { userId, ...(savedOnly ? { saved: true } : {}) },
        select: { id: true, title: true, incidentSummary: true, receivedMessage: true, existingDraft: true, saved: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.conversationPlan.findMany({
        where: { userId, ...(savedOnly ? { saved: true } : {}) },
        select: { id: true, title: true, situationText: true, saved: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.assignmentCoachSession.findMany({
        where: { userId, ...(savedOnly ? { saved: true } : {}) },
        select: { id: true, title: true, originalText: true, assignmentType: true, saved: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      // Recordings have no `saved` flag — a teacher does not star a lesson
      // they recorded, they either keep it or delete it. Excluded from a
      // saved-only view rather than shown as unsaved.
      savedOnly
        ? Promise.resolve([])
        : prisma.audioSession.findMany({
            where: { userId, status: { in: ['analyzed', 'locked'] } },
            select: { id: true, classSubject: true, gradeLevel: true, sessionDate: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          }),
      prisma.review.findMany({
        where: { userId, ...(savedOnly ? { saved: true } : {}) },
        select: { id: true, docType: true, fileName: true, originalText: true, focusArea: true, saved: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])

  const items: WorkItem[] = [
    ...debriefs.map((d) => ({
      id: d.id,
      surface: surfaceFor({ model: 'debrief' }),
      kind: 'Conversation',
      title: titleFrom(d.incidentText),
      ...withTopic(topicFor(d)),
      saved: d.saved,
      createdAt: d.createdAt,
      href: `/talk?open=${d.id}`,
    })),
    ...attempts.map((a) => ({
      id: a.id,
      surface: surfaceFor({ model: 'scenarioAttempt' }),
      kind: 'Practice',
      title: titleFrom(a.scenario.text, a.responseText),
      ...withTopic(topicFor(a.scenario)),
      saved: a.saved,
      createdAt: a.createdAt,
      href: `/practice?open=${a.id}`,
    })),
    ...preps.map((p) => ({
      id: p.id,
      surface: surfaceFor({ model: 'conversationPrep', source: p.source }),
      kind: p.source === 'practice' ? 'Practice' : 'Message review',
      title: titleFrom(p.title, p.situationText),
      ...withTopic(topicFor({ category: p.category })),
      saved: p.saved,
      createdAt: p.createdAt,
      href: `/communications?tool=${p.source === 'practice' ? 'practice' : 'review'}&open=${p.id}`,
    })),
    ...plans.map((p) => ({
      id: p.id,
      surface: surfaceFor({ model: 'lessonPlan', mode: p.mode }),
      kind: p.mode === 'presentation' ? 'Presentation' : p.mode === 'generated' ? 'Sample plan' : 'Lesson plan',
      title: titleFrom(p.unitName, p.objective, p.fileName),
      ...withTopic(null),
      saved: p.saved,
      createdAt: p.createdAt,
      // The mode too: this page's tab was internal state with no URL, so a
      // link to one plan had no way to say which of three panels it lives in.
      href: `/lesson-planning?open=${p.id}&mode=${p.mode}`,
    })),
    ...messages.map((m) => ({
      id: m.id,
      surface: surfaceFor({ model: 'parentMessage' }),
      kind: 'Message',
      title: titleFrom(m.title, m.incidentSummary, m.receivedMessage, m.existingDraft),
      ...withTopic('parent_communication'),
      saved: m.saved,
      createdAt: m.createdAt,
      href: `/communications?tool=write&open=${m.id}`,
    })),
    ...conversationPlans.map((p) => ({
      id: p.id,
      surface: surfaceFor({ model: 'conversationPlan' }),
      kind: 'Meeting plan',
      title: titleFrom(p.title, p.situationText),
      ...withTopic(null),
      saved: p.saved,
      createdAt: p.createdAt,
      href: `/communications?tool=prepare&open=${p.id}`,
    })),
    ...assignments.map((a) => ({
      id: a.id,
      surface: surfaceFor({ model: 'assignmentCoachSession' }),
      kind: 'Assignment',
      title: titleFrom(a.title, a.originalText),
      ...withTopic(null),
      saved: a.saved,
      createdAt: a.createdAt,
      href: `/assignment-coach?open=${a.id}`,
    })),
    ...sessions.map((s) => ({
      id: s.id,
      surface: surfaceFor({ model: 'audioSession' }),
      kind: 'Recording',
      title: titleFrom(s.classSubject, s.gradeLevel ? `Grade ${s.gradeLevel}` : null, 'Recorded lesson'),
      ...withTopic(null),
      saved: false,
      createdAt: s.createdAt,
      href: `/debrief?open=${s.id}`,
    })),
    ...reviews.map((r) => ({
      id: r.id,
      surface: surfaceFor({ model: 'review' }),
      kind: isDocType(r.docType) ? DOC_TYPE_LABELS[r.docType] : 'Review',
      title: titleFrom(r.fileName, r.originalText),
      ...withTopic(r.focusArea),
      saved: r.saved,
      createdAt: r.createdAt,
      // The result's own URL. `?open=` was never handled by the page, so
      // every review in My Work landed on an empty drop zone.
      href: `/look-it-over/${r.id}`,
    })),
  ]

  const filtered = items
    .filter((item) => (typeof surface === 'string' ? item.surface === surface : true))
    .filter((item) => (typeof topic === 'string' ? item.topic === topic : true))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  // Counts for the filter chips, computed over everything rather than over
  // the filtered set — a chip that reads "0" is how a teacher learns the
  // filter is the reason they cannot see anything.
  const bySurface = Object.fromEntries(
    WORK_SURFACES.map((s) => [s, items.filter((i) => i.surface === s).length]),
  ) as Record<WorkSurface, number>

  const byTopic = new Map<string, number>()
  for (const item of items) {
    if (item.topic) byTopic.set(item.topic, (byTopic.get(item.topic) ?? 0) + 1)
  }

  res.json({
    items: filtered,
    total: items.length,
    bySurface,
    byTopic: [...byTopic.entries()]
      .map(([value, count]) => ({ value, label: topicLabel(value) ?? value, count }))
      .sort((a, b) => b.count - a.count),
  })
})

/// The topic and its label together, so a client never has to own the
/// taxonomy's wording. `kindLabel` is consulted too, because the oldest rows
/// carry only a kind.
function withTopic(topic: string | null): { topic: string | null; topicLabel: string | null } {
  if (!topic) return { topic: null, topicLabel: null }
  return { topic, topicLabel: topicLabel(topic) ?? kindLabel(topic) }
}
