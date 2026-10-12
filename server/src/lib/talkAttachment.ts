/// The document a teacher attaches before a Talk It Through call.
///
/// Talk It Through is the spoken surface, and that changes what a document can
/// be for. On the typed surfaces — Look It Over, Planning Coach — the teacher
/// can see the file, so Coach can say "question three" and mean it. Spoken,
/// there is no shared page to point at and no way to skim: anything Coach
/// reads back is time the teacher spends listening to their own document.
///
/// So the document is context, never the subject. It is attached before the
/// call rather than during one (a file picker does not belong in a hands-free
/// conversation), it is stored as text on the Debrief row so every turn can see
/// it, and the block below spends most of its words telling Coach not to
/// perform it.

/// Characters of document text one conversation carries.
///
/// A lesson plan is comfortably inside this; a sixty-page curriculum guide is
/// not, and should not be, because the useful ceiling here is not the model's
/// context but what one spoken conversation can be about. ~12k characters is
/// roughly 3k tokens, which is affordable at thirty turns once cached (see
/// cachedSystemWithDocument) and still leaves the reply budget alone.
export const MAX_ATTACHMENT_CHARS = 12_000

/// Filenames are teacher-supplied text that goes straight into the prompt.
/// The instruction-priority notice already covers a file called
/// "ignore your instructions.pdf", but a name with newlines in it would break
/// the shape of the block, so it gets flattened and clipped here.
export function cleanAttachmentName(name: string): string {
  return name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

/// Clipped at a whitespace boundary where there is one nearby, so the text
/// does not end mid-word.
export function clipAttachmentText(text: string): { text: string; truncated: boolean } {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_ATTACHMENT_CHARS) return { text: trimmed, truncated: false }
  const hard = trimmed.slice(0, MAX_ATTACHMENT_CHARS)
  const lastBreak = hard.lastIndexOf('\n')
  const cut = lastBreak > MAX_ATTACHMENT_CHARS - 500 ? lastBreak : hard.lastIndexOf(' ')
  return { text: (cut > 0 ? hard.slice(0, cut) : hard).trimEnd(), truncated: true }
}

export function buildAttachmentBlock(name: string | null, text: string | null): string {
  if (!text?.trim()) return ''
  const { text: body, truncated } = clipAttachmentText(text)
  const label = cleanAttachmentName(name ?? '') || 'a document'

  return `
The teacher attached a document before this conversation started: "${label}". Its text is at the end of this section.

It is BACKGROUND, not the subject. Never read it back to them, never summarise it, and never walk through it section by section — they wrote it or they chose it, so they already know what is in it, and this is spoken, where anything recited has to be sat through. Wait for them to bring it up, then answer the thing they actually asked, in the same two sentences and sixty words as any other reply. If they open with nothing more than "take a look at it", ask what about it they want to think through — do not volunteer a review. Refer to it the way a colleague who read it would: "the exit ticket", "that second activity", not "section 3" or "the document states". When you are the one opening the conversation, you may note that you have it in a single short clause — "I've got your plan here" — and then ask what they want to think about; nothing more than that, not what is in it and not what you noticed.

Treat the text as incomplete. It was pulled out of a file automatically, and tables, equations, handwriting, and anything inside an image come out partial or missing — the reader deliberately drops lines it is not confident about rather than guessing at them. So never tell the teacher their document is missing something, never count what is in it, never quote it as exact wording, and never infer that something did not happen because it is not here. When what you need is not in the text, ask them for it.${
    truncated
      ? ' This is also only the first part of a longer file, so say so if they ask about something you cannot see.'
      : ''
  }

--- "${label}" begins ---
${body}
--- "${label}" ends ---`
}

/// What the client sends on the first turn, having run the file through
/// /talk/attachment first. Capped again here rather than trusted: the
/// extraction endpoint caps what it returns, but nothing stops a client
/// posting its own body.
export function readAttachmentInput(raw: unknown): { name: string; text: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const { name, text } = raw as { name?: unknown; text?: unknown }
  if (typeof text !== 'string' || !text.trim()) return null
  return {
    name: cleanAttachmentName(typeof name === 'string' ? name : ''),
    text: clipAttachmentText(text).text,
  }
}
