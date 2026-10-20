import assert from 'node:assert/strict'
import { test } from 'node:test'
import { questionTags } from './questionTags.ts'

const t = (text: string, startSec = 0, speakerLabel = 'Teacher') => ({ speakerLabel, startSec, text })

test('counts each tag, however many share a line', () => {
  const tags = questionTags([t('We combine them. Right? Okay? K?', 10), t('So, okay?', 20)])
  assert.deepEqual(
    tags.map((x) => [x.tag, x.timestampSec]),
    [['right', 10], ['okay', 10], ['k', 10], ['okay', 20]],
  )
})

test('a real question that contains a tag word is not a tag', () => {
  assert.equal(questionTags([t('Is that right? What is the right answer?')]).length, 0)
})

test('only the teacher', () => {
  assert.equal(questionTags([t('Right?', 0, 'Student')]).length, 0)
})
