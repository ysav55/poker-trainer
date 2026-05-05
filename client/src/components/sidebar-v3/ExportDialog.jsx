import React, { useState, useEffect } from 'react';

/**
 * ExportDialog — modal to select export format (CSV or XLSX) and download hands.
 *
 * Props:
 *   - open (bool): Whether dialog is visible
 *   - onClose (func): Callback when dialog closes
 *   - tableId (string): Table ID to export (used in query param)
 */
export default function ExportDialog({ open, onClose, tableId }) {
  const [format, setFormat] = useState('csv');
  const [downloading, setDownloading] = useState(false);

  // Handle Escape key
  useEffect(() => {
    if (!open) return;

    function handleKey(e) {
      if (e.key === 'Escape') onClose?.();
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleDownload() {
    if (!tableId) return;

    setDownloading(true);
    const url = `/api/exports/hands?tableId=${encodeURIComponent(tableId)}&format=${format}`;

    // Trigger browser download via window.location (respects Content-Disposition header)
    window.location.href = url;

    // Reset after a short delay (time for download to start)
    setTimeout(() => {
      setDownloading(false);
      onClose?.();
    }, 500);
  }

  return (
    <div
      role="dialog"
      aria-label="Export hands"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: 16,
          minWidth: 320,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-title" style={{ marginBottom: 12 }}>
          Export hands
        </div>

        <div className="lbl" style={{ marginBottom: 8, fontSize: 12 }}>
          Format
        </div>
        <div className="row" style={{ gap: 12, marginBottom: 16 }}>
          <label
            style={{
              display: 'flex',
              gap: 6,
              fontSize: 12,
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="radio"
              value="csv"
              checked={format === 'csv'}
              onChange={(e) => setFormat(e.target.value)}
            />
            CSV (per-hand rows)
          </label>
          <label
            style={{
              display: 'flex',
              gap: 6,
              fontSize: 12,
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="radio"
              value="xlsx"
              checked={format === 'xlsx'}
              onChange={(e) => setFormat(e.target.value)}
            />
            Excel (4 sheets)
          </label>
        </div>

        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button
            className="btn ghost"
            onClick={onClose}
            style={{ flex: 0.8 }}
          >
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={handleDownload}
            disabled={!tableId || downloading}
            style={{ flex: 1 }}
          >
            {downloading ? 'Downloading…' : '↓ Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
