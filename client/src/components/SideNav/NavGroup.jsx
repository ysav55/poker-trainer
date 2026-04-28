import React from 'react';
import { colors } from '../../lib/colors.js';

export default function NavGroup({ label, expanded, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      {expanded && (
        <span
          className="text-[10px] font-bold tracking-widest uppercase px-3 pt-4 pb-1"
          style={{ color: colors.textMuted }}
        >
          {label}
        </span>
      )}
      {!expanded && <div className="my-2 mx-3" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />}
      {children}
    </div>
  );
}
