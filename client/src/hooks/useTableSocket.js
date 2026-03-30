import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext.jsx';

export function useTableSocket(tableId) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SERVER_URL ?? '', {
      auth: (cb) => cb({ token: user?.token ?? '' }),
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_room', {
        name: user.name,
        isCoach: user.role === 'coach',
        isSpectator: false,
        tableId,
      });
    });
    socket.on('disconnect', () => setConnected(false));

    socketRef.current = socket;
    return () => socket.disconnect();
  }, [tableId, user?.token]);

  const emit = (event, data) => socketRef.current?.emit(event, data);
  return { socketRef, emit, connected };
}
