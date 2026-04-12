import { useSourcePreview } from '../store/sourcePreview';

export function SourcePreviewPopup(): JSX.Element | null {
  const { source, close } = useSourcePreview();
  if (!source) return null;

  return (
    <div className="source-preview-overlay" onClick={close}>
      <div className="source-preview-popup" onClick={(e) => e.stopPropagation()}>
        <div className="source-preview-header">
          <h3>{source.name}</h3>
          <button type="button" className="source-preview-close" onClick={close}>
            &#x2715;
          </button>
        </div>
        <div className="source-preview-body">
          {source.summary}
        </div>
        {source.sourcePath && (
          <div className="source-preview-path">{source.sourcePath}</div>
        )}
        {!source.sourcePath && source.type === 'pasted' && (
          <div className="source-preview-path">Pasted text</div>
        )}
      </div>
    </div>
  );
}
