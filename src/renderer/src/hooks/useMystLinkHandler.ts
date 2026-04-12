import { useEffect } from 'react';
import { useDocuments } from '../store/documents';
import { useSourcePreview } from '../store/sourcePreview';
import { bridge } from '../api/bridge';

export function useMystLinkHandler(): void {
  const { files, setActive } = useDocuments();
  const openPreview = useSourcePreview((s) => s.open);

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href) return;
      if (href.startsWith('http://') || href.startsWith('https://')) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (!href.endsWith('.md')) return;

      const filename = href.replace(/^\.?\/?/, '');

      const doc = files.find((f) => f.filename === filename);
      if (doc) {
        setActive(doc.filename);
        return;
      }

      const slug = filename.replace(/\.md$/, '');
      bridge.sources
        .list()
        .then((sources) => {
          const source = sources.find((s) => s.slug === slug);
          if (source) {
            openPreview(source);
          }
        })
        .catch(console.error);
    };

    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [files, setActive, openPreview]);
}
