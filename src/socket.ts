import { io } from 'socket.io-client';
import { getAuthToken } from './utils/auth';

// Determine the socket URL:
// 1. Use VITE_SOCKET_URL if explicitly set (for custom deployments)
// 2. In development, use localhost:3001
// 3. In production, connect to the same origin (frontend and backend on same server)
const getSocketUrl = (): string | undefined => {
    if (import.meta.env.VITE_SOCKET_URL) {
        return import.meta.env.VITE_SOCKET_URL;
    }
    if (import.meta.env.DEV) {
        return 'http://localhost:3001';
    }
    // In production, use same origin - Socket.IO will connect to window.location.origin
    return undefined;
};

const SOCKET_URL = getSocketUrl();

// Log the connection URL for debugging (only in browser console)
if (typeof window !== 'undefined') {
    console.log('[Socket] Connecting to:', SOCKET_URL || 'same origin');
}

export const socket = io(SOCKET_URL, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: {
        token: getAuthToken() ?? undefined,
    },
});

export const setSocketAuthToken = (token: string | null): void => {
    socket.auth = {
        token: token ?? undefined,
    };
};

export const connectSocket = (): void => {
    if (!socket.connected) {
        socket.connect();
    }
};

export const disconnectSocket = (): void => {
    if (socket.connected) {
        socket.disconnect();
    }
};

// Expose for E2E testing
if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).socket = socket;
}

export default socket;
