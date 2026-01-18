// Custom commands for ECE297 Queue tests

// Test room name used across all tests
const TEST_ROOM = 'cypress-test';
const TEST_ROOM_2 = 'cypress-test-2';
const MASTER_PASSWORD = 'ece297ta';
const ROOM_PASSWORD = 'testpass';
const API_URL = 'http://localhost:3001';

/**
 * Visit a page with the test room (or custom room)
 */
Cypress.Commands.add('visitWithRoom', (hashOrRoom = '', hash = '') => {
    // If hashOrRoom is a known hash (student, ta, all), use TEST_ROOM
    // Otherwise treat it as a custom room name
    if (['student', 'ta', 'all', ''].includes(hashOrRoom)) {
        cy.visit(`/?ta=${TEST_ROOM}${hashOrRoom ? '#' + hashOrRoom : ''}`);
    } else {
        // hashOrRoom is a custom room name, hash is the page hash
        cy.visit(`/?ta=${hashOrRoom}${hash ? '#' + hash : ''}`);
    }
});

/**
 * Visit a specific room
 */
Cypress.Commands.add('visitRoom', (roomName, hash = '') => {
    cy.visit(`/?ta=${roomName}${hash ? '#' + hash : ''}`);
});

/**
 * Clear all queues via socket for the test room
 */
Cypress.Commands.add('clearQueues', () => {
    cy.window().then((win) => {
        if (win.socket && win.socket.connected) {
            win.socket.emit('ta-clear-all', { room: TEST_ROOM });
        }
    });
    cy.wait(500);
});

/**
 * Wait for socket connection with timeout
 */
Cypress.Commands.add('waitForSocket', (timeout = 10000) => {
    cy.window({ timeout }).should('have.property', 'socket');
    cy.window({ timeout }).its('socket.connected').should('be.true');
});

/**
 * Join marking queue via socket (bypasses UI)
 */
Cypress.Commands.add('joinMarkingViaSocket', (name, studentId, userId = null) => {
    cy.window().then((win) => {
        const id = userId || `test-user-${Date.now()}`;
        win.socket.emit('join-marking', {
            name,
            studentId,
            email: null,
            userId: id,
            room: TEST_ROOM
        });
    });
    cy.wait(200);
});

/**
 * Join question queue via socket (bypasses UI)
 */
Cypress.Commands.add('joinQuestionViaSocket', (name, userId = null, description = null) => {
    cy.window().then((win) => {
        const id = userId || `test-user-${Date.now()}`;
        win.socket.emit('join-question', {
            name,
            email: null,
            description,
            userId: id,
            room: TEST_ROOM
        });
    });
    cy.wait(200);
});

/**
 * Setup the test room (claim it with password if needed)
 */
Cypress.Commands.add('setupTestRoom', (roomName = TEST_ROOM) => {
    // First check if room exists
    cy.request(`${API_URL}/api/room-status?room=${roomName}`).then((response) => {
        if (!response.body.hasPassword) {
            // Claim the room
            cy.request({
                method: 'POST',
                url: `${API_URL}/api/claim-room`,
                body: {
                    room: roomName,
                    masterPassword: MASTER_PASSWORD,
                    newPassword: ROOM_PASSWORD
                }
            });
        }
    });
});

/**
 * Setup multiple test rooms
 */
Cypress.Commands.add('setupMultipleRooms', () => {
    cy.setupTestRoom(TEST_ROOM);
    cy.setupTestRoom(TEST_ROOM_2);
});

/**
 * Clear queues for a specific room
 */
Cypress.Commands.add('clearRoomQueues', (roomName) => {
    cy.window().then((win) => {
        if (win.socket && win.socket.connected) {
            win.socket.emit('ta-clear-all', { room: roomName });
        }
    });
    cy.wait(500);
});

/**
 * Clear queues for all test rooms
 */
Cypress.Commands.add('clearAllTestRooms', () => {
    cy.window().then((win) => {
        if (win.socket && win.socket.connected) {
            win.socket.emit('ta-clear-all', { room: TEST_ROOM });
            win.socket.emit('ta-clear-all', { room: TEST_ROOM_2 });
        }
    });
    cy.wait(500);
});

/**
 * Get second test room name
 */
Cypress.Commands.add('getTestRoom2', () => {
    return cy.wrap(TEST_ROOM_2);
});

/**
 * Check user status across all rooms
 */
Cypress.Commands.add('checkUserStatus', (userId) => {
    return cy.request(`${API_URL}/api/user-status?userId=${userId}`).then((response) => {
        return response.body;
    });
});

/**
 * Login as TA using room password
 */
Cypress.Commands.add('loginAsTA', () => {
    cy.visitWithRoom('ta');
    cy.waitForSocket();
    cy.wait(500);

    // Check if we see login form or setup form
    cy.get('body').then(($body) => {
        if ($body.text().includes('Setup Room')) {
            // Need to set up room first
            cy.get('input[placeholder="Enter Master Password"]').type(MASTER_PASSWORD);
            cy.get('input[placeholder="Set Room Password"]').type(ROOM_PASSWORD);
            cy.contains('button', 'Create & Login').click({ force: true });
        } else if ($body.text().includes('TA Login')) {
            // Room already set up, just enter room password
            cy.get('input[placeholder="Enter room password"]').type(ROOM_PASSWORD);
            cy.contains('button', 'Login').click({ force: true });
        }
    });

    cy.contains('TA Dashboard', { timeout: 10000 }).should('be.visible');
    cy.wait(500);
});

/**
 * Add multiple users to a queue quickly
 */
Cypress.Commands.add('addBulkUsers', (queueType, count, prefix = 'BulkUser') => {
    cy.window().then((win) => {
        for (let i = 0; i < count; i++) {
            const timestamp = Date.now();
            if (queueType === 'marking') {
                win.socket.emit('join-marking', {
                    name: `${prefix}_${i}`,
                    studentId: String(1000 + i).slice(-4).padStart(4, '0'),
                    email: null,
                    userId: `${prefix.toLowerCase()}-${i}-${timestamp}`,
                    room: TEST_ROOM
                });
            } else {
                win.socket.emit('join-question', {
                    name: `${prefix}_${i}`,
                    email: null,
                    userId: `${prefix.toLowerCase()}-${i}-${timestamp}`,
                    room: TEST_ROOM
                });
            }
        }
    });
    cy.wait(Math.min(count * 100, 3000)); // Wait proportionally, max 3s
});

/**
 * Verify queue count
 */
Cypress.Commands.add('verifyQueueCount', (queueType, expectedCount) => {
    cy.get(`.queue-card.${queueType} .queue-count`, { timeout: 10000 })
        .should('contain', `${expectedCount} waiting`);
});

/**
 * Reset test state - clear queues and session
 */
Cypress.Commands.add('resetTestState', () => {
    // Visit student page to ensure socket connects
    cy.visitWithRoom('student');
    cy.waitForSocket();

    cy.window().then((win) => {
        return new Cypress.Promise((resolve) => {
            // Clear storage first
            win.sessionStorage.clear();
            
            // Generate fresh user ID for this test
            const testUserId = `cypress-test-user-${Date.now()}`;
            win.localStorage.setItem('ece297-queue-user-id', testUserId);

            if (win.socket && win.socket.connected) {
                console.log('Clearing all queues for room:', TEST_ROOM);
                win.socket.emit('ta-clear-all', { room: TEST_ROOM });
                
                // Wait for queues to be cleared
                setTimeout(resolve, 1000);
            } else {
                resolve();
            }
        });
    });
    
    cy.wait(500);
});

/**
 * Get the test room name
 */
Cypress.Commands.add('getTestRoom', () => {
    return cy.wrap(TEST_ROOM);
});

/**
 * Delete test room (cleanup after tests)
 */
Cypress.Commands.add('deleteTestRoom', () => {
    cy.window().then((win) => {
        if (win.socket && win.socket.connected) {
            win.socket.emit('ta-delete-room', { room: TEST_ROOM });
        }
    });
    cy.wait(500);
});

/**
 * Wait for toast message to appear
 */
Cypress.Commands.add('waitForToast', (message, timeout = 5000) => {
    cy.get('.toast-container .toast', { timeout }).should('contain', message);
});

/**
 * Ensure we're on a clean state before test
 */
Cypress.Commands.add('ensureCleanState', () => {
    cy.clearQueues();
    cy.window().then((win) => {
        // Generate fresh user ID
        const testUserId = `cypress-test-user-${Date.now()}`;
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
    });
    cy.wait(300);
});
