import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorState } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';
import { renderLatex } from '../utils/markdown';

const mathKey = new PluginKey<DecorationSet>('mathRender');

interface MathRange {
  from: number;
  to: number;
  source: string;
  display: boolean;
}

/**
 * Scan every text node in the doc for `$$...$$` (block math) and `$...$`
 * (inline math). Math is stored in the source as raw text, so we only decorate
 * matches we find inside a single text node — multi-line display math that
 * spans paragraph boundaries is left raw, which is rare enough to ignore.
 */
function findMath(doc: PmNode): MathRange[] {
  const ranges: MathRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return undefined;
    const text = node.text;
    // Display first (greedy), then inline. A single regex with alternation
    // ensures $$ doesn't get misparsed as two empty $..$ pairs.
    const pattern = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const full = m[0];
      const display = full.startsWith('$$');
      const source = (display ? m[1] : m[2]) ?? '';
      if (source.trim().length === 0) continue;
      const from = pos + m.index;
      const to = from + full.length;
      ranges.push({ from, to, source, display });
    }
    return undefined;
  });
  return ranges;
}

function buildDecorations(state: EditorState): DecorationSet {
  const ranges = findMath(state.doc);
  if (ranges.length === 0) return DecorationSet.empty;
  const sel = state.selection;
  const decos: Decoration[] = [];
  for (const r of ranges) {
    // Keep the raw source visible while the cursor is inside or adjacent to
    // the math range — otherwise typing `$x$` would instantly hide the source
    // and the user couldn't edit it.
    const cursorInside = sel.from <= r.to && sel.to >= r.from;
    if (cursorInside) continue;
    decos.push(Decoration.inline(r.from, r.to, { class: 'myst-math-raw' }));
    decos.push(
      Decoration.widget(
        r.to,
        () => {
          const el = document.createElement('span');
          el.className = r.display
            ? 'myst-math-rendered myst-math-display'
            : 'myst-math-rendered';
          el.contentEditable = 'false';
          el.innerHTML = renderLatex(r.source, r.display);
          return el;
        },
        { side: 1, key: `math-${r.from}-${r.to}-${r.source}` },
      ),
    );
  }
  return DecorationSet.create(state.doc, decos);
}

export function createMathRenderExtension(): Extension {
  return Extension.create({
    name: 'mathRender',
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: mathKey,
          state: {
            init(_, state) {
              return buildDecorations(state);
            },
            apply(tr, old, _oldState, newState) {
              if (!tr.docChanged && !tr.selectionSet) return old;
              return buildDecorations(newState);
            },
          },
          props: {
            decorations(state) {
              return mathKey.getState(state) ?? DecorationSet.empty;
            },
          },
        }),
      ];
    },
  });
}
