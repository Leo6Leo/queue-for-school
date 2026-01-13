// Sound effects utilities

// Create a simple notification sound using Web Audio API
export const playNotificationSound = () => {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Create a pleasant notification chime
        const playTone = (freq, startTime, duration) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = freq;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        };

        const now = audioContext.currentTime;
        // Play a pleasant two-tone chime
        playTone(880, now, 0.15);        // A5
        playTone(1108.73, now + 0.15, 0.2); // C#6
        playTone(1318.51, now + 0.35, 0.3); // E6

    } catch (e) {
        console.log('Audio not supported:', e);
    }
};

// Play an urgent alert sound for "it's your turn"
export const playUrgentSound = () => {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const playTone = (freq, startTime, duration, volume = 0.4) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = freq;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
            gainNode.gain.linearRampToValueAtTime(volume * 0.7, startTime + duration * 0.5);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        };

        const now = audioContext.currentTime;

        // Play an attention-grabbing sequence
        // First phrase
        playTone(523.25, now, 0.1);        // C5
        playTone(659.25, now + 0.1, 0.1);  // E5
        playTone(783.99, now + 0.2, 0.15); // G5
        playTone(1046.50, now + 0.35, 0.25); // C6

        // Second phrase (repeat higher)
        playTone(659.25, now + 0.7, 0.1);  // E5
        playTone(783.99, now + 0.8, 0.1);  // G5
        playTone(1046.50, now + 0.9, 0.15); // C6
        playTone(1318.51, now + 1.05, 0.35); // E6

    } catch (e) {
        console.log('Audio not supported:', e);
    }
};

// Play a satisfying sound for following a question (me too!)
export const playMeTooSound = () => {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const playTone = (freq, startTime, duration, volume = 0.2) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = freq;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        };

        const now = audioContext.currentTime;
        // Rising cheerful chime
        playTone(523.25, now, 0.1, 0.15);        // C5
        playTone(659.25, now + 0.08, 0.1, 0.2);  // E5
        playTone(783.99, now + 0.16, 0.15, 0.25); // G5
        playTone(1046.50, now + 0.24, 0.2, 0.2);  // C6

    } catch (e) {
        console.log('Audio not supported:', e);
    }
};

// Play a pop sound for unfollowing
export const playPopSound = () => {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.08);
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.08);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.08);

    } catch (e) {
        console.log('Audio not supported:', e);
    }
};

// Play a soft click sound (keeping for compatibility)
export const playClickSound = () => {
    playPopSound();
};

// Play a success sound for check-in
export const playSuccessSound = () => {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const playTone = (freq, startTime, duration) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = freq;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        };

        const now = audioContext.currentTime;
        // Success chime - ascending
        playTone(523.25, now, 0.12);       // C5
        playTone(659.25, now + 0.1, 0.12); // E5
        playTone(783.99, now + 0.2, 0.2);  // G5

    } catch (e) {
        console.log('Audio not supported:', e);
    }
};
