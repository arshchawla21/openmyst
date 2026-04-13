# LLM layer

All LLM calls go through `src/main/llm/openrouter.ts`. There is exactly one place in the codebase that calls `fetch('https://openrouter.ai/...')`. Every feature that wants the LLM imports from here.

## API

```ts
import { streamChat, completeText, type LlmMessage } from '../../llm';
```

### `streamChat(options)` — token-by-token

Use this when you want to stream the response to the renderer (chat turns).

```ts
const fullContent = await streamChat({
  apiKey,
  model,
  messages: [
    { role: 'system', content: '...' },
    { role: 'user', content: '...' },
  ],
  logScope: 'chat',                              // optional, defaults to 'llm'
  onChunk: (chunk) => broadcast(IpcChannels.Chat.Chunk, chunk),
});
```

Returns the full concatenated content when the stream closes. Throws on HTTP error with the body inlined into the message — caller is expected to surface that to the UI.

### `completeText(options)` — non-streaming

Use this when you want the whole response as a string and don't need live tokens (the sources digest, future one-shot extractors).

```ts
const raw = await completeText({
  apiKey,
  model,
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ],
  logScope: 'sources',
});
if (raw === null) return fallbackDigest(...);   // soft failure: returns null instead of throwing
```

The asymmetry is intentional. `streamChat` errors are user-visible (the chat is the foreground task; the user wants to see what went wrong). `completeText` is used in background pipelines where graceful degradation matters more — if the digest LLM call fails, we fall back to a truncated-text summary so ingestion can never lose a source file.

## Where the API key lives

The OpenRouter key is per-user, not per-project. It's stored at `<userData>/settings.json` encrypted with Electron's `safeStorage`:

- **macOS**: backed by Keychain
- **Windows**: backed by DPAPI
- **Linux**: backed by libsecret (gnome-keyring or kwallet)

The cipher is base64-encoded inside the JSON. Plaintext never touches disk. See `src/main/features/settings/index.ts`.

Features get the decrypted key via `getOpenRouterKey()` from `features/settings`. They check for `null` and either bail (chat — error to the user) or fall back (sources — degraded ingest).

## Adding a new model or provider

The `defaultModel` field in settings is a free-form string passed straight through to OpenRouter, which accepts any model on its catalogue (`anthropic/claude-3.5-sonnet`, `openai/gpt-4o`, etc.). The renderer's settings panel has a text input — no allow-list.

If you wanted to support a non-OpenRouter provider:

1. Add a new file under `src/main/llm/` (e.g. `anthropic.ts`) that exposes `streamChat` and `completeText` with the same signatures.
2. Add a provider field to settings.
3. Have features pick the right client based on the provider.

The split between `streamChat`/`completeText` and the rest of the codebase is deliberately the only abstraction — anything else (the JSON parsing, the SSE protocol, the headers) stays inside `llm/`. Don't leak transport details into features.

## Why a hand-rolled fetch and not the OpenAI SDK

Three reasons:

1. **OpenRouter is OpenAI-compatible JSON.** There's no client to maintain that we couldn't write in 50 lines of `fetch`.
2. **Streaming is the interesting part**, and the hand-rolled SSE parser is small and explicit. With a third-party client we'd be at the mercy of whatever buffering or error semantics it picked.
3. **Bundle size.** The Electron main process bundle is currently tiny. Adding the OpenAI SDK would balloon it for no functional gain.

If a new provider doesn't speak OpenAI-compatible JSON, the right move is a sibling file in `llm/` with the same exported function shape, not a generic adapter.

## Logging

Both functions accept a `logScope` (defaults to `'llm'`). Internally they emit:

- `llm.request` — model, message count, total chars, streaming flag
- `llm.response` — content length, elapsed ms, first 400 chars preview
- `llm.http.failed` — status + body on non-2xx

That gives you a full timeline in the dev console of every LLM call the app made, which is the difference between "the chat is acting weird" and "ah, the model returned `unauthorized` because the key is wrong."
