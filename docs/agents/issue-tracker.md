# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

> Bootstrap note: chosen as the default for Wayfinder because GitHub CLI (`gh`) is not available in this environment. Switch to GitHub Issues later via `/setup-matt-pocock-skills` if preferred.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file
- Comments and conversation history append under a `## Comments` heading

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md`
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`
- `Type:` line — `research` / `prototype` / `grilling` / `task`
- `Status:` line — open / `claimed` / `resolved`
- **Blocking**: `Blocked by: NN, NN` near the top
- **Frontier**: open, unblocked, unclaimed — first by number wins
- **Claim**: set `Status: claimed` before work
- **Resolve**: append `## Answer`, set `Status: resolved`, append gist + link to map Decisions-so-far
