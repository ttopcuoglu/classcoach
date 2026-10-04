// The four surfaces, as a client needs them.
//
// The derivation that decides which surface a stored item belongs to lives on
// the server (`server/src/lib/workSurface.ts`) and runs at read time — this
// side only names them.

export const WORK_SURFACES = ['talk_it_through', 'practice', 'look_it_over', 'lesson_debrief'] as const

export type WorkSurface = (typeof WORK_SURFACES)[number]

export const WORK_SURFACE_LABELS: Record<WorkSurface, string> = {
  talk_it_through: 'Talk It Through',
  practice: 'Practice',
  look_it_over: 'Look It Over',
  lesson_debrief: 'Lesson Debrief',
}
