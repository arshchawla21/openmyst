# Contributing

Thanks for taking a look. Open Myst is small enough that a single coherent voice in the codebase matters more than process — so this doc is mostly *here is how to navigate it* with a few hard rules at the bottom.

## Before you start

- **Open an issue first** if you're planning a non-trivial change. A two-line "I'm thinking about X, would you take a PR?" saves both of us a wasted afternoon.
- **Read [docs/architecture.md](docs/architecture.md).** The folder layout looks obvious from the outside, but there are a few load-bearing conventions (the `platform/` boundary, the IPC adapter pattern, the `editLogic.ts` purity rule) that are easier to keep than to discover by accident.
- **Skim the docs/ folder** for the area you're touching. Each subsystem has its own page that explains *why* it's the way it is, not just what's there.

## Local development

```bash
npm install
npm run dev          # launches the Electron app with hot reload
npm test             # vitest, runs once
npm run test:watch   # vitest in watch mode
npm run typecheck    # main + renderer tsc passes
npm run lint         # eslint
npm run format       # prettier write
```

The renderer hot-reloads on save. The main process needs a restart (`Cmd-R` in the dev window or just stop and restart `npm run dev`) when you change anything under `src/main/`.

## Code organisation

The `src/main/` tree is feature-folder. One feature = one folder = one entry in `src/main/ipc/`. The two rules that keep this clean:

1. **Features import from `platform/` and `llm/`, never directly from `electron` or `node:fs`.** If you find yourself reaching for `BrowserWindow` or `fs.readFile` inside a feature file, add a helper to `platform/` instead. This keeps features straightforward to test and means the day we want to swap the LLM transport, sandbox, or storage backend, we know exactly which files move.
2. **`features/chat/editLogic.ts` stays pure.** No imports of `electron`, `node:fs`, or anything project-aware. It's the one file with real unit-test coverage and we want to keep it that way.

If you're adding a new feature, follow [docs/adding-a-feature.md](docs/adding-a-feature.md) — there's a step-by-step recipe.

## Testing

- Pure logic (parsers, edit application, merge rules) gets unit tests under `src/main/__tests__/` or `src/renderer/src/__tests__/`. We use Vitest.
- Integration coverage is mostly manual today — there's no headless Electron harness yet. If you can add one, please do.
- Always run `npm run typecheck && npm test` before opening a PR. CI is not yet wired up; you are CI.

## Style

- Prettier for formatting (`npm run format`). Don't argue with it.
- ESLint for the rest. Warnings are fine, errors aren't.
- Comments explain *why*, not *what*. If a function is doing something subtle or load-bearing, leave a note. Otherwise let the code speak.
- Names matter. Prefer `pendingEditsForDoc` over `pe`, `streamChat` over `chat`. The codebase is small enough that you don't pay a typing cost for being clear.

## Pull requests

- One concern per PR. *Refactor + new feature* is two PRs.
- Title in the imperative ("Add wiki graph filter") not past tense.
- Description: what changed, why, anything reviewers should pay attention to. Screenshots for UI changes.
- If you touched the agent's system prompt or the `myst_edit` parser, call it out — those are the highest-blast-radius surfaces in the codebase.

## Hard rules

- **Don't commit your OpenRouter key.** It's stored in the OS keychain via `safeStorage`, not the repo, but double-check before pushing.
- **Don't break the editLogic test suite.** If you change `editLogic.ts`, update the tests in the same commit.
- **Don't reach across layers.** Renderer never imports from `main/`; main never imports from `renderer/`. Both go through `shared/` types and IPC channels.

If something here is wrong or out of date, fix it in the same PR — these docs are part of the codebase, not a separate project.
