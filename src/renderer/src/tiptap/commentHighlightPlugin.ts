import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import type { Comment } from '@shared/types';
import { useComments } from '../store/comments';

interface CommentHighlightState {
  decorations: DecorationSet;
}

export const commentHighlightKey = new PluginKey<CommentHighlightState>('commentHighlight');

interface FlatDoc {
  flat: string;
  // posMap[i] = PM position of the ith character in `flat`.
  // For synthetic '\n' separators between blocks, posMap[i] is the PM pos
  // between those blocks (so a range mapping that index resolves cleanly).
  posMap: number[];
}

function buildFlatText(doc: PmNode): FlatDoc {
  const parts: string[] = [];
  const posMap: number[] = [];
  let first = true;

  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      if (!first) {
        // Insert a synthetic '\n' between sibling textblocks. The PM pos
        // `pos` is the opening of this block — mapping the '\n' to that
        // position puts the range boundary right at the block edge.
        parts.push('\n');
        posMap.push(pos);
      }
      first = false;
      let childOffset = 1; // inside a textblock, content starts at pos + 1
      node.forEach((child) => {
        if (child.isText && child.text) {
          const text = child.text;
          parts.push(text);
          for (let i = 0; i < text.length; i++) {
            posMap.push(pos + childOffset + i);
          }
        }
        childOffset += child.nodeSize;
      });
      return false;
    }
    return undefined;
  });

  return { flat: parts.join(''), posMap };
}

function findCommentRange(
  doc: PmNode,
  comment: Comment,
): { from: number; to: number } | null {
  if (!comment.text) return null;
  const { flat, posMap } = buildFlatText(doc);
  if (flat.length === 0) return null;

  const { contextBefore, contextAfter, text } = comment;
  const combined = `${contextBefore}${text}${contextAfter}`;

  let startIdx = -1;
  let endIdx = -1;

  if (combined.length > 0) {
    const hit = flat.indexOf(combined);
    if (hit !== -1) {
      startIdx = hit + contextBefore.length;
      endIdx = startIdx + text.length;
    }
  }

  if (startIdx === -1) {
    const hit = flat.indexOf(text);
    if (hit === -1) return null;
    startIdx = hit;
    endIdx = hit + text.length;
  }

  // endIdx points *past* the last matched char — grab the last char's pos
  // and add 1, which puts the boundary right after that char in PM coords.
  const fromPos = posMap[startIdx];
  const lastChar = endIdx - 1;
  const lastPos = posMap[lastChar];
  if (fromPos === undefined || lastPos === undefined) return null;
  const toPos = lastPos + 1;
  if (toPos <= fromPos) return null;
  return { from: fromPos, to: toPos };
}

function buildDecoration(doc: PmNode, comment: Comment): Decoration | null {
  const range = findCommentRange(doc, comment);
  if (!range) return null;
  return Decoration.inline(
    range.from,
    range.to,
    {
      class: 'comment-highlight',
      'data-comment-id': comment.id,
    },
    {
      commentId: comment.id,
      inclusiveStart: true,
      inclusiveEnd: true,
    },
  );
}

function applyMeta(
  current: DecorationSet,
  doc: PmNode,
  comments: Comment[],
): DecorationSet {
  const nextIds = new Set(comments.map((c) => c.id));
  const existing = current.find();
  const existingIds = new Set<string>();
  const toRemove: Decoration[] = [];

  for (const d of existing) {
    const id = (d.spec as { commentId?: string }).commentId;
    if (!id) continue;
    if (!nextIds.has(id)) {
      toRemove.push(d);
    } else {
      existingIds.add(id);
    }
  }

  let result = current;
  if (toRemove.length > 0) result = result.remove(toRemove);

  const toAdd: Decoration[] = [];
  for (const comment of comments) {
    if (existingIds.has(comment.id)) continue;
    const deco = buildDecoration(doc, comment);
    if (deco) toAdd.push(deco);
  }
  if (toAdd.length > 0) result = result.add(doc, toAdd);

  return result;
}

export function createCommentHighlightExtension(): Extension {
  return Extension.create({
    name: 'commentHighlight',
    addProseMirrorPlugins() {
      return [
        new Plugin<CommentHighlightState>({
          key: commentHighlightKey,
          state: {
            init() {
              return { decorations: DecorationSet.empty };
            },
            apply(tr, old) {
              const mapped = old.decorations.map(tr.mapping, tr.doc);
              const meta = tr.getMeta(commentHighlightKey) as Comment[] | undefined;
              if (meta !== undefined) {
                return { decorations: applyMeta(mapped, tr.doc, meta) };
              }
              return { decorations: mapped };
            },
          },
          props: {
            decorations(state) {
              return commentHighlightKey.getState(state)?.decorations ?? DecorationSet.empty;
            },
            handleDOMEvents: {
              mousedown(_view, event) {
                const target = event.target as HTMLElement | null;
                const hit = target?.closest?.('.comment-highlight') as HTMLElement | null;
                if (!hit) return false;
                const id = hit.getAttribute('data-comment-id');
                if (!id) return false;
                // Don't reopen when clicking a draft preview.
                if (id === '__draft__') return false;
                event.preventDefault();
                useComments.getState().setReopen(id);
                return true;
              },
            },
          },
        }),
      ];
    },
  });
}
