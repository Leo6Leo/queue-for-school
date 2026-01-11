// Request notification permission
export const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return false;
    }

    if (Notification.permission === 'granted') {
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }

    return false;
};

// Send browser notification
export const sendNotification = (title, options = {}) => {
    if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
            icon: '/vite.svg',
            badge: '/vite.svg',
            vibrate: [200, 100, 200],
            ...options,
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };

        // Auto close after 10 seconds
        setTimeout(() => notification.close(), 10000);

        return notification;
    }
};

// Check if notifications are supported and enabled
export const isNotificationEnabled = () => {
    return 'Notification' in window && Notification.permission === 'granted';
};

export const getNotificationPermissionStatus = () => {
    if (!('Notification' in window)) {
        return 'unsupported';
    }
    return Notification.permission;
};
