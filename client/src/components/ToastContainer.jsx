import React from 'react';
import { useToast } from '../contexts/ToastContext.jsx';
import { colors } from '../lib/colors.js';
import { X } from 'lucide-react';

const TYPE_STYLES = {
  error:   { borderColor: colors.error,   icon: '\u26A0' },
  success: { borderColor: colors.success, icon: '\u2713' },
  info:    { borderColor: colors.gold,    icon: '\u2139' },
  warning: { borderColor: colors.warning, icon: '\u26A0' },
};

export default function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2" style={{ maxWidth: 360 }}>
      {toasts.map((toast) => {
        const style = TYPE_STYLES[toast.type] ?? TYPE_STYLES.info;
        return (
          <div
            key={toast.id}
            role="alert"
            data-type={toast.type}
            className="flex items-start gap-2 px-4 py-3 rounded-lg shadow-xl cursor-pointer"
            style={{
              background: colors.bgSurfaceRaised,
              border: `1px solid ${style.borderColor}`,
              backdropFilter: 'blur(8px)',
            }}
            onClick={() => dismissToast(toast.id)}
          >
            <span className="text-sm shrink-0 mt-0.5" style={{ color: style.borderColor }}>
              {style.icon}
            </span>
            <span className="text-sm flex-1" style={{ color: colors.textPrimary }}>
              {toast.message}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); dismissToast(toast.id); }}
              className="shrink-0 mt-0.5"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              aria-label="Dismiss"
            >
              <X size={14} style={{ color: colors.textMuted }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
