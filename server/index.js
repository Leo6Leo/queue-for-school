import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

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

// Queue storage
const queues = {
    marking: [],    // { id, name, studentId, joinedAt, userId, email }
    question: []    // { id, name, joinedAt, userId, email }
};

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

// Broadcast queue updates to all clients
const broadcastQueues = () => {
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

    io.emit('queues-update', {
        marking: getQueueWithPositions(queues.marking),
        question: getQueueWithPositions(queues.question)
    });
};

// Notify user when their turn is approaching
const notifyUpcoming = (queueType, position, userId) => {
    if (position <= 3 && position > 0) {
        emitToUser(userId, 'turn-approaching', {
            queueType,
            position,
            message: position === 1
                ? "You're next! Please be ready."
                : `You're #${position} in the ${queueType} queue.`
        });
    }
};

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    let currentUserId = null;

    // Register user with their persistent ID
    socket.on('register-user', ({ userId }) => {
        currentUserId = userId;
        registerUserSocket(userId, socket.id);
        console.log(`User ${userId} registered with socket ${socket.id}`);

        // Send current queue state
        broadcastQueues();

        // Check if user is already in any queue and send their entries
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
    socket.on('join-marking', ({ name, studentId, email, userId }) => {
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
            status: 'waiting' // Added status
        };

        queues.marking.push(entry);

        console.log(`${name} (${userId}) joined marking queue`);
        broadcastQueues();

        // Notify all tabs of this user
        emitToUser(userId, 'joined-queue', {
            queueType: 'marking',
            position: queues.marking.length,
            entryId: entry.id
        });
    });

    // Join question queue
    socket.on('join-question', ({ name, email, userId }) => {
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
            joinedAt: new Date().toISOString(),
            userId,
            status: 'waiting' // Added status
        };

        queues.question.push(entry);

        console.log(`${name} (${userId}) joined question queue`);
        broadcastQueues();

        // Notify all tabs of this user
        emitToUser(userId, 'joined-queue', {
            queueType: 'question',
            position: queues.question.length,
            entryId: entry.id
        });
    });

    // Leave queue
    socket.on('leave-queue', ({ queueType, entryId, userId }) => {
        const queue = queues[queueType];
        const index = queue.findIndex(item => item.id === entryId);

        if (index !== -1) {
            queue.splice(index, 1);
            console.log(`Entry ${entryId} left ${queueType} queue`);

            // Notify all tabs of this user
            emitToUser(userId, 'left-queue', { queueType, entryId });

            broadcastQueues();

            // Notify people who moved up
            queue.filter(item => item.status === 'waiting').slice(0, 3).forEach((item, idx) => {
                notifyUpcoming(queueType, idx + 1, item.userId);
            });
        }
    });

    // Student: Push back position
    socket.on('push-back', ({ queueType, entryId, userId }) => {
        const queue = queues[queueType];
        const index = queue.findIndex(item => item.id === entryId);

        if (index !== -1) {
            // Only allow pushing back if waiting
            if (queue[index].status !== 'waiting') {
                return;
            }

            const item = queue[index];
            // Calculate new index (current + 2, but capped at queue length)
            let newIndex = index + 2;
            if (newIndex >= queue.length) {
                newIndex = queue.length - 1;
            }

            if (newIndex !== index) {
                // Remove from old position
                queue.splice(index, 1);
                // Insert at new position
                queue.splice(newIndex, 0, item);
                
                // Update joinedAt to be slightly after the person we are now behind
                // This ensures time-based sorting (merged view) respects the new order
                if (newIndex > 0) {
                    const prevItem = queue[newIndex - 1];
                    // Add 1 second to the previous person's time
                    const prevTime = new Date(prevItem.joinedAt).getTime();
                    item.joinedAt = new Date(prevTime + 1000).toISOString();
                } else {
                    // If moved to front (unlikely for push-back), just update to now?
                    // Or keep as is.
                }

                console.log(`User ${userId} pushed back in ${queueType} queue from ${index} to ${newIndex}`);
                broadcastQueues();
                
                // Notify user
                emitToUser(userId, 'pushed-back', { 
                    queueType, 
                    position: newIndex + 1 
                });
            }
        }
    });

    // TA: Call next person (Check-in / Notify to come)
    socket.on('ta-checkin', ({ queueType }) => {
        // If queueType is 'combined', we need to find the oldest waiting entry across queues?
        // For now, let's assume the client tells us which specific queue the top person is in, 
        // OR we handle specific queue types. 
        // But the user asked to merge queues for TA. The command still likely sends 'marking' or 'question' 
        // if the TA clicks on a specific item in the merged list. 
        // However, if there is a general "Call Next" button for the merged queue:
        
        let targetQueue = queueType;
        let entry = null;

        if (queueType === 'combined') {
            // Find the oldest waiting person across both queues
            const markingTop = queues.marking.find(item => item.status === 'waiting');
            const questionTop = queues.question.find(item => item.status === 'waiting');

            if (!markingTop && !questionTop) {
                socket.emit('error', { message: `No one waiting in any queue.` });
                return;
            }

            if (markingTop && questionTop) {
                // Compare timestamps
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
        console.log(`TA called ${entry.name} from ${targetQueue} queue`);

        // Notify the student
        emitToUser(entry.userId, 'being-called', {
            queueType: targetQueue,
            message: `TA will be with you shortly. Please raise your hand.`
        });

        broadcastQueues();
    });

    // TA: Call specific person
    socket.on('ta-call-specific', ({ queueType, entryId }) => {
        // Find entry in specific queue or search both if needed (though UI should pass specific type)
        // If queueType is combined, we must find the item first
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
            console.log(`TA called specific student ${entry.name}`);
            
            emitToUser(entry.userId, 'being-called', {
                queueType: finalQueueType,
                message: `TA will be with you shortly. Please raise your hand.`
            });
            
            broadcastQueues();
        }
    });

    // TA: Start Assisting (Student has arrived)
    socket.on('ta-start-assisting', ({ queueType, entryId }) => {
        // Find entry in specific queue or search both
        let entry;
        let finalQueueType = queueType;

        if (queueType === 'combined') {
             // Find entry by ID in either queue
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
            console.log(`TA started assisting ${entry.name}`);
            
            broadcastQueues();
        }
    });

    // TA: Complete serving (Next student)
    socket.on('ta-next', ({ queueType }) => {
        // If 'combined', we might want to clear ALL assisting students? 
        // Or specific ones? The previous logic cleared ALL assisting in a queue.
        // Let's support clearing all assisting across all queues if 'combined' is sent,
        // or just specific queue.
        
        const queuesToProcess = (queueType === 'combined') 
            ? ['marking', 'question'] 
            : [queueType];

        queuesToProcess.forEach(qType => {
            const queue = queues[qType];
            const assistingIndices = [];
            
            queue.forEach((item, index) => {
                if (item.status === 'assisting') {
                    assistingIndices.push(index);
                }
            });

            if (assistingIndices.length > 0) {
                for (let i = assistingIndices.length - 1; i >= 0; i--) {
                    const removed = queue.splice(assistingIndices[i], 1)[0];
                    console.log(`TA finished assisting ${removed.name}`);
                    
                    emitToUser(removed.userId, 'finished-assisting', {
                        queueType: qType,
                        message: `The TA has finished assisting you. Hope that helped!`
                    });
                }
            }
        });
        
        // Note: We don't automatically check in the next person anymore based on request "Only the student come and TA mark them"
        broadcastQueues();
        
        // Notify upcoming
        queuesToProcess.forEach(qType => {
            queues[qType].filter(item => item.status === 'waiting').slice(0, 3).forEach((item, idx) => {
                notifyUpcoming(qType, idx + 1, item.userId);
            });
        });
    });

    // TA: Remove specific person
    socket.on('ta-remove', ({ queueType, entryId }) => {
        const queue = queues[queueType];
        const index = queue.findIndex(item => item.id === entryId);

        if (index !== -1) {
            const removed = queue.splice(index, 1)[0];
            console.log(`TA removed ${removed.name} from ${queueType} queue`);

            emitToUser(removed.userId, 'removed-from-queue', {
                queueType,
                message: `You have been removed from the ${queueType} queue.`
            });

            broadcastQueues();
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);

        if (currentUserId) {
            unregisterUserSocket(currentUserId, socket.id);

            // Only remove from queues if user has no more connected sockets
            // This allows user to close a tab without losing their position
            // They will be removed after a timeout if they don't reconnect

            // For now, we keep them in the queue even if disconnected
            // The TA can manually remove them if needed
        }
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Queue server running on port ${PORT}`);
});
