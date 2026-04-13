import type { SourceMeta } from '@shared/types';
import { writeProjectFile } from '../../platform';

/**
 * Rewriter for `sources/index.md` — the human-readable source list that sits
 * inside the project folder (user-visible, git-friendly). Distinct from the
 * research wiki's index under `.myst/wiki/index.md`, which is what the agent
 * actually reads on each chat turn. Both get updated together whenever the
 * source list changes.
 */
export async function updateSourcesIndex(sources: SourceMeta[]): Promise<void> {
  const lines = ['# Sources\n'];
  if (sources.length === 0) {
    lines.push('_No sources yet._\n');
  } else {
    for (const s of sources) {
      lines.push(`- [${s.name}](${s.slug}.md) — ${s.indexSummary}`);
    }
    lines.push('');
  }
  await writeProjectFile('sources/index.md', lines.join('\n'));
}
