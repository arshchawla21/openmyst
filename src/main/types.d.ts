/**
 * Ambient module declarations for the Electron main process bundle.
 *
 * Vite (via electron-vite) supports `?raw` imports that inline a file's
 * contents as a string at build time — we use it to keep long prose assets
 * like agent.md as real `.md` files editable on disk rather than embedded in
 * backtick-quoted JS literals.
 */
declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare module '*?raw' {
  const content: string;
  export default content;
}
