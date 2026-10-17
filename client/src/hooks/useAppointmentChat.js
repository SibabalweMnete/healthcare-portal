import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function useAppointmentChat({ appointmentId, token }) {
  const socketRef = useRef(null);
  const joinedRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setMessages([]);
    setError('');
    setConnected(false);
    setJoined(false);
    joinedRef.current = false;

    if (!appointmentId || !token) {
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: true,
    });
    socketRef.current = socket;

    const joinAppointment = () => {
      joinedRef.current = false;
      setJoined(false);
      socket.emit('join_appointment', { appointmentId }, (result) => {
        if (!result || !result.ok) {
          setError(result?.error || 'Unable to join appointment chat.');
          return;
        }
        setError('');
        joinedRef.current = true;
        setJoined(true);
      });
    };
    const handleMessage = (message) => {
      if (message.appointmentId === appointmentId) {
        setMessages((current) => [...current, message]);
      }
    };
    const handleConnect = () => {
      setConnected(true);
      joinAppointment();
    };
    const handleDisconnect = () => {
      setConnected(false);
      joinedRef.current = false;
      setJoined(false);
    };
    const handleConnectError = (socketError) => {
      setError(socketError.message || 'Unable to connect to chat.');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('receive_message', handleMessage);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('receive_message', handleMessage);
      socket.disconnect();
      socketRef.current = null;
      joinedRef.current = false;
    };
  }, [appointmentId, token]);

  const sendMessage = useCallback((messageText) => new Promise((resolve) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected || !joinedRef.current) {
      const result = { ok: false, error: 'You are not connected to this appointment chat.' };
      setError(result.error);
      resolve(result);
      return;
    }

    socket.emit('send_message', { appointmentId, messageText }, (result) => {
      if (!result?.ok) {
        setError(result?.error || 'Unable to send message.');
        resolve({ ok: false, error: result?.error || 'Unable to send message.' });
        return;
      }
      setError('');
      resolve(result);
    });
  }), [appointmentId]);

  return { connected, joined, messages, error, sendMessage };
}
