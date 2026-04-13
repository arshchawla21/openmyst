/** Shape of a single message sent to an OpenRouter chat completion. */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Options accepted by streamChat(). Everything except `apiKey`, `model`,
 * and `messages` is optional — sensible defaults live in openrouter.ts.
 */
export interface StreamChatOptions {
  apiKey: string;
  model: string;
  messages: LlmMessage[];
  /** Called with each content chunk as it arrives from the stream. */
  onChunk?: (chunk: string) => void;
  /** Scope label for the logger — e.g. 'chat', 'sources'. Defaults to 'llm'. */
  logScope?: string;
}
