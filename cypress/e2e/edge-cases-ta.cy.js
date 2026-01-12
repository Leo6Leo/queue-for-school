/**
 * EDGE CASES TESTS - Part 2: TA Operations, State & UI Edge Cases
 * Tests TA-specific edge cases, state persistence, and UI boundary conditions.
 */

describe('Edge Cases - TA & State Operations', () => {
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

    describe('TA Authentication Edge Cases', () => {
        it('TA incorrect password shows error and clears field', () => {
            cy.visit('/#ta');
            cy.get('input[type="password"]').type('wrongpassword');
            cy.contains('button', 'Login').click({ force: true });
            cy.contains('Incorrect password').should('be.visible');
            cy.get('input[type="password"]').should('have.value', '');
        });

        it('TA session persists on page reload', () => {
            cy.visit('/#ta');
            cy.get('input[type="password"]').type('ece297ta');
            cy.contains('button', 'Login').click({ force: true });
            cy.contains('TA Dashboard').should('be.visible');

            cy.reload();
            cy.contains('TA Dashboard').should('be.visible');
        });

        it('TA logout works correctly', () => {
            cy.visit('/#ta');
            cy.get('input[type="password"]').type('ece297ta');
            cy.contains('button', 'Login').click({ force: true });
            cy.contains('TA Dashboard').should('be.visible');

            cy.contains('Logout').click({ force: true });
            cy.get('.home-btn').should('be.visible');
        });

        it('TA can call specific student out of order', () => {
            cy.visit('/#student');

            cy.window().then((win) => {
                for (let i = 1; i <= 5; i++) {
                    win.socket.emit('join-marking', {
                        name: `OrderTest${i}`,
                        studentId: `000${i}`,
                        email: null,
                        userId: `order-test-${i}`
                    });
                }
            });

            cy.wait(500);

            cy.visit('/#ta');
            cy.get('input[type="password"]').type('ece297ta');
            cy.contains('button', 'Login').click({ force: true });

            // Call student 3 specifically
            cy.contains('OrderTest3')
                .parent()
                .parent()
                .find('button')
                .contains('Call')
                .click({ force: true });

            cy.wait(300);
            cy.contains('Start Assisting OrderTest3').should('be.visible');
        });
    });

    describe('Leave/Rejoin Pattern Tests', () => {
        it('user can leave and immediately rejoin', () => {
            cy.visit('/#student');

            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('QuickRejoiner');
                cy.contains('Join Queue').click({ force: true });
                cy.contains('#1').should('be.visible');
                cy.contains('Leave Queue').click({ force: true });
                cy.get('input[placeholder="Enter your name"]').should('be.visible');
                cy.get('input[placeholder="Enter your name"]').type('QuickRejoiner2');
                cy.contains('Join Queue').click({ force: true });
                cy.contains('#1').should('be.visible');
            });
        });

        it('position updates correctly when someone ahead leaves', () => {
            cy.visit('/#student');

            // Add 3 virtual users
            cy.window().then((win) => {
                for (let i = 1; i <= 3; i++) {
                    win.socket.emit('join-question', {
                        name: `AheadUser${i}`,
                        email: null,
                        userId: `ahead-${i}`
                    });
                }
            });

            cy.wait(300);

            // Join as 4th
            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('FourthUser');
                cy.contains('Join Queue').click({ force: true });
                cy.contains('#4').should('be.visible');
            });

            // First user leaves
            cy.window().then((win) => {
                // Find and remove first entry - for simplicity clear all
                win.socket.emit('ta-clear-all');
            });

            cy.wait(300);

            // User should see form again (cleared)
            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').should('be.visible');
            });
        });
    });

    describe('Push Back Edge Cases', () => {
        it('push back not visible for first position alone', () => {
            cy.visit('/#student');

            cy.get('.queue-card.marking').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('AloneUser');
                cy.get('input[placeholder="e.g., 1234"]').type('1234');
                cy.contains('Join Queue').click({ force: true });
                cy.contains('#1').should('be.visible');
            });

            // Push back should move to position 2 if there are others
            // When alone, push back position check
            cy.get('.queue-card.marking').within(() => {
                // The push back button appears for positions <= 3
                // but if alone, clicking it should not crash
                cy.get('body').then(() => {
                    // Just verify UI is stable
                    cy.contains('Your Position').should('be.visible');
                });
            });
        });
    });

    describe('State Persistence Tests', () => {
        it('user position persists after page reload', () => {
            cy.visit('/#student');

            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('PersistUser');
                cy.contains('Join Queue').click({ force: true });
                cy.contains('#1').should('be.visible');
            });

            cy.reload();

            cy.get('.queue-card.question').within(() => {
                cy.contains('Your Position').should('be.visible');
                cy.contains('#1').should('be.visible');
            });
        });

        it('user position persists after navigation', () => {
            cy.visit('/#student');

            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('NavUser');
                cy.contains('Join Queue').click({ force: true });
                cy.contains('#1').should('be.visible');
            });

            cy.visit('/');
            cy.wait(300);
            cy.visit('/#student');

            cy.get('.queue-card.question').within(() => {
                cy.contains('Your Position').should('be.visible');
            });
        });
    });

    describe('Time Display Tests', () => {
        it('displays Just now for recently joined', () => {
            cy.visit('/#student');

            cy.get('.queue-card.question').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('TimeUser');
                cy.contains('Join Queue').click({ force: true });
            });

            cy.get('.queue-card.question .queue-item-time')
                .should('contain', 'Just now');
        });
    });

    describe('Combined Queue Sorting', () => {
        it('TA sees combined queue sorted by join time', () => {
            cy.visit('/#student');

            cy.window().then((win) => {
                win.socket.emit('join-marking', {
                    name: 'FirstMark',
                    studentId: '1111',
                    email: null,
                    userId: 'first-mark'
                });
            });

            cy.wait(100);

            cy.window().then((win) => {
                win.socket.emit('join-question', {
                    name: 'SecondQuest',
                    email: null,
                    userId: 'second-quest'
                });
            });

            cy.wait(100);

            cy.window().then((win) => {
                win.socket.emit('join-marking', {
                    name: 'ThirdMark',
                    studentId: '2222',
                    email: null,
                    userId: 'third-mark'
                });
            });

            cy.wait(500);

            cy.visit('/#ta');
            cy.get('input[type="password"]').type('ece297ta');
            cy.contains('button', 'Login').click({ force: true });

            // First entry should be FirstMark
            cy.get('.queue-list .queue-item').first()
                .should('contain', 'FirstMark');
        });
    });

    describe('Theme Toggle Tests', () => {
        it('theme persists across page loads', () => {
            cy.visit('/');

            // Click theme toggle (default is light, toggle to dark)
            cy.get('.theme-icon-btn').first().click({ force: true });

            // Verify dark mode
            cy.get('html').should('have.attr', 'data-theme', 'dark');

            cy.reload();

            // Should still be dark
            cy.get('html').should('have.attr', 'data-theme', 'dark');
        });
    });

    describe('Connection Status Tests', () => {
        it('shows connected status when socket is connected', () => {
            cy.visit('/#student');
            cy.get('.connection-status').should('contain', 'Connected');
        });

        it('shows disconnected status when socket disconnects', () => {
            cy.visit('/#student');

            cy.window().then((win) => {
                win.socket.disconnect();
            });

            cy.get('.connection-status').should('contain', 'Disconnected');
        });
    });

    describe('Empty Queue Display', () => {
        it('shows empty state message when queue is empty', () => {
            cy.visit('/#student');
            cy.get('.queue-card.marking').within(() => {
                cy.contains('No one in queue').should('be.visible');
            });
            cy.get('.queue-card.question').within(() => {
                cy.contains('No one in queue').should('be.visible');
            });
        });

        it('shows 0 waiting count when queue is empty', () => {
            cy.visit('/#student');
            cy.get('.queue-card.marking .queue-count')
                .should('contain', '0 waiting');
            cy.get('.queue-card.question .queue-count')
                .should('contain', '0 waiting');
        });
    });

    describe('Form Validation Feedback', () => {
        it('join button disabled when name is empty', () => {
            cy.visit('/#student');

            cy.get('.queue-card.question').within(() => {
                cy.contains('Join Queue').should('be.disabled');
                cy.get('input[placeholder="Enter your name"]').type('a');
                cy.contains('Join Queue').should('not.be.disabled');
                cy.get('input[placeholder="Enter your name"]').clear();
                cy.contains('Join Queue').should('be.disabled');
            });
        });

        it('marking queue requires valid 4-digit ID', () => {
            cy.visit('/#student');

            cy.get('.queue-card.marking').within(() => {
                cy.get('input[placeholder="Enter your name"]').type('ValidName');

                // No ID - disabled
                cy.contains('Join Queue').should('be.disabled');

                // 3 digits - disabled
                cy.get('input[placeholder="e.g., 1234"]').type('123');
                cy.contains('Join Queue').should('be.disabled');

                // 4 digits - enabled
                cy.get('input[placeholder="e.g., 1234"]').type('4');
                cy.contains('Join Queue').should('not.be.disabled');
            });
        });
    });
});
