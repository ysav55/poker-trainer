import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sidebar-expanded';
const AUTO_COLLAPSE_WIDTH = 1280;

function getInitial() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === 'true';
  return window.innerWidth >= AUTO_COLLAPSE_WIDTH;
}

export function useSidebarState() {
  const [expanded, setExpanded] = useState(getInitial);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = () => {
      if (window.innerWidth < AUTO_COLLAPSE_WIDTH && localStorage.getItem(STORAGE_KEY) === null) {
        setExpanded(false);
      }
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return { expanded, toggle };
}
