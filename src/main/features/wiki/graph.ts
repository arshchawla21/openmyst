import type { SourceMeta, WikiGraph, WikiGraphEdge, WikiGraphNode } from '@shared/types';

/**
 * Scan source summaries for `[text](slug.md)` markdown links that point at
 * other known source slugs, and turn them into graph edges. This is the
 * cheapest possible "linked sources" heuristic: the summary prompt already
 * asks the LLM to cite related sources as wikilinks, so the edges fall out
 * of the summary text for free. No embeddings, no separate inference pass.
 *
 * Pure function — no IO, no Electron deps. Safe to unit test.
 */
export function computeWikiGraph(sources: SourceMeta[]): WikiGraph {
  const slugSet = new Set(sources.map((s) => s.slug));
  const nodes: WikiGraphNode[] = sources.map((s) => ({
    id: s.slug,
    name: s.name,
    indexSummary: s.indexSummary,
    addedAt: s.addedAt,
  }));
  const edges: WikiGraphEdge[] = [];
  const seen = new Set<string>();
  const linkRe = /\]\(([^)\s]+?)\.md\)/g;
  for (const s of sources) {
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(s.summary)) !== null) {
      const target = m[1];
      if (!target || target === s.slug || !slugSet.has(target)) continue;
      const key = `${s.slug}->${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: s.slug, target });
    }
  }
  return { nodes, edges };
}
