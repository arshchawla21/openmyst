# Adding a new feature

A recipe for the case where you want to add something the app doesn't do yet and you need main-process state, an IPC surface, and a UI. Follow this and the pattern stays consistent.

## The pattern

Every feature in `src/main/features/` is a folder with these properties:

1. **Self-contained.** All its files live under one folder.
2. **IO-free core where possible.** Pure logic goes in its own file so we can unit-test it without touching the filesystem.
3. **Platform-only for side effects.** Filesystem / logger / window broadcasts come from `src/main/platform/`. LLM calls come from `src/main/llm/`. Nothing else.
4. **Exports through an `index.ts` barrel.** The outside world imports `from '../features/foo'`, never from a specific internal file.
5. **One IPC file in `src/main/ipc/`** that validates input shape and hands off to the feature.

## Worked example: "snippets"

Say you want to add a snippets feature — the user saves reusable pieces of prose and can insert them into any document.

### 1. Pick a name and plan the files

```
src/main/features/snippets/
  index.ts          ← public API (list/create/delete/get)
  types.ts          ← Snippet interface (or put in src/shared/types.ts if the renderer needs it)
```

For snippets we don't need a pure-logic file; for anything more algorithmic we'd add one.

### 2. Add types to `src/shared/types.ts`

If the renderer is going to render or create these, the type belongs in `shared/` so both sides see it.

```ts
export interface Snippet {
  id: string;
  name: string;
  content: string;
  createdAt: string;
}
```

### 3. Add IPC channels to `src/shared/ipc-channels.ts`

```ts
export const IpcChannels = {
  // ...existing...
  Snippets: {
    List:   'snippets:list',
    Create: 'snippets:create',
    Delete: 'snippets:delete',
    Changed: 'snippets:changed',     // broadcast for renderer to re-fetch
  },
} as const;
```

### 4. Write the feature

`src/main/features/snippets/index.ts`:

```ts
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Snippet } from '@shared/types';
import { IpcChannels } from '@shared/ipc-channels';
import { projectPath, ensureDir, broadcast } from '../../platform';

const FILE = '.myst/snippets.json';

async function readAll(): Promise<Snippet[]> {
  try {
    const raw = await fs.readFile(projectPath(FILE), 'utf-8');
    return JSON.parse(raw) as Snippet[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function writeAll(snippets: Snippet[]): Promise<void> {
  await ensureDir(projectPath('.myst'));
  await fs.writeFile(projectPath(FILE), JSON.stringify(snippets, null, 2), 'utf-8');
}

function notify(): void {
  broadcast(IpcChannels.Snippets.Changed);
}

export async function listSnippets(): Promise<Snippet[]> {
  return readAll();
}

export async function createSnippet(name: string, content: string): Promise<Snippet> {
  const all = await readAll();
  const snippet: Snippet = {
    id: randomUUID(),
    name,
    content,
    createdAt: new Date().toISOString(),
  };
  await writeAll([...all, snippet]);
  notify();
  return snippet;
}

export async function deleteSnippet(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((s) => s.id !== id));
  notify();
}
```

Notice what's *not* there: no `electron`, no `node:path`, no direct `fs.readFile` of absolute paths. Everything goes through `platform/` so a reader doesn't have to hunt for where "the project root" is defined.

### 5. Wire the IPC

`src/main/ipc/snippets.ts`:

```ts
import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import { createSnippet, deleteSnippet, listSnippets } from '../features/snippets';

export function registerSnippetsIpc(): void {
  ipcMain.handle(IpcChannels.Snippets.List, () => listSnippets());

  ipcMain.handle(IpcChannels.Snippets.Create, async (_event, name: unknown, content: unknown) => {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Snippet name must be a non-empty string.');
    }
    if (typeof content !== 'string') {
      throw new Error('Snippet content must be a string.');
    }
    return createSnippet(name.trim(), content);
  });

  ipcMain.handle(IpcChannels.Snippets.Delete, async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Snippet id must be a string.');
    await deleteSnippet(id);
  });
}
```

Then in `src/main/ipc/index.ts`:

```ts
import { registerSnippetsIpc } from './snippets';
// ...
export function registerIpcHandlers(): void {
  // ...existing...
  registerSnippetsIpc();
}
```

IPC files are deliberately boring. Validate input shape, call the feature, return the result. If you're writing more than ten lines of logic in one of these, it probably belongs in the feature.

### 6. Expose to the preload

`src/preload/index.ts` — add typed wrappers on the `api` object:

```ts
snippets: {
  list: () => ipcRenderer.invoke(IpcChannels.Snippets.List),
  create: (name: string, content: string) =>
    ipcRenderer.invoke(IpcChannels.Snippets.Create, name, content),
  delete: (id: string) => ipcRenderer.invoke(IpcChannels.Snippets.Delete, id),
  onChanged: (cb: () => void) => {
    ipcRenderer.on(IpcChannels.Snippets.Changed, cb);
    return () => ipcRenderer.off(IpcChannels.Snippets.Changed, cb);
  },
},
```

And update the type on `window.api` so the renderer gets autocomplete.

### 7. Build the UI

In `src/renderer/src/`, add a panel component and wire it to `window.api.snippets.*`. The zustand store (`store.ts`) is the usual place for cached lists — subscribe to `onChanged` to refetch.

### 8. Test it

- Unit tests for any pure logic (if you added a `logic.ts` file).
- Manual smoke test: create a snippet, check `.myst/snippets.json` on disk, delete it, check it's gone.
- `npm run typecheck && npm test` passes.

### 9. Document it

If the feature warrants explanation (new concepts, new user-visible surface), add a section to the appropriate doc — or a new page under `docs/` for something big. The existing pages under `docs/` are the template.

## Smaller cases

**Pure logic feature** (e.g. a new markdown transformer): put it under `features/<name>/index.ts`, write unit tests, don't register any IPC. Other features import and use it.

**New source format**: don't make a new feature. Add a branch to `features/sources/extract.ts`. That's what `extract.ts` exists for.

**New LLM-driven pipeline**: add a new file under an existing feature (or a new feature folder), call `completeText` or `streamChat` from `llm/`. Don't write a new fetch block.

## Anti-patterns

- **Importing `electron` from a feature file.** Always go through `platform/`.
- **Putting business logic in `ipc/<feature>.ts`.** It's an adapter. Keep it boring.
- **Reaching across features.** `features/chat/` can import from `features/pendingEdits/` because chat *uses* pending edits — that's fine. But `features/pendingEdits/` should never import from `features/chat/`. If you find a cycle, you have a new shared file to extract.
- **Storing state in module globals.** The only exception is `features/projects/index.ts`, which owns the `currentProject` pointer, because "which project is open" is irreducibly global.
- **Skipping the shape validation in the IPC layer.** The renderer is untrusted from main's perspective. Validate.
