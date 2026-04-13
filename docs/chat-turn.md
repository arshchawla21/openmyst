# Anatomy of a chat turn

What happens between the moment the user hits **Send** and the moment a new assistant message appears in the panel. This is the most concept-dense path in the codebase — if you want to change agent behaviour, you'll be reading this page.

## The end-to-end path

```
renderer (Send button)
   │  IpcChannels.Chat.Send
   ▼
ipc/chat.ts                           validates input shape
   │
   ▼
features/chat/index.ts  sendMessage
   │  - load API key + model
   │  - read agent.md, document, wiki index
   │  - append user message to chat.jsonl
   │  - broadcast Chat.Started      ──▶ renderer shows typing indicator
   │
   ▼
features/chat/turn.ts  runTurn
   │  1. load history + existing pending edits
   │  2. buildSystemPrompt(...)        (systemPrompt.ts)
   │  3. streamChat(...)               (llm/openrouter.ts)
   │     │  onChunk: broadcast Chat.Chunk ──▶ renderer renders tokens live
   │     ▼
   │  4. parseEditBlocks(fullContent)  (editLogic.ts)
   │  5. triageEditsAgainstPending     ──▶ pending patch where appropriate
   │  6. retry: missing block?         (looksLikeDocumentRequest)
   │  7. retry: validation failed?     (validateEdits)
   │  8. stageEdits → addPendingEdits  (features/pendingEdits)
   │  9. cleanChatContent + persist assistant message
   │
   ▼
broadcast Chat.ChunkDone ──▶ renderer unblocks input
```

## Step-by-step

### 1. `sendMessage` (entry point)

`features/chat/index.ts` is the IPC-facing entry. It does the things that depend on ambient state (settings, the open project, the current document) and assembles a `TurnContext` for `runTurn`.

It also broadcasts `Chat.Started` immediately after appending the user message so the renderer can show the user's bubble and a typing indicator *before* the first LLM token arrives. This matters for perceived latency — the gap between Send and first token is often 1-3 seconds.

The `displayText` parameter is for cases where what the user sees in chat history differs from what the LLM sees. The "Ask Myst from a comment" path uses this: the chat shows the user's natural-language question, but the LLM gets a scaffolded prompt with the comment context appended.

### 2. `buildSystemPrompt`

`features/chat/systemPrompt.ts` is the one file you touch to change *what the agent is briefed with on each turn*. The system message is the concatenation of:

1. `agent.md` — the per-project persona/instructions
2. The "tweak etiquette" rider — a one-line reminder to invite follow-ups
3. `[Active document: <name>]` — a tiny header
4. The full document text, delimited with `========== BEGIN/END ==========`
5. The pending-edits block (only if there are any) — see below
6. The wiki index (only if non-empty)

The pending-edits block is critical. When the LLM has just proposed an edit and the user says *"make it shorter,"* the LLM needs to see that pending edit so it can either rewrite it or surgically patch a substring of it. Without this block, the second turn would either fail to find the text in the document or create a parallel pending entry. The prompt explicitly tells the LLM about both options (full rewrite vs surgical tweak) and warns against creating parallel entries.

### 3. `streamChat`

The actual LLM call. Tokens stream back through `onChunk` and get broadcast to the renderer as `Chat.Chunk` IPC messages, which the renderer appends to a placeholder assistant bubble in real time. See [llm-layer.md](llm-layer.md).

### 4. `parseEditBlocks`

`features/chat/editLogic.ts` (pure, unit-tested) extracts ` ```myst_edit ` fenced blocks from the assistant content and returns the parsed edits + the chat content with the blocks stripped out. Each edit has `old_string`, `new_string`, and an optional `occurrence` index.

### 5. Triage against pending edits

`triageEditsAgainstPending` decides where each edit should land:

- If `old_string === ''` → it's an append; goes to `stageEdits`.
- If `old_string` is found in the current document → it's a real edit; goes to `stageEdits`.
- Otherwise, try `tryResolvePendingPatch`: maybe the LLM is patching a substring of a pending edit's `new_string`. If so, call `patchPendingEditNewString` and update the working copy in-memory so subsequent edits in the same batch see the patched version.
- If none of the above match → still goes to `stageEdits`, where it'll either succeed or fall back to fuzzy matching on accept (see [editing-pipeline.md](editing-pipeline.md)).

This triage step is what makes the *"write me a story → make it shorter"* loop work. The story exists only in the pending edit's `new_string` until the user accepts it; the second turn's `make it shorter` edit references text from that pending entry, not from the document on disk.

### 6. Retry: missing edit block

If the user's message looks like a document-modification request (`looksLikeDocumentRequest` checks for change-verbs like "rewrite", "shorten", "fix") but the LLM emitted no edits and didn't patch any pending, we re-prompt with the document attached and ask explicitly for the `myst_edit` block. This catches the failure mode where the LLM responds in chat with *"sure, here's the rewrite"* but forgets to wrap it in the fence.

Comment-context turns (`COMMENT CONTEXT` prefix) are exempt — those default to chat answers and shouldn't get nudged into edit mode.

### 7. Retry: validation failure

`validateEdits` checks every edit can be located unambiguously in the document. If any fail, we re-prompt with the failure list and ask the LLM to either give a more specific `old_string` or add an `occurrence` field. The retry happens once; if it still fails, the edits are staged anyway and will fail at accept-time (with a clear error to the user) or fall back to the fuzzy matcher.

### 8. Stage edits

`stageEdits` calls `addPendingEdits` from `features/pendingEdits`, which writes the entries to `.myst/pending/<doc>.json` and broadcasts `PendingEdits.Changed`. The renderer's pending-edit Tiptap plugin re-fetches and renders the red strike-through + green replacement widgets.

### 9. Persist assistant message

The final chat content (with `myst_edit` blocks stripped) is appended to `chat.jsonl`. If there were edits but no chat text, we substitute *"Ready to review — check the pending edits."* so the user sees something in the panel.

The `finally` block always broadcasts `Chat.ChunkDone` — even on error — so the renderer's input box gets re-enabled. Without this, an error mid-turn would leave the UI permanently locked.

## Where to make changes

- **Want to change what the agent is told?** → `systemPrompt.ts`
- **Want to change how we react to its response?** → `turn.ts`
- **Want to change how `myst_edit` blocks are parsed?** → `editLogic.ts` (and update the tests in the same commit)
- **Want to add a new retry trigger?** → add a step in `turn.ts` between parse and stage
- **Want to change what the user sees while waiting?** → emit different IPC channels from `sendMessage` and handle them in the renderer

The split between these files is the load-bearing convention — keeping prompt-building, orchestration, and pure parsing separate is what made this turn loop possible to reason about in the first place.
