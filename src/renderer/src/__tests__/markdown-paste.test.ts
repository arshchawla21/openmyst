import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Markdown } from 'tiptap-markdown';
import MarkdownIt from 'markdown-it';
import { DOMParser as PmDOMParser, Slice } from '@tiptap/pm/model';

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

function createEditor(content = ''): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Link.configure({ openOnClick: false }),
      Image,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content,
  });
}

function simulateMarkdownPaste(editor: Editor, markdownText: string): void {
  const html = md.render(markdownText);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;

  const parsed = PmDOMParser.fromSchema(editor.schema).parse(wrapper);
  const slice = new Slice(parsed.content, 0, 0);

  editor.view.dispatch(editor.view.state.tr.replaceSelection(slice));
}

function getEditorHtml(editor: Editor): string {
  return editor.getHTML();
}

function getEditorMarkdown(editor: Editor): string {
  const storage = editor.storage as unknown as Record<
    string,
    { getMarkdown?: () => string }
  >;
  return storage['markdown']?.getMarkdown?.() ?? '';
}

describe('Markdown paste pipeline', () => {
  it('should render a pasted H1 heading', () => {
    const editor = createEditor('<p></p>');
    simulateMarkdownPaste(editor, '# Hello World');
    const html = getEditorHtml(editor);
    expect(html).toContain('<h1>Hello World</h1>');
    expect(html).not.toContain('#');
    editor.destroy();
  });

  it('should render pasted H2 and paragraph', () => {
    const editor = createEditor('<p></p>');
    simulateMarkdownPaste(editor, '## Subheading\n\nSome paragraph text.');
    const html = getEditorHtml(editor);
    expect(html).toContain('<h2>Subheading</h2>');
    expect(html).toContain('<p>Some paragraph text.</p>');
    expect(html).not.toContain('##');
    editor.destroy();
  });

  it('should render pasted bold and italic inline', () => {
    const editor = createEditor('<p></p>');
    simulateMarkdownPaste(editor, '**bold** and *italic* text');
    const html = getEditorHtml(editor);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).not.toContain('**');
    expect(html).not.toContain('*italic*');
    editor.destroy();
  });

  it('should render pasted bullet list', () => {
    const editor = createEditor('<p></p>');
    simulateMarkdownPaste(editor, '- item one\n- item two\n- item three');
    const html = getEditorHtml(editor);
    expect(html).toContain('<li><p>item one</p></li>');
    expect(html).toContain('<li><p>item two</p></li>');
    expect(html).not.toContain('- item');
    editor.destroy();
  });

  it('should render pasted blockquote', () => {
    const editor = createEditor('<p></p>');
    simulateMarkdownPaste(editor, '> A blockquote');
    const html = getEditorHtml(editor);
    expect(html).toContain('<blockquote>');
    expect(html).toContain('A blockquote');
    editor.destroy();
  });

  it('should render pasted horizontal rule', () => {
    const editor = createEditor('<p></p>');
    simulateMarkdownPaste(editor, 'Before\n\n---\n\nAfter');
    const html = getEditorHtml(editor);
    expect(html).toContain('<hr>');
    expect(html).not.toContain('---');
    editor.destroy();
  });

  it('should render a full pasted markdown document', () => {
    const editor = createEditor('<p></p>');
    const fullDoc = [
      '# Main Title',
      '',
      'A paragraph with **bold** and *italic*.',
      '',
      '## Section Two',
      '',
      '- bullet one',
      '- bullet two',
      '',
      '> A quote',
      '',
      '---',
      '',
      'Final paragraph.',
    ].join('\n');

    simulateMarkdownPaste(editor, fullDoc);
    const html = getEditorHtml(editor);

    expect(html).toContain('<h1>Main Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<h2>Section Two</h2>');
    expect(html).toContain('<li>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<hr>');
    expect(html).toContain('Final paragraph.');

    expect(html).not.toContain('# Main');
    expect(html).not.toContain('## Section');
    expect(html).not.toContain('**bold**');
    expect(html).not.toContain('- bullet');
    expect(html).not.toContain('> A quote');
    expect(html).not.toContain('---');

    editor.destroy();
  });

  it('should handle pasting into an existing document at cursor', () => {
    const editor = createEditor('<p>Before </p>');
    editor.commands.focus('end');
    simulateMarkdownPaste(editor, '**pasted**');
    const html = getEditorHtml(editor);
    expect(html).toContain('<strong>pasted</strong>');
    editor.destroy();
  });

  it('should round-trip: paste markdown → serialize back to markdown', () => {
    const editor = createEditor('<p></p>');
    simulateMarkdownPaste(editor, '# Hello\n\nWorld **bold** text.');
    const output = getEditorMarkdown(editor);
    expect(output).toContain('# Hello');
    expect(output).toContain('**bold**');
    editor.destroy();
  });
});
