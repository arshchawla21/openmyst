import { app, shell } from 'electron';
import { platform, arch, release } from 'node:os';
import { getRecentLogsText, log, logFromRenderer } from '../../platform';

/**
 * Bug reporting — opens a pre-filled GitHub issue in the user's browser.
 *
 * Why not create the issue directly via the GitHub API? Two reasons:
 *   1. That would require shipping a personal access token in the app binary
 *      (or running a proxy server) — both are ways to leak a credential.
 *   2. Users should *review* the issue, including the logs we attached,
 *      before posting anything. The `issues/new?title=&body=` flow gives us
 *      that for free, using whatever GitHub account they're already signed
 *      into in their default browser.
 *
 * The cost is GitHub's URL length cap. Issue-new URLs accept around 8 KB in
 * the query string before the server rejects them. We budget ~6 KB for the
 * body, truncating the log tail to fit. For longer logs, the user can grab
 * the full terminal output themselves and paste it into the issue.
 */

/**
 * Repository that receives bug reports. Update this when the repo moves or
 * forks. Format is `owner/repo`.
 */
const GITHUB_REPO = 'arshchawla21/openmyst';

const MAX_URL_BYTES = 7500;
const BUG_LABEL = 'bug';

export interface BugReportInput {
  title: string;
  description: string;
}

interface EnvInfo {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  os: string;
  osRelease: string;
  arch: string;
}

function collectEnv(): EnvInfo {
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown',
    chromeVersion: process.versions.chrome ?? 'unknown',
    nodeVersion: process.versions.node ?? 'unknown',
    os: platform(),
    osRelease: release(),
    arch: arch(),
  };
}

function formatEnv(env: EnvInfo): string {
  return [
    `- App: ${env.appVersion}`,
    `- Electron: ${env.electronVersion}`,
    `- Chrome: ${env.chromeVersion}`,
    `- Node: ${env.nodeVersion}`,
    `- OS: ${env.os} ${env.osRelease} (${env.arch})`,
  ].join('\n');
}

/**
 * Build the issue body (markdown). Logs are placed last so they can be
 * truncated from the front without losing the user's description.
 */
export function buildIssueBody(
  input: BugReportInput,
  env: EnvInfo,
  logsText: string,
): string {
  const description = input.description.trim() || '_(no description provided)_';

  const header = [
    '## Description',
    '',
    description,
    '',
    '## Environment',
    '',
    formatEnv(env),
    '',
    '## Recent logs',
    '',
    '```',
  ].join('\n');

  const footer = '\n```\n';

  // Budget: body must fit inside MAX_URL_BYTES once the whole URL is encoded.
  // We work in decoded characters here; the encode pass is a fat factor of ~3
  // for non-ASCII but closer to 1.5 for our logs (mostly ASCII). Aim for ~3 KB
  // of body text, which comfortably encodes under the cap.
  const BODY_BUDGET = 3000;
  const available = Math.max(0, BODY_BUDGET - header.length - footer.length);

  let logs = logsText;
  let truncated = false;
  if (logs.length > available) {
    // Keep the *tail* of the log — most recent events matter most for bug repro.
    logs = logs.slice(-available);
    truncated = true;
  }

  const logsBlock = truncated
    ? `[… earlier log lines truncated to fit GitHub's URL limit. Full logs are in the terminal running \`npm run dev\`.]\n${logs}`
    : logs || '(no log activity captured in this session)';

  return header + '\n' + logsBlock + footer;
}

export function buildIssueUrl(input: BugReportInput): string {
  const env = collectEnv();
  const logsText = getRecentLogsText();
  const body = buildIssueBody(input, env, logsText);

  const params = new URLSearchParams({
    title: input.title.trim() || 'Bug report',
    body,
    labels: BUG_LABEL,
  });

  let url = `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`;

  // Final safety belt: if we still overshoot the URL cap (unlikely — the
  // body budget is generous), progressively drop log lines until we fit.
  if (url.length > MAX_URL_BYTES) {
    const shrunkBody = buildIssueBody(input, env, logsText.slice(-1000));
    const shrunkParams = new URLSearchParams({
      title: input.title.trim() || 'Bug report',
      body: shrunkBody,
      labels: BUG_LABEL,
    });
    url = `https://github.com/${GITHUB_REPO}/issues/new?${shrunkParams.toString()}`;
  }

  return url;
}

export async function submitBugReport(input: BugReportInput): Promise<void> {
  if (!input.title.trim()) throw new Error('Bug report title is required.');
  const url = buildIssueUrl(input);
  log('bug', 'submit', {
    titlePreview: input.title.slice(0, 60),
    urlChars: url.length,
  });
  await shell.openExternal(url);
}

/** Exposed so the renderer can ship its own errors into the ring buffer. */
export function recordRendererLog(scope: string, event: string, message: string): void {
  logFromRenderer(scope, event, message);
}
