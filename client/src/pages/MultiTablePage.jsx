import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLobby } from '../contexts/LobbyContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { TableProvider, useTable } from '../contexts/TableContext.jsx';
import TableTile from '../components/TableTile.jsx';
import BroadcastBar from '../components/BroadcastBar.jsx';

/**
 * Compute CSS gridTemplateColumns / gridTemplateRows based on table count and focus.
 *
 * Layout rules (design spec):
 *   1  — full width
 *   2  — 50/50 (or 70/30 when focused)
 *   3  — 3 columns flat (focused col gets ~70%)
 *   4+ — 2×2 (focused tile gets 70%)
 */
function computeGridTemplate(count, focusedId, tables) {
  if (count === 0) return { columns: '1fr', rows: '1fr' };
  if (count === 1) return { columns: '1fr', rows: '1fr' };

  if (count === 2) {
    if (focusedId) {
      const idx = tables.findIndex((t) => t.id === focusedId);
      return idx === 0
        ? { columns: '70% 30%', rows: '1fr' }
        : { columns: '30% 70%', rows: '1fr' };
    }
    return { columns: '1fr 1fr', rows: '1fr' };
  }

  if (count === 3) {
    if (focusedId) {
      const idx = tables.findIndex((t) => t.id === focusedId);
      const cols = [idx === 0 ? '70%' : '1fr', idx === 1 ? '70%' : '1fr', idx === 2 ? '70%' : '1fr'];
      return { columns: cols.join(' '), rows: '1fr' };
    }
    return { columns: '1fr 1fr 1fr', rows: '1fr' };
  }

  // 4+ tables — 2×2
  if (focusedId) {
    return { columns: '70% 30%', rows: '70% 30%' };
  }
  return { columns: '1fr 1fr', rows: '1fr 1fr' };
}

// ─── SocketRef bridge ─────────────────────────────────────────────────────────

/**
 * Lives inside a TableProvider and calls onRef(tableId, socketRef) once the
 * socket is available. Used to collect socketRefs for BroadcastBar.
 */
function SocketRefBridge({ tableId, onRef }) {
  const { socket } = useTable();

  useEffect(() => {
    if (socket?.socketRef) {
      onRef(tableId, socket.socketRef);
    }
  }, [tableId, socket, onRef]);

  return null;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MultiTablePage() {
  const { activeTables } = useLobby();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [focusedTableId, setFocusedTableId] = useState(null);

  // Map of tableId -> socketRef, kept stable
  const socketRefMapRef = useRef({});
  // Flat array for BroadcastBar — rebuilt on each change
  const [socketRefs, setSocketRefs] = useState([]);

  const handleRef = useCallback((tableId, socketRef) => {
    socketRefMapRef.current[tableId] = socketRef;
    setSocketRefs(Object.values(socketRefMapRef.current));
  }, []);

  const tables = activeTables ?? [];
  const count = tables.length;

  const handleFocus = useCallback((tableId) => {
    setFocusedTableId((prev) => (prev === tableId ? null : tableId));
  }, []);

  if (count === 0) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          background: '#0d1117',
        }}
      >
        <p style={{ color: '#8b949e', fontSize: 14 }}>
          No active tables. Create one from the lobby.
        </p>
        <button
          onClick={() => navigate('/lobby')}
          style={{
            fontSize: 12,
            padding: '6px 14px',
            borderRadius: 6,
            background: 'transparent',
            color: '#8b949e',
            border: '1px solid #30363d',
            cursor: 'pointer',
          }}
        >
          ← Back to Lobby
        </button>
      </div>
    );
  }

  const { columns, rows } = computeGridTemplate(count, focusedTableId, tables);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: '#0d1117',
        overflow: 'hidden',
      }}
    >
      {/* Top navigation bar */}
      <div
        style={{
          height: 40,
          background: '#0d1117',
          borderBottom: '1px solid #21262d',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate('/lobby')}
          style={{
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 5,
            background: 'transparent',
            color: '#8b949e',
            border: '1px solid #30363d',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e6edf3'; e.currentTarget.style.borderColor = '#6e7681'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.borderColor = '#30363d'; }}
        >
          ← Lobby
        </button>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: 'rgba(212,175,55,0.7)',
            textTransform: 'uppercase',
          }}
        >
          Multi-Table
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6e7681' }}>
          {count} table{count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Broadcast bar — visible only to coaches with table:manage permission */}
      {hasPermission('table:manage') && (
        <BroadcastBar tableRefs={socketRefs} />
      )}

      {/* Adaptive grid of table tiles */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: columns,
          gridTemplateRows: rows,
          gap: 8,
          padding: 8,
          minHeight: 0,
        }}
      >
        {tables.map((table) => (
          <TableProvider key={table.id} tableId={table.id}>
            <SocketRefBridge tableId={table.id} onRef={handleRef} />
            <TableTile
              focused={focusedTableId === table.id}
              onFocus={() => handleFocus(table.id)}
            />
          </TableProvider>
        ))}
      </div>
    </div>
  );
}
