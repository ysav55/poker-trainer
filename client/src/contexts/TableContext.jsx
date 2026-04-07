import { createContext, useContext } from 'react';
import { useTableSocket } from '../hooks/useTableSocket.js';
import { useGameState } from '../hooks/useGameState.js';
import { usePlaylistManager } from '../hooks/usePlaylistManager.js';
import { useNotifications } from '../hooks/useNotifications.js';

const TableContext = createContext(null);

export function TableProvider({ tableId, managerMode = false, children }) {
  const socket = useTableSocket(tableId, { managerMode });
  const notifications = useNotifications(socket);
  const { addError, addNotification } = notifications;

  const gameState = useGameState({ ...socket, addError, addNotification });
  const playlist = usePlaylistManager(socket);
  return (
    <TableContext.Provider value={{ tableId, socket, gameState, playlist, notifications }}>
      {children}
    </TableContext.Provider>
  );
}

export const useTable = () => useContext(TableContext);
