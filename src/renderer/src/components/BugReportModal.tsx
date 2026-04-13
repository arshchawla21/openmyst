import { useState } from 'react';
import { bridge } from '../api/bridge';

interface Props {
  onClose: () => void;
}

export function BugReportModal({ onClose }: Props): JSX.Element {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (): Promise<void> => {
    if (title.trim().length === 0) {
      setError('Please enter a title.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await bridge.bugReport.submit({ title, description });
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Report a bug</h2>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </header>

        {submitted ? (
          <section className="modal-section">
            <p>
              A pre-filled GitHub issue has opened in your browser. Review the details —
              including the attached logs — and click <strong>Submit new issue</strong> on
              GitHub to post it. Thanks for the report!
            </p>
            <div className="row">
              <button type="button" className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="modal-section">
              <p className="muted">
                Clicking submit opens a pre-filled GitHub issue in your browser with your
                description and the most recent log activity from this session. You review
                and post it — no credentials are sent from the app.
              </p>
            </section>

            <section className="modal-section">
              <label className="field-label" htmlFor="bug-title">
                Title
              </label>
              <input
                id="bug-title"
                type="text"
                placeholder="Short summary of what went wrong"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
              />
            </section>

            <section className="modal-section">
              <label className="field-label" htmlFor="bug-description">
                Description
              </label>
              <textarea
                id="bug-description"
                placeholder="What did you do? What did you expect? What actually happened?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
                rows={8}
              />
            </section>

            {error && <div className="error">{error}</div>}

            <section className="modal-section">
              <div className="row">
                <button type="button" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void submit()}
                  disabled={submitting || title.trim().length === 0}
                >
                  {submitting ? 'Opening GitHub…' : 'Submit report'}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
