# Development

Day-to-day workflow. If you just cloned the repo, this is the page that gets you running.

## Setup

```bash
git clone <this repo>
cd openmyst
npm install
```

Requirements: Node 20+ (for the built-in `fetch` API in main), a working Electron toolchain for your platform. On Linux you may need `libgtk-3-0`, `libnss3`, `libasound2` depending on distro.

## Scripts

```bash
npm run dev          # launch Electron with electron-vite, hot reload
npm run build        # typecheck + production bundle to out/
npm run typecheck    # tsc --noEmit for main+preload+shared AND renderer
npm test             # vitest run once
npm run test:watch   # vitest watch mode
npm run lint         # eslint with cache
npm run format       # prettier write
npm run format:check # prettier check (CI-safe)
```

The `typecheck` script runs two tsc passes because main and renderer have different `lib` settings (Node vs DOM). Both must be clean.

## Hot reload behaviour

- **Renderer changes** (React components, Tiptap plugins, CSS) hot-reload instantly.
- **Main process changes** (anything under `src/main/`) trigger a full reload of the Electron window — you'll see the app flicker as the main process restarts. This is expected.
- **Shared type changes** reload both sides.

If hot reload gets wedged (it happens occasionally with electron-vite when you save mid-build), stop and restart `npm run dev`.

## Project structure at a glance

```
src/
  main/        Electron main process — see docs/architecture.md
  preload/     contextBridge exposing typed IPC
  renderer/    React + Tiptap UI
  shared/      Types and IPC channel constants

out/           Production build output (gitignored)
node_modules/  (gitignored)

docs/          Developer documentation
README.md      Project overview
CONTRIBUTING.md How to contribute
electron.vite.config.ts    Bundler config
tsconfig.*.json            TypeScript configs (node, web, base)
vitest.config.ts           Test runner config
```

## Where to start reading

For contributors who've just cloned the repo, the reading order we recommend is:

1. [docs/architecture.md](architecture.md) — the big picture
2. [docs/data-model.md](data-model.md) — what's on disk
3. [docs/chat-turn.md](chat-turn.md) — the main concept-dense flow
4. [docs/editing-pipeline.md](editing-pipeline.md) — the other main flow
5. [docs/llm-layer.md](llm-layer.md) — the one shared client
6. [docs/wiki-system.md](wiki-system.md) — the research memory
7. [docs/adding-a-feature.md](adding-a-feature.md) — recipe for new work

That's maybe 40 minutes of reading and covers everything load-bearing.

## Testing

Vitest runs in two environments: Node (for `src/main/__tests__/`) and jsdom (for `src/renderer/src/__tests__/`). The test config picks the right one based on file path.

Today we have:

- **`src/main/__tests__/editLogic.test.ts`** — 52 tests covering the `myst_edit` parser, edit application, fuzzy matching, and pending-edit merging. This is the most important test file in the repo because `editLogic.ts` is the most concept-dense file. If you touch it, update these.
- **`src/renderer/src/__tests__/markdown-paste.test.ts`** — 9 tests covering the Tiptap markdown paste pipeline (round-tripping pasted markdown through the editor and back).

Both pass in under 2 seconds. Run them before every PR.

There is **no** end-to-end test harness yet. If you can add one (spectron is dead; the modern options are `@electron/test` or `playwright` with an Electron target), that would be a genuinely valuable contribution.

## Debugging

### Main process

The dev Electron window opens DevTools automatically (you can see the renderer). For main-process logs, check the terminal running `npm run dev` — everything from the `log()` helper (`src/main/platform/log.ts`) prints there with a `[scope]` prefix.

To attach a real debugger to the main process:

```bash
npx electron-vite dev --inspect-brk=9229
```

Then attach Chrome DevTools via `chrome://inspect`, or VS Code via a launch config.

### Renderer

DevTools is your friend. React DevTools extension works. The zustand store is on `window.__store` in dev for quick inspection.

### LLM calls

Every LLM call logs a `llm.request` with the model, message count, and total chars, and a `llm.response` with the content length, elapsed ms, and a 400-char preview. If the chat is acting weird, the first thing to do is read the main-process log and see what went over the wire.

If you need to see the *full* prompt (which you often do when debugging agent behaviour), temporarily bump the preview length in `src/main/llm/openrouter.ts` or log `messages` directly at the `streamChat` call site.

## Common pitfalls

- **"No project is open"** errors when running tests: `projectPath()` throws if no project is loaded. Pure-logic tests shouldn't hit that, but if you're testing something that reads from disk, you need a fake project or a tempdir fixture.
- **Pending edit renderer widgets not showing up**: check the main-process log for `pending.add.committed`. If that fired, the renderer's `onPendingEditsChanged` listener is probably the issue.
- **Typecheck passes but the app won't start**: usually a mismatch between `@shared/types` and what a feature expects. `tsc --noEmit` catches most of these but not all runtime shape drifts. Check the DevTools console on the renderer side too.
- **Build fails on `agent-template.md?raw` import**: the `?raw` suffix is a Vite feature — it works because of `src/main/types.d.ts` declaring the ambient module. If you're adding a new `?raw` import and typecheck fails, check that file is still present.

## Releasing

There is no release automation yet. When we're ready:

1. Bump `package.json` version.
2. Run `npm run build` and verify `out/` is clean.
3. Tag the commit.
4. Use `electron-builder` or similar to package per-platform binaries.

This is another valuable-contribution-shaped hole. If you want to set up a CI pipeline that packages signed macOS, Windows, and Linux builds on tag, we'd take that PR gratefully.
