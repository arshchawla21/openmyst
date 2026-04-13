# Wiki system

The research wiki is the agent's persistent memory. It lives at `.myst/wiki/index.md` inside each project and gets loaded into every chat turn as part of the system prompt — so the agent always knows what sources exist without the user re-attaching them every time.

It is *not* a full retrieval system. There are no embeddings, no vector store, no search ranking. The whole thing is plain markdown + a heuristic graph computation, and that's deliberate — see *Why so simple* at the bottom.

## What the user sees

- **Sources panel** in the renderer: drag PDFs in, paste text, or pick files. Each source becomes a row with the LLM-generated short name and one-sentence summary.
- **Wiki Graph button**: opens a force-directed graph showing sources as nodes and LLM-noticed connections as edges. Hovering a node shows its summary in a fixed tooltip slot at the top.
- **The chat agent** referencing sources by name without being told to.

## What's on disk

```
.myst/wiki/
  index.md       ← the master index, loaded into every chat turn
  log.md         ← append-only activity log

sources/
  index.md       ← human-readable source list (separate from the wiki index)
  <slug>.md      ← the LLM-written summary for each source
  <slug>.meta.json
```

There are *two* index files on purpose. `sources/index.md` is the human-facing list — top-level in the project folder, git-friendly, what you'd `cat` to remember what's in the project. `.myst/wiki/index.md` is the agent-facing one — under `.myst/`, formatted with section headers (Sources / Concepts / Findings) the agent is told to use, and loaded into the system prompt every turn. Updating one updates the other.

## The ingest pipeline

When a user adds a source (PDF, paste, or pick), `features/sources/index.ts → ingestSources` runs:

1. **`extractText`** (`features/sources/extract.ts`) — file → plain text. One branch per extension family. PDFs go through `pdf-parse`; markdown and text are read directly. This is the file you touch to add a new source format.
2. **`generateDigest`** (`features/sources/digest.ts`) — text → `{name, summary, indexSummary}` via `completeText` from the LLM client. The prompt tells the LLM about *existing sources in the project* so it can drop wikilinks like `[Other Source](other_slug.md)` inside the summary. Those wikilinks are what powers the graph (see below).
3. **`saveSource`** — writes `sources/<slug>.md` (the summary) and `sources/<slug>.meta.json` (the structured sidecar).
4. **`updateSourcesIndex`** (`features/sources/indexMd.ts`) — rewrites `sources/index.md` from the full source list.
5. **`updateWikiIndex`** (`features/wiki/index.ts`) — rewrites `.myst/wiki/index.md` from the same list.
6. **`appendWikiLog`** — adds an `[YYYY-MM-DD] ingest | name (slug)` line to `.myst/wiki/log.md`.
7. **Broadcast `Sources.Changed`** — renderer refreshes the panel.

If anything from step 4 onwards fails, the source still exists on disk — re-running ingest reconciles it. Step 1 (extract) and 2 (digest) are the only failure points that lose data, and digest has a graceful fallback to a truncated-text summary so a missing API key never drops a source.

## The chat-turn injection

`features/chat/turn.ts` reads `.myst/wiki/index.md` once per turn (via `readWikiIndex`) and includes it in the system prompt under a delimited block:

```
========== BEGIN research wiki index (.myst/wiki/index.md — your default memory surface) ==========
[contents]
========== END research wiki index ==========
This index is loaded every turn. Treat it as the map of what you already know:
consult it before answering, and open the source pages (sources/<slug>.md) it points at
when you need the full text. Do not ask the user to attach sources that are already here.
```

That last line is load-bearing. Without it, the agent kept asking the user to attach PDFs that were *already in the project*. With it, the agent reads the index, picks the relevant source slugs, and the user never has to re-introduce known material.

The wiki index is empty for fresh projects, in which case the whole block is omitted from the prompt.

## The graph

`features/wiki/graph.ts → computeWikiGraph(sources)` is pure. Nodes are sources; edges are markdown links from one source's summary that point at another source's slug. The full implementation is one regex (`/\]\(([^)\s]+?)\.md\)/g`) and a couple of `Set` instances.

This is the cheapest possible "linked sources" heuristic. No embeddings, no separate inference pass, no graph database. The summary prompt asks the LLM to cite related sources as wikilinks while it's writing, so the edges fall out for free. When you ingest a new source, the LLM sees the existing source list, mentions a couple by name in its summary, and the next time you open the graph there are new edges.

It's not perfect — the LLM sometimes misses connections that are obviously there to a human — but it scales to hundreds of sources without anything more sophisticated, and the false-positive rate is essentially zero (the LLM only links what it's actually citing).

## Why so simple

The temptation when building "agent memory" is to reach for a vector store. We deliberately didn't, for three reasons:

1. **Markdown is the right substrate for a writing tool.** Users can read the wiki, edit it by hand, version it with git, search it with grep. A vector store breaks all of that.
2. **Loading the index into every turn is "good enough" up to ~100 sources.** Beyond that you'd want selective retrieval — but we'd cross that bridge when we hit it, and the crossing is "add a retrieval step before `buildSystemPrompt`," not "rewrite the whole subsystem."
3. **The LLM is the index.** Asking the model to write summaries that cite related work *is* the retrieval step, just paid up-front at ingest time instead of at query time. The graph is the cached result.

If you want to add embeddings later, the right place is a new `features/wiki/retrieval.ts` that takes the user's question and returns a subset of source slugs to inject — slotted in between `readWikiIndex` and `buildSystemPrompt` in `features/chat/turn.ts`. Don't replace the index; augment it.

## Where to make changes

- **New source format** (e.g. `.docx`) → add a branch to `features/sources/extract.ts`.
- **Better summaries** (different prompt, different model) → `features/sources/digest.ts`.
- **More aggressive linking** → tweak the digest system prompt; the graph regex picks up whatever the LLM writes.
- **Concept / finding pages** (the empty headers in the wiki index) → wire a new feature that lets the agent write to `.myst/wiki/concepts/<slug>.md`. The index template already has the `## Concepts` and `## Findings` sections waiting.
- **Selective retrieval** instead of always-load → see *Why so simple*, point 3.
