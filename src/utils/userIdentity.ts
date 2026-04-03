// User identity management across tabs
import { v4 as uuidv4 } from 'uuid';
import type { UserData } from '../types';

const USER_ID_KEY = 'ece297-queue-user-id';
const USER_DATA_KEY = 'ece297-queue-user-data';

// Get or create a unique user ID that persists across tabs and sessions
export const getUserId = (): string => {
    let userId = localStorage.getItem(USER_ID_KEY);

    if (!userId) {
        userId = uuidv4();
        localStorage.setItem(USER_ID_KEY, userId);
    }

    return userId;
};

// Save user data (name, entries, etc.)
export const saveUserData = (data: UserData): void => {
    localStorage.setItem(USER_DATA_KEY, JSON.stringify({
        ...data,
        updatedAt: Date.now()
    }));

    // Dispatch storage event for other tabs
    window.dispatchEvent(new StorageEvent('storage', {
        key: USER_DATA_KEY,
        newValue: JSON.stringify(data)
    }));
};

// Get saved user data
export const getUserData = (): UserData | null => {
    const data = localStorage.getItem(USER_DATA_KEY);
    return data ? JSON.parse(data) : null;
};

// Clear user data (on logout or leave)
export const clearUserData = (): void => {
    localStorage.removeItem(USER_DATA_KEY);
};

// Listen for changes from other tabs
export const onUserDataChange = (callback: (data: UserData | null) => void): (() => void) => {
    const handler = (event: StorageEvent) => {
        if (event.key === USER_DATA_KEY) {
            const data = event.newValue ? JSON.parse(event.newValue) : null;
            callback(data);
        }
    };

    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
};
