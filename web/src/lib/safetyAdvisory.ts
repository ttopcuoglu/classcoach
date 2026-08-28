export type SafetyTier = 'admin_review' | 'do_not_handle_alone'

export type SafetyFlag = { tier: SafetyTier; message: string }

// Deliberately conservative, keyword-based — a Phase 1 heuristic, not a full
// classifier. No "revise before sending" tier: too subjective for keyword
// matching, and the app shouldn't feel alarming for routine communication.
// The two tiers below are the ones that matter for a teacher's safety and
// scope of authority, so those are the ones worth a heuristic nudge.
const DO_NOT_HANDLE_ALONE_PHRASES = [
  /\bsuicid/i,
  /\bkill (myself|himself|herself|themselves|yourself)\b/i,
  /\bself.?harm/i,
  /\bhurt (myself|himself|herself|themselves)\b/i,
  /\babuse[sd]?\b/i,
  /\bneglect/i,
  /\bweapon/i,
  /\bthreat(en(ed|ing)?)?\b/i,
  /\bunsafe at home\b/i,
  /\bmental.?health crisis\b/i,
]

const ADMIN_REVIEW_PHRASES = [
  /\bharass/i,
  /\bbully(ing)?\b/i,
  /\bdiscriminat/i,
  /\b504\b/i,
  /\bIEP\b/i,
  /\bspecial education\b/i,
  /\blawyer\b/i,
  /\blegal action\b/i,
  /\bsu(e|ing|ed)\b.*\b(school|district|teacher)\b/i,
  /\blawsuit\b/i,
  /\brecords? request\b/i,
  /\bconfidential(ity)?\b/i,
  /\bfile a complaint\b/i,
]

export function detectSafetyFlag(text: string): SafetyFlag | null {
  if (!text || !text.trim()) return null
  if (DO_NOT_HANDLE_ALONE_PHRASES.some((re) => re.test(text))) {
    return {
      tier: 'do_not_handle_alone',
      message:
        "This may involve a safety concern. Don't handle this alone — follow your school's policy and contact an administrator or the appropriate designated staff member right away.",
    }
  }
  if (ADMIN_REVIEW_PHRASES.some((re) => re.test(text))) {
    return {
      tier: 'admin_review',
      message:
        'This may be worth an administrator review before you send or finalize anything — loop in an administrator or the appropriate staff member.',
    }
  }
  return null
}
