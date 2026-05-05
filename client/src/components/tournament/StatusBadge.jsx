import React from 'react';
import { colors } from '../../lib/colors.js';

const STATUS_TOKEN = {
  pending:   { fg: colors.info,    tint: colors.infoTint,    border: colors.infoBorder    },
  running:   { fg: colors.success, tint: colors.successTint, border: colors.successBorder },
  paused:    { fg: colors.warning, tint: colors.warningTint, border: colors.warningBorder },
  finished:  { fg: colors.textMuted, tint: colors.mutedTint, border: colors.mutedBorder   },
  cancelled: { fg: colors.error,   tint: colors.errorTint,   border: colors.errorBorder   },
};

export default function StatusBadge({ status }) {
  const t = STATUS_TOKEN[status] ?? STATUS_TOKEN.finished;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 3,
      background: t.tint, border: `1px solid ${t.border}`, color: t.fg,
    }}>
      {status}
    </span>
  );
}
