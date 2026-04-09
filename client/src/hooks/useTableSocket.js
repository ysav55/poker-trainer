import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext.jsx';

export function useTableSocket(tableId, { managerMode = false, forceSpectator = false } = {}) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  // Reactive socket state — useGameState depends on this to re-run its effect
  // when the socket instance changes (must match useConnectionManager's contract).
  const [socket, setSocket] = useState(null);

  // Read spectate flag from URL (?spectate=true)
  const [searchParams] = useSearchParams();
  const spectateMode = forceSpectator || searchParams.get('spectate') === 'true';

  // Read buy-in amount from router state (set by LobbyPage buy-in modal)
  const location = useLocation();
  const buyInAmount = location.state?.buyInAmount ?? null;

  useEffect(() => {
    const sock = io(import.meta.env.VITE_SERVER_URL ?? '', {
      auth: (cb) => cb({ token: user?.token ?? '' }),
    });

    sock.on('connect', () => {
      setConnected(true);
      if (!user) return;
      const COACH_ROLES = ['coach', 'admin', 'superadmin'];
      sock.emit('join_room', {
        name: user.name,
        isCoach: COACH_ROLES.includes(user.role) && !spectateMode,
        isSpectator: spectateMode,
        tableId,
        managerMode,
        ...(buyInAmount != null ? { buyInAmount } : {}),
      });
    });
    sock.on('disconnect', () => setConnected(false));
    sock.on('connect_error', (err) => {
      console.error('[useTableSocket] connect_error:', err.message);
    });

    socketRef.current = sock;
    setSocket(sock);
    return () => {
      sock.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [tableId, user?.token]);

  const emit = (event, data) => socketRef.current?.emit(event, data);
  return { socketRef, socket, emit, connected, isSpectator: spectateMode };
}
