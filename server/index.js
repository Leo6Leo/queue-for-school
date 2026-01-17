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

// Room storage: Map<roomName, { marking: [], question: [] }>
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
    // Convert Map to Object for JSON serialization
    const dataToSave = Object.fromEntries(rooms);
    const tempFile = `${DATA_FILE}.tmp`;
    
    fs.writeFile(tempFile, JSON.stringify(dataToSave, null, 2), (err) => {
        if (err) {
            console.error('Error writing temp queue data:', err);
            isSaving = false;
            return;
        }

        // Atomic rename
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
            // Convert Object back to Map
            rooms = new Map(Object.entries(parsedData));
            console.log('Queue data loaded from disk.');
        }
    } catch (err) {
        console.error('Error loading queue data:', err);
    }
};

// Helper to get or create room
const getRoom = (roomName) => {
    if (!rooms.has(roomName)) {
        rooms.set(roomName, { marking: [], question: [] });
    }
    return rooms.get(roomName);
};

// Load initial data
loadQueues();

// Track connected users by their persistent userId
const userSockets = new Map(); // userId -> Set of socketIds

// Register a socket for a user
const registerUserSocket = (userId, socketId) => {
    if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socketId);
};

// Unregister a socket for a user
const unregisterUserSocket = (userId, socketId) => {
    if (userSockets.has(userId)) {
        userSockets.get(userId).delete(socketId);
        if (userSockets.get(userId).size === 0) {
            userSockets.delete(userId);
        }
    }
};

// Emit to all sockets of a user
const emitToUser = (userId, event, data) => {
    if (userSockets.has(userId)) {
        userSockets.get(userId).forEach(socketId => {
            io.to(socketId).emit(event, data);
        });
    }
};

// Check if user has any connected sockets
const isUserConnected = (userId) => {
    return userSockets.has(userId) && userSockets.get(userId).size > 0;
};

// Broadcast queue updates to a specific room
const broadcastQueues = (roomName) => {
    const queues = getRoom(roomName);
    
    const getQueueWithPositions = (queue) => {
        let waitingCount = 0;
        return queue.map((item) => {
            if (item.status === 'waiting' || item.status === 'called') {
                waitingCount++;
                return { ...item, position: waitingCount };
            }
            return { ...item, position: 0 }; // 0 for assisting
        });
    };

    io.to(roomName).emit('queues-update', {
        marking: getQueueWithPositions(queues.marking),
        question: getQueueWithPositions(queues.question)
    });
};

// Notify user when their turn is approaching
const notifyUpcoming = (roomName, queueType, position, userId) => {
    if (queueType === 'question') return; // Do not notify question queue

    // Notify if they are next (1) or have 1 person ahead (2)
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
    let currentRoom = null;

    // Register user with their persistent ID and room
    socket.on('register-user', ({ userId, room }) => {
        if (!room) return; // Ignore if no room specified
        
        currentUserId = userId;
        currentRoom = room;
        
        // Join the socket.io room
        socket.join(room);
        
        registerUserSocket(userId, socket.id);
        console.log(`User ${userId} registered in room ${room}`);

        // Send current queue state for this room
        broadcastQueues(room);

        // Check if user is already in any queue in this room and send their entries
        const queues = getRoom(room);
        
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
    });

    // Join marking queue
    socket.on('join-marking', ({ name, studentId, email, userId, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        
        // Check if already in queue by userId
        const existingIndex = queues.marking.findIndex(
            item => item.userId === userId
        );

        if (existingIndex !== -1) {
            socket.emit('error', { message: 'You are already in the marking queue.' });
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

        console.log(`${name} (${userId}) joined marking queue in room ${room}`);
        broadcastQueues(room);

        // Notify all tabs of this user
        emitToUser(userId, 'joined-queue', {
            queueType: 'marking',
            position: queues.marking.length,
            entryId: entry.id
        });
    });

    // Join question queue
    socket.on('join-question', ({ name, email, description, userId, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        
        // Check if already in queue by userId
        const existingIndex = queues.question.findIndex(
            item => item.userId === userId
        );

        if (existingIndex !== -1) {
            socket.emit('error', { message: 'You are already in the question queue.' });
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

        console.log(`${name} (${userId}) joined question queue in room ${room}`);
        broadcastQueues(room);

        emitToUser(userId, 'joined-queue', {
            queueType: 'question',
            position: queues.question.length,
            entryId: entry.id
        });
    });

    // Leave queue
    socket.on('leave-queue', ({ queueType, entryId, userId, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        const queue = queues[queueType];
        
        const index = queue.findIndex(item => item.id === entryId);

        if (index !== -1) {
            queue.splice(index, 1);
            saveQueues();
            console.log(`Entry ${entryId} left ${queueType} queue in room ${room}`);

            emitToUser(userId, 'left-queue', { queueType, entryId });

            broadcastQueues(room);

            // Notify people who moved up
            queue.filter(item => item.status === 'waiting').slice(0, 3).forEach((item, idx) => {
                notifyUpcoming(room, queueType, idx + 1, item.userId);
            });
        }
    });

    // Follow a question (+1)
    socket.on('follow-question', ({ entryId, userId, name, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        const entry = queues.question.find(item => item.id === entryId);

        if (!entry) {
            socket.emit('error', { message: 'Question not found.' });
            return;
        }

        if (entry.followers.some(f => f.userId === userId)) {
            socket.emit('error', { message: 'You are already following this question.' });
            return;
        }

        if (entry.userId === userId) {
            socket.emit('error', { message: 'You cannot follow your own question.' });
            return;
        }

        entry.followers.push({ userId, name });
        saveQueues();

        broadcastQueues(room);

        emitToUser(userId, 'following-question', { entryId });
    });

    // Unfollow a question
    socket.on('unfollow-question', ({ entryId, userId, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        const entry = queues.question.find(item => item.id === entryId);

        if (!entry) {
            return;
        }

        const followerIndex = entry.followers.findIndex(f => f.userId === userId);
        if (followerIndex !== -1) {
            entry.followers.splice(followerIndex, 1);
            saveQueues();
            broadcastQueues(room);
            emitToUser(userId, 'unfollowed-question', { entryId });
        }
    });

    // Student: Push back position
    socket.on('push-back', ({ queueType, entryId, userId, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        const queue = queues[queueType];
        const index = queue.findIndex(item => item.id === entryId);

        if (index !== -1) {
            if (queue[index].status !== 'waiting') return;

            const item = queue[index];
            let newIndex = index + 1;
            if (newIndex >= queue.length) {
                newIndex = queue.length - 1;
            }

            if (newIndex !== index) {
                queue.splice(index, 1);
                queue.splice(newIndex, 0, item);
                
                if (newIndex > 0) {
                    const prevItem = queue[newIndex - 1];
                    const prevTime = new Date(prevItem.joinedAt).getTime();
                    item.joinedAt = new Date(prevTime + 1000).toISOString();
                }
                
                saveQueues();

                console.log(`User ${userId} pushed back in ${queueType} queue in room ${room}`);
                broadcastQueues(room);
                
                emitToUser(userId, 'pushed-back', { 
                    queueType, 
                    position: newIndex + 1 
                });
            }
        }
    });

    // TA: Call next person
    socket.on('ta-checkin', ({ queueType, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        
        let targetQueue = queueType;
        let entry = null;

        if (queueType === 'combined') {
            const markingTop = queues.marking.find(item => item.status === 'waiting');
            const questionTop = queues.question.find(item => item.status === 'waiting');

            if (!markingTop && !questionTop) {
                socket.emit('error', { message: `No one waiting in any queue.` });
                return;
            }

            if (markingTop && questionTop) {
                if (new Date(markingTop.joinedAt) < new Date(questionTop.joinedAt)) {
                    targetQueue = 'marking';
                    entry = markingTop;
                } else {
                    targetQueue = 'question';
                    entry = questionTop;
                }
            } else if (markingTop) {
                targetQueue = 'marking';
                entry = markingTop;
            } else {
                targetQueue = 'question';
                entry = questionTop;
            }
        } else {
            entry = queues[queueType].find(item => item.status === 'waiting');
        }

        if (!entry) {
            socket.emit('error', { message: `No one waiting in the ${targetQueue} queue.` });
            return;
        }

        entry.status = 'called';
        saveQueues();
        console.log(`TA called ${entry.name} from ${targetQueue} queue in room ${room}`);

        emitToUser(entry.userId, 'being-called', {
            queueType: targetQueue,
            message: `You are called. Please raise your hand.`
        });

        if (targetQueue === 'question' && entry.followers && entry.followers.length > 0) {
            entry.followers.forEach(follower => {
                emitToUser(follower.userId, 'being-called', {
                    queueType: 'question',
                    message: `A question you're following is being answered! Please come join.`,
                    isFollower: true,
                    originalEntryId: entry.id
                });
            });
        }

        broadcastQueues(room);
    });

    // TA: Call specific person
    socket.on('ta-call-specific', ({ queueType, entryId, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        
        let entry;
        let finalQueueType = queueType;

        if (queueType === 'combined') {
             entry = queues.marking.find(i => i.id === entryId);
             if (entry) finalQueueType = 'marking';
             else {
                 entry = queues.question.find(i => i.id === entryId);
                 if (entry) finalQueueType = 'question';
             }
        } else {
             entry = queues[queueType].find(item => item.id === entryId);
        }

        if (entry) {
            entry.status = 'called';
            saveQueues();

            emitToUser(entry.userId, 'being-called', {
                queueType: finalQueueType,
                message: `TA will be with you shortly. Please raise your hand.`
            });

            if (finalQueueType === 'question' && entry.followers && entry.followers.length > 0) {
                entry.followers.forEach(follower => {
                    emitToUser(follower.userId, 'being-called', {
                        queueType: 'question',
                        message: `A question you're following is being answered! Please come join.`,
                        isFollower: true,
                        originalEntryId: entryId
                    });
                });
            }

            broadcastQueues(room);
        }
    });
    
    // TA: Cancel Call
    socket.on('ta-cancel-call', ({ queueType, entryId, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        
        let entry;
        let finalQueueType = queueType;

        if (queueType === 'combined') {
             entry = queues.marking.find(i => i.id === entryId);
             if (entry) finalQueueType = 'marking';
             else {
                 entry = queues.question.find(i => i.id === entryId);
                 if (entry) finalQueueType = 'question';
             }
        } else {
             entry = queues[queueType].find(item => item.id === entryId);
        }

        if (entry && entry.status === 'called') {
            entry.status = 'waiting';
            saveQueues();
            console.log(`TA cancelled call for ${entry.name} in room ${room}`);

            const queue = queues[finalQueueType];
            const position = queue.filter(item => item.status === 'waiting' || item.status === 'called').indexOf(entry) + 1;

            emitToUser(entry.userId, 'pushed-back', {
                queueType: finalQueueType,
                position: position
            });

            broadcastQueues(room);
        }
    });

    // TA: Start Assisting
    socket.on('ta-start-assisting', ({ queueType, entryId, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        
        let entry;
        let finalQueueType = queueType;

        if (queueType === 'combined') {
             entry = queues.marking.find(i => i.id === entryId);
             if (entry) finalQueueType = 'marking';
             else {
                 entry = queues.question.find(i => i.id === entryId);
                 if (entry) finalQueueType = 'question';
             }
        } else {
             entry = queues[queueType].find(item => item.id === entryId);
        }

        if (entry) {
            entry.status = 'assisting';
            saveQueues();
            
            emitToUser(entry.userId, 'assisting-started', {
                queueType: finalQueueType,
                message: `The TA has started assisting you.`
            });

            broadcastQueues(room);
        }
    });

    // TA: Complete serving
    socket.on('ta-next', ({ queueType, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        
        const queuesToProcess = (queueType === 'combined') 
            ? ['marking', 'question'] 
            : [queueType];

        let anyChanged = false;

        queuesToProcess.forEach(qType => {
            const queue = queues[qType];
            const assisting = queue.filter(item => item.status === 'assisting');
            
            if (assisting.length > 0) {
                anyChanged = true;
                
                queues[qType] = queue.filter(item => item.status !== 'assisting');
                
                assisting.forEach(removed => {
                    if (qType === 'marking') {
                        emitToUser(removed.userId, 'finished-assisting', {
                            queueType: qType,
                            message: `The TA has finished assisting you. Hope that helped!`
                        });
                    }
                });

                if (qType === 'marking') {
                    queues[qType].filter(item => item.status === 'waiting').slice(0, 3).forEach((item, idx) => {
                        notifyUpcoming(room, qType, idx + 1, item.userId);
                    });
                }
            }
        });
        
        if (anyChanged) {
            saveQueues();
            broadcastQueues(room);
        }
    });

    // TA: Remove specific person
    socket.on('ta-remove', ({ queueType, entryId, room }) => {
        if (!room) return;
        const queues = getRoom(room);
        const queue = queues[queueType];
        
        const index = queue.findIndex(item => item.id === entryId);

        if (index !== -1) {
            const removed = queue.splice(index, 1)[0];
            saveQueues();

            emitToUser(removed.userId, 'removed-from-queue', {
                queueType,
                message: `You have been removed from the ${queueType} queue.`
            });

            broadcastQueues(room);
        }
    });

    // TA: Clear all queues
    socket.on('ta-clear-all', ({ room }) => {
        if (!room) return;
        const queues = getRoom(room);
        
        queues.marking = [];
        queues.question = [];
        saveQueues();
        console.log(`TA cleared all queues in room ${room}`);
        broadcastQueues(room);
        
        // Notify all users in this room (via socket room)
        io.to(room).emit('removed-from-queue', {
            message: 'The queue has been reset by the TA.'
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);

        if (currentUserId) {
            unregisterUserSocket(currentUserId, socket.id);
        }
    });
});

// TA Authentication endpoint
const TA_PASSWORD = process.env.TA_PASSWORD || 'ece297ta';

app.post('/api/ta-auth', (req, res) => {
    const { password } = req.body;

    if (password === TA_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Incorrect password' });
    }
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Queue server running on port ${PORT}`);
});