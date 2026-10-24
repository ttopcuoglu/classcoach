import { useEffect, useState } from 'react'
import {
  addCanvasInstall,
  getCanvasInstalls,
  removeCanvasInstall,
  setCanvasApiKey,
  type CanvasEnvironment,
  type CanvasInstall,
  type LmsInstalls,
  type LmsKind,
} from '../lib/api'
import { SEND_TO_CANVAS_ENABLED } from './SendToCanvas'
import { Spinner } from './Spinner'

// A school connecting its LMS to Wivoza (LTI 1.3): Canvas, Schoology,
// Brightspace, Moodle or Blackboard. The LMS side is done by its admin, using
// the steps shown for that LMS; the Wivoza side is pasting what the LMS shows
// back. Canvas is the one tried end to end; the others follow each LMS's own
// documentation and say so.

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <code className="w-0 min-w-0 flex-1 truncate rounded-lg border border-hairline bg-cream px-3 py-1.5 text-[13px] text-forest">{value}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1600)
            } catch {
              // The address is on screen to copy by hand.
            }
          }}
          className={`shrink-0 rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-semibold text-forest hover:bg-cream ${FOCUS}`}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/// The scopes Send to Canvas asks for — the same four as CANVAS_SCOPES in
/// server/src/lib/canvasApi.ts, in Canvas's own words for the scope list.
const SCOPES_TO_TICK = [
  'Courses — GET /api/v1/courses',
  'Modules — GET /api/v1/courses/:course_id/modules',
  'Pages — POST /api/v1/courses/:course_id/pages',
  'Module items — POST /api/v1/courses/:course_id/modules/:module_id/items',
]

/// Send to Canvas's half of the set-up, for one connected Canvas: an API
/// developer key, which is what lets a teacher's page land in their course.
function SendSetup({ install, redirectUri, onSaved }: { install: CanvasInstall; redirectUri: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [canvasUrl, setCanvasUrl] = useState(install.canvasUrl ?? '')
  const [apiClientId, setApiClientId] = useState(install.apiClientId ?? '')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await setCanvasApiKey(install.id, { canvasUrl, apiClientId: apiClientId.trim(), apiClientSecret: secret.trim() || undefined })
      setSecret('')
      setOpen(false)
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="basis-full border-t border-hairline pt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-forest">Send to Canvas:</span>
        <span className="text-ink-soft">
          {install.sendReady
            ? `on · ${install.sendingTeachers ?? 0} ${install.sendingTeachers === 1 ? 'teacher has' : 'teachers have'} allowed it`
            : 'not set up — teachers can open Wivoza from Canvas, but not send lessons to it'}
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} className={`rounded font-semibold text-forest underline underline-offset-2 ${FOCUS}`}>
          {open ? 'Close' : install.sendReady ? 'Change the API key' : 'Set it up'}
        </button>
      </div>
      {open && (
        <form onSubmit={save} className="mt-3 flex flex-col gap-3 text-sm text-ink">
          <p>
            <span className="font-semibold text-forest">1. In Canvas, make an API key.</span> Admin → Developer Keys → + Developer Key → API Key.
            Name it Wivoza and paste this under Redirect URIs:
          </p>
          <CopyField label="Redirect URI" value={redirectUri} />
          <div>
            <p>
              <span className="font-semibold text-forest">2. Turn on Enforce Scopes and tick only these four.</span> Wivoza can then list courses
              and modules and add pages — nothing else.
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-ink-soft">
              {SCOPES_TO_TICK.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <p>
            <span className="font-semibold text-forest">3. Save, turn the key on, then copy</span> its client ID (Details column) and its key (Show
            Key) into the boxes below, with your Canvas address.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-semibold text-ink-soft">Your Canvas address</span>
              <input
                id={`canvas-url-${install.id}`}
                value={canvasUrl}
                onChange={(e) => setCanvasUrl(e.target.value)}
                placeholder="yourschool.instructure.com"
                className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft">API key client ID</span>
              <input
                id={`canvas-api-id-${install.id}`}
                inputMode="numeric"
                value={apiClientId}
                onChange={(e) => setApiClientId(e.target.value)}
                className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft">API key secret</span>
              <input
                id={`canvas-api-secret-${install.id}`}
                type="password"
                autoComplete="off"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={install.sendReady ? 'Leave empty to keep the current one' : ''}
                className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
              />
            </label>
          </div>
          <p className="text-xs text-ink-soft">The secret is stored encrypted and never shown again. Changing the key or address asks each teacher to allow Wivoza once more.</p>
          {error && (
            <p role="alert" className="text-sm text-terracotta-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !canvasUrl.trim() || !apiClientId.trim() || (!install.sendReady && !secret.trim())}
            className={`flex items-center gap-2 self-start rounded-full bg-forest px-5 py-2 text-sm font-bold text-cream hover:bg-forest-soft disabled:opacity-60 ${FOCUS}`}
          >
            {busy && <Spinner />}
            <span className="text-cream">Save</span>
          </button>
        </form>
      )}
    </div>
  )
}

const LMS_OPTIONS: { lms: LmsKind; label: string }[] = [
  { lms: 'canvas', label: 'Canvas' },
  { lms: 'schoology', label: 'Schoology' },
  { lms: 'brightspace', label: 'Brightspace' },
  { lms: 'moodle', label: 'Moodle' },
  { lms: 'blackboard', label: 'Blackboard' },
]
const lmsLabel = (lms: LmsKind | undefined) => LMS_OPTIONS.find((o) => o.lms === (lms ?? 'canvas'))!.label

/// Which LMSs a school can connect here by itself. Only Canvas for now
/// (2026-10-24): it is the one where hiding Wivoza from students is
/// documented and tried. The others are built (steps below, server routes)
/// and switched on here once tried with a real school; until then a school
/// on another LMS contacts Wivoza.
const OFFERED: LmsKind[] = ['canvas']

const FIELD = 'rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none'

function Field({ id, label, value, onChange, placeholder, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} autoComplete="off" className={FIELD} />
      {hint && <span className="text-[11px] text-ink-soft">{hint}</span>}
    </label>
  )
}

const Step = ({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) => (
  <li className="flex flex-col gap-2">
    <p>
      <span className="font-semibold text-forest">
        {n}. {title}
      </span>{' '}
      {children}
    </p>
  </li>
)

type Draft = { clientId: string; name: string; environment: CanvasEnvironment; deploymentId: string; issuer: string; authUrl: string; jwksUrl: string }
const EMPTY: Draft = { clientId: '', name: '', environment: 'production', deploymentId: '', issuer: '', authUrl: '', jwksUrl: '' }

/// The steps an LMS admin follows in their LMS, then the fields they paste
/// back. Everything but Canvas is written from that LMS's documentation and
/// has not been tried with Wivoza yet.
function SetupSteps({ lms, data, draft, set }: { lms: LmsKind; data: LmsInstalls; draft: Draft; set: (patch: Partial<Draft>) => void }) {
  const urls = data.toolUrls ?? {
    login: data.configUrl.replace(/config\.json$/, 'login'),
    launch: data.configUrl.replace(/config\.json$/, 'launch'),
    jwks: data.configUrl.replace(/config\.json$/, 'jwks'),
    domain: new URL(data.configUrl).host,
  }
  const vendor = lms === 'schoology' ? data.vendorApps?.schoology : lms === 'blackboard' ? data.vendorApps?.blackboard : undefined

  if (lms === 'canvas')
    return (
      <>
        <li className="flex flex-col gap-2">
          <p>
            <span className="font-semibold text-forest">1. In Canvas, make a developer key.</span> Admin → Developer Keys → + Developer Key → LTI
            Key. For Method, choose <span className="font-semibold">Enter URL</span> and paste the first address. Paste the second under Redirect
            URIs.
          </p>
          <CopyField label="JSON URL" value={data.configUrl} />
          <CopyField label="Redirect URI" value={urls.launch} />
        </li>
        <Step n={2} title="Turn the key on and copy its client ID">— the long number in the Details column.</Step>
        <Step n={3} title="Install it.">
          Admin → Settings → Apps → View App Configurations → + App → Configuration Type: By Client ID. Paste the client ID and install. To try it
          first, leave it Not Available and add an exception for one test course.
        </Step>
        <li className="flex flex-col gap-2">
          <span className="font-semibold text-forest">4. Paste the client ID here.</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="lms-client-id" label="Client ID" value={draft.clientId} onChange={(v) => set({ clientId: v })} placeholder="e.g. 10000000000123" />
            <Field id="lms-name" label="Name (optional)" value={draft.name} onChange={(v) => set({ name: v })} placeholder="Canvas" />
          </div>
          <details className="text-xs text-ink-soft">
            <summary className="cursor-pointer font-semibold">Made the key in Canvas Beta or Test?</summary>
            <select
              id="canvas-environment"
              value={draft.environment}
              onChange={(e) => set({ environment: e.target.value as CanvasEnvironment })}
              className="mt-2 rounded-xl border border-hairline bg-white px-3 py-1.5 text-sm text-ink"
            >
              <option value="production">Canvas (your school's usual Canvas)</option>
              <option value="beta">Canvas Beta</option>
              <option value="test">Canvas Test</option>
            </select>
          </details>
        </li>
      </>
    )

  if ((lms === 'schoology' || lms === 'blackboard') && !vendor)
    return (
      <li className="rounded-xl bg-pale-gold/50 px-3 py-2 text-forest">
        Wivoza's {lmsLabel(lms)} app is being registered with {lms === 'schoology' ? 'Schoology' : 'Anthology, which makes Blackboard'}. Once it is,
        connecting takes one number from your {lmsLabel(lms)} admin. Contact Wivoza if your school needs it now.
      </li>
    )

  if (lms === 'schoology')
    return (
      <>
        <Step n={1} title="Install Wivoza for your district.">
          As a Schoology district admin, find Wivoza in the App Center and install it for your district.
        </Step>
        <Step n={2} title="Copy the deployment ID.">
          In your district's app list, click Configure next to Wivoza. Schoology shows the deployment ID for your district.
        </Step>
        <Step n={3} title="Add it to courses.">
          Install the app to the courses where teachers should find it. Schoology may show it to students in those courses; Wivoza turns students
          away.
        </Step>
        <li className="flex flex-col gap-2">
          <span className="font-semibold text-forest">4. Paste the deployment ID here.</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="lms-deployment" label="Deployment ID" value={draft.deploymentId} onChange={(v) => set({ deploymentId: v })} />
            <Field id="lms-name" label="Name (optional)" value={draft.name} onChange={(v) => set({ name: v })} placeholder="Schoology" />
          </div>
        </li>
      </>
    )

  if (lms === 'blackboard')
    return (
      <>
        <li className="flex flex-col gap-2">
          <p>
            <span className="font-semibold text-forest">1. Register Wivoza.</span> Administrator Panel → LTI Tool Providers → Register LTI 1.3/Advantage
            Tool. Paste Wivoza's client ID and submit.
          </p>
          <CopyField label="Client ID" value={vendor!} />
        </li>
        <Step n={2} title="Approve it, sending names only.">
          Set Tool Status to Approved. Under user fields to send, choose Name only, not email. Submit — Blackboard shows the Deployment ID; copy it.
        </Step>
        <li className="flex flex-col gap-2">
          <p>
            <span className="font-semibold text-forest">3. Add a course tool for teachers.</span> In the tool's menu, Manage Placements → Create
            Placement. Label Wivoza, type Course tool, <span className="font-semibold">untick Allow student access</span>, Launch in New Window, and
            this Target Link URI:
          </p>
          <CopyField label="Target Link URI" value={urls.launch} />
        </li>
        <li className="flex flex-col gap-2">
          <span className="font-semibold text-forest">4. Paste the deployment ID here.</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="lms-deployment" label="Deployment ID" value={draft.deploymentId} onChange={(v) => set({ deploymentId: v })} />
            <Field id="lms-name" label="Name (optional)" value={draft.name} onChange={(v) => set({ name: v })} placeholder="Blackboard" />
          </div>
        </li>
      </>
    )

  if (lms === 'brightspace')
    return (
      <>
        <li className="flex flex-col gap-2">
          <p>
            <span className="font-semibold text-forest">1. Register Wivoza.</span> Admin Tools → Manage Extensibility → LTI Advantage → Register Tool →
            Standard. Name it Wivoza and paste these. Leave the extensions unticked, and tick Send Institution Role.
          </p>
          <CopyField label="Domain" value={urls.domain} />
          <CopyField label="Redirect URL" value={urls.launch} />
          <CopyField label="OpenID Connect Login URL" value={urls.login} />
          <CopyField label="Keyset URL" value={urls.jwks} />
        </li>
        <Step n={2} title="Make a deployment.">
          View Deployments → New Deployment. Under security settings send the user's name, not email. Add the org units for your school, then create
          it.
        </Step>
        <Step n={3} title="Make a link.">
          In the deployment, View Links → New Link, with the Redirect URL above as its URL and Basic Launch as its type. Put it where teachers will
          find it, limited to teaching roles if your Brightspace allows; Wivoza turns students away.
        </Step>
        <li className="flex flex-col gap-2">
          <span className="font-semibold text-forest">4. Copy Brightspace's registration details here.</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="lms-client-id" label="Client Id" value={draft.clientId} onChange={(v) => set({ clientId: v })} />
            <Field id="lms-issuer" label="Issuer" value={draft.issuer} onChange={(v) => set({ issuer: v })} placeholder="https://…" />
            <Field id="lms-auth" label="OpenID Connect Authentication Endpoint" value={draft.authUrl} onChange={(v) => set({ authUrl: v })} placeholder="https://…" />
            <Field id="lms-jwks" label="Brightspace Keyset URL" value={draft.jwksUrl} onChange={(v) => set({ jwksUrl: v })} placeholder="https://…" />
            <Field id="lms-deployment" label="Deployment Id (optional)" value={draft.deploymentId} onChange={(v) => set({ deploymentId: v })} />
            <Field id="lms-name" label="Name (optional)" value={draft.name} onChange={(v) => set({ name: v })} placeholder="Brightspace" />
          </div>
        </li>
      </>
    )

  return (
    <>
      <li className="flex flex-col gap-2">
        <p>
          <span className="font-semibold text-forest">1. Add Wivoza as a tool.</span> Site administration → Plugins → Activity modules → External
          tool → Manage tools → configure a tool manually. Name it Wivoza, choose LTI 1.3, Public key type Keyset URL, Default launch container New
          window, share the launcher's name always and email never, and paste these:
        </p>
        <CopyField label="Tool URL" value={urls.launch} />
        <CopyField label="Public keyset" value={urls.jwks} />
        <CopyField label="Initiate login URL" value={urls.login} />
        <CopyField label="Redirection URI(s)" value={urls.launch} />
      </li>
      <Step n={2} title="Copy its details.">
        In Manage tools, open the tool's View configuration details.
      </Step>
      <Step n={3} title="Keep it out of students' view.">
        Teachers add Wivoza to a course as an activity and hide it from students. Wivoza turns students away either way.
      </Step>
      <li className="flex flex-col gap-2">
        <span className="font-semibold text-forest">4. Paste Moodle's configuration details here.</span>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="lms-issuer" label="Platform ID" value={draft.issuer} onChange={(v) => set({ issuer: v })} placeholder="https://moodle.yourschool.org" />
          <Field id="lms-client-id" label="Client ID" value={draft.clientId} onChange={(v) => set({ clientId: v })} />
          <Field id="lms-auth" label="Authentication request URL" value={draft.authUrl} onChange={(v) => set({ authUrl: v })} placeholder="https://…/mod/lti/auth.php" />
          <Field id="lms-jwks" label="Public keyset URL" value={draft.jwksUrl} onChange={(v) => set({ jwksUrl: v })} placeholder="https://…/mod/lti/certs.php" />
          <Field id="lms-deployment" label="Deployment ID (optional)" value={draft.deploymentId} onChange={(v) => set({ deploymentId: v })} />
          <Field id="lms-name" label="Name (optional)" value={draft.name} onChange={(v) => set({ name: v })} placeholder="Moodle" />
        </div>
      </li>
    </>
  )
}

function ready(lms: LmsKind, d: Draft, data: LmsInstalls): boolean {
  if (lms === 'canvas') return !!d.clientId.trim()
  if (lms === 'schoology') return !!data.vendorApps?.schoology && !!d.deploymentId.trim()
  if (lms === 'blackboard') return !!data.vendorApps?.blackboard && !!d.deploymentId.trim()
  return !!(d.clientId.trim() && d.issuer.trim() && d.authUrl.trim() && d.jwksUrl.trim())
}

export default function CanvasInstalls() {
  const [data, setData] = useState<LmsInstalls | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lms, setLms] = useState<LmsKind>('canvas')
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  async function refresh() {
    try {
      setData(await getCanvasInstalls())
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }
  useEffect(() => {
    void refresh()
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!data || !ready(lms, draft, data) || busy) return
    setBusy(true)
    setError(null)
    const t = (v: string) => v.trim() || undefined
    try {
      await addCanvasInstall({
        lms,
        name: t(draft.name),
        clientId: t(draft.clientId),
        environment: lms === 'canvas' ? draft.environment : undefined,
        deploymentId: t(draft.deploymentId),
        issuer: t(draft.issuer),
        authUrl: t(draft.authUrl),
        jwksUrl: t(draft.jwksUrl),
      })
      setDraft(EMPTY)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(id: string) {
    setBusy(true)
    setError(null)
    try {
      await removeCanvasInstall(id)
      setConfirming(null)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <p className="text-sm text-ink-soft">{loadError}</p>
  if (!data)
    return (
      <p className="flex items-center gap-2 text-sm text-ink-soft">
        <Spinner /> Loading…
      </p>
    )

  const label = lmsLabel(lms)

  return (
    <div className="flex flex-col gap-6">
      {data.platforms.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">Connected</h2>
          <ul className="flex flex-col gap-2">
            {data.platforms.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-hairline bg-white px-4 py-3">
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block font-semibold text-forest">
                    {p.name}
                    {p.name !== lmsLabel(p.lms) && <span className="ml-2 text-xs font-semibold text-ink-soft">{lmsLabel(p.lms)}</span>}
                  </span>
                  <span className="block text-xs text-ink-soft [overflow-wrap:anywhere]">
                    {p.deploymentId && (p.lms === 'schoology' || p.lms === 'blackboard') ? `Deployment ${p.deploymentId}` : `Client ID ${p.clientId}`}
                    {(p.lms ?? 'canvas') === 'canvas' && p.environment !== 'production' ? ` · ${p.environment}` : ''} · {p.connectedTeachers}{' '}
                    {p.connectedTeachers === 1 ? 'teacher has' : 'teachers have'} connected
                  </span>
                </span>
                {confirming === p.id ? (
                  <span className="flex items-center gap-2 text-xs text-forest">
                    Teachers lose the Wivoza link in {lmsLabel(p.lms)}.
                    <button type="button" disabled={busy} onClick={() => handleRemove(p.id)} className={`rounded font-semibold text-terracotta-600 underline underline-offset-2 ${FOCUS}`}>
                      Remove
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className={`rounded font-semibold underline underline-offset-2 ${FOCUS}`}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirming(p.id)} className={`rounded text-xs font-semibold text-ink-soft underline underline-offset-2 hover:text-forest ${FOCUS}`}>
                    Remove
                  </button>
                )}
                {SEND_TO_CANVAS_ENABLED && (p.lms ?? 'canvas') === 'canvas' && (
                  <SendSetup install={p} redirectUri={data.oauthRedirectUri ?? data.configUrl.replace(/lti\/config\.json$/, 'canvas/oauth/callback')} onSaved={() => void refresh()} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-forest">
          {OFFERED.length > 1 ? (data.platforms.length ? 'Connect another LMS' : 'Connect your LMS') : data.platforms.length ? 'Connect another Canvas' : 'Connect your Canvas'}
        </h2>
        {OFFERED.length > 1 && (
        <div role="radiogroup" aria-label="Your LMS" className="flex flex-wrap gap-2">
          {LMS_OPTIONS.filter((o) => OFFERED.includes(o.lms)).map((o) => (
            <button
              key={o.lms}
              type="button"
              role="radio"
              aria-checked={lms === o.lms}
              onClick={() => {
                setLms(o.lms)
                setError(null)
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${FOCUS} ${
                lms === o.lms ? 'bg-forest text-cream' : 'border border-hairline bg-white text-forest hover:bg-cream'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        )}
        {lms !== 'canvas' && (
          <p className="rounded-xl bg-cream px-3 py-2 text-xs text-ink-soft">
            These steps follow {label}'s own documentation. Wivoza has been tried end to end with Canvas, not yet with {label}, so tell Wivoza if a
            step doesn't match what you see.
          </p>
        )}
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <ol className="flex flex-col gap-4 text-sm text-ink">
            <SetupSteps lms={lms} data={data} draft={draft} set={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
          </ol>
          {error && (
            <p role="alert" className="text-sm text-terracotta-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !ready(lms, draft, data)}
            className={`flex items-center gap-2 self-start rounded-full bg-forest px-5 py-2.5 text-sm font-bold text-cream hover:bg-forest-soft disabled:opacity-60 ${FOCUS}`}
          >
            {busy && <Spinner />}
            <span className="text-cream">Connect {label}</span>
          </button>
        </form>
        <p className="text-xs text-ink-soft">
          Teachers then open Wivoza from their courses, in its own tab. The first time, each teacher signs in to Wivoza once to connect their{' '}
          {label} account. Students who reach it are turned away.
        </p>
      </section>

      <section className="rounded-3xl border border-dashed border-hairline px-6 py-5">
        <h2 className="font-heading text-base font-bold text-forest">Using a different LMS?</h2>
        <p className="mt-1 text-sm text-ink-soft">
          We can work with your LMS too — Schoology, Brightspace, Moodle, Blackboard and others that support LTI 1.3. Email{' '}
          <a href="mailto:hello@wivoza.com" className={`rounded font-semibold text-forest underline underline-offset-2 ${FOCUS}`}>
            hello@wivoza.com
          </a>{' '}
          and we'll set it up with your LMS admin, including keeping Wivoza out of students' view.
        </p>
      </section>
    </div>
  )
}
