import { applyMode, Mode } from '@cloudscape-design/global-styles';
import { useEffect } from 'react';

/** Dark mode would print light text on white paper, so the page is light for as long as the print dialog is open. */
export function usePrintInLightMode() {
  useEffect(() => {
    let wasDark = false;
    const before = () => {
      wasDark = document.body.classList.contains('awsui-dark-mode');
      applyMode(Mode.Light);
    };
    const after = () => wasDark && applyMode(Mode.Dark);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
}
