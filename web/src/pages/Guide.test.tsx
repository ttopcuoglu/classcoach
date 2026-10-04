// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

// The guide is where a teacher goes when the app has stopped making sense, so
// a broken link here lands on the one page that was supposed to help.
//
// The jump nav used to derive its anchor from its label, which is how "Plan"
// went on pointing at #plan long after that section became "Before and
// after": a dead link no type-check and no reviewer would notice. These tests
// read the rendered page, so the nav and the sections have to agree.

vi.mock('../lib/api', () => ({}))
vi.mock('../components/SupportChat', () => ({ default: () => null }))
vi.mock('../components/TrainingVideos', () => ({ TrainingLibrary: () => null }))

const { default: Guide } = await import('./Guide')

function renderGuide() {
  return render(
    <MemoryRouter>
      <Guide />
    </MemoryRouter>,
  ).container
}

afterEach(cleanup)

test('every jump link points at a section that is on the page', () => {
  const container = renderGuide()
  const targets = new Set(Array.from(container.querySelectorAll('[id]')).map((el) => el.id))
  const anchors = Array.from(container.querySelectorAll('a[href^="#"]')).map((a) =>
    (a.getAttribute('href') ?? '').slice(1),
  )
  expect(anchors.length).toBeGreaterThan(0)
  for (const anchor of anchors) {
    expect(targets.has(anchor), `#${anchor} has no section`).toBe(true)
  }
})

// The nav is the page's table of contents: a section missing from it is a
// section a teacher scrolls past.
test('the jump nav names every top-level section', () => {
  const container = renderGuide()
  const linked = new Set(
    Array.from(container.querySelectorAll('a[href^="#"]')).map((a) => (a.getAttribute('href') ?? '').slice(1)),
  )
  const sections = Array.from(container.querySelectorAll('section[id]')).map((s) => s.id)
  expect(sections.length).toBeGreaterThan(0)
  for (const id of sections) {
    expect(linked.has(id), `section #${id} is not in the jump nav`).toBe(true)
  }
})

// Four surfaces, four guides. These are the links out of the reference and
// into the coaching walkthrough, and each is a real route.
test('each surface guide is linked, and no retired guide is', () => {
  const container = renderGuide()
  const guides = Array.from(container.querySelectorAll('a[href^="/guide/"]')).map((a) => a.getAttribute('href'))
  expect(new Set(guides)).toEqual(
    new Set(['/guide/talk-it-through', '/guide/practice', '/guide/look-it-over', '/guide/lesson-debrief']),
  )
})

// The old three group headers named tools, not moments. "Plan" in particular
// was the header this refactor dissolved.
test('the retired tools and group headers are not named on the page', () => {
  const text = renderGuide().textContent ?? ''
  // Asserted as a boolean: `expect(text).not.toContain(...)` prints the whole
  // guide — some 15,000 characters — on failure, which buries the one word
  // that is wrong.
  const names = (phrase: string) => text.includes(phrase)
  for (const gone of [
    'Ask & Practice',
    'Lesson Planning',
    'Assignment Coach',
    'Communication Coach',
    'Cheat Sheet',
    'First 30 Days',
    'Reflect tab',
  ]) {
    expect(names(gone), `the guide still names "${gone}"`).toBe(false)
  }
})

test('the four surfaces are named, under the one group header they share', () => {
  const text = renderGuide().textContent ?? ''
  for (const label of ['Talk It Through', 'Practice', 'Look It Over', 'Lesson Debrief', 'My Work']) {
    expect(text.includes(label), `the guide never names "${label}"`).toBe(true)
  }
})
