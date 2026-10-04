import {
  FOCUS_AREAS,
  findFocusArea,
  focusAreaForSubCategory,
  subCategoryValues,
  type FocusArea,
} from './focusAreas.ts'
import { prisma } from './prisma.ts'
import { DIFFICULTY_LEVELS } from './scenarioCategories.ts'

const NEUTRAL_WEIGHT = 3 // midpoint of the 1-5 rating scale — used when there isn't enough data yet
const MIN_RATED_ATTEMPTS = 2 // same threshold as the growth-insight card in TryItOut.tsx

function weightedRandomPick<T>(items: readonly T[], weights: number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

/// Lower average rating -> higher weight, floored so nothing is ever excluded.
function needWeight(ratings: number[] | undefined): number {
  if (!ratings || ratings.length < MIN_RATED_ATTEMPTS) return NEUTRAL_WEIGHT
  const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
  return Math.max(0.5, 6 - avg)
}

async function ratingsByCategory(userId: string): Promise<Map<string, number[]>> {
  const attempts = await prisma.scenarioAttempt.findMany({
    where: { userId, rating: { not: null } },
    include: { scenario: true },
  })
  const byCategory = new Map<string, number[]>()
  for (const a of attempts) {
    if (a.rating == null) continue
    const list = byCategory.get(a.scenario.category) ?? []
    list.push(a.rating)
    byCategory.set(a.scenario.category, list)
  }
  return byCategory
}

/// Which of the six areas to practice, when the teacher didn't say. Weighted
/// toward areas they score lower in, same soft heuristic as the category pick.
export async function pickWeightedFocusArea(
  userId: string,
  explicitFocusArea?: unknown,
): Promise<FocusArea> {
  const explicit = findFocusArea(explicitFocusArea)
  if (explicit) return explicit

  const byCategory = await ratingsByCategory(userId)
  const byArea = new Map<string, number[]>()
  for (const [category, ratings] of byCategory) {
    const area = focusAreaForSubCategory(category)
    if (!area) continue
    byArea.set(area.value, [...(byArea.get(area.value) ?? []), ...ratings])
  }

  const weights = FOCUS_AREAS.map((a) => needWeight(byArea.get(a.value)))
  return weightedRandomPick(FOCUS_AREAS, weights)
}

// A soft heuristic over the rating data already collected for the growth
// card — not literal model training. Only used when the teacher didn't pick a
// sub-category explicitly; weights toward the ones they score lower in so
// practice naturally concentrates where a teacher is weaker, without ever
// fully excluding the others.
//
// Weighting happens WITHIN a focus area, never across them: a teacher who
// opened Practice to work on grading should not be handed a defiance scenario
// because their behavior ratings happen to be lower. The area is the
// teacher's choice; this only picks inside it.
export async function pickWeightedCategory(
  userId: string,
  focusArea: unknown,
  explicitCategory?: unknown,
): Promise<string> {
  const allowed = subCategoryValues(focusArea)
  if (typeof explicitCategory === 'string' && allowed.includes(explicitCategory)) {
    return explicitCategory
  }

  const byCategory = await ratingsByCategory(userId)
  const weights = allowed.map((category) => needWeight(byCategory.get(category)))
  return weightedRandomPick(allowed, weights)
}

export async function pickWeightedDifficulty(
  userId: string,
  category: string,
  explicitDifficulty?: unknown,
): Promise<(typeof DIFFICULTY_LEVELS)[number]> {
  if (
    typeof explicitDifficulty === 'string' &&
    (DIFFICULTY_LEVELS as readonly string[]).includes(explicitDifficulty)
  ) {
    return explicitDifficulty as (typeof DIFFICULTY_LEVELS)[number]
  }

  const attempts = await prisma.scenarioAttempt.findMany({
    where: { userId, rating: { not: null }, scenario: { category } },
  })
  const ratings = attempts.map((a) => a.rating).filter((r): r is number => r != null)

  if (ratings.length < MIN_RATED_ATTEMPTS) {
    return DIFFICULTY_LEVELS[Math.floor(Math.random() * DIFFICULTY_LEVELS.length)]
  }

  const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
  if (avg >= 4) return weightedRandomPick(['intermediate', 'advanced'] as const, [1, 2])
  if (avg <= 2.5) return weightedRandomPick(['beginner', 'intermediate'] as const, [2, 1])
  return DIFFICULTY_LEVELS[Math.floor(Math.random() * DIFFICULTY_LEVELS.length)]
}
