import React, { useEffect } from 'react';

function ErrorToast({ message, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div
      className="toast-enter flex items-start gap-2 px-4 py-3 rounded-xl shadow-2xl cursor-pointer"
      style={{
        background: 'rgba(30, 10, 10, 0.97)',
        border: '1px solid rgba(239,68,68,0.4)',
        backdropFilter: 'blur(8px)',
        maxWidth: 360,
        boxShadow: '0 4px 30px rgba(239,68,68,0.2)',
      }}
      onClick={onDismiss}
    >
      <span className="text-red-400 text-sm leading-none mt-0.5 shrink-0">⚠</span>
      <span className="text-sm text-red-300 leading-snug flex-1">{message}</span>
      <span className="text-gray-600 text-xs shrink-0 mt-0.5">✕</span>
    </div>
  );
}

export default ErrorToast;
