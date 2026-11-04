# Draft: indemnification clause for the Wivoza Terms

**Status: draft for attorney review. Not in the live Terms.** Written by Claude on 2026-11-03, not by a lawyer.

## Where it would go

As a new paragraph at the end of section 4, "Classroom recordings and student information", in `web/src/pages/Terms.tsx`. Section 4 already requires the teacher to get every school authorization, notice and consent the law requires before recording. This clause adds what happens if they don't.

## Proposed text

> **Your responsibility for recordings and uploads.** To the extent permitted by law, you agree to defend, indemnify and hold harmless Edinexa Technologies LLC and its officers, employees and agents from any third-party claim, demand, loss or expense (including reasonable attorneys' fees) arising from a recording or upload you make through Wivoza without an authorization, notice or consent that was required by law or by your school's policy. This does not apply to a claim to the extent it is caused by our own breach of these Terms, our negligence or our willful misconduct. If you use Wivoza under a school or district agreement, that agreement governs instead where the two differ.

## Questions for the attorney

1. **Is a teacher-indemnity clause enforceable against an individual consumer in Massachusetts,** given chapter 93A and the fact that most teachers pay $0 to $119 a year? Would a narrower clause, covering only recordings made in knowing breach of section 4, be more defensible?
2. **Is this worth having at all?** Teachers are unlikely to be able to pay a claim. Is the main value deterrence plus clarity, and does it hurt sign-ups or school sales enough to outweigh that?
3. **Wiretap exposure (G.L. c. 272 §99).** Wivoza does not record anything itself; the teacher's device does. Does that keep Edinexa out of the "interception" itself, and does the first-recording notice (a dated `recordingNoticeAt` on each account telling the teacher to inform students) help?
4. **The other states that require everyone's consent to record** (for example California, Florida, Illinois, Maryland, Montana, New Hampshire, Pennsylvania and Washington). Is the "tell your students once" instruction enough nationally, or does any state need different wording?
5. **Student data laws** (FERPA; Massachusetts student privacy agreements; state laws such as California's SOPIPA). For a teacher on an individual account, with no school agreement, is Wivoza's position in Terms section 8 sound?
6. **Insurance.** Which policies fit: technology errors and omissions (E&O), cyber liability, privacy liability? Do districts commonly require proof of them?

## What is already in place (for the attorney's context)

- **Terms section 4:** the teacher must get all required authorizations, notices and consent before recording.
- **Terms section 8:** a teacher's account alone does not authorize education records. The school must establish a legal basis and any provider agreement.
- **Terms section 11:** liability capped at the greater of $100 or the amount paid in the last 12 months.
- **Terms section 12:** Massachusetts law and Massachusetts courts.
- **First-recording notice** (web, iPhone and Apple Watch): tell your students once, follow your school's policy, here is a page for your principal and a note for families. Acknowledgment is stored per account in `User.recordingNoticeAt`, and each lesson's `consentConfirmed` records whether the teacher had seen the notice.
- **Public page** www.wivoza.com/classroom-recording: what is kept, who sees it, a line for a school's start-of-year form, and a note for families.
- **Data handling:** audio is deleted once transcribed (a temporary server file; the iPhone keeps its copy at most 7 days). Transcripts stay in the teacher's private account and can include names said aloud. Deepgram and Anthropic are both used under terms that exclude this content from model training.
