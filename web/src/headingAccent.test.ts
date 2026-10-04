import { expect, test } from 'vitest'

// The accent period after a page heading — "Look It Over." — is terracotta.
//
// It was gold on twenty-nine headings and terracotta on one, which is the kind
// of split nobody notices until two pages sit beside each other in a
// screenshot. The headings live in seventeen files plus two shared components,
// so the only way this stays settled is for a new page using the wrong one to
// fail here.
//
// Read as source text rather than rendered, because that catches a page no
// test renders — which is most of them.
const sources = import.meta.glob('./**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const GOLD_PERIOD = '<span className="text-gold">.</span>'

test('no heading uses the gold accent period', () => {
  const offenders = Object.entries(sources)
    .filter(([, source]) => source.includes(GOLD_PERIOD))
    .map(([path]) => path)
  expect(offenders).toEqual([])
})

// Guards the test itself: if the glob ever stops matching, the assertion above
// passes on an empty set and silently stops protecting anything.
test('the source glob actually found the pages', () => {
  const paths = Object.keys(sources)
  expect(paths.length).toBeGreaterThan(30)
  expect(paths.some((p) => p.endsWith('pages/LookItOver.tsx'))).toBe(true)
  // And the accent it should be using is there to find.
  expect(sources['./pages/LookItOver.tsx']).toContain('<span className="text-terracotta">.</span>')
})
