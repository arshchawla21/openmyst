# Data model

A Myst Review project is a plain folder. There is no database, no proprietary container, no hidden service. Everything the app knows about your project lives in files you can `ls` and `cat` from any other tool.

## Project folder layout

```
my-project/
  project.json              ← project metadata (name, createdAt, defaultModel)
  agent.md                  ← per-project system prompt (seeded from agent-template.md)
  chat.jsonl                ← chat history, one JSON message per line
  comments.json             ← legacy single-doc comments file (still read for back-compat)

  documents/                ← user's writing
    notes.md
    draft.md
    …                       ← every .md here shows up in the document picker

  sources/                  ← research material (LLM-summarised)
    index.md                ← human-readable list of sources
    foo_paper.md            ← the LLM-written summary
    foo_paper.meta.json     ← {slug, name, originalName, type, addedAt, summary, indexSummary, sourcePath}
    …

  .myst/                    ← machine-managed state. Don't hand-edit unless you know why.
    pending/
      notes.md.json         ← pending edits for documents/notes.md
      …
    comments/
      notes.md.json         ← anchored comments for documents/notes.md (post-multidoc)
      …
    diffs/                  ← reserved for future diff snapshots
    wiki/
      index.md              ← the agent's persistent memory surface (loaded every chat turn)
      log.md                ← append-only activity log (ingest, delete…)
```

The split between *user-visible* and *machine-managed* is: anything the user might care about reading or editing lives at the top level (`documents/`, `sources/`, `agent.md`, `chat.jsonl`). Anything that exists purely so the app can resume state lives under `.myst/`. That makes the project folder safe to commit to git — you can `.gitignore .myst/` if you want a clean history, or commit it if you want full reproducibility.

## File-by-file

### `project.json`
```ts
interface ProjectMeta {
  name: string;
  path: string;          // absolute path to the folder
  defaultModel: string | null;
  createdAt: string;     // ISO timestamp
}
```
Written once on `createNewProject` and read on every `openProject`. The `defaultModel` field is currently unused — the global setting wins; it's reserved for per-project model overrides.

### `agent.md`
The per-project system prompt for the chat agent. Seeded on project creation from `src/main/features/projects/agent-template.md`. Users can edit it freely — the chat feature reads it fresh on every turn (`readProjectFile('agent.md')`), so changes take effect immediately.

### `chat.jsonl`
JSONL, one `ChatMessage` per line:
```ts
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
```
Read whole on every turn (small file in practice; not optimised). Cleared via the chat panel's "clear history" button.

### `documents/<name>.md`
Plain markdown. The editor reads them via `readDocument(filename)` and writes them via `writeDocument(filename, content)` which is atomic (tmp-then-rename). The renderer's autosave writes here on every keystroke debounce; the pending-edit accept path also writes here.

### `sources/<slug>.md` + `sources/<slug>.meta.json`
Source pages. `<slug>.md` holds the LLM-written summary (markdown, with wikilinks to other sources where the LLM noticed connections). `<slug>.meta.json` is the structured sidecar:
```ts
interface SourceMeta {
  slug: string;
  name: string;             // short display title (LLM-generated)
  originalName: string;     // file basename or pasted title
  type: 'pdf' | 'markdown' | 'text' | 'pasted';
  addedAt: string;
  summary: string;          // duplicate of <slug>.md content (legacy)
  indexSummary: string;     // one-sentence version for the wiki index
  sourcePath?: string;      // original file path on disk if known
}
```

### `sources/index.md`
Human-readable list of sources, rewritten on every ingest/delete. Format:
```markdown
# Sources

- [Name of paper](slug.md) — one-sentence index summary
- …
```
Distinct from `.myst/wiki/index.md` (see below). Both get updated together; the difference is audience: `sources/index.md` is for *you*, `.myst/wiki/index.md` is for *the agent*.

### `.myst/pending/<doc>.json`
Per-document pending edits queue:
```ts
interface PendingEdit {
  id: string;
  docFilename: string;
  oldString: string;
  newString: string;
  occurrence: number;     // which match to target if oldString appears multiple times
  createdAt: string;
  batchId: string;        // edits proposed in the same chat turn share a batchId
  batchIndex: number;
  batchTotal: number;
}
```
Lifecycle: chat turn writes → renderer renders widgets → user accepts/rejects → entry is removed. See [editing-pipeline.md](editing-pipeline.md) for the full picture.

### `.myst/comments/<doc>.json`
Per-document anchored comments:
```ts
interface Comment {
  id: string;
  docFilename: string;
  text: string;             // the selected text the comment is anchored to
  contextBefore: string;    // ~80 chars before the selection (for re-anchoring after edits)
  contextAfter: string;     // ~80 chars after
  message: string;          // the user's comment text
  createdAt: string;
}
```
Anchoring is heuristic — re-finding `text` in the document, falling back to `contextBefore + contextAfter` if the exact string moved.

### `.myst/wiki/index.md`
The agent's persistent memory. Auto-rewritten on every source ingest/delete. Loaded into every chat turn as part of the system prompt — so the agent always knows what sources exist without the user having to re-attach them. See [wiki-system.md](wiki-system.md).

### `.myst/wiki/log.md`
Append-only activity log. One line per ingest/delete operation, prefixed with the date. The agent can read it (it's in the project) but mostly it's for human auditing of *what the agent has done over time*.

## What is NOT in the project folder

- **The OpenRouter API key.** Stored at the user level via Electron's `safeStorage` in `~/Library/Application Support/myst-review/settings.json` (macOS) — encrypted, never written in plaintext.
- **Recent projects list.** Same place. Per-user, not per-project.
- **The agent template.** Lives in the source code at `src/main/features/projects/agent-template.md` and is copied into each new project as `agent.md`.

## Why JSONL for chat history

JSONL gives us atomic appends without read-modify-write. Each turn appends one line; nothing else has to lock or merge. At realistic scale (a few thousand turns per project) the read-whole-on-each-turn cost is invisible — the file stays under a megabyte.

If chat ever needs to scale to long-running threads, the right move is to add per-day or per-thread JSONL files, not to reach for SQLite. The append-friendly shape is the whole point.
