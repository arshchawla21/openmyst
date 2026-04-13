import type { SourceMeta } from '@shared/types';
import { completeText } from '../../llm';
import { getOpenRouterKey, getSettings } from '../settings';

/**
 * Turn a blob of source text into a structured wiki entry using the LLM.
 *
 * Returns three things:
 *   - `name`         — short title the UI shows in the Sources panel
 *   - `summary`      — full wiki-style summary written to `sources/<slug>.md`
 *   - `indexSummary` — one-sentence version written to the wiki index
 *
 * The LLM is also told about existing sources in the project so it can drop
 * inline wikilinks like `[Other Source](other_slug.md)`. Those wikilinks are
 * what powers the research graph (see features/wiki/graph.ts) — the graph
 * edges fall out of the summary text for free, no separate inference pass.
 *
 * If the API key is missing, or the LLM call fails, we degrade gracefully to
 * a truncated-text summary instead of blowing up. Ingestion must always
 * succeed or the user's source file disappears into the void.
 */

export interface SourceDigest {
  name: string;
  summary: string;
  indexSummary: string;
}

const MAX_PREVIEW_CHARS = 6000;

const SYSTEM_PROMPT = `You process source material into a research wiki entry. Given raw text from a source, output ONLY valid JSON with these three fields:

{
  "name": "A short, descriptive title for this source (2-6 words)",
  "summary": "A detailed wiki-style summary of the source content. 2-4 paragraphs covering the key points, arguments, data, and conclusions. Write in third person. Be thorough — this summary replaces the original for research purposes. You may use markdown links to reference other sources if relevant, using the format [Source Name](slug.md).",
  "indexSummary": "One sentence (under 20 words) describing what this source covers, for quick scanning."
}

Output ONLY the JSON object. No markdown fences, no commentary.`;

function fallbackDigest(rawText: string, hint: string): SourceDigest {
  return {
    name: hint,
    summary: rawText.slice(0, 500),
    indexSummary: `Source: ${hint}`,
  };
}

function buildUserPrompt(rawText: string, hint: string, existingSources: SourceMeta[]): string {
  const preview = rawText.slice(0, MAX_PREVIEW_CHARS);
  const existingBlock = existingSources.length
    ? `\n\nExisting sources in this project (you can link to these using [Name](slug.md)):\n${existingSources
        .map((s) => `- ${s.name} (${s.slug}.md)`)
        .join('\n')}`
    : '';
  return `Source hint: "${hint}"${existingBlock}\n\nRaw text:\n${preview}`;
}

export async function generateDigest(
  rawText: string,
  hint: string,
  existingSources: SourceMeta[] = [],
): Promise<SourceDigest> {
  const apiKey = await getOpenRouterKey();
  if (!apiKey) return fallbackDigest(rawText, hint);

  const { defaultModel } = await getSettings();
  const raw = await completeText({
    apiKey,
    model: defaultModel,
    logScope: 'sources',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(rawText, hint, existingSources) },
    ],
  });

  if (raw === null) return fallbackDigest(rawText, hint);

  try {
    const cleaned = raw.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
    const parsed = JSON.parse(cleaned) as Partial<SourceDigest>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : hint,
      summary: typeof parsed.summary === 'string' ? parsed.summary : rawText.slice(0, 500),
      indexSummary:
        typeof parsed.indexSummary === 'string' ? parsed.indexSummary : `Source: ${hint}`,
    };
  } catch {
    return fallbackDigest(rawText, hint);
  }
}
