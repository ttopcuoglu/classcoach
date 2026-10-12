/// Turning a failed document read into a response, in one place.
///
/// Every surface that accepts a file hits the same five failures, and each
/// one already had a sentence written for it that is really a fact about the
/// teacher's file rather than a server error ("a long scan usually is").
/// Those sentences were living in routes/assignmentCoach.ts, which meant the
/// second surface to accept a file had the choice of importing from an
/// unrelated router or writing its own wording — and two copies of a
/// teacher-facing sentence drift.
///
/// Deliberately no dependency on documentText.ts: see extractErrors.ts for
/// why the names of the failures stay separate from the parsers.

import type { Response } from 'express'
import { NoTextFoundError, UnsupportedFileError } from './extractErrors.ts'
import { ExtractionTimeoutError, ExtractionTooHeavyError } from './extractInChild.ts'

/// Returns true when it handled the error. False means the caller has
/// something that is genuinely a server failure, and should log it and say so
/// in whatever words that surface uses.
export function sendExtractionError(res: Response, error: unknown, surface: string, file: { originalname: string; size: number }): boolean {
  if (error instanceof UnsupportedFileError) {
    res.status(400).json({ error: error.message })
    return true
  }
  if (error instanceof NoTextFoundError) {
    res.status(422).json({ error: error.message })
    return true
  }
  if (error instanceof ExtractionTimeoutError) {
    console.error(`[${surface}] extract timed out:`, file.originalname, file.size)
    res.status(422).json({
      error: 'That took too long to read — a photo or a long scan can. Try a smaller file, or paste the text instead.',
    })
    return true
  }
  // Too big to read in the memory one document gets. Said as the fact it
  // is, with the way round it, rather than as a server error — because
  // from the teacher's side it is a fact about their file.
  if (error instanceof ExtractionTooHeavyError) {
    console.error(`[${surface}] extract ran out of room:`, file.originalname, file.size)
    res.status(422).json({
      error:
        'That file was too heavy to read — a long scan usually is. Try exporting it as a smaller PDF, sending it in two halves, or pasting the text.',
    })
    return true
  }
  return false
}
