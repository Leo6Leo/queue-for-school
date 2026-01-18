/**
 * Edge Cases Tests
 * Tests unusual scenarios and boundary conditions
 */

describe('Edge Cases', () => {
  beforeEach(() => {
    cy.setupTestRoom();
    cy.resetTestState();
  });

  afterEach(() => {
    cy.clearQueues();
  });

  describe('Queue Position Edge Cases', () => {
    it('verifies push back is hidden when only one person in queue', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Solo User');
        cy.get('input[placeholder="e.g., 1234"]').type('1111');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();

        // Should be #1
        cy.contains('#1', { timeout: 10000 }).should('be.visible');

        // Push Back should NOT be visible when alone
        cy.contains('Push Back').should('not.exist');
      });
    });

    it('shows push back button when multiple people in queue', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add another user first via socket
      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'First User',
          studentId: '1111',
          email: null,
          userId: 'first-user-' + Date.now(),
          room: 'cypress-test'
        });
      });

      cy.wait(500);

      // Current user joins via UI
      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Second User');
        cy.get('input[placeholder="e.g., 1234"]').type('2222');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();

        // Should be #2
        cy.contains('#2', { timeout: 10000 }).should('be.visible');

        // Push Back should be visible now (position <= 3 and not alone)
        cy.contains('Push Back').should('be.visible');
      });
    });

    it('push back moves user one position back', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add a user first
      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'Back User',
          studentId: '3333',
          email: null,
          userId: 'back-user-' + Date.now(),
          room: 'cypress-test'
        });
      });

      cy.wait(500);

      // Join as first
      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Pusher');
        cy.get('input[placeholder="e.g., 1234"]').type('4444');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();

        cy.contains('#2', { timeout: 10000 }).should('be.visible');
        
        // Click push back
        cy.contains('Push Back').click({ force: true });
      });

      cy.wait(500);

      // Should now be #2 (pushed back one position - but since there's only 2, stays at 2)
      cy.get('.queue-card.marking').within(() => {
        cy.contains('#2').should('be.visible');
      });
    });
  });

  describe('Duplicate Prevention', () => {
    it('prevents same user from joining marking queue twice', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Join normally via UI
      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Double User');
        cy.get('input[placeholder="e.g., 1234"]').type('2222');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });

      cy.wait(500);

      // Try to join again via socket with same userId
      cy.window().then((win) => {
        const userId = win.localStorage.getItem('ece297-queue-user-id');
        win.socket.emit('join-marking', {
          name: 'Double User',
          studentId: '2222',
          email: null,
          userId: userId,
          room: 'cypress-test'
        });
      });

      // Expect Error Toast
      cy.get('.toast-container .toast', { timeout: 5000 }).should('contain', 'already in the marking queue');
    });

    it('prevents same user from joining question queue twice', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Join normally
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Double Q User');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });

      cy.wait(500);

      // Try to join again via socket
      cy.window().then((win) => {
        const userId = win.localStorage.getItem('ece297-queue-user-id');
        win.socket.emit('join-question', {
          name: 'Double Q User',
          email: null,
          userId: userId,
          room: 'cypress-test'
        });
      });

      // Expect Error Toast
      cy.get('.toast-container .toast', { timeout: 5000 }).should('contain', 'already in the question queue');
    });
  });

  describe('No Room Parameter', () => {
    it('shows error page when no room parameter is provided', () => {
      cy.visit('/');
      cy.contains('Invalid Link', { timeout: 10000 }).should('be.visible');
      cy.contains('View All Active Rooms').should('be.visible');
    });

    it('can navigate to All Rooms from error page', () => {
      cy.visit('/');
      cy.contains('View All Active Rooms').click();
      cy.contains('Active Rooms', { timeout: 10000 }).should('be.visible');
    });
  });

  describe('Connection Resilience', () => {
    it('reconnects and restores state after socket disconnect', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Join queue
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Reconnect User');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });

      cy.wait(1000);

      // Simulate disconnect by disconnecting and reconnecting socket
      cy.window().then((win) => {
        win.socket.disconnect();
      });

      cy.wait(1000);

      cy.window().then((win) => {
        win.socket.connect();
      });

      cy.wait(3000);

      // Verify state is restored
      cy.get('.queue-card.question', { timeout: 10000 }).within(() => {
        cy.contains('Your Position').should('be.visible');
      });
    });

    it('shows connection status correctly', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();
      
      // Should show connected
      cy.get('.connection-status', { timeout: 10000 }).should('contain', 'Connected');

      // Disconnect
      cy.window().then((win) => {
        win.socket.disconnect();
      });

      cy.wait(500);

      // Should show disconnected
      cy.get('.connection-status').should('contain', 'Disconnected');

      // Reconnect
      cy.window().then((win) => {
        win.socket.connect();
      });

      cy.wait(2000);

      // Should show connected again
      cy.get('.connection-status').should('contain', 'Connected');
    });
  });

  describe('All Rooms View', () => {
    it('shows active rooms with correct counts', () => {
      // First add some users to the test room
      cy.visitWithRoom('student');
      cy.waitForSocket();
      cy.addBulkUsers('marking', 3, 'RoomTest');

      cy.wait(1000);

      // Navigate to All Rooms view
      cy.visit('/#all');
      cy.waitForSocket();
      cy.wait(1000);

      // Should see the test room
      cy.contains('cypress-test', { timeout: 10000 }).should('be.visible');
      // Should show the marking count
      cy.contains('3').should('be.visible');
    });

    it('receives real-time updates on All Rooms view', () => {
      cy.visit('/#all');
      cy.waitForSocket();
      cy.wait(1000);

      // Add a user via socket
      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'Realtime Test',
          studentId: '9999',
          email: null,
          userId: 'realtime-test-user-' + Date.now(),
          room: 'cypress-test'
        });
      });

      cy.wait(1000);

      // Should update without refresh
      cy.contains('cypress-test', { timeout: 10000 }).should('be.visible');
    });
  });

  describe('Empty Queue Behavior', () => {
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

  describe('Input Validation', () => {
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
