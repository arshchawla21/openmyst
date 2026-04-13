import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import type { SourceMeta } from '@shared/types';

/**
 * Source file → plain text. One function per extension family. The output
 * is always UTF-8 markdown/text that can be handed to the LLM as-is.
 *
 * Keep this file dependency-thin: it's the layer a contributor will touch
 * to add a new source type (e.g. .docx, .epub) and they shouldn't need to
 * understand the rest of the pipeline to do it. Add a branch, return
 * `{ text, type }`, done.
 */

export interface ExtractedSource {
  text: string;
  type: SourceMeta['type'];
}

export async function extractText(filePath: string): Promise<ExtractedSource> {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return { text: result.text, type: 'pdf' };
  }
  const text = await fs.readFile(filePath, 'utf-8');
  if (ext === '.md' || ext === '.markdown') return { text, type: 'markdown' };
  return { text, type: 'text' };
}
