import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

const MAX_TOASTS = 5;
const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const dismissToast = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id, message, type, createdAt: Date.now() };
    setToasts((prev) => [entry, ...prev].slice(0, MAX_TOASTS));
    timersRef.current[id] = setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    return id;
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
