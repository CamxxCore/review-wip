import { expect, test } from 'claude-code/testing'

import { decide, decisionsPrompt, patch, refuseAll } from '../hooks/register'
import type { Report } from '../types'

const base: Report = {
  title: 'Review',
  sections: [
    { name: 'Bugs', items: [{ id: 'B1', title: 'a', status: 'open', moots: { accept: ['S1'] } }] },
    { name: 'Simplify', items: [{ id: 'S1', title: 'b', status: 'open' }, { id: 'S2', title: 'c', status: 'open' }] },
  ],
}
const status = (r: Report, id: string) => r.sections.flatMap(s => s.items).find(i => i.id === id)?.status

test('accepting moots dependents and undo restores them', async () => {
  const accepted = decide(base, 'B1', 'accepted')
  expect(status(accepted, 'S1')).toBe('moot')
  const undone = decide(accepted, 'B1', 'open')
  expect(status(undone, 'S1')).toBe('open')
})

test('refuse all touches only open items of that section', async () => {
  const r = refuseAll(decide(base, 'S2', 'info'), 'Simplify')
  expect(status(r, 'S1')).toBe('refused')
  expect(status(r, 'S2')).toBe('info')
  expect(status(r, 'B1')).toBe('open')
})

test('patch edits, removes, adds and clears pending', async () => {
  let r = patch(base, [{ id: 'S1', status: 'pending' }])
  r = patch(r, [{ id: 'S1', scope: 'new' }, { id: 'S2', remove: true }, { id: 'P1', title: 'd', section: 'Prune' }])
  expect(status(r, 'S1')).toBe('open')
  expect(status(r, 'S2')).toBe(undefined)
  expect(status(r, 'P1')).toBe('open')
})

test('decisions prompt lists each group', async () => {
  expect(decisionsPrompt(base)).toBe(null)
  const text = decisionsPrompt(decide(decide(base, 'B1', 'accepted'), 'S2', 'info'))!
  expect(text.includes('- B1: a')).toBe(true)
  expect(text.includes('- S2: c')).toBe(true)
})
