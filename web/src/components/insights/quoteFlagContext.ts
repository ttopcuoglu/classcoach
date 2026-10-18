import { createContext } from 'react'
import type { Evidence } from '../../lib/insightsModel'

/// Which quotes the teacher has flagged, and how to flag one. Shared by every
/// quote card on the page; absent (null) where flagging is not offered.
export type QuoteFlagState = {
  isFlagged: (findingKey: string, segmentId: string) => boolean
  flag: (findingKey: string, evidence: Evidence) => Promise<void>
}

export const QuoteFlagContext = createContext<QuoteFlagState | null>(null)
