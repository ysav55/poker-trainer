/**
 * GroupCard.jsx
 *
 * Single group card in the sidebar. Shows color, name, and member count.
 * Clickable to select, with edit/delete context menu.
 */

import React, { useState } from 'react';
import { MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { colors } from '../../lib/colors';

export default function GroupCard({ group, isSelected, onSelect, onEdit, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '10px 8px',
        background: isSelected ? colors.bgSurfaceRaised : 'transparent',
        border: `1px solid ${isSelected ? colors.borderStrong : colors.borderDefault}`,
        borderRadius: 4,
        cursor: 'pointer',
        marginBottom: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = colors.bgSurfaceHover;
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            flexShrink: 0,
            background: group.color || colors.gold,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: colors.textPrimary,
              fontSize: 13,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {group.name}
          </div>
          <div style={{ color: colors.textMuted, fontSize: 11 }}>
            {group.member_count || 0} members
          </div>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: colors.textMuted,
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Group options"
        >
          <MoreVertical size={14} />
        </button>

        {showMenu && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              background: colors.bgSurfaceRaised,
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: 4,
              zIndex: 100,
              minWidth: 120,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
                setShowMenu(false);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'none',
                border: 'none',
                color: colors.textSecondary,
                fontSize: 12,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderBottom: `1px solid ${colors.borderDefault}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = colors.textPrimary)}
              onMouseLeave={(e) => (e.currentTarget.style.color = colors.textSecondary)}
            >
              <Edit2 size={12} />
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setShowMenu(false);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'none',
                border: 'none',
                color: colors.error,
                fontSize: 12,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              <Trash2 size={12} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
