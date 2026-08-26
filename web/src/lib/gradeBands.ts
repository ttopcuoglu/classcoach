export const GRADE_BANDS = ['K-5', '6-8', '9-12'] as const

export type GradeBand = (typeof GRADE_BANDS)[number]
