# Architecture

Open Myst is an Electron app. That gives us three processes (main, preload, renderer) and a hard rule that they can only talk to each other through IPC. Inside that, the main process is organised as a feature-folder layout with a thin platform layer underneath.

## Process model

```
┌────────────────────────┐    contextBridge     ┌────────────────────────┐
│  Main (Node + Electron)│ ◀──────────────────▶ │   Renderer (React)     │
│                        │       (typed IPC)    │                        │
│  - filesystem          │                      │  - Tiptap editor       │
│  - LLM calls           │                      │  - chat panel          │
│  - project state       │                      │  - sources panel       │
│  - IPC handlers        │                      │  - wiki graph modal    │
└────────────────────────┘                      └────────────────────────┘
            ▲                                              ▲
            │                                              │
            └─────────── shared/ types + channels ─────────┘
```

- **Main** (`src/main/`): everything stateful. Owns the filesystem, the LLM client, the in-memory current-project pointer. No DOM, no React.
- **Preload** (`src/preload/`): exposes a typed surface to the renderer via `contextBridge`. One function per IPC channel, no business logic.
- **Renderer** (`src/renderer/`): React + Tiptap. Pure UI; calls main through `window.api.*`.
- **Shared** (`src/shared/`): type definitions and `IpcChannels` constants used by all three. The contract.

Renderer never imports from main and vice versa. If you need a new piece of data flowing between them, add a channel constant to `shared/ipc-channels.ts` and a handler to `src/main/ipc/`.

## Main process layout

```
src/main/
  index.ts                 Electron entry — creates the window, calls registerIpcHandlers()
  context-menu.ts          Native context menu (spell-check + clipboard)
  types.d.ts               Ambient module declarations (Vite ?raw imports)

  platform/                The thin Node/Electron wrapper layer.
    fs.ts                    projectPath, readProjectFile, atomic write…
    log.ts                   namespaced logger
    window.ts                broadcast() to all windows
    index.ts                 barrel

  llm/                     OpenRouter client (the only file that calls fetch).
    openrouter.ts            streamChat + completeText
    types.ts                 LlmMessage, StreamChatOptions
    index.ts                 barrel

  features/                One folder per feature. Self-contained.
    settings/                user-wide settings + safeStorage key handling
    projects/                project lifecycle + agent-template.md
    documents/               documents/*.md CRUD
    comments/                .myst/comments/<doc>.json CRUD
    pendingEdits/            staging area between LLM proposal and on-disk write
    chat/                    LLM turn orchestration (the biggest feature)
      editLogic.ts             pure parser/applier — has unit tests, no IO
      systemPrompt.ts          builds the per-turn system message
      turn.ts                  the orchestration loop
      persistence.ts           chat.jsonl reads/writes
      index.ts                 sendMessage entry point
    sources/                 PDF/text → wiki entry pipeline
      extract.ts               file → text (one branch per extension)
      digest.ts                text → {name, summary, indexSummary} via LLM
      indexMd.ts               sources/index.md rewriter
      index.ts                 ingest orchestration
    wiki/                    .myst/wiki/ — the agent's persistent memory
      graph.ts                 pure source-link graph computation
      index.ts                 read/write wiki index + log

  ipc/                     IPC adapters. One file per feature.
    settings.ts, projects.ts, documents.ts, chat.ts,
    comments.ts, pendingEdits.ts, sources.ts, wiki.ts
    index.ts                 registerIpcHandlers() — calls each register*()
```

## The three layers

**Platform** is a thin wrapper over Electron and Node primitives — `projectPath`, `readProjectFile`, `broadcast`, `log`. Features import from here instead of reaching directly for `electron` or `node:fs`. This is not about abstraction for its own sake; it's about keeping every feature easy to read by hiding the same five lines of "resolve a project-relative path" boilerplate that would otherwise be everywhere.

**LLM** is the single source of truth for talking to OpenRouter. Before the refactor, both `chat.ts` and `sources.ts` had their own `fetch` block with slightly different headers and no shared retry. Now there's `streamChat` (with an `onChunk` callback) and `completeText` (non-streaming, returns the raw string), and any new feature that needs an LLM goes through the same client.

**Features** are the units of "this is what the app does." Each one owns a folder, exports a few functions through its `index.ts`, and is wired to the renderer through one IPC file in `src/main/ipc/`. Features can depend on `platform/`, `llm/`, and other features — the dependency direction is roughly `chat → pendingEdits → documents` and `sources → wiki`, with `settings` and `projects` at the bottom.

## Renderer layout

```
src/renderer/src/
  App.tsx                  top-level layout
  store.ts                 zustand store — current doc, sources, pending edits, chat
  components/              panels, modals, buttons
  tiptap/                  Tiptap editor + custom plugins (pendingEditPlugin, comments)
  api.ts                   wrapper over window.api (typed IPC client)
  __tests__/               markdown paste round-trip tests
```

The renderer is conventional React. The interesting parts are the Tiptap plugins — `pendingEditPlugin.ts` is what renders the red strike-through + green replacement widget for each pending edit, and the comment plugin keeps comment anchors stable across edits.

## Why this layout

The original `src/main/` was flat — eleven files at the top level, each one growing by another responsibility every few weeks. Three problems:

1. **Cross-feature edits were everywhere.** Adding pending-edit support required touching `chat.ts`, `ipc.ts`, `editLogic.ts`, and a new `pendingEdits.ts`, all sharing a kitchen-sink `projectPath()` helper.
2. **Two `fetch` blocks for OpenRouter.** Drifting headers, no shared streaming parser, no shared retry.
3. **The system prompt was a 100-line template literal** in the middle of `projects.ts`. Editing it required scrolling past unrelated scaffolding code.

The refactor fixed all three: features own their files, the LLM client is shared, and the agent template is now an actual `.md` file (`features/projects/agent-template.md`) imported via Vite's `?raw` suffix.

If you're adding something new, follow the pattern. It's there to keep the codebase navigable as it grows.
