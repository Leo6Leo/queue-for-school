/**
 * EDGE CASES TESTS - Part 2: TA Operations, State & UI Edge Cases
 * Tests TA-specific edge cases, state persistence, and UI boundary conditions.
 */

const TEST_ROOM = 'cypress-test';

describe('Edge Cases - TA & State Operations', () => {
  beforeEach(() => {
    cy.setupTestRoom();
    cy.resetTestState();
  });

  afterEach(() => {
    cy.clearQueues();
  });

  describe('TA Authentication Edge Cases', () => {
    it('TA incorrect password shows error', () => {
      cy.visitWithRoom('ta');
      cy.waitForSocket();
      cy.wait(500);

      // Handle both Setup Room and TA Login scenarios
      cy.get('body').then(($body) => {
        if ($body.text().includes('Setup Room')) {
          // For setup, enter wrong master password
          cy.get('input[placeholder="Enter Master Password"]').type('wrongpassword');
          cy.get('input[placeholder="Set Room Password"]').type('anypass');
          cy.contains('button', 'Create & Login').click({ force: true });
          cy.contains('Incorrect Master Password', { timeout: 5000 }).should('be.visible');
        } else if ($body.text().includes('TA Login')) {
          // For login, enter wrong room password
          cy.get('input[placeholder="Enter room password"]').type('wrongpassword');
          cy.contains('button', 'Login').click({ force: true });
          cy.contains('Incorrect', { timeout: 5000 }).should('be.visible');
        }
      });
    });

    it('TA session persists on page reload', () => {
      cy.loginAsTA();
      cy.contains('TA Dashboard').should('be.visible');

      cy.reload();
      cy.waitForSocket();
      cy.wait(1000);
      
      cy.contains('TA Dashboard', { timeout: 10000 }).should('be.visible');
    });

    it('TA logout works correctly', () => {
      cy.loginAsTA();
      cy.contains('TA Dashboard').should('be.visible');

      cy.contains('button', 'Logout').click({ force: true });
      
      cy.wait(500);
      cy.url().should('not.include', '#ta');
    });

    it('TA can call specific student out of order', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add 5 users
      cy.window().then((win) => {
        for (let i = 1; i <= 5; i++) {
          win.socket.emit('join-marking', {
            name: `OrderTest${i}`,
            studentId: `000${i}`,
            email: null,
            userId: `order-test-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(1000);

      cy.loginAsTA();

      // Call student 3 specifically
      cy.contains('OrderTest3', { timeout: 10000 })
        .parents('.queue-item')
        .find('button')
        .contains('Call')
        .click({ force: true });

      cy.wait(500);
      cy.contains('Start Assisting OrderTest3').should('be.visible');
    });
  });

  describe('Leave/Rejoin Pattern Tests', () => {
    it('user can leave and immediately rejoin', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('QuickRejoiner');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('#1', { timeout: 10000 }).should('be.visible');
        cy.contains('button', 'Leave Queue').click({ force: true });
      });

      cy.wait(500);

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').should('be.visible');
        cy.get('input[placeholder="Enter your name"]').type('QuickRejoiner2');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('#1', { timeout: 10000 }).should('be.visible');
      });
    });

    it('position updates correctly when queue is cleared', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add 3 virtual users
      cy.window().then((win) => {
        for (let i = 1; i <= 3; i++) {
          win.socket.emit('join-question', {
            name: `AheadUser${i}`,
            email: null,
            userId: `ahead-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(500);

      // Join as 4th
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('FourthUser');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('#4', { timeout: 10000 }).should('be.visible');
      });

      // Clear queue via socket
      cy.window().then((win) => {
        win.socket.emit('ta-clear-all', { room: TEST_ROOM });
      });

      cy.wait(1000);

      // User should see form again (cleared)
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').should('be.visible');
      });
    });
  });

  describe('Push Back Edge Cases', () => {
    it('push back not visible when alone in queue', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('AloneUser');
        cy.get('input[placeholder="e.g., 1234"]').type('1234');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('#1', { timeout: 10000 }).should('be.visible');

        // Push back should not exist when alone
        cy.contains('Push Back').should('not.exist');
      });
    });
  });

  describe('State Persistence Tests', () => {
    it('user position persists after page reload', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('PersistUser');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('#1', { timeout: 10000 }).should('be.visible');
      });

      cy.wait(1000);
      cy.reload();
      cy.waitForSocket();
      cy.wait(2000);

      cy.get('.queue-card.question', { timeout: 10000 }).within(() => {
        cy.contains('Your Position').should('be.visible');
        cy.contains('#1').should('be.visible');
      });
    });

    it('user position persists after navigation', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('NavUser');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('#1', { timeout: 10000 }).should('be.visible');
      });

      cy.wait(500);

      // Navigate away and back
      cy.visitWithRoom();
      cy.wait(500);
      cy.visitWithRoom('student');
      cy.waitForSocket();
      cy.wait(1500);

      cy.get('.queue-card.question', { timeout: 10000 }).within(() => {
        cy.contains('Your Position').should('be.visible');
      });
    });
  });

  describe('Time Display Tests', () => {
    it('displays Just now for recently joined', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('TimeUser');
        cy.contains('button', 'Join Queue').click({ force: true });
      });

      cy.wait(500);

      cy.get('.queue-card.question .queue-item-time', { timeout: 10000 })
        .should('contain', 'Just now');
    });
  });

  describe('Combined Queue Sorting', () => {
    it('TA sees combined queue sorted by join time', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'FirstMark',
          studentId: '1111',
          email: null,
          userId: 'first-mark-' + Date.now(),
          room: TEST_ROOM
        });
      });

      cy.wait(200);

      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: 'SecondQuest',
          email: null,
          userId: 'second-quest-' + Date.now(),
          room: TEST_ROOM
        });
      });

      cy.wait(200);

      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'ThirdMark',
          studentId: '2222',
          email: null,
          userId: 'third-mark-' + Date.now(),
          room: TEST_ROOM
        });
      });

      cy.wait(1000);

      cy.loginAsTA();

      // First entry should be FirstMark (earliest join time)
      cy.get('.queue-list .queue-item', { timeout: 10000 }).first()
        .should('contain', 'FirstMark');
    });
  });

  describe('Theme Toggle Tests', () => {
    it('theme persists across page loads', () => {
      cy.visitWithRoom();
      cy.wait(500);

      // Get current theme first
      cy.get('html').invoke('attr', 'data-theme').then((currentTheme) => {
        // Toggle theme
        cy.get('.theme-icon-btn').first().click({ force: true });
        cy.wait(300);

        // Verify theme changed
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        cy.get('html').should('have.attr', 'data-theme', newTheme);

        cy.reload();
        cy.wait(1000);

        // Should persist
        cy.get('html').should('have.attr', 'data-theme', newTheme);
      });
    });

    it('theme toggle button works', () => {
      cy.visitWithRoom();
      cy.wait(500);

      // Click toggle and verify it changes
      cy.get('html').invoke('attr', 'data-theme').then((initialTheme) => {
        cy.get('.theme-icon-btn').first().click({ force: true });
        cy.wait(300);
        
        const expectedTheme = initialTheme === 'dark' ? 'light' : 'dark';
        cy.get('html').should('have.attr', 'data-theme', expectedTheme);
      });
    });
  });

  describe('Connection Status Tests', () => {
    it('shows connected status when socket is connected', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();
      
      cy.get('.connection-status', { timeout: 10000 }).should('contain', 'Connected');
    });

    it('shows disconnected status when socket disconnects', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.disconnect();
      });

      cy.wait(500);
      cy.get('.connection-status').should('contain', 'Disconnected');
    });
  });

  describe('Empty Queue Display', () => {
    it('shows empty state message when queue is empty', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();
      
      cy.get('.queue-card.marking').within(() => {
        cy.contains('No one in queue').should('be.visible');
      });
      cy.get('.queue-card.question').within(() => {
        cy.contains('No one in queue').should('be.visible');
      });
    });

    it('shows 0 waiting count when queue is empty', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();
      
      cy.get('.queue-card.marking .queue-count')
        .should('contain', '0 waiting');
      cy.get('.queue-card.question .queue-count')
        .should('contain', '0 waiting');
    });
  });

  describe('Form Validation Feedback', () => {
    it('join button disabled when name is empty', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.contains('button', 'Join Queue').should('be.disabled');
        cy.get('input[placeholder="Enter your name"]').type('a');
        cy.contains('button', 'Join Queue').should('not.be.disabled');
        cy.get('input[placeholder="Enter your name"]').clear();
        cy.contains('button', 'Join Queue').should('be.disabled');
      });
    });

    it('marking queue requires valid 4-digit ID', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('ValidName');

        // No ID - disabled
        cy.contains('button', 'Join Queue').should('be.disabled');

        // 3 digits - disabled
        cy.get('input[placeholder="e.g., 1234"]').type('123');
        cy.contains('button', 'Join Queue').should('be.disabled');

        // 4 digits - enabled
        cy.get('input[placeholder="e.g., 1234"]').type('4');
        cy.contains('button', 'Join Queue').should('not.be.disabled');
      });
    });
  });
});
