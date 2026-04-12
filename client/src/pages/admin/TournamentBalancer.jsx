import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api';

export default function TournamentBalancer() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [tableIds, setTableIds] = useState([]);
  const [tableStates, setTableStates] = useState({}); // tableId -> { players: [...] }
  const [loading, setLoading] = useState(true);
  const [balancing, setBalancing] = useState(false);
  const [dragInfo, setDragInfo] = useState(null); // { playerId, fromTableId }
  const [notification, setNotification] = useState(null);

  const fetchGroupData = () => {
    apiFetch(`/api/tournament-groups/${groupId}`)
      .then(data => {
        setGroup(data.group);
        const ids = data.tableIds ?? [];
        setTableIds(ids);
        // Fetch each table's game state
        return Promise.all(
          ids.map(tableId =>
            apiFetch(`/api/tables/${tableId}`)
              .then(t => ({ tableId, players: t?.players ?? t?.state?.players ?? [] }))
              .catch(() => ({ tableId, players: [] }))
          )
        );
      })
      .then(results => {
        const states = {};
        for (const { tableId, players } of results) {
          states[tableId] = { players };
        }
        setTableStates(states);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchGroupData();
  }, [groupId]);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAutoBalance = async () => {
    setBalancing(true);
    try {
      const result = await apiFetch(`/api/tournament-groups/${groupId}/auto-balance`, { method: 'POST' });
      const count = result?.moves?.length ?? 0;
      showNotification(count > 0 ? `Auto-balance complete: ${count} player(s) moved` : 'Tables are already balanced', 'success');
      // Refresh table states after balancing
      fetchGroupData();
    } catch (err) {
      showNotification(`Auto-balance failed: ${err.message}`, 'error');
      console.error(err);
    }
    setBalancing(false);
  };

  const handleDragStart = (playerId, fromTableId) => setDragInfo({ playerId, fromTableId });

  const handleDragEnd = () => setDragInfo(null);

  const handleDrop = async (toTableId) => {
    if (!dragInfo || dragInfo.fromTableId === toTableId) {
      setDragInfo(null);
      return;
    }
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/move-player`, {
        method: 'POST',
        body: JSON.stringify({
          playerId: dragInfo.playerId,
          fromTableId: dragInfo.fromTableId,
          toTableId,
        }),
      });
      showNotification('Player moved successfully', 'success');
      fetchGroupData();
    } catch (err) {
      showNotification(`Move failed: ${err.message}`, 'error');
      console.error(err);
    }
    setDragInfo(null);
  };

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (!group) return <div className="p-8 text-red-400">Group not found</div>;

  const minPlayers = group.min_players_per_table ?? 3;
  const hasUnderPopulated = tableIds.some(tableId => {
    const state = tableStates[tableId] ?? { players: [] };
    const players = (state.players ?? []).filter(p => (p.stack ?? 0) > 0);
    return players.length > 0 && players.length < minPlayers;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{group.name} — Balancer</h1>
          <p className="text-gray-400 text-sm mt-1">Drag players between tables or use auto-balance</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm"
          >
            Back
          </button>
          <button
            onClick={fetchGroupData}
            className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm"
          >
            Refresh
          </button>
          <button
            onClick={handleAutoBalance}
            disabled={balancing}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm disabled:opacity-50"
          >
            {balancing ? 'Balancing...' : 'Auto Balance'}
          </button>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`mb-4 px-4 py-3 rounded text-sm font-medium ${
          notification.type === 'error'
            ? 'bg-red-900/50 border border-red-600 text-red-300'
            : notification.type === 'success'
            ? 'bg-green-900/50 border border-green-600 text-green-300'
            : 'bg-blue-900/50 border border-blue-600 text-blue-300'
        }`}>
          {notification.msg}
        </div>
      )}

      {/* Info bar */}
      <div className="mb-4 flex gap-4 text-sm text-gray-400">
        <span>Min players/table: <span className="text-white font-semibold">{minPlayers}</span></span>
        <span>Max players/table: <span className="text-white font-semibold">{group.max_players_per_table ?? 9}</span></span>
        <span>Tables: <span className="text-white font-semibold">{tableIds.length}</span></span>
      </div>

      {/* Table columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {tableIds.map((tableId, idx) => {
          const state   = tableStates[tableId] ?? { players: [] };
          const players = (state.players ?? []).filter(p => (p.stack ?? 0) > 0);
          const isUnder = players.length > 0 && players.length < minPlayers;
          const isDragTarget = dragInfo && dragInfo.fromTableId !== tableId;

          return (
            <div
              key={tableId}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(tableId)}
              className={`flex-shrink-0 w-56 rounded-xl border-2 p-3 bg-gray-900 transition-colors ${
                isDragTarget
                  ? 'border-blue-400 bg-blue-950/30'
                  : isUnder
                  ? 'border-red-500'
                  : 'border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-sm">Table {idx + 1}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  isUnder ? 'bg-red-900 text-red-300' : 'bg-gray-800 text-gray-400'
                }`}>
                  {players.length} players
                </span>
              </div>

              <div className="space-y-2">
                {players.map(player => (
                  <div
                    key={player.id ?? player.stable_id}
                    draggable
                    onDragStart={() => handleDragStart(player.stable_id ?? player.id, tableId)}
                    onDragEnd={handleDragEnd}
                    className="bg-gray-800 rounded-lg p-2 cursor-grab active:cursor-grabbing hover:bg-gray-700 transition-colors select-none"
                  >
                    <div className="text-sm font-medium truncate">{player.name}</div>
                    <div className="text-xs text-gray-400">{(player.stack ?? 0).toLocaleString()} chips</div>
                  </div>
                ))}
                {players.length === 0 && (
                  <div className="text-gray-600 text-xs text-center py-4">Empty table</div>
                )}
              </div>

              {isUnder && (
                <div className="mt-2 text-xs text-red-400 text-center">
                  Below minimum ({minPlayers})
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer warning */}
      {hasUnderPopulated && (
        <p className="mt-4 text-red-400 text-sm">
          Tables highlighted in red are below the minimum player count ({minPlayers}). Use Auto Balance or drag players to fix.
        </p>
      )}
    </div>
  );
}
