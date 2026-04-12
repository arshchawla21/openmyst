import { useEffect } from 'react';
import { useApp } from './store/app';
import { Layout } from './components/Layout';
import { Welcome } from './components/Welcome';
import { SettingsModal } from './components/SettingsModal';

export function App(): JSX.Element {
  const { project, settingsOpen, init, error, dismissError } = useApp();

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="app-root">
      {project ? <Layout /> : <Welcome />}
      {settingsOpen && <SettingsModal />}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button type="button" className="link" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
