# review-wip

A Claude Code plugin that shows code review findings as interactive cards in the chat. Each finding can be accepted, refused, rephrased, followed up on, or marked as needing more info -- directly from the panel.

## What it does

When invoked via `/review-wip`, the plugin runs a structured review of your working tree (staged, unstaged, and untracked changes) in three passes:

1. **Bugs** -- correctness and security defects, each with a concrete failure scenario
2. **Simplify** -- over-engineering, stdlib replacements, YAGNI
3. **Prune** -- unnecessary code, cleaner re-implementations, removable blocks

Findings appear as cards in a panel with per-item actions:

- **Accept / Refuse** -- decide on each finding; accepting can automatically moot related items
- **Need info** -- ask Claude to explain before you decide
- **Rephrase** -- have Claude rewrite a confusing finding in plainer language
- **Ask** -- open a follow-up prompt about a specific item
- **Send decisions** -- batch-apply all your accept/refuse choices at once

## Installation

Copy the plugin into your Claude Code plugins directory:

```bash
git clone https://github.com/CamxxCore/review-wip.git ~/.claude/plugins/local/review-wip
```

Copy the skill command so `/review-wip` is available:

```bash
cp ~/.claude/plugins/local/review-wip/commands/review-wip.md ~/.claude/commands/review-wip.md
```

## Usage

In any git repository with uncommitted changes:

```
/review-wip          # defaults to high effort
/review-wip low      # quick pass
/review-wip max      # thorough
```

## Structure

```
.claude-plugin/
  plugin.json        # Plugin manifest
hooks/
  hooks.json         # Hook module list
  register.tsx       # Tool registration, state management, and UI
types/
  index.d.ts         # TypeScript type definitions
tests/
  logic.test.ts      # Unit tests for decide/patch/refuseAll logic
  pane.test.ts       # UI rendering tests
commands/
  review-wip.md      # Skill command (the /review-wip prompt)
tsconfig.json
```

## License

MIT
