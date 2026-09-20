// Finds a real, openly licensed picture for a slide from Wikimedia Commons —
// free, no account or key needed, and strong on the things classrooms teach
// (maps, diagrams, historical photographs, science illustrations).
//
// Only public-domain and Creative Commons results are used, each with a credit
// line built from the file's own license data, and anything that isn't
// classroom-safe is skipped. Every failure returns null, so the slide simply
// keeps its "add a picture here" spot.

// `original` marks a picture taken from the teacher's own uploaded deck (a data
// link, never stored) as opposed to one found on Wikimedia Commons.
export type SlideImage = { url: string; width: number; height: number; credit: string; original?: boolean }

const IMAGE_HOST = 'upload.wikimedia.org'
const USER_AGENT = 'Wivoza/1.0 (https://www.wivoza.com; classroom presentation builder)'
const MAX_IMAGE_BYTES = 3 * 1024 * 1024

// Public domain, CC0, or a Creative Commons license that only asks for credit.
const ALLOWED_LICENSE = /^(public domain|pd\b|cc0|cc[ -]by(?:[ -]sa)?\b)/i
// Kept deliberately broad: a wrong skip costs a fallback, a wrong pick costs a
// teacher an awkward moment.
const NOT_CLASSROOM_SAFE = /nud|naked|erotic|\bsex|porn|genital|topless|bikini|lingerie|fetish|gore|corpse|autopsy|swastika|lynching|beheading|execution/i

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'for', 'to', 'with', 'from', 'at', 'by'])
// Singular-ish search words, so "routes" and "route", "maps" and "map" agree.
function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
}

function stripHtml(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim() : ''
}

type CommonsPage = {
  index?: number
  title?: string
  imageinfo?: {
    mime?: string
    thumburl?: string
    thumbwidth?: number
    thumbheight?: number
    extmetadata?: Record<string, { value?: string }>
  }[]
}

export async function findImage(rawQuery: string): Promise<SlideImage | null> {
  const query = rawQuery.trim().slice(0, 100)
  if (!query) return null
  try {
    const url = new URL('https://commons.wikimedia.org/w/api.php')
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrnamespace: '6',
      gsrlimit: '12',
      gsrsearch: query,
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: '1000',
    }).toString()
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(7000) })
    if (!response.ok) return null
    const data = (await response.json()) as { query?: { pages?: Record<string, CommonsPage> } }
    const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99))

    const tokens = queryTokens(query)
    // A picture must actually mention most of what was asked for — a weak match
    // (a mug photo for "family celebration") is worse than the marked spot.
    const needed = Math.max(1, Math.ceil(tokens.length * 0.6))
    let best: { score: number; image: SlideImage } | null = null

    for (const page of pages) {
      const info = page.imageinfo?.[0]
      if (!info?.thumburl || !info.thumbwidth || !info.thumbheight) continue
      if (!['image/jpeg', 'image/png', 'image/svg+xml'].includes(info.mime ?? '')) continue
      if (info.thumbwidth < 480 || new URL(info.thumburl).hostname !== IMAGE_HOST) continue

      const meta = info.extmetadata ?? {}
      const license = stripHtml(meta.LicenseShortName?.value)
      if (!ALLOWED_LICENSE.test(license) || meta.NonFree?.value === 'true') continue
      const text = [page.title, stripHtml(meta.ImageDescription?.value), meta.Categories?.value].join(' ')
      if (NOT_CLASSROOM_SAFE.test(text)) continue

      const haystack = text.toLowerCase()
      const score = tokens.filter((token) => haystack.includes(token)).length
      if (score < needed || (best && score <= best.score)) continue

      const artist = stripHtml(meta.Artist?.value)
      const isPublicDomain = /^(public domain|pd\b|cc0)/i.test(license)
      // Author fields are free-form and often messy (file names, wiki markup), so
      // only a short, clean name is shown; otherwise the license alone credits it.
      const cleanArtist = artist.length > 0 && artist.length <= 45 && !/[:*|]|\.(svg|png|jpe?g)/i.test(artist)
      const credit = [!isPublicDomain && cleanArtist ? artist : null, license, 'Wikimedia Commons'].filter(Boolean).join(' · ')
      best = { score, image: { url: info.thumburl, width: info.thumbwidth, height: info.thumbheight, credit } }
    }
    return best?.image ?? null
  } catch {
    // Network trouble, a timeout, or an unexpected response — no picture.
  }
  return null
}

// Downloads an image already vetted by findImage. The host allowlist is checked
// again here because the URL can round-trip through the browser.
export async function fetchImageData(url: string): Promise<{ data: string; type: 'image/jpeg' | 'image/png' | 'image/gif' } | null> {
  // A picture from the teacher's own deck already travels with the deck.
  if (isDataImageUrl(url)) {
    const match = url.match(/^data:(image\/(?:png|jpeg|gif));base64,(.+)$/)
    return match ? { data: `${match[1]};base64,${match[2]}`, type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' } : null
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname !== IMAGE_HOST) return null
    const response = await fetch(parsed, { headers: { 'User-Agent': USER_AGENT }, redirect: 'error', signal: AbortSignal.timeout(10000) })
    if (!response.ok) return null
    const type = response.headers.get('content-type')?.split(';')[0]
    if (type !== 'image/jpeg' && type !== 'image/png') return null
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null
    return { data: `${type};base64,${bytes.toString('base64')}`, type }
  } catch {
    return null
  }
}

export function isAllowedImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.hostname === IMAGE_HOST
  } catch {
    return false
  }
}

// A picture embedded straight in the deck model: PNG, JPEG, or GIF only, and
// small enough (~3 MB of image) that a whole deck of them stays reasonable.
const MAX_DATA_URL_CHARS = 4_300_000
export function isDataImageUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_DATA_URL_CHARS && /^data:image\/(?:png|jpeg|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
}

// The bytes of a picture embedded in a deck or document, for the Word and PDF
// builders (which take raw bytes rather than a link).
export function dataUrlBytes(url: string): { bytes: Buffer; type: 'png' | 'jpg' | 'gif' } | null {
  const match = isDataImageUrl(url) ? url.match(/^data:image\/(png|jpeg|gif);base64,(.+)$/) : null
  return match ? { bytes: Buffer.from(match[2], 'base64'), type: match[1] === 'jpeg' ? 'jpg' : (match[1] as 'png' | 'gif') } : null
}

// Bytes for any vetted picture link — the teacher's own embedded pictures and
// Wikimedia ones alike — for the Word and PDF builders.
export async function loadImageBytes(url: string): Promise<{ bytes: Buffer; type: 'png' | 'jpg' | 'gif' } | null> {
  const embedded = dataUrlBytes(url)
  if (embedded) return embedded
  const fetched = await fetchImageData(url)
  const match = fetched?.data.match(/^image\/(png|jpeg);base64,(.+)$/)
  return match ? { bytes: Buffer.from(match[2], 'base64'), type: match[1] === 'jpeg' ? 'jpg' : 'png' } : null
}

// Fits a picture inside a box without stretching it.
export function fitInside(width: number, height: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
