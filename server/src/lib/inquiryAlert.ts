// Emails a heads-up when a school submits the /for-schools form, so a new
// request doesn't sit unseen in the admin inbox.
//
// Sent through Resend's HTTP API (no SDK needed). Stays switched off until
// RESEND_API_KEY is set; the inquiry is already saved either way, so a
// missing key or a failed send only ever costs the alert, never the request.
//
//   RESEND_API_KEY       required to send at all
//   INQUIRY_ALERT_TO     default info@wivoza.com
//   INQUIRY_ALERT_FROM   default "Wivoza <alerts@send.wivoza.com>" — the
//                        domain must be verified in Resend

type InquiryForAlert = {
  name: string
  email: string
  role: string
  organizationName: string
  organizationType: string
  teacherCount: string | null
  message: string | null
}

const TYPE_LABELS: Record<string, string> = {
  school: 'School',
  district: 'District',
  network: 'Charter network',
  other: 'Other',
}

export async function sendInquiryAlert(inquiry: InquiryForAlert): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const to = process.env.INQUIRY_ALERT_TO || 'info@wivoza.com'
  const from = process.env.INQUIRY_ALERT_FROM || 'Wivoza <alerts@send.wivoza.com>'

  // Plain text on purpose: every field was typed by an anonymous visitor, and
  // text/plain can't be turned into markup or links by what they typed.
  const text = [
    `New school inquiry from ${inquiry.organizationName}`,
    '',
    `Name: ${inquiry.name}`,
    `Role: ${inquiry.role}`,
    `Email: ${inquiry.email}`,
    `Organization: ${inquiry.organizationName} (${TYPE_LABELS[inquiry.organizationType] ?? inquiry.organizationType})`,
    `Teachers: ${inquiry.teacherCount ?? 'Not given'}`,
    '',
    'Message:',
    inquiry.message ?? '(none)',
    '',
    'Reply to this email to answer them directly. It is also in the admin dashboard under School inquiries.',
  ].join('\n')

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: inquiry.email,
        subject: `New school inquiry: ${inquiry.organizationName}`.slice(0, 200),
        text,
      }),
    })
    if (!response.ok) {
      console.error('[school-inquiries] alert email failed', response.status, await response.text().catch(() => ''))
    }
  } catch (err) {
    console.error('[school-inquiries] alert email failed', err)
  }
}
