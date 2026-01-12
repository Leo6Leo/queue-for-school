/**
 * CHAOS ENGINEERING TESTS - Race Conditions, Network Issues & Malformed Data
 * Tests application resilience under chaotic conditions.
 */

describe('Chaos Engineering Tests', () => {
    beforeEach(() => {
        cy.visit('/');
        cy.window().then((win) => {
            win.sessionStorage.clear();
            if (win.socket) {
                win.socket.emit('ta-clear-all');
            }
        });
        cy.wait(500);
    });

    afterEach(() => {
        cy.window().then((win) => {
            if (win.socket) {
                win.socket.emit('ta-clear-all');
            }
        });
    });

    describe('Race Conditions', () => {
        it('handles simultaneous joins from multiple users', () => {
            cy.visit('/#student');
            cy.window().its('socket.connected').should('be.true');

            cy.window().then((win) => {
                // Fire 50 joins simultaneously
                for (let i = 0; i < 50; i++) {
                    win.socket.emit('join-question', {
                        name: `RaceUser_${i}`,
                        email: null,
                        userId: `race-${i}-${Date.now()}`
                    });
                }
            });

            cy.wait(2000);
            cy.get('.queue-card.question .queue-count').should('contain', '50 waiting');
        });

        it('handles TA calling while students are joining', () => {
            cy.visit('/#student');

            // Start with 5 users
            cy.window().then((win) => {
                for (let i = 0; i < 5; i++) {
                    win.socket.emit('join-marking', {
                        name: `TACallRace_${i}`,
                        studentId: `000${i}`,
                        email: null,
                        userId: `ta-race-${i}`
                    });
                }
            });

            cy.wait(300);

            // Simultaneously add more users AND call next
            cy.window().then((win) => {
                win.socket.emit('ta-checkin', { queueType: 'marking' });
                for (let i = 5; i < 10; i++) {
                    win.socket.emit('join-marking', {
                        name: `TACallRace_${i}`,
                        studentId: `000${i}`,
                        email: null,
                        userId: `ta-race-${i}`
                    });
                }
            });

            cy.wait(1000);
            cy.get('.queue-card.marking').should('be.visible');
        });

        it('handles multiple TAs calling simultaneously', () => {
            cy.visit('/#student');

            cy.window().then((win) => {
                for (let i = 0; i < 10; i++) {
                    win.socket.emit('join-marking', {
                        name: `MultiTA_${i}`,
                        studentId: `000${i}`,
                        email: null,
                        userId: `multi-ta-${i}`
                    });
                }
            });

            cy.wait(300);

            // Multiple "TAs" call at once
            cy.window().then((win) => {
                win.socket.emit('ta-checkin', { queueType: 'marking' });
                win.socket.emit('ta-checkin', { queueType: 'marking' });
                win.socket.emit('ta-checkin', { queueType: 'marking' });
            });

            cy.wait(500);
            cy.get('.queue-card.marking').should('be.visible');
        });

        it('handles leave and join in rapid succession', () => {
            cy.visit('/#student');

            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('RapidLeaveJoin');
                cy.contains('Join Queue').click({ force: true });
                cy.contains('Your Position').should('be.visible');
            });

            // Rapid leave-join-leave-join
            cy.window().then((win) => {
                const userId = win.localStorage.getItem('queue_user_id');
                // Emit multiple operations rapidly
                win.socket.emit('leave-queue', { queueType: 'question', entryId: 'x', userId });
                win.socket.emit('join-question', { name: 'Rapid1', email: null, userId: 'rapid-1' });
                win.socket.emit('join-question', { name: 'Rapid2', email: null, userId: 'rapid-2' });
            });

            cy.wait(1000);
            cy.get('.queue-card.question').should('be.visible');
        });
    });

    describe('Malformed Data Handling', () => {
        it('handles join with empty name via socket', () => {
            cy.visit('/#student');
            cy.window().its('socket.connected').should('be.true');

            cy.window().then((win) => {
                win.socket.emit('join-question', {
                    name: '',
                    email: null,
                    userId: 'empty-name-test'
                });
            });

            cy.wait(500);
            cy.get('.queue-card.question').should('be.visible');
        });

        it('handles join with null userId', () => {
            cy.visit('/#student');

            cy.window().then((win) => {
                win.socket.emit('join-question', {
                    name: 'NullUserIdTest',
                    email: null,
                    userId: null
                });
            });

            cy.wait(500);
            cy.get('.queue-card.question').should('be.visible');
        });

        it('handles join with undefined fields', () => {
            cy.visit('/#student');

            cy.window().then((win) => {
                win.socket.emit('join-question', {
                    name: 'UndefinedFields'
                    // Missing userId and email
                });
            });

            cy.wait(500);
            cy.get('.queue-card.question').should('be.visible');
        });

        it('handles leave with invalid entryId', () => {
            cy.visit('/#student');

            cy.window().then((win) => {
                win.socket.emit('leave-queue', {
                    queueType: 'marking',
                    entryId: 'nonexistent-entry-id-12345',
                    userId: 'some-user'
                });
            });

            cy.wait(500);
            cy.get('body').should('be.visible');
        });

        it('handles invalid queueType', () => {
            cy.visit('/#student');

            cy.window().then((win) => {
                win.socket.emit('ta-checkin', { queueType: 'invalid-queue-type' });
                win.socket.emit('ta-next', { queueType: 'nonexistent' });
            });

            cy.wait(500);
            cy.get('body').should('be.visible');
        });

        it('handles extremely long email', () => {
            cy.visit('/#student');
            const longEmail = 'a'.repeat(200) + '@test.com';

            cy.window().then((win) => {
                win.socket.emit('join-question', {
                    name: 'LongEmailUser',
                    email: longEmail,
                    userId: 'long-email-user'
                });
            });

            cy.wait(500);
            cy.get('.queue-card.question').should('be.visible');
        });
    });

    describe('Connection Resilience', () => {
        it('recovers after disconnect/reconnect', () => {
            cy.visit('/#student');

            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('DisconnectUser');
                cy.contains('Join Queue').click({ force: true });
                cy.contains('Your Position').should('be.visible');
            });

            cy.window().then((win) => {
                win.socket.disconnect();
            });

            cy.wait(500);
            cy.get('.connection-status').should('contain', 'Disconnected');

            cy.window().then((win) => {
                win.socket.connect();
            });

            cy.wait(1000);
            cy.get('.connection-status').should('contain', 'Connected');
            cy.get('.queue-card.question').within(() => {
                cy.contains('Your Position').should('be.visible');
            });
        });

        it('handles multiple rapid reconnects', () => {
            cy.visit('/#student');

            cy.window().its('socket.connected').should('be.true');

            cy.window().then((win) => {
                for (let i = 0; i < 5; i++) {
                    win.socket.disconnect();
                    win.socket.connect();
                }
            });

            cy.wait(2000);
            cy.get('.queue-card').should('be.visible');
        });
    });

    describe('State Corruption Recovery', () => {
        it('handles cleared localStorage mid-session', () => {
            cy.visit('/#student');

            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('ClearStorageUser');
                cy.contains('Join Queue').click({ force: true });
                cy.contains('Your Position').should('be.visible');
            });

            cy.window().then((win) => {
                win.localStorage.clear();
            });

            cy.reload();
            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').should('be.visible');
            });
        });

        it('handles corrupted userId in localStorage', () => {
            cy.visit('/#student');

            cy.window().then((win) => {
                win.localStorage.setItem('queue_user_id', '{"invalid": "json');
            });

            cy.reload();
            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('CorruptedIDUser');
                cy.contains('Join Queue').click({ force: true });
            });

            cy.wait(500);
            cy.get('.queue-card.question').should('be.visible');
        });
    });

    describe('TA Edge Chaos', () => {
        it('TA calls next on empty combined queue', () => {
            cy.visit('/#ta');
            cy.get('input[type="password"]').type('ece297ta');
            cy.contains('button', 'Login').click({ force: true });

            cy.window().then((win) => {
                win.socket.emit('ta-checkin', { queueType: 'combined' });
            });

            cy.wait(500);
            cy.get('.queue-card.combined').should('be.visible');
            cy.contains('No one in queue').should('be.visible');
        });

        it('TA finishes assisting when nobody is being assisted', () => {
            cy.visit('/#ta');
            cy.get('input[type="password"]').type('ece297ta');
            cy.contains('button', 'Login').click({ force: true });

            cy.window().then((win) => {
                win.socket.emit('ta-next', { queueType: 'marking' });
                win.socket.emit('ta-next', { queueType: 'question' });
                win.socket.emit('ta-next', { queueType: 'combined' });
            });

            cy.wait(500);
            cy.get('.queue-card.combined').should('be.visible');
        });

        it('TA removes non-existent entry', () => {
            cy.visit('/#ta');
            cy.get('input[type="password"]').type('ece297ta');
            cy.contains('button', 'Login').click({ force: true });

            cy.window().then((win) => {
                win.socket.emit('ta-remove', {
                    queueType: 'marking',
                    entryId: 'does-not-exist-12345'
                });
            });

            cy.wait(500);
            cy.get('.queue-card.combined').should('be.visible');
        });

        it('handles rapid clear-all operations', () => {
            cy.visit('/#student');

            // Add users
            cy.window().then((win) => {
                for (let i = 0; i < 20; i++) {
                    win.socket.emit('join-question', {
                        name: `ClearTest_${i}`,
                        email: null,
                        userId: `clear-test-${i}`
                    });
                }
            });

            cy.wait(500);

            // Rapid clear
            cy.window().then((win) => {
                win.socket.emit('ta-clear-all');
                win.socket.emit('ta-clear-all');
                win.socket.emit('ta-clear-all');
            });

            cy.wait(500);
            cy.get('.queue-card.question').within(() => {
                cy.contains('0 waiting').should('be.visible');
            });
        });
    });

    describe('Push Back Chaos', () => {
        it('handles push back for non-existent entry', () => {
            cy.visit('/#student');

            cy.window().then((win) => {
                win.socket.emit('push-back', {
                    queueType: 'marking',
                    entryId: 'fake-entry-id',
                    userId: 'fake-user'
                });
            });

            cy.wait(500);
            cy.get('body').should('be.visible');
        });

        it('handles push back with wrong queueType', () => {
            cy.visit('/#student');

            cy.window().then((win) => {
                win.socket.emit('join-marking', {
                    name: 'WrongQueue',
                    studentId: '1234',
                    email: null,
                    userId: 'wrong-queue-user'
                });
            });

            cy.wait(300);

            cy.window().then((win) => {
                // Try to push back in wrong queue
                win.socket.emit('push-back', {
                    queueType: 'question', // Wrong queue!
                    entryId: 'some-id',
                    userId: 'wrong-queue-user'
                });
            });

            cy.wait(500);
            cy.get('.queue-card.marking').should('be.visible');
        });
    });

    describe('Hash Routing Chaos', () => {
        it('handles rapid hash changes', () => {
            cy.visit('/');

            cy.window().then((win) => {
                win.location.hash = 'student';
                win.location.hash = 'ta';
                win.location.hash = 'student';
                win.location.hash = '';
                win.location.hash = 'student';
            });

            cy.wait(1000);
            cy.get('body').should('be.visible');
        });

        it('handles hash with query parameters', () => {
            cy.visit('/#student?foo=bar&test=1');
            cy.wait(500);
            cy.get('body').should('be.visible');
        });
    });
});
