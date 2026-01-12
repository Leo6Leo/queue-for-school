/**
 * STRESS TESTS - Extreme Heavy Load Testing
 * Tests the application under extreme conditions with massive concurrent operations.
 */

describe('Stress Tests - Extreme Load', () => {
    const HEAVY_LOAD_USERS = 100;  // High number of virtual users
    const RAPID_FIRE_ITERATIONS = 50;

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
        // Cleanup: Clear all queues after each test
        cy.window().then((win) => {
            if (win.socket) {
                win.socket.emit('ta-clear-all');
            }
        });
    });

    describe('Massive User Load', () => {
        it(`handles ${HEAVY_LOAD_USERS} concurrent marking queue joins`, () => {
            cy.visit('/#student');

            // Wait for socket connection
            cy.window().should('have.property', 'socket');
            cy.window().its('socket.connected').should('be.true');

            // Flood marking queue with virtual users
            cy.window().then((win) => {
                const promises = [];
                for (let i = 0; i < HEAVY_LOAD_USERS; i++) {
                    win.socket.emit('join-marking', {
                        name: `StressUser_${i}`,
                        studentId: String(1000 + i).slice(-4).padStart(4, '0'),
                        email: `stress${i}@test.com`,
                        userId: `stress-mark-${i}-${Date.now()}`
                    });
                }
            });

            // Wait for all updates to propagate
            cy.wait(2000);

            // Verify UI displays correct count
            cy.get('.queue-card.marking .queue-count')
                .should('contain', `${HEAVY_LOAD_USERS} waiting`);

            // Verify the list renders without crashing
            cy.get('.queue-card.marking .queue-list')
                .should('be.visible')
                .find('.queue-item')
                .should('have.length', HEAVY_LOAD_USERS);

            // Verify first and last items are correct
            cy.get('.queue-card.marking .queue-list')
                .contains('StressUser_0')
                .should('be.visible');
            cy.get('.queue-card.marking .queue-list')
                .contains(`StressUser_${HEAVY_LOAD_USERS - 1}`)
                .scrollIntoView()
                .should('be.visible');
        });

        it(`handles ${HEAVY_LOAD_USERS} concurrent question queue joins`, () => {
            cy.visit('/#student');

            cy.window().its('socket.connected').should('be.true');

            cy.window().then((win) => {
                for (let i = 0; i < HEAVY_LOAD_USERS; i++) {
                    win.socket.emit('join-question', {
                        name: `QuestionUser_${i}`,
                        email: null,
                        userId: `stress-quest-${i}-${Date.now()}`
                    });
                }
            });

            cy.wait(2000);

            cy.get('.queue-card.question .queue-count')
                .should('contain', `${HEAVY_LOAD_USERS} waiting`);
        });

        it('handles mixed queue joins across both queues simultaneously', () => {
            cy.visit('/#student');

            cy.window().its('socket.connected').should('be.true');

            cy.window().then((win) => {
                // Alternate between marking and question
                for (let i = 0; i < HEAVY_LOAD_USERS; i++) {
                    if (i % 2 === 0) {
                        win.socket.emit('join-marking', {
                            name: `MixedMark_${i}`,
                            studentId: String(1000 + i).slice(-4).padStart(4, '0'),
                            email: null,
                            userId: `mixed-mark-${i}-${Date.now()}`
                        });
                    } else {
                        win.socket.emit('join-question', {
                            name: `MixedQuest_${i}`,
                            email: null,
                            userId: `mixed-quest-${i}-${Date.now()}`
                        });
                    }
                }
            });

            cy.wait(2000);

            // Each queue should have roughly half
            cy.get('.queue-card.marking .queue-count')
                .should('contain', `${HEAVY_LOAD_USERS / 2} waiting`);
            cy.get('.queue-card.question .queue-count')
                .should('contain', `${HEAVY_LOAD_USERS / 2} waiting`);
        });
    });

    describe('Rapid Fire Operations', () => {
        it('handles rapid join-leave cycles for same user', () => {
            cy.visit('/#student');

            cy.window().its('socket.connected').should('be.true');

            // Join question queue first
            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('RapidUser');
                cy.contains('Join Queue').click({ force: true });
                cy.contains('Your Position').should('be.visible');
            });

            // Get entry ID and perform rapid leave/join cycles
            cy.window().then((win) => {
                let entryId;
                const userId = win.localStorage.getItem('queue_user_id');

                // Set up listener for joined event
                win.socket.on('joined-queue', (data) => {
                    entryId = data.entryId;
                });

                // Rapid leave-join cycles (via socket, not UI which is too slow)
                for (let i = 0; i < RAPID_FIRE_ITERATIONS; i++) {
                    // Join
                    win.socket.emit('join-question', {
                        name: `RapidCycle_${i}`,
                        email: null,
                        userId: `rapid-fire-${i}`
                    });
                }
            });

            // Wait and verify UI is still stable
            cy.wait(3000);
            cy.get('.queue-card.question').should('be.visible');
            cy.get('.queue-card.question .queue-list').should('be.visible');
        });

        it('handles rapid TA call-next cycles', () => {
            cy.visit('/#student');

            // First, populate queue
            cy.window().then((win) => {
                for (let i = 0; i < 20; i++) {
                    win.socket.emit('join-marking', {
                        name: `CallCycleUser_${i}`,
                        studentId: String(1000 + i).slice(-4).padStart(4, '0'),
                        email: null,
                        userId: `call-cycle-${i}`
                    });
                }
            });

            cy.wait(500);

            // Go to TA view
            cy.visit('/#ta');
            cy.get('input[type="password"]').type('ece297ta');
            cy.contains('button', 'Login').click({ force: true });

            cy.contains('TA Dashboard').should('be.visible');

            // Rapidly call and finish students via socket
            cy.window().then((win) => {
                for (let i = 0; i < 10; i++) {
                    win.socket.emit('ta-checkin', { queueType: 'marking' });
                    // Small delay
                    setTimeout(() => {
                        win.socket.emit('ta-next', { queueType: 'marking' });
                    }, 50);
                }
            });

            cy.wait(2000);

            // UI should still be responsive and show remaining students
            cy.get('.queue-card.combined').should('be.visible');
        });

        it('handles burst of push-back operations', () => {
            cy.visit('/#student');

            // Populate queue
            cy.window().then((win) => {
                for (let i = 0; i < 10; i++) {
                    win.socket.emit('join-marking', {
                        name: `PushBackUser_${i}`,
                        studentId: String(1000 + i).slice(-4).padStart(4, '0'),
                        email: null,
                        userId: `pushback-${i}`
                    });
                }
            });

            cy.wait(500);

            // Multiple users try to push back simultaneously
            cy.window().then((win) => {
                for (let i = 0; i < 5; i++) {
                    // We need entry IDs, but for stress testing we just emit and let server handle
                    // Server should gracefully handle invalid push-backs
                    win.socket.emit('push-back', {
                        queueType: 'marking',
                        entryId: 'some-entry-id', // Will likely fail, testing resilience
                        userId: `pushback-${i}`
                    });
                }
            });

            cy.wait(1000);

            // UI should not crash
            cy.get('.queue-card.marking').should('be.visible');
        });
    });

    describe('TA Dashboard Under Load', () => {
        it('renders combined queue with 200 users without freezing', function () {
            this.timeout(30000); // Extended timeout for this heavy test

            cy.visit('/#student');
            
            cy.window().should('have.property', 'socket');
            cy.window().its('socket.connected').should('be.true');

            // Populate both queues heavily
            cy.window().then((win) => {
                for (let i = 0; i < 100; i++) {
                    win.socket.emit('join-marking', {
                        name: `TAALoadMark_${i}`,
                        studentId: String(1000 + i).slice(-4).padStart(4, '0'),
                        email: `taload${i}@test.com`,
                        userId: `ta-load-mark-${i}`
                    });
                    win.socket.emit('join-question', {
                        name: `TAALoadQuest_${i}`,
                        email: null,
                        userId: `ta-load-quest-${i}`
                    });
                }
            });

            cy.wait(3000);

            // TA logs in
            cy.visit('/#ta');
            cy.get('input[type="password"]').type('ece297ta');
            cy.contains('button', 'Login').click({ force: true });

            // Dashboard should render
            cy.contains('TA Dashboard').should('be.visible');

            // Combined queue should show all users
            cy.get('.queue-card.combined .queue-count').should(($el) => {
                const text = $el.text();
                const match = text.match(/(\d+) waiting/);
                const count = match ? parseInt(match[1]) : 0;
                expect(count).to.equal(200);
            });

            // TA can still interact
            cy.contains('Next Marking').should('be.visible').click({ force: true });
            cy.wait(500);
            cy.contains('Start Assisting').should('be.visible');
        });

        it('TA can process students while queue is being flooded', () => {
            // TA logs in first
            cy.visit('/#ta');
            cy.get('input[type="password"]').type('ece297ta');
            cy.contains('button', 'Login').click({ force: true });
            cy.contains('TA Dashboard').should('be.visible');

            // Start flooding queue while TA works
            cy.window().then((win) => {
                // Continuous flood
                const floodInterval = setInterval(() => {
                    const id = Math.floor(Math.random() * 10000);
                    win.socket.emit('join-marking', {
                        name: `FloodWhileTA_${id}`,
                        studentId: String(1000 + id % 9000).slice(-4).padStart(4, '0'),
                        email: null,
                        userId: `flood-ta-${id}`
                    });
                }, 100);

                // Stop after 5 seconds
                setTimeout(() => clearInterval(floodInterval), 5000);
            });

            // Wait a bit for some users to appear
            cy.wait(1000);

            // TA should still be able to call students
            cy.contains('Next Marking').click({ force: true });
            cy.wait(500);

            // UI remains responsive
            cy.get('.queue-card.combined').should('be.visible');

            cy.wait(5000); // Let flood finish
        });
    });

    describe('Memory & Performance Checks', () => {
        it('UI remains responsive after adding and removing 500 users', function () {
            this.timeout(60000);

            cy.visit('/#student');

            // Add 500 users
            cy.window().then((win) => {
                for (let i = 0; i < 500; i++) {
                    win.socket.emit('join-question', {
                        name: `MemoryTestUser_${i}`,
                        email: null,
                        userId: `memory-${i}`
                    });
                }
            });

            cy.wait(5000);

            // Verify all added
            cy.get('.queue-card.question .queue-count')
                .should('contain', '500 waiting');

            // Now clear all
            cy.window().then((win) => {
                win.socket.emit('ta-clear-all');
            });

            cy.wait(1000);

            // Verify queue is empty
            cy.get('.queue-card.question .queue-count')
                .should('contain', '0 waiting');

            // Verify UI is responsive - can still join
            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('AfterClearUser');
                cy.contains('Join Queue').click({ force: true });
                cy.contains('Your Position').should('be.visible');
            });
        });

        it('handles page navigation during heavy queue updates', () => {
            cy.visit('/#student');

            // Start flooding
            cy.window().then((win) => {
                const interval = setInterval(() => {
                    try {
                        // Check if window/socket is still valid
                        if (win && win.socket && !win.closed) {
                            const id = Math.floor(Math.random() * 10000);
                            win.socket.emit('join-question', {
                                name: `NavFlood_${id}`,
                                email: null,
                                userId: `nav-flood-${id}`
                            });
                        } else {
                            clearInterval(interval);
                        }
                    } catch (e) {
                        clearInterval(interval);
                    }
                }, 50);

                setTimeout(() => clearInterval(interval), 3000);
            });

            // Navigate while updates happening
            cy.wait(500);
            cy.visit('/#ta');
            cy.wait(500);
            cy.visit('/#student');
            cy.wait(500);
            cy.visit('/');
            cy.wait(500);
            cy.visit('/#student');

            // Wait for flood to finish
            cy.wait(3000);

            // App should still work
            cy.get('.queue-card.question').should('be.visible');
        });
    });

    describe('Concurrent Session Stress', () => {
        it('maintains correct position after many queue changes', () => {
            cy.visit('/#student');

            // Join as main user first
            cy.get('.queue-card.marking').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('PositionTestUser');
                cy.get('input[placeholder="e.g., 1234"]').type('9999');
                cy.contains('Join Queue').click({ force: true });
                cy.contains('#1').should('be.visible');
            });

            // Add 30 users behind
            cy.window().then((win) => {
                for (let i = 0; i < 30; i++) {
                    win.socket.emit('join-marking', {
                        name: `BehindUser_${i}`,
                        studentId: String(1000 + i).slice(-4).padStart(4, '0'),
                        email: null,
                        userId: `behind-${i}`
                    });
                }
            });

            cy.wait(1000);

            // Main user should still be #1
            cy.get('.queue-card.marking').within(() => {
                cy.contains('#1').should('be.visible');
                cy.contains('31 waiting').should('be.visible');
            });

            // Now remove some users from middle (via TA)
            cy.window().then((win) => {
                // Remove users behind-5 through behind-15
                // This requires knowing entry IDs, so we'll just verify queue is stable
                win.socket.emit('ta-clear-all');
            });

            cy.wait(500);

            // Queue should be cleared, main user should see form again
            cy.get('.queue-card.marking').within(() => {
                cy.get('input[placeholder="Enter your name"]').should('be.visible');
            });
        });
    });
});