import { prisma } from './prisma.ts'
import { DIFFICULTY_LEVELS, SCENARIO_CATEGORIES } from './scenarioCategories.ts'

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

// A soft heuristic over the rating data already collected for the growth
// card — not literal model training. Only used when the teacher didn't pick
// a category explicitly; weights toward categories with a lower average
// rating so practice naturally concentrates where a teacher is weaker,
// without ever fully excluding the others.
export async function pickWeightedCategory(
  userId: string,
  explicitCategory?: unknown,
): Promise<(typeof SCENARIO_CATEGORIES)[number]> {
  if (typeof explicitCategory === 'string' && (SCENARIO_CATEGORIES as readonly string[]).includes(explicitCategory)) {
    return explicitCategory as (typeof SCENARIO_CATEGORIES)[number]
  }

  const attempts = await prisma.scenarioAttempt.findMany({
    where: { userId, rating: { not: null } },
    include: { scenario: true },
  })

  const ratingsByCategory = new Map<string, number[]>()
  for (const a of attempts) {
    if (a.rating == null) continue
    const list = ratingsByCategory.get(a.scenario.category) ?? []
    list.push(a.rating)
    ratingsByCategory.set(a.scenario.category, list)
  }

  const weights = SCENARIO_CATEGORIES.map((category) => {
    const ratings = ratingsByCategory.get(category)
    if (!ratings || ratings.length < MIN_RATED_ATTEMPTS) return NEUTRAL_WEIGHT
    const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
    return Math.max(0.5, 6 - avg) // lower average rating -> higher weight
  })

  return weightedRandomPick(SCENARIO_CATEGORIES, weights)
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
