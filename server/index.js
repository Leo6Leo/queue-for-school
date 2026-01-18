import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'queue_data.json');

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Room storage: Map<roomName, { marking: [], question: [], password: string|null }>
let rooms = new Map();

// Persistence functions
let isSaving = false;
let saveScheduled = false;

const saveQueues = () => {
    if (isSaving) {
        saveScheduled = true;
        return;
    }

    isSaving = true;
    const dataToSave = Object.fromEntries(rooms);
    const tempFile = `${DATA_FILE}.tmp`;

    fs.writeFile(tempFile, JSON.stringify(dataToSave, null, 2), (err) => {
        if (err) {
            console.error('Error writing temp queue data:', err);
            isSaving = false;
            return;
        }

        fs.rename(tempFile, DATA_FILE, (renameErr) => {
            isSaving = false;
            if (renameErr) console.error('Error renaming queue data file:', renameErr);

            if (saveScheduled) {
                saveScheduled = false;
                saveQueues();
            }
        });
    });
};

const loadQueues = () => {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            const parsedData = JSON.parse(data);
            rooms = new Map(Object.entries(parsedData));
            console.log('Queue data loaded from disk.');
        }
    } catch (err) {
        console.error('Error loading queue data:', err);
    }
};

// Helper to get or create room (modified to not auto-create on get, only on claim/join if exists)
// Actually, for students joining, we can auto-create basic structure but without password it's "unclaimed"
const getRoom = (roomName) => {
    if (!rooms.has(roomName)) {
        rooms.set(roomName, { marking: [], question: [], password: null });
    }
    return rooms.get(roomName);
};

// Load initial data
loadQueues();

// Track connected users
const userSockets = new Map();

const registerUserSocket = (userId, socketId) => {
    if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socketId);
};

const unregisterUserSocket = (userId, socketId) => {
    if (userSockets.has(userId)) {
        userSockets.get(userId).delete(socketId);
        if (userSockets.get(userId).size === 0) {
            userSockets.delete(userId);
        }
    }
};

const emitToUser = (userId, event, data) => {
    if (userSockets.has(userId)) {
        userSockets.get(userId).forEach(socketId => {
            io.to(socketId).emit(event, data);
        });
    }
};

// Check if user is in any queue in any room (cross-room check)
const findUserInAnyRoom = (userId) => {
    for (const [roomName, roomData] of rooms.entries()) {
        if (!roomData || !Array.isArray(roomData.marking) || !Array.isArray(roomData.question)) continue;
        
        const inMarking = roomData.marking.find(item => item.userId === userId);
        if (inMarking) {
            return { room: roomName, queueType: 'marking', entry: inMarking };
        }
        
        const inQuestion = roomData.question.find(item => item.userId === userId);
        if (inQuestion) {
            return { room: roomName, queueType: 'question', entry: inQuestion };
        }
    }
    return null;
};

// Remove user from all queues in a specific room
const removeUserFromRoom = (userId, roomName) => {
    if (!rooms.has(roomName)) return false;
    
    const queues = rooms.get(roomName);
    let removed = false;
    
    const markingIndex = queues.marking.findIndex(item => item.userId === userId);
    if (markingIndex !== -1) {
        queues.marking.splice(markingIndex, 1);
        removed = true;
    }
    
    const questionIndex = queues.question.findIndex(item => item.userId === userId);
    if (questionIndex !== -1) {
        queues.question.splice(questionIndex, 1);
        removed = true;
    }
    
    // Also remove from followers
    queues.question.forEach(entry => {
        if (entry.followers) {
            const followerIndex = entry.followers.findIndex(f => f.userId === userId);
            if (followerIndex !== -1) {
                entry.followers.splice(followerIndex, 1);
                removed = true;
            }
        }
    });
    
    return removed;
};

// Broadcast room list to all connected clients (for "All Rooms" view)
const broadcastRoomsList = () => {
    const roomList = Array.from(rooms.entries())
        .filter(([name, data]) => data && Array.isArray(data.marking) && Array.isArray(data.question))
        .map(([name, data]) => ({
            name,
            markingCount: data.marking.length,
            questionCount: data.question.length,
            hasPassword: !!data.password
        }));
    io.emit('rooms-list-update', roomList);
};

// Broadcast queue updates to a specific room
const broadcastQueues = (roomName) => {
    if (!rooms.has(roomName)) return; // Room might be deleted
    const queues = rooms.get(roomName);

    const getQueueWithPositions = (queue) => {
        let waitingCount = 0;
        return queue.map((item) => {
            if (item.status === 'waiting' || item.status === 'called') {
                waitingCount++;
                return { ...item, position: waitingCount };
            }
            return { ...item, position: 0 };
        });
    };

    io.to(roomName).emit('queues-update', {
        marking: getQueueWithPositions(queues.marking),
        question: getQueueWithPositions(queues.question)
    });

    // Also broadcast room list update for "All Rooms" view
    broadcastRoomsList();
};

const notifyUpcoming = (roomName, queueType, position, userId) => {
    if (queueType === 'question') return;

    if (position === 1 || position === 2) {
        emitToUser(userId, 'turn-approaching', {
            queueType,
            position,
            message: position === 1
                ? "You're next! Please stay on the page."
                : "Be prepared. Only one person is ahead of you."
        });
    }
};

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    let currentUserId = null;

    socket.on('register-user', ({ userId, room }) => {
        if (!room) return;

        currentUserId = userId;
        socket.join(room);
        registerUserSocket(userId, socket.id);
        console.log(`User ${userId} registered in room ${room}`);

        // If room exists, broadcast state
        if (rooms.has(room)) {
            broadcastQueues(room);
            const queues = rooms.get(room);

            const getEntryInfo = (queue) => {
                const entry = queue.find(item => item.userId === userId);
                if (!entry) return null;

                let position = 0;
                if (entry.status === 'waiting' || entry.status === 'called') {
                    position = queue.filter(item => item.status === 'waiting' || item.status === 'called').indexOf(entry) + 1;
                }

                return {
                    entryId: entry.id,
                    position,
                    status: entry.status
                };
            };

            socket.emit('restore-entries', {
                marking: getEntryInfo(queues.marking),
                question: getEntryInfo(queues.question)
            });
        }
    });

    // ... [Previous socket event handlers for join, leave, etc. remain largely the same but verify room existence] ...
    // To save tokens/space, I will implement them using the getRoom helper which auto-creates.
    // However, for robust room management, we might want to restrict creating rooms via socket only?
    // For now, consistent with previous design: any usage creates the room structure in memory.

    socket.on('join-marking', ({ name, studentId, email, userId, room }) => {
        if (!room) return;
        const queues = getRoom(room);

        // Check if already in this room's marking queue
        const existingIndex = queues.marking.findIndex(item => item.userId === userId);
        if (existingIndex !== -1) {
            socket.emit('error', { message: 'You are already in the marking queue.' });
            return;
        }

        // Check if user is in any other room's queue
        const otherRoomEntry = findUserInAnyRoom(userId);
        if (otherRoomEntry && otherRoomEntry.room !== room) {
            socket.emit('error', { 
                message: `You are already in a queue in room "${otherRoomEntry.room}". Please leave that queue first before joining another room.`,
                existingRoom: otherRoomEntry.room,
                existingQueueType: otherRoomEntry.queueType
            });
            return;
        }

        const entry = {
            id: uuidv4(),
            name,
            studentId,
            email: email || null,
            joinedAt: new Date().toISOString(),
            userId,
            status: 'waiting'
        };

        queues.marking.push(entry);
        saveQueues();
        broadcastQueues(room);

        emitToUser(userId, 'joined-queue', {
            queueType: 'marking',
            position: queues.marking.length,
            entryId: entry.id
        });
    });

    socket.on('join-question', ({ name, email, description, userId, room }) => {
        if (!room) return;
        const queues = getRoom(room);

        // Check if already in this room's question queue
        const existingIndex = queues.question.findIndex(item => item.userId === userId);
        if (existingIndex !== -1) {
            socket.emit('error', { message: 'You are already in the question queue.' });
            return;
        }

        // Check if user is in any other room's queue
        const otherRoomEntry = findUserInAnyRoom(userId);
        if (otherRoomEntry && otherRoomEntry.room !== room) {
            socket.emit('error', { 
                message: `You are already in a queue in room "${otherRoomEntry.room}". Please leave that queue first before joining another room.`,
                existingRoom: otherRoomEntry.room,
                existingQueueType: otherRoomEntry.queueType
            });
            return;
        }

        const entry = {
            id: uuidv4(),
            name,
            email: email || null,
            description: description || null,
            joinedAt: new Date().toISOString(),
            userId,
            status: 'waiting',
            followers: []
        };

        queues.question.push(entry);
        saveQueues();
        broadcastQueues(room);

        emitToUser(userId, 'joined-queue', {
            queueType: 'question',
            position: queues.question.length,
            entryId: entry.id
        });
    });

    socket.on('leave-queue', ({ queueType, entryId, userId, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        const queue = queues[queueType];

        const index = queue.findIndex(item => item.id === entryId);

        if (index !== -1) {
            queue.splice(index, 1);
            saveQueues();
            emitToUser(userId, 'left-queue', { queueType, entryId });
            broadcastQueues(room);
            queue.filter(item => item.status === 'waiting').slice(0, 3).forEach((item, idx) => {
                notifyUpcoming(room, queueType, idx + 1, item.userId);
            });
        }
    });

    socket.on('follow-question', ({ entryId, userId, name, room }) => {
        if (!room) return;
        
        // Check if user is in a queue in another room
        const otherRoomEntry = findUserInAnyRoom(userId);
        if (otherRoomEntry && otherRoomEntry.room !== room) {
            socket.emit('error', { 
                message: `You cannot follow questions while in a queue in room "${otherRoomEntry.room}". Please leave that queue first.`,
                existingRoom: otherRoomEntry.room,
                existingQueueType: otherRoomEntry.queueType
            });
            return;
        }
        
        const queues = getRoom(room);
        const entry = queues.question.find(item => item.id === entryId);

        if (!entry || entry.userId === userId || entry.followers.some(f => f.userId === userId)) {
            socket.emit('error', { message: 'Cannot follow question.' });
            return;
        }

        entry.followers.push({ userId, name });
        saveQueues();
        broadcastQueues(room);
        emitToUser(userId, 'following-question', { entryId });
    });

    socket.on('unfollow-question', ({ entryId, userId, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        const entry = queues.question.find(item => item.id === entryId);

        if (entry) {
            const followerIndex = entry.followers.findIndex(f => f.userId === userId);
            if (followerIndex !== -1) {
                entry.followers.splice(followerIndex, 1);
                saveQueues();
                broadcastQueues(room);
                emitToUser(userId, 'unfollowed-question', { entryId });
            }
        }
    });

    socket.on('push-back', ({ queueType, entryId, userId, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        const queue = queues[queueType];
        const index = queue.findIndex(item => item.id === entryId);

        if (index !== -1 && queue[index].status === 'waiting') {
            const item = queue[index];
            let newIndex = Math.min(index + 1, queue.length - 1);

            if (newIndex !== index) {
                queue.splice(index, 1);
                queue.splice(newIndex, 0, item);
                if (newIndex > 0) {
                    const prevItem = queue[newIndex - 1];
                    item.joinedAt = new Date(new Date(prevItem.joinedAt).getTime() + 1000).toISOString();
                }
                saveQueues();
                broadcastQueues(room);
                emitToUser(userId, 'pushed-back', { queueType, position: newIndex + 1 });
            }
        }
    });

    socket.on('ta-checkin', ({ queueType, room }) => {
        if (!room) return;
        // Validate queueType to prevent server crash
        if (!['marking', 'question', 'combined'].includes(queueType)) {
            socket.emit('error', { message: 'Invalid queue type' });
            return;
        }
        const queues = getRoom(room);

        let targetQueue = queueType;
        let entry = null;

        if (queueType === 'combined') {
            const markingTop = queues.marking.find(item => item.status === 'waiting');
            const questionTop = queues.question.find(item => item.status === 'waiting');

            if (markingTop && questionTop) {
                if (new Date(markingTop.joinedAt) < new Date(questionTop.joinedAt)) {
                    targetQueue = 'marking'; entry = markingTop;
                } else {
                    targetQueue = 'question'; entry = questionTop;
                }
            } else if (markingTop) { targetQueue = 'marking'; entry = markingTop; }
            else if (questionTop) { targetQueue = 'question'; entry = questionTop; }
        } else {
            entry = queues[queueType].find(item => item.status === 'waiting');
        }

        if (entry) {
            entry.status = 'called';
            saveQueues();
            emitToUser(entry.userId, 'being-called', { queueType: targetQueue, message: `You are called. Please raise your hand.` });

            if (targetQueue === 'question' && entry.followers) {
                entry.followers.forEach(f => emitToUser(f.userId, 'being-called', { queueType: 'question', message: 'A question you follow is being answered!' }));
            }
            broadcastQueues(room);
        }
    });

    socket.on('ta-call-specific', ({ queueType, entryId, room }) => {
        if (!room) return;
        if (!['marking', 'question', 'combined'].includes(queueType)) return;
        const queues = getRoom(room);
        let entry = queueType === 'combined'
            ? (queues.marking.find(i => i.id === entryId) || queues.question.find(i => i.id === entryId))
            : queues[queueType]?.find(item => item.id === entryId);

        if (entry) {
            entry.status = 'called';
            saveQueues();
            const realType = queues.marking.includes(entry) ? 'marking' : 'question';
            emitToUser(entry.userId, 'being-called', { queueType: realType, message: `TA will be with you shortly.` });
            if (realType === 'question' && entry.followers) {
                entry.followers.forEach(f => emitToUser(f.userId, 'being-called', { queueType: 'question', message: 'A question you follow is being answered!' }));
            }
            broadcastQueues(room);
        }
    });

    socket.on('ta-cancel-call', ({ queueType, entryId, room }) => {
        if (!room) return;
        if (!['marking', 'question', 'combined'].includes(queueType)) return;
        const queues = getRoom(room);
        let entry = queueType === 'combined'
            ? (queues.marking.find(i => i.id === entryId) || queues.question.find(i => i.id === entryId))
            : queues[queueType]?.find(item => item.id === entryId);

        if (entry && entry.status === 'called') {
            entry.status = 'waiting';
            saveQueues();
            const realType = queues.marking.includes(entry) ? 'marking' : 'question';
            const pos = queues[realType].filter(i => i.status === 'waiting' || i.status === 'called').indexOf(entry) + 1;
            emitToUser(entry.userId, 'pushed-back', { queueType: realType, position: pos });
            broadcastQueues(room);
        }
    });

    socket.on('ta-start-assisting', ({ queueType, entryId, room }) => {
        if (!room) return;
        if (!['marking', 'question', 'combined'].includes(queueType)) return;
        const queues = getRoom(room);
        let entry = queueType === 'combined'
            ? (queues.marking.find(i => i.id === entryId) || queues.question.find(i => i.id === entryId))
            : queues[queueType]?.find(item => item.id === entryId);

        if (entry) {
            entry.status = 'assisting';
            saveQueues();
            const realType = queues.marking.includes(entry) ? 'marking' : 'question';
            emitToUser(entry.userId, 'assisting-started', { queueType: realType, message: `The TA has started assisting you.` });
            broadcastQueues(room);
        }
    });

    socket.on('ta-next', ({ queueType, room }) => {
        if (!room) return;
        if (!['marking', 'question', 'combined'].includes(queueType)) return;
        const queues = getRoom(room);
        const types = queueType === 'combined' ? ['marking', 'question'] : [queueType];
        let changed = false;

        types.forEach(qType => {
            const assisting = queues[qType].filter(i => i.status === 'assisting');
            if (assisting.length > 0) {
                changed = true;
                queues[qType] = queues[qType].filter(i => i.status !== 'assisting');
                assisting.forEach(removed => {
                    if (qType === 'marking') emitToUser(removed.userId, 'finished-assisting', { queueType: qType, message: `Session finished.` });
                });
                if (qType === 'marking') {
                    queues[qType].filter(i => i.status === 'waiting').slice(0, 3).forEach((item, idx) => notifyUpcoming(room, qType, idx + 1, item.userId));
                }
            }
        });

        if (changed) {
            saveQueues();
            broadcastQueues(room);
        }
    });

    socket.on('ta-remove', ({ queueType, entryId, room }) => {
        if (!room) return;
        if (!['marking', 'question'].includes(queueType)) return;
        const queues = getRoom(room);
        const queue = queues[queueType];
        if (!queue) return;
        const index = queue.findIndex(item => item.id === entryId);
        if (index !== -1) {
            const removed = queue.splice(index, 1)[0];
            saveQueues();
            emitToUser(removed.userId, 'removed-from-queue', { queueType, message: `You have been removed.` });
            broadcastQueues(room);
        }
    });

    socket.on('ta-clear-all', ({ room }) => {
        if (!room) return;
        const queues = getRoom(room);
        queues.marking = [];
        queues.question = [];
        saveQueues();
        broadcastQueues(room);
        io.to(room).emit('removed-from-queue', { message: 'Queue reset by TA.' });
    });

    // New: Delete Room
    socket.on('ta-delete-room', ({ room }) => {
        if (!room) return;
        if (rooms.has(room)) {
            rooms.delete(room);
            saveQueues();
            io.to(room).emit('room-deleted', { message: 'This room has been closed by the TA.' });
            io.in(room).socketsLeave(room); // Disconnect all clients from this room
            console.log(`Room ${room} deleted by TA`);
            // Broadcast updated room list
            broadcastRoomsList();
        }
    });

    socket.on('disconnect', () => {
        if (currentUserId) unregisterUserSocket(currentUserId, socket.id);
    });
});

// Authentication & Room Management Endpoints
const MASTER_PASSWORD = process.env.TA_PASSWORD || 'ece297ta';

// 1. Get all rooms (for "All Rooms" view)
app.get('/api/rooms', (req, res) => {
    try {
        const roomList = Array.from(rooms.entries())
            .filter(([name, data]) => data && Array.isArray(data.marking) && Array.isArray(data.question))
            .map(([name, data]) => ({
                name,
                markingCount: data.marking.length,
                questionCount: data.question.length,
                hasPassword: !!data.password
            }));
        res.json(roomList);
    } catch (err) {
        console.error('Error in /api/rooms:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2. Check room status (does it exist? does it have a password?)
app.get('/api/room-status', (req, res) => {
    const { room } = req.query;
    if (!room) return res.status(400).json({ error: 'Room required' });

    if (rooms.has(room)) {
        res.json({ exists: true, hasPassword: !!rooms.get(room).password });
    } else {
        res.json({ exists: false, hasPassword: false });
    }
});

// 3. Claim/Create a room (requires Master Password)
app.post('/api/claim-room', (req, res) => {
    const { room, masterPassword, newPassword } = req.body;

    if (masterPassword !== MASTER_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Incorrect Master Password' });
    }

    const roomData = getRoom(room); // Creates if not exists
    roomData.password = newPassword;
    saveQueues();

    res.json({ success: true });
});

// 4. Room Auth (Login to existing room)
app.post('/api/room-auth', (req, res) => {
    const { room, password } = req.body;

    if (!rooms.has(room)) {
        return res.status(404).json({ success: false, message: 'Room not found' });
    }

    const roomData = rooms.get(room);
    if (roomData.password && roomData.password === password) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Incorrect room password' });
    }
});

// 5. Check user's current room membership
app.get('/api/user-status', (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const existingEntry = findUserInAnyRoom(userId);
    if (existingEntry) {
        res.json({
            inQueue: true,
            room: existingEntry.room,
            queueType: existingEntry.queueType,
            entryId: existingEntry.entry.id,
            status: existingEntry.entry.status
        });
    } else {
        res.json({ inQueue: false });
    }
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Queue server running on port ${PORT}`);
});