// Custom commands for ECE297 Queue tests

/**
 * Clear all queues via socket
 */
Cypress.Commands.add('clearQueues', () => {
    cy.window().then((win) => {
        if (win.socket && win.socket.connected) {
            win.socket.emit('ta-clear-all');
        }
    });
    cy.wait(300);
});

/**
 * Wait for socket connection
 */
Cypress.Commands.add('waitForSocket', () => {
    cy.window().should('have.property', 'socket');
    cy.window().its('socket.connected').should('be.true');
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
            userId: id
        });
    });
    cy.wait(100);
});

/**
 * Join question queue via socket (bypasses UI)
 */
Cypress.Commands.add('joinQuestionViaSocket', (name, userId = null) => {
    cy.window().then((win) => {
        const id = userId || `test-user-${Date.now()}`;
        win.socket.emit('join-question', {
            name,
            email: null,
            userId: id
        });
    });
    cy.wait(100);
});

/**
 * Login as TA
 */
Cypress.Commands.add('loginAsTA', () => {
    cy.get('input[type="password"]').type('ece297ta');
    cy.contains('button', 'Login').click({ force: true });
    cy.contains('TA Dashboard').should('be.visible');
});

/**
 * Add multiple users to a queue quickly
 */
Cypress.Commands.add('addBulkUsers', (queueType, count, prefix = 'BulkUser') => {
    cy.window().then((win) => {
        for (let i = 0; i < count; i++) {
            if (queueType === 'marking') {
                win.socket.emit('join-marking', {
                    name: `${prefix}_${i}`,
                    studentId: String(1000 + i).slice(-4).padStart(4, '0'),
                    email: null,
                    userId: `${prefix.toLowerCase()}-${i}-${Date.now()}`
                });
            } else {
                win.socket.emit('join-question', {
                    name: `${prefix}_${i}`,
                    email: null,
                    userId: `${prefix.toLowerCase()}-${i}-${Date.now()}`
                });
            }
        }
    });
    cy.wait(Math.min(count * 50, 2000)); // Wait proportionally, max 2s
});

/**
 * Verify queue count
 */
Cypress.Commands.add('verifyQueueCount', (queueType, expectedCount) => {
    cy.get(`.queue-card.${queueType} .queue-count`)
        .should('contain', `${expectedCount} waiting`);
});

/**
 * Reset test state
 */
Cypress.Commands.add('resetTestState', () => {
    cy.visit('/');
    cy.window().then((win) => {
        win.sessionStorage.clear();
        if (win.socket) {
            win.socket.emit('ta-clear-all');
        }
    });
    cy.wait(500);
});