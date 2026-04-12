import { useApp } from '../store/app';
import { DocumentEditor } from './DocumentEditor';
import { ErrorBoundary } from './ErrorBoundary';

export function DocumentPanel(): JSX.Element {
  const { project } = useApp();

  if (!project) {
    return (
      <div className="document-panel">
        <div className="document-placeholder">
          <p className="muted">No project open.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="document-panel">
      <ErrorBoundary>
        <DocumentEditor projectPath={project.path} />
      </ErrorBoundary>
    </div>
  );
}
