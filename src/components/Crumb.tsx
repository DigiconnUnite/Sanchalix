'use client';

import { createContext, useContext, useEffect } from 'react';

export const CrumbContext = createContext<(label: string) => void>(() => {});

/** Names the record a page is about (a student, an exam, a receipt), so the breadcrumb shows it instead of "Details". */
export function useCrumb(label: string | undefined) {
  const setLabel = useContext(CrumbContext);
  useEffect(() => {
    if (!label) return;
    setLabel(label);
    return () => setLabel('');
  }, [label, setLabel]);
}
