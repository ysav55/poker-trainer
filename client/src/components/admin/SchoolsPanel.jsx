import React, { useState } from 'react';
import { MoreHorizontal, Trash2, Pencil, Plus } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';

export default function SchoolsPanel({ schools, selectedSchoolId, totalUsers, onSelectSchool, onSchoolsChanged }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuOpen, setMenuOpen] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/api/admin/schools', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName('');
      setCreating(false);
      onSchoolsChanged?.();
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const handleRename = async (id) => {
    if (!renameVal.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/schools/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: renameVal.trim() }),
      });
      setRenaming(null);
      setRenameVal('');
      onSchoolsChanged?.();
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    const school = schools.find(s => s.id === id);
    if (school && school.total > 0) {
      alert(`Cannot delete "${name}" — it has ${school.total} members. Remove them first.`);
      return;
    }
    if (!confirm(`Delete school "${name}"?`)) return;
    try {
      await apiFetch(`/api/admin/schools/${id}`, { method: 'DELETE' });
      if (selectedSchoolId === id) onSelectSchool(null);
      onSchoolsChanged?.();
    } catch { /* silent */ }
  };

  const itemStyle = (isSelected) => ({
    padding: '8px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    marginBottom: 3,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: isSelected ? 'rgba(212,175,55,0.1)' : 'transparent',
    border: isSelected ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent',
    color: isSelected ? colors.textPrimary : colors.textMuted,
  });

  return (
    <div className="flex flex-col flex-1 px-3 py-3" style={{ overflow: 'auto' }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
          Schools
        </span>
      </div>

      <div style={itemStyle(selectedSchoolId === null)} onClick={() => onSelectSchool(null)}>
        <span className="text-xs">All Users</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{totalUsers}</span>
      </div>

      {(schools || []).map(s => (
        <div key={s.id} style={{ position: 'relative' }}>
          {renaming === s.id ? (
            <div className="flex items-center gap-1 mb-1">
              <input
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                className="flex-1 text-xs rounded px-2 py-1"
                style={{ background: colors.bgSurface, border: `1px solid ${colors.borderDefault}`, color: colors.textPrimary }}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename(s.id);
                  if (e.key === 'Escape') { setRenaming(null); setRenameVal(''); }
                }}
              />
            </div>
          ) : (
            <div
              style={itemStyle(selectedSchoolId === s.id)}
              onClick={() => onSelectSchool(s.id)}
              onContextMenu={e => { e.preventDefault(); setMenuOpen(menuOpen === s.id ? null : s.id); }}
            >
              <span className="text-xs truncate" style={{ maxWidth: 130 }}>{s.name}</span>
              <div className="flex items-center gap-1">
                <span style={{ fontSize: 10, color: '#3fb950' }}>{s.total}</span>
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === s.id ? null : s.id); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, padding: 2 }}
                >
                  <MoreHorizontal size={12} />
                </button>
              </div>
            </div>
          )}

          {menuOpen === s.id && (
            <div
              className="absolute right-0 z-10 rounded shadow-lg py-1"
              style={{
                top: '100%',
                background: colors.bgSurface,
                border: `1px solid ${colors.borderDefault}`,
                minWidth: 120,
              }}
            >
              <button
                onClick={() => { setRenaming(s.id); setRenameVal(s.name); setMenuOpen(null); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left"
                style={{ color: colors.textPrimary, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <Pencil size={11} /> Rename
              </button>
              <button
                onClick={() => { handleDelete(s.id, s.name); setMenuOpen(null); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left"
                style={{ color: '#f85149', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <Trash2 size={11} /> Delete
              </button>
            </div>
          )}
        </div>
      ))}

      {creating ? (
        <div className="flex items-center gap-1 mt-1">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="School name"
            className="flex-1 text-xs rounded px-2 py-1"
            style={{ background: colors.bgSurface, border: `1px solid ${colors.borderDefault}`, color: colors.textPrimary }}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || saving}
            className="text-xs px-2 py-1 rounded"
            style={{ background: colors.gold, color: '#0d1117', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >Add</button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 mt-2 text-xs"
          style={{ color: colors.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Plus size={12} /> New School
        </button>
      )}
    </div>
  );
}
