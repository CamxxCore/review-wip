import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Item, ItemStatus, Report } from '../types'

const TOOL = 'mcp__review-wip__report'
const report = atom({ plugin: 'review-wip', key: 'report' } as const, null)

type PatchItem = Partial<Item> & { id: string; section?: string; remove?: boolean }

const items = (r: Report) => r.sections.flatMap(s => s.items)

const mapItems = (r: Report, fn: (item: Item) => Item | null): Report => ({
  ...r,
  sections: r.sections.map(s => ({
    ...s,
    items: s.items.map(fn).filter((i): i is Item => i !== null),
  })),
})

export function decide(r: Report, id: string, status: ItemStatus): Report {
  const target = items(r).find(i => i.id === id)
  if (!target) return r
  const moots =
    status === 'accepted' ? target.moots?.accept ?? [] : status === 'refused' ? target.moots?.refuse ?? []  : []
  return mapItems(r, i => {
    if (i.id === id) return { ...i, status }
    if (i.mootedBy === id) return { ...i, status: 'open', mootedBy: undefined }
    if (moots.includes(i.id) && (i.status === 'open' || i.status === 'info'))
      return { ...i, status: 'moot', mootedBy: id }
    return i
  })
}

export function refuseAll(r: Report, section: string): Report {
  const open = r.sections.find(s => s.name === section)?.items.filter(i => i.status === 'open') ?? []
  return open.reduce((acc, i) => decide(acc, i.id, 'refused'), r)
}

export function patch(r: Report, changes: PatchItem[]): Report {
  let next = r
  for (const { section, remove, ...change } of changes) {
    const exists = items(next).some(i => i.id === change.id)
    if (exists) {
      next = mapItems(next, i =>
        i.id !== change.id
          ? i
          : remove
            ? null
            : { ...i, ...change, status: change.status ?? (i.status === 'pending' ? 'open' : i.status) },
      )
    } else if (!remove && section) {
      const item: Item = { title: '', ...change, status: change.status ?? 'open' }
      const has = next.sections.some(s => s.name === section)
      next = {
        ...next,
        sections: has
          ? next.sections.map(s => (s.name === section ? { ...s, items: [...s.items, item] } : s))
          : [...next.sections, { name: section, items: [item] }],
      }
    }
  }
  return next
}

export function decisionsPrompt(r: Report): string | null {
  const all = items(r)
  const list = (status: ItemStatus) =>
    all.filter(i => i.status === status).map(i => `- ${i.id}: ${i.title}`)
  const accepted = list('accepted')
  const refused = list('refused')
  const info = list('info')
  if (accepted.length + refused.length + info.length === 0) return null
  const parts = ['Review decisions from the review-wip panel.']
  if (accepted.length) parts.push('Accepted - apply these:', ...accepted)
  if (refused.length) parts.push('Refused - drop these, do not raise them again this pass:', ...refused)
  if (info.length)
    parts.push(
      'Need more information before deciding - explain each in chat, then sharpen its title and scope and set it back to open:',
      ...info,
    )
  parts.push(
    `Update the panel in place with ${TOOL} (action "patch"): remove applied and refused items, ` +
      'and add or change any item an applied change resolves or creates. Keep the chat reply to a short summary.',
  )
  return parts.join('\n')
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  open: '',
  accepted: 'Accepted',
  refused: 'Refused',
  info: 'Needs info',
  moot: 'Moot',
  pending: 'Rewriting...',
}

const SEVERITY_COLOR = { high: 'error', medium: 'warning', low: 'suggestion' } as const

const SCHEMA = {
  type: 'object',
  properties: {
    action: { enum: ['set', 'patch'], description: 'set replaces the whole report; patch changes items by id' },
    report: {
      type: 'object',
      description: 'For set. Sections in display order, items ranked inside each.',
      properties: {
        title: { type: 'string' },
        footer: { type: 'string', description: 'Closing line, e.g. "net: -120 lines"' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              items: { type: 'array', items: { $ref: '#/$defs/item' } },
            },
            required: ['name', 'items'],
          },
        },
      },
      required: ['title', 'sections'],
    },
    items: {
      type: 'array',
      description:
        "For patch. Each entry names an id; given fields replace the item's. remove: true drops it. " +
        'An unknown id with section adds a new item there.',
      items: {
        allOf: [
          { $ref: '#/$defs/item' },
          { type: 'object', properties: { section: { type: 'string' }, remove: { type: 'boolean' } } },
        ],
      },
    },
    footer: { type: 'string', description: 'For patch: replaces the closing line' },
  },
  required: ['action'],
  $defs: {
    item: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Stable id: B1.. bugs, S1.. simplify, P1.. prune, C1.. Codex' },
        title: { type: 'string', description: 'One or two plain sentences: the problem and its effect' },
        scope: { type: 'string', description: 'A few words: who or what it affects, or lines saved' },
        severity: { enum: ['high', 'medium', 'low'] },
        file: { type: 'string', description: 'Repo-relative path of the main location' },
        line: { type: 'number' },
        source: { type: 'string', description: 'Who found it when not Claude, e.g. "Codex"' },
        status: { enum: ['open', 'accepted', 'refused', 'info', 'moot'] },
        moots: {
          type: 'object',
          description: 'Items this one makes irrelevant when the user accepts or refuses it',
          properties: {
            accept: { type: 'array', items: { type: 'string' } },
            refuse: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['id'],
    },
  },
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'report',
      description:
        'Shows review findings as interactive cards in the chat, where the user accepts, refuses, rephrases, ' +
        'follows up or asks for more information per item. Use action "set" for a new review, "patch" to ' +
        'change or add items; the cards move to the newest call.',
      inputSchema: SCHEMA,
      isDeferred: false,
    })
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as { action: 'set' | 'patch'; report?: Report; items?: PatchItem[]; footer?: string }
    if (input.action === 'set') {
      if (!input.report) return { deny: 'action "set" needs report' }
      const fresh = patch(
        { ...input.report, sections: input.report.sections.map(s => ({ ...s, items: [] })) },
        input.report.sections.flatMap(s => s.items.map(i => ({ ...i, section: s.name }))),
      )
      await update($, report, () => fresh)
    } else {
      if (!(await read($, report))) return { deny: 'no report yet; call with action "set" first' }
      await update($, report, r => {
        const patched = patch(r!, input.items ?? [])
        return input.footer === undefined ? patched : { ...patched, footer: input.footer }
      })
    }
    await update($, report, r => ({ ...r!, toolUseId: e.tool_use_id }))
    const r = (await read($, report))!
    const open = items(r).filter(i => i.status === 'open').length
    return { result: `The chat shows ${items(r).length} cards, ${open} open. Do not repeat the findings in chat.` }
  })

  on('ui.render', { component: 'ToolResult', props: { tool: TOOL } }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolUse', props: { tool: TOOL } }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const r = await read($, report)
    if (!r || e.props.isRunning) return <Text dimColor>Updating the review...</Text>
    if (r.toolUseId !== e.requestId) return <Text dimColor>Review updated. The current cards are further down.</Text>

    const perRow = (e.viewport?.columns ?? 120) >= 90 ? 2 : 1
    const width = perRow === 2 ? '50%' : '100%'
    const set = (id: string, status: ItemStatus) => update($, report, x => decide(x!, id, status))
    const openFile = async (item: Item) => {
      const shown = await $.tool.call({ tool: 'mcp__ccd_view__show_pane', pane: 'file', path: item.file, line: item.line })
      if ('deny' in shown && shown.deny) await $.ui.toast(`${item.file}${item.line ? `:${item.line}` : ''}`)
    }
    const rephrase = async (item: Item) => {
      await update($, report, x => patch(x!, [{ id: item.id, status: 'pending' }]))
      await $.prompt.submit({
        text:
          `Rewrite review item ${item.id} ("${item.title}") so it is easier to understand: plain words, the ` +
          `problem and its effect first. Update it in place with ${TOOL} (action "patch") and keep the chat reply to one line.`,
      })
    }
    const followUp = (item: Item) => $.prompt.fill({ text: `About review item ${item.id} (${item.title}): `, mode: 'replace' })
    const send = async () => {
      const text = decisionsPrompt(r)
      if (text) await $.prompt.submit({ text })
      else await $.ui.toast('Nothing decided yet.')
    }

    const card = (item: Item) => {
      const decided = item.status !== 'open'
      const color = decided ? 'inactive' : SEVERITY_COLOR[item.severity ?? 'low']
      const where = item.file ? `${item.file}${item.line ? `:${item.line}` : ''}` : ''
      const tag = STATUS_LABEL[item.status] + (item.mootedBy ? ` by ${item.mootedBy}` : '')
      return (
        <Box
          key={`card:${item.id}`}
          flexDirection="column"
          justifyContent="space-between"
          flexGrow={1}
          width={width}
          borderStyle="round"
          borderColor={color}
          paddingX={1}
        >
          <Box flexDirection="column">
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={color} bold>
                {item.id}
                {item.severity && !decided ? `  ${item.severity.toUpperCase()}` : ''}
                {item.source ? `  ${item.source}` : ''}
              </Text>
              {decided ? <Text dimColor>{tag}</Text> : null}
            </Box>
            <Text bold={!decided} dimColor={decided}>{item.title}</Text>
            {item.scope ? <Text dimColor>{item.scope}</Text> : null}
            {where ? (
              <Button key={`${item.id}:file`} plain dimColor onPress={() => openFile(item)}>{where}</Button>
            ) : null}
          </Box>
          <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
            {decided ? (
              item.status === 'pending' ? (
                <Text dimColor>Waiting for Claude</Text>
              ) : (
                <Button key={`${item.id}:undo`} plain dimColor onPress={() => set(item.id, 'open')}>Undo</Button>
              )
            ) : (
              <>
                <Box flexDirection="row" columnGap={1}>
                  <Button key={`${item.id}:accept`} variant="primary" onPress={() => set(item.id, 'accepted')}>Accept</Button>
                  <Button key={`${item.id}:refuse`} onPress={() => set(item.id, 'refused')}>Refuse</Button>
                </Box>
                <Box flexDirection="row" columnGap={2}>
                  <Button key={`${item.id}:info`} plain dimColor onPress={() => set(item.id, 'info')}>Need info</Button>
                  <Button key={`${item.id}:rephrase`} plain dimColor onPress={() => rephrase(item)}>Rephrase</Button>
                  <Button key={`${item.id}:ask`} plain dimColor onPress={() => followUp(item)}>Ask</Button>
                </Box>
              </>
            )}
          </Box>
        </Box>
      )
    }

    const grid = (list: Item[]) => {
      const rows: Item[][] = []
      for (let i = 0; i < list.length; i += perRow) rows.push(list.slice(i, i + perRow))
      return rows.map(row => (
        <Box key={`row:${row[0]!.id}`} flexDirection="row" alignItems="stretch" columnGap={1}>
          {row.map(card)}
          {row.length < perRow ? <Box key={`pad:${row[0]!.id}`} width={width} flexGrow={1} /> : null}
        </Box>
      ))
    }

    const info = items(r).filter(i => i.status === 'info')
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text bold>{r.title}</Text>
        {r.sections.map(s => {
          const open = s.items.filter(i => i.status === 'open').length
          return (
            <Box key={`sec:${s.name}`} flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold>
                  {s.name}  <Text dimColor>{open} open of {s.items.length}</Text>
                </Text>
                {open > 0 ? (
                  <Button key={`${s.name}:refuse-all`} plain dimColor onPress={() => update($, report, x => refuseAll(x!, s.name))}>
                    Refuse all
                  </Button>
                ) : null}
              </Box>
              {s.items.length === 0 ? <Text dimColor>Nothing found.</Text> : grid(s.items)}
            </Box>
          )
        })}
        {info.length > 0 ? (
          <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
            <Text bold color="warning">Need more information</Text>
            {info.map(i => <Text key={`info:${i.id}`}>{i.id}  {i.title}</Text>)}
          </Box>
        ) : null}
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text dimColor>{r.footer ?? ''}</Text>
          <Button key="send" variant="primary" onPress={send}>Send decisions</Button>
        </Box>
      </Box>
    )
  })
}
