/**
 * platform/ is the thin layer between Electron/Node primitives and feature
 * code. Features should import from here instead of reaching directly for
 * `electron`, `node:fs`, or `node:path`.
 *
 * What lives here:
 *   - fs.ts     — project-scoped filesystem helpers (projectPath, readProjectFile…)
 *   - log.ts    — namespaced logger (`log('chat', 'received', {…})`)
 *   - window.ts — broadcast() helper for renderer notifications
 *
 * What does NOT live here: business logic. Keep this layer boring.
 */
export * from './fs';
export * from './log';
export * from './window';
