import { bridge } from '../api/bridge';

/**
 * Pipe unhandled renderer errors into the main-process ring buffer so they
 * show up in bug reports. We don't try to capture every `console.log`
 * because most of those are noise; unhandled errors and promise rejections
 * are the signal that actually matters when something breaks.
 *
 * Fire-and-forget — if the bridge call fails we swallow it, since the
 * whole point is that something has *already* gone wrong and we don't want
 * to cascade.
 */

function shipToMain(event: string, message: string): void {
  try {
    void bridge.bugReport.rendererLog('renderer', event, message);
  } catch {
    // swallow — cannot help ourselves here
  }
}

export function installRendererErrorReporter(): void {
  window.addEventListener('error', (ev) => {
    const parts = [
      ev.message ?? 'unknown error',
      ev.filename ? `@ ${ev.filename}:${ev.lineno ?? '?'}:${ev.colno ?? '?'}` : '',
      ev.error instanceof Error && ev.error.stack ? '\n' + ev.error.stack : '',
    ];
    shipToMain('window.onerror', parts.filter(Boolean).join(' '));
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const message =
      reason instanceof Error
        ? `${reason.message}${reason.stack ? '\n' + reason.stack : ''}`
        : typeof reason === 'string'
          ? reason
          : JSON.stringify(reason);
    shipToMain('unhandledrejection', message);
  });
}
