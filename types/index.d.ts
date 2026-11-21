export type ItemStatus = 'open' | 'accepted' | 'refused' | 'info' | 'moot' | 'pending'

export type Severity = 'high' | 'medium' | 'low'

export type Item = {
  id: string
  title: string
  scope?: string
  severity?: Severity
  file?: string
  line?: number
  source?: string
  moots?: { accept?: string[]; refuse?: string[] }
  status: ItemStatus
  mootedBy?: string
}

export type Section = { name: string; items: Item[] }

export type Report = { title: string; sections: Section[]; footer?: string; toolUseId?: string }

declare module 'claude-code' {
  interface PluginState {
    'review-wip': { report: Report | null }
  }
}
