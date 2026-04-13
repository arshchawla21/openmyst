import type { PendingEdit } from '@shared/types';

interface PendingEditsBannerProps {
  activeEdit: PendingEdit | null;
  error: string | null;
  onAccept: () => void;
  onReject: () => void;
}

export function PendingEditsBanner({
  activeEdit,
  error,
  onAccept,
  onReject,
}: PendingEditsBannerProps): JSX.Element | null {
  if (!activeEdit) return null;

  const counter = `${activeEdit.batchIndex}/${activeEdit.batchTotal}`;
  const label =
    activeEdit.batchTotal === 1 ? 'Pending edit' : `Pending edit ${counter}`;

  return (
    <div className="pending-banner">
      <div className="pending-banner-row">
        <span className="pending-banner-dot" />
        <span className="pending-banner-label">{label}</span>
        <div className="pending-banner-actions">
          <button
            type="button"
            className="pending-banner-btn pending-banner-reject"
            onClick={onReject}
            title="Reject"
          >
            Reject
          </button>
          <button
            type="button"
            className="pending-banner-btn pending-banner-accept"
            onClick={onAccept}
            title="Accept"
          >
            Accept
          </button>
        </div>
      </div>
      {error && <div className="pending-banner-error">⚠️ {error}</div>}
    </div>
  );
}
