import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkGuidance, focusApplies, needsChoice, type PriorityForFocus } from './schoolPriorityRules.ts'
import { readSchoolFocusIdea, schoolFocusBlock } from './schoolFocusBlock.ts'

const NOW = new Date('2026-11-10T15:00:00Z')
const priority: PriorityForFocus = {
  id: 'p1',
  organizationId: 'org1',
  status: 'active',
  version: 2,
  startsOn: new Date('2026-10-27T00:00:00Z'),
  endsOn: new Date('2027-01-23T00:00:00Z'),
}

test('a focus applies only when the teacher chose it, at this version, in this school, in its dates', () => {
  assert.equal(focusApplies(priority, { state: 'on', version: 2 }, 'org1', NOW), true)
  assert.equal(focusApplies(priority, null, 'org1', NOW), false, 'never chosen')
  for (const state of ['paused', 'off', 'later']) {
    assert.equal(focusApplies(priority, { state, version: 2 }, 'org1', NOW), false, state)
  }
  assert.equal(focusApplies(priority, { state: 'on', version: 1 }, 'org1', NOW), false, 'chosen on an older meaning')
  assert.equal(focusApplies({ ...priority, status: 'archived' }, { state: 'on', version: 2 }, 'org1', NOW), false)
  assert.equal(focusApplies({ ...priority, status: 'draft' }, { state: 'on', version: 2 }, 'org1', NOW), false)
  assert.equal(focusApplies(priority, { state: 'on', version: 2 }, 'org2', NOW), false, 'teacher moved school')
  assert.equal(focusApplies(priority, { state: 'on', version: 2 }, null, NOW), false, 'teacher left school')
  assert.equal(focusApplies(priority, { state: 'on', version: 2 }, 'org1', new Date('2026-10-26T12:00:00Z')), false, 'before it starts')
  assert.equal(focusApplies(priority, { state: 'on', version: 2 }, 'org1', new Date('2027-01-23T20:00:00Z')), true, 'its last day')
  assert.equal(focusApplies(priority, { state: 'on', version: 2 }, 'org1', new Date('2027-01-24T01:00:00Z')), false, 'after it ends')
})

test('the invitation shows once per version, and an answer of later or off is still an answer', () => {
  assert.equal(needsChoice(priority, null, NOW), true)
  assert.equal(needsChoice(priority, { state: 'later', version: 2 }, NOW), false)
  assert.equal(needsChoice(priority, { state: 'off', version: 2 }, NOW), false)
  assert.equal(needsChoice(priority, { state: 'on', version: 2 }, NOW), false)
  assert.equal(needsChoice(priority, { state: 'later', version: 1 }, NOW), true, 'the school changed what it means')
  assert.equal(needsChoice({ ...priority, status: 'archived' }, null, NOW), false)
})

const good = {
  name: 'Academic Discussions',
  purpose: 'Students explain their reasoning and build on each other.',
  looksLike: 'Turn and talk before taking answers. "I agree, and…"',
  whenItFits: 'Questions with more than one defensible answer. Check whether students understand the reasoning.',
  ideas: 'Two minutes in pairs. Students monitor their own progress.',
  whenNotToUse: 'Brand-new vocabulary, timed practice.',
}

test('ordinary guidance passes, including "check whether students understand"', () => {
  const r = checkGuidance(good, ['Maria Rivera', 'Will Chen'])
  assert.equal(r.ok, true)
})

test('guidance that orders, requires, or watches teachers is refused with a reason', () => {
  for (const bad of [
    'Tell teachers to stop lecturing.',
    'Teachers must run a discussion every day.',
    'This is mandatory for all staff.',
    'Report back on who is doing it.',
    'Let me know whether teachers use it.',
    'Track which teachers try this.',
    'Flag teachers who never use it.',
  ]) {
    const r = checkGuidance({ ...good, ideas: bad }, [])
    assert.equal(r.ok, false, bad)
    if (!r.ok) assert.equal(r.field, 'ideas')
  }
})

test("a staff member's name is refused, common words that are also names are not", () => {
  const r = checkGuidance({ ...good, ideas: 'Like Rivera does in room 12.' }, ['Maria Rivera'])
  assert.equal(r.ok, false)
  assert.equal(checkGuidance({ ...good, ideas: 'This will help. Grace under pressure.' }, ['Will Grace']).ok, true)
})

test('empty or over-long fields are refused', () => {
  assert.equal(checkGuidance({ ...good, purpose: '  ' }, []).ok, false)
  assert.equal(checkGuidance({ ...good, name: 'x'.repeat(61) }, []).ok, false)
})

test('no chosen focus leaves the prompt exactly as it was', () => {
  assert.equal(schoolFocusBlock([], 'planning'), '')
  assert.equal(schoolFocusBlock([], 'talk'), '')
})

test('the block quotes the guidance and keeps the rules outside the quote', () => {
  const block = schoolFocusBlock([{ id: 'p1', ...good }], 'planning')
  const inside = block.slice(block.indexOf('<school_focus>'), block.indexOf('</school_focus>'))
  assert.ok(inside.includes('Academic Discussions'))
  assert.ok(!inside.includes('How to use it'))
  assert.ok(block.includes('<school_focus_idea>'))
  assert.ok(/never record/i.test(block))
  assert.ok(!schoolFocusBlock([{ id: 'p1', ...good }], 'talk').includes('<school_focus_idea>'))
})

test('an idea is optional, and an over-long one is dropped', () => {
  assert.equal(readSchoolFocusIdea(null), null)
  assert.equal(readSchoolFocusIdea('  '), null)
  assert.equal(readSchoolFocusIdea('If it fits your goal, pair them.'), 'If it fits your goal, pair them.')
  assert.equal(readSchoolFocusIdea('x'.repeat(601)), null)
})

test('an idea is tied to the focus it names, and dropped when two focuses leave it unnamed', async () => {
  const { matchSchoolFocusIdea } = await import('./schoolFocusBlock.ts')
  const a = { id: 'a', ...good }
  const b = { id: 'b', ...good, name: 'Contextual Learning' }
  assert.deepEqual(matchSchoolFocusIdea('Academic Discussions\nIf it fits your goal, pair them.', [a, b]), {
    priorityId: 'a',
    name: 'Academic Discussions',
    text: 'If it fits your goal, pair them.',
  })
  assert.equal(matchSchoolFocusIdea('If it fits your goal, pair them.', [a, b]), null)
  assert.equal(matchSchoolFocusIdea('If it fits your goal, pair them.', [a])?.priorityId, 'a')
  assert.equal(matchSchoolFocusIdea('Academic Discussions', [a]), null, 'a name with no idea')
  assert.equal(matchSchoolFocusIdea('anything', []), null)
})

test('memory is told never to record a school focus', async () => {
  const { MEMORY_UPDATE_INSTRUCTION } = await import('./coachMemory.ts')
  assert.match(MEMORY_UPDATE_INSTRUCTION, /Never record anything about a school focus/)
})

test("an idea whose own check names a mismatch is dropped", async () => {
  const { checkFoundMismatch, matchSchoolFocusIdea } = await import('./schoolFocusBlock.ts')
  const f = [{ whenNotToUse: 'Brand-new vocabulary, timed practice.\nSafety instructions' }]
  const g = [{ whenNotToUse: 'Introducing brand-new vocabulary or procedures.\nTimed practice, assessments, safety instructions.' }]
  assert.equal(checkFoundMismatch('Organelle names\nMATCH: Introducing brand-new vocabulary or procedures.', g), true)
  assert.equal(checkFoundMismatch('Weighing causes with two sources\nNO MATCH', g), false)
  assert.equal(checkFoundMismatch('Weighing causes\nThis is not a "may not fit" case.', g), true, 'no verdict is treated as a match')
  assert.equal(checkFoundMismatch('Weighing sources\nMATCH: Comparing sources, methods or solutions.', g), false, 'a "When it fits" line is not a mismatch')
  assert.equal(checkFoundMismatch('Drill\nMATCH: Safety instructions', f), true)
  const a = { id: 'a', ...good }
  assert.equal(matchSchoolFocusIdea('If it fits your goal, pair them.', [a], 'Vocabulary\nMATCH: Brand-new vocabulary, timed practice.'), null)
  assert.equal(matchSchoolFocusIdea('If it fits your goal, pair them.', [a], 'Comparing sources\nNO MATCH')?.priorityId, 'a')
})

test('a lesson with no idea records that the focus was considered, and why, in the school’s words', async () => {
  const { focusOutcome, suggestAnywayPrompt } = await import('./schoolFocusBlock.ts')
  const a = { id: 'a', ...good, whenNotToUse: "When the group doesn't yet have enough shared background.\nTimed practice." }
  assert.equal(focusOutcome(null, [], null), null, 'no focus, nothing stored')
  assert.deepEqual(focusOutcome(null, [a], "Microscope lab\nMATCH: When the group doesn't yet have enough shared background."), {
    priorityId: 'a',
    name: 'Academic Discussions',
    skipped: true,
    reason: "When the group doesn't yet have enough shared background.",
  })
  assert.equal((focusOutcome(null, [a], 'Something\nNO MATCH') as { reason: string | null }).reason, null)
  assert.equal(focusOutcome('If it fits your goal, pair them.', [a], 'Lab\nNO MATCH')?.priorityId, 'a')
  const prompt = suggestAnywayPrompt(a, 'Timed practice.')
  assert.ok(prompt.includes('<school_focus>') && prompt.includes('"Timed practice."'))
  assert.ok(!prompt.includes('school_focus_check'), 'the teacher asked, so no check this time')
})
