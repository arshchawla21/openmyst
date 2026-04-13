/**
 * llm/ owns every call to an LLM provider. Today that provider is OpenRouter,
 * but this layer is where a future swap (direct Anthropic, Gemini, local…)
 * would go — feature code should never import `fetch` to talk to a model.
 *
 * Public surface:
 *   - streamChat({apiKey, model, messages, onChunk}) → full completion string
 *   - completeText({apiKey, model, messages})       → non-streaming string
 *   - LlmMessage, StreamChatOptions                 → types
 */
export * from './openrouter';
export * from './types';
