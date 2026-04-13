# Editing pipeline

The other half of the chat turn: how an LLM proposal becomes a real change to the user's document. The key idea is that *nothing is applied automatically*. Every edit lands in a per-document staging queue first, the renderer shows it as a diff widget, and the user accepts or rejects each one individually.

## The `myst_edit` block

The agent emits proposed edits as fenced markdown code blocks:

````markdown
```myst_edit
{"old_string": "the existing text to replace", "new_string": "the new text", "occurrence": 1}
```
````

- `old_string` — exact substring to find. `""` means "append to the end".
- `new_string` — what to replace it with.
- `occurrence` — optional, 1-indexed. Picks which match to target if `old_string` appears more than once. Defaults to 1.

The parser (`features/chat/editLogic.ts → parseEditBlocks`) is permissive about indentation, fence variants, and surrounding whitespace, but strict about the JSON shape inside. Malformed blocks are dropped and the assistant message goes through with whatever did parse.

## The pending queue

When `runTurn` finishes parsing, surviving edits get written to `.myst/pending/<doc>.json` via `addPendingEdits` (`features/pendingEdits/index.ts`). One file per document. Each entry:

```ts
interface PendingEdit {
  id: string;
  docFilename: string;
  oldString: string;
  newString: string;
  occurrence: number;
  createdAt: string;
  batchId: string;     // shared across edits proposed in the same turn
  batchIndex: number;
  batchTotal: number;
}
```

`addPendingEdits` is *not* a naive append — it calls `mergePendingEdits` (pure, in `editLogic.ts`) which de-duplicates against existing entries with the same `oldString`. This is what lets the *"make it shorter"* loop replace the previous pending edit in place rather than stacking a new one on top.

Once written, `PendingEdits.Changed` is broadcast and the renderer re-fetches.

## Rendering

`src/renderer/src/tiptap/pendingEditPlugin.ts` listens for the broadcast, fetches the pending list for the active doc, and decorates each match in the editor:

- **Red strike-through** over the `oldString` location (or a marker at the end of the doc for appends).
- **Green replacement widget** showing the `newString`, with Accept and Reject buttons inline.

Clicking into the widget lets the user edit `newString` directly before accepting — that goes through `patchPendingEditNewString` so the change persists if they walk away and come back.

## Accept

`acceptPendingEdit(id, overrideNewString?)` does five things:

1. **Find the edit by id** across all pending files (renderer only sends the id; we scan).
2. **Read the document** fresh from disk.
3. **Apply** with `applyEditOccurrence(doc, oldString, newString, occurrence)`.
4. **Fall back** to `applyEditOccurrenceFuzzy` if exact match fails (whitespace-tolerant — handles the most common LLM failure mode where `old_string` has subtly different spaces or newlines than the on-disk markdown).
5. **Write** the new document atomically (`writeDocument` does tmp-then-rename) and **remove** the entry from the pending file.

If both exact and fuzzy match fail, we throw a clear error to the renderer with diagnostic context logged to the dev console (doc length, head/tail, first-line fuzzy hit position) so you can figure out *why* the match failed without flooding the log on every accept.

## Reject

`rejectPendingEdit(id)` just removes the entry from the pending file. No document write, no LLM call. Cheap.

## Patch (in-flight tweak)

`patchPendingEditNewString(docFilename, id, newString)` updates the `new_string` on a pending entry without touching the document. Used by:

- The renderer when the user types into the green widget.
- The chat turn's triage path when the LLM emits an edit whose `old_string` is a substring of an existing pending's `new_string`.

## Why this whole staging dance

The naive design — apply edits directly when they arrive — has three problems:

1. **No undo.** Once written, the LLM's proposal is in your document. Even with git, that's a lot of friction for "no, try again."
2. **No iteration.** *"Make it shorter"* needs to know what *it* is. If the edit is already merged, the LLM has to re-find it in a document that's now drifted from the version it just edited.
3. **No partial accept.** A turn often proposes 3-5 edits; you might want two of them and not the others. Auto-apply forces all-or-nothing.

The staging queue solves all three. The cost is one extra click per edit, which turns out to feel *correct* rather than annoying — accepting an edit becomes a deliberate act, the way a code review accept is.

## Where to make changes

- **Parser quirks** (new fence forms, JSON shapes, escape rules) → `editLogic.ts`. Update tests in the same commit.
- **Apply / fuzzy fallback** behaviour → `editLogic.ts → applyEditOccurrence(Fuzzy)`. Tests cover the common cases.
- **Merge / dedupe rules** for incoming edits → `editLogic.ts → mergePendingEdits`. Tests cover the tricky ones.
- **Disk format** for pending files → `features/pendingEdits/index.ts`. If you change the JSON shape, write a migration; old projects on disk shouldn't break.
- **Renderer widget UI** → `src/renderer/src/tiptap/pendingEditPlugin.ts`.

The whole pipeline is `editLogic.ts` (pure) + `pendingEdits/index.ts` (IO + IPC) + the plugin file (UI). Three places. Stick to that split.
