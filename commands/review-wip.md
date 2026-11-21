---
description: One review pass over all staged and uncommitted changes - bugs, then what to prune
argument-hint: "[low|medium|high|max]"
---

Scope is the working tree and nothing else: staged, unstaged and untracked changes.
Committed work is out of scope even if it is unpushed.

Do the whole review yourself, in this session. Do not delegate any pass to subagents. Read the
diff, the files around it and their callers as each finding needs. Effort level: `$ARGUMENTS`
(default `high`).

## 1. Establish the scope

- `git --no-pager diff HEAD -M --stat` then `git --no-pager diff HEAD -M` for tracked changes
  (`-M` so renames read as renames, not delete+add)
- `git ls-files --others --exclude-standard` for new files; read each in full

Every finding below must point into that set. A file the diff does not touch is context, not a target.

## 2. Bugs pass

Find correctness and security defects in the changed lines. Each one must name a concrete
scenario where it fails. No style notes. Keep the 10 strongest.

As soon as the pass is done:

1. Show the cards in the chat with `mcp__review-wip__report`, `action: "set"`: the `Bugs` section filled,
   and `Simplify` and `Prune` sent empty for now.
2. Start a comprehensive Codex review of the working tree in the background, then go on:
   `node <codex plugin>/scripts/codex-companion.mjs review --scope working-tree` with Bash
   `run_in_background: true`. The script is at
   `~/.claude/plugins/cache/openai-codex/codex/<version>/scripts/codex-companion.mjs`; use the newest
   version. If the plugin is missing, say so in one line and carry on without it.

## 3. Simplify and Prune pass (combined)

This is one pass, not two. Walk the diff and ask, for each changed region:

- **Simplify**: over-engineering, using the `ponytail-review` tags (`delete` / `stdlib` / `native`
  / `yagni` / `shrink`).
- **Prune**: unnecessary additions, cleaner re-implementations, removable code at the coarsest
  level that holds (logic block, function, class, whole file).

Before listing anything as removable, grep for its callers and give the count in its scope line.

### Self-filter gate

Before reporting a finding, answer silently: **"If asked to implement this right now, would the
result be clearly better?"** Drop or tag as `deferred` anything that fails:

- **Active diagnostic code**: if the code is behind `#ifdef`, referenced in a development log or
  `instability_issues` file, or added in the current diff alongside the feature it diagnoses, it
  is likely in-use instrumentation. Flag it as `deferred` ("remove after triage"), not as
  actionable. Do not present active diagnostic instrumentation as over-engineering.
- **Merge N calls into 1**: describe what the merged version looks like. If the merged form has
  more arguments, worse readability, or loses an IRQL/context gate, drop the finding.
- **Untracked files the user has not staged**: these are not in git. Do not flag them unless they
  would cause a problem if committed.

### Deduplication

Each finding appears once. If the same issue fits both Simplify and Prune, put it in whichever
section it fits better. Never double-count across sections.

### Limits

Keep **10 total** across both sections (not 10 each), ranked by value of the change. Report them
with `action: "patch"` -- Simplify items with ids `S1..`, Prune items with ids `P1..`. A section
with nothing gets no items; the panel says so.

## 4. Merge the Codex review

When the Codex run finishes, read its findings and check each one against the code yourself.
Patch the ones that hold into the right section, with ids `C1..` and `source: "Codex"`. If
Codex found something already on the panel, add `source: "Claude + Codex"` to that item; do not
add a duplicate. A full section keeps 10 items: a Codex finding replaces the weakest one only
when it is stronger. Say in one chat line how many Codex findings you added, merged and rejected.
If the run failed, say that; a failed run is not a clean review.

## Items

Each item is one card on the panel:

- `title` - one or two plain sentences: the problem and its effect. Lead with what goes wrong
  for whom, not with the code.
- `scope` - as few words as possible: who or what it affects (`tenant developers, Users list`),
  and for simplify and prune, about how many lines go (`-35 lines, 2 callers`).
- `severity` - `high`, `medium` or `low`. For bugs this is the harm. For simplify and prune it is
  the value of the change.
- `file` and `line` - the main location, repo-relative.
- `moots` - where accepting or refusing this item makes another irrelevant, name that item so the
  panel resolves it.

Rank items inside each section by how well they meet that section's criteria. A higher chance of
blast radius or later problems lowers the rank. Code that is there to keep things readable or
maintainable ranks lower. Order the cards by rank.

Put `net: -<N> lines` across Simplify and Prune in the report's `footer`. If a section has nothing,
send it with no items; the panel says so.

Do not repeat the findings in chat. Keep chat to short progress lines. When later prompts from
the panel ask for a rephrase, decisions or more information, change the panel with
`action: "patch"`, never a new `set`.

If the `mcp__review-wip__report` tool is not available, report the sections with the
ReportFindings tool instead.

Report only. Do not edit anything; the user decides what lands.
