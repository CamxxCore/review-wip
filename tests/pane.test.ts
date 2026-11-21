import { expect, test } from 'claude-code/testing'

const REPORT = {
  title: 'Review',
  footer: 'net: -10 lines',
  sections: [
    {
      name: 'Bugs',
      items: [
        { id: 'B1', title: 'A tenant developer can read staff email.', scope: 'Users list', severity: 'high', file: 'a.cs', line: 3, moots: { accept: ['B2'] } },
        { id: 'B2', title: 'Second.', severity: 'low' },
        { id: 'B3', title: 'Third.', severity: 'medium' },
      ],
    },
    { name: 'Prune', items: [] },
  ],
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`cards draw and accept moots dependents on ${surface}`, async $ => {
    await $.tool.call({ tool: 'mcp__review-wip__report', action: 'set', report: REPORT, tool_use_id: 'tu1' })
    const ui = await $.ui.mount({
      plugin: 'review-wip',
      surface,
      component: 'ToolUse',
      requestId: 'tu1',
      props: { tool_use_id: 'tu1', tool: 'mcp__review-wip__report', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
    })
    expect(await ui.find({ key: 'B1:file' })).toBeDefined()
    expect(await ui.find({ text: /Nothing found/ })).toBeDefined()
    await ui.press({ key: 'B1:accept' })
    expect(await ui.find({ key: 'B1:undo' })).toBeDefined()
    expect(await ui.find({ key: 'B2:undo' })).toBeDefined()
    expect(await ui.find({ key: 'B3:accept' })).toBeDefined()
    await ui.unmount()
  })
}

test('an older report row shrinks to one line', async $ => {
  await $.tool.call({ tool: 'mcp__review-wip__report', action: 'set', report: REPORT, tool_use_id: 'old' })
  await $.tool.call({ tool: 'mcp__review-wip__report', action: 'patch', items: [], tool_use_id: 'new' })
  const ui = await $.ui.mount({
    plugin: 'review-wip',
    surface: 'desktop',
    component: 'ToolUse',
    requestId: 'old',
    props: { tool_use_id: 'old', tool: 'mcp__review-wip__report', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  })
  expect(await ui.find({ text: /further down/ })).toBeDefined()
  expect(await ui.find({ key: 'B1:accept' })).toBe(undefined)
  await ui.unmount()
})
