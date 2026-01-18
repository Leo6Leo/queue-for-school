/**
 * LOAD TESTS - Performance and Scalability Testing
 * Tests the application's ability to handle various load conditions.
 */

const TEST_ROOM = 'cypress-test';

describe('Load Tests', () => {
  beforeEach(() => {
    cy.setupTestRoom();
    cy.resetTestState();
  });

  afterEach(() => {
    cy.clearQueues();
  });

  describe('High Volume Queue Operations', () => {
    it('handles 50 marking queue users', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add 50 users
      cy.window().then((win) => {
        for (let i = 0; i < 50; i++) {
          win.socket.emit('join-marking', {
            name: `LoadUser_${i}`,
            studentId: String(1000 + i).padStart(4, '0'),
            email: null,
            userId: `load-user-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(4000);
      cy.get('.queue-card.marking .queue-count', { timeout: 15000 }).should('contain', '50 waiting');
    });

    it('handles 50 question queue users', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        for (let i = 0; i < 50; i++) {
          win.socket.emit('join-question', {
            name: `QuestionLoadUser_${i}`,
            email: null,
            userId: `q-load-user-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(4000);
      cy.get('.queue-card.question .queue-count', { timeout: 15000 }).should('contain', '50 waiting');
    });

    it('handles both queues at capacity simultaneously', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        // Add 25 to each queue
        for (let i = 0; i < 25; i++) {
          win.socket.emit('join-marking', {
            name: `MixLoad_${i}`,
            studentId: String(1000 + i).padStart(4, '0'),
            email: null,
            userId: `mix-mark-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
          win.socket.emit('join-question', {
            name: `MixQLoad_${i}`,
            email: null,
            userId: `mix-q-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(4000);
      cy.get('.queue-card.marking .queue-count', { timeout: 15000 }).should('contain', '25 waiting');
      cy.get('.queue-card.question .queue-count', { timeout: 15000 }).should('contain', '25 waiting');
    });
  });

  describe('TA Operations Under Load', () => {
    it('TA can navigate combined queue with 40 users', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add 40 users (20 marking, 20 question)
      cy.window().then((win) => {
        for (let i = 0; i < 20; i++) {
          win.socket.emit('join-marking', {
            name: `TANav_${i}`,
            studentId: String(2000 + i).padStart(4, '0'),
            email: null,
            userId: `ta-nav-m-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
          win.socket.emit('join-question', {
            name: `TANavQ_${i}`,
            email: null,
            userId: `ta-nav-q-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(3000);

      cy.loginAsTA();
      cy.wait(1500);

      // Dashboard should be responsive
      cy.contains('TA Dashboard', { timeout: 10000 }).should('be.visible');
      cy.get('.queue-card.combined .queue-count', { timeout: 10000 }).should('contain', '40 waiting');

      // TA can still click and navigate
      cy.contains('button', 'Next Marking').should('be.visible').click({ force: true });
      cy.wait(500);
      cy.contains('Start Assisting').should('be.visible');
    });

    it('TA can clear queue under load', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add 30 users
      cy.addBulkUsers('marking', 30, 'ClearLoad');
      cy.wait(2000);

      cy.loginAsTA();
      cy.wait(1500);

      // Verify count
      cy.get('.queue-card.combined .queue-count', { timeout: 10000 }).should('contain', '30 waiting');

      // Clear all
      cy.on('window:confirm', () => true);
      cy.contains('button', 'Clear All Queues').scrollIntoView().click({ force: true });
      cy.wait(1500);

      // Should be empty
      cy.contains('No one in queue').should('be.visible');
    });
  });

  describe('Real-time Updates Under Load', () => {
    it('student sees correct position when queue grows', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Join as first user
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('FirstStudent');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click({ force: true });
        cy.contains('#1', { timeout: 10000 }).should('be.visible');
      });

      // Add more users via socket
      cy.window().then((win) => {
        for (let i = 0; i < 10; i++) {
          win.socket.emit('join-question', {
            name: `LaterUser_${i}`,
            email: null,
            userId: `later-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(2000);

      // First user should still be #1
      cy.get('.queue-card.question').within(() => {
        cy.contains('#1').should('be.visible');
      });
    });

    it('student sees correct position when users leave', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add some users first
      cy.window().then((win) => {
        for (let i = 0; i < 5; i++) {
          win.socket.emit('join-question', {
            name: `Ahead_${i}`,
            email: null,
            userId: `ahead-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(1000);

      // Join as 6th user
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('SixthStudent');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click({ force: true });
        cy.contains('#6', { timeout: 10000 }).should('be.visible');
      });

      // TA clears queue (removes users ahead)
      cy.clearQueues();
      cy.wait(1000);

      // Should be back to form (no longer in queue)
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').should('be.visible');
      });
    });
  });

  describe('Concurrent User Sessions', () => {
    it('handles multiple users joining simultaneously', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Simulate burst of concurrent joins
      cy.window().then((win) => {
        for (let i = 0; i < 20; i++) {
          win.socket.emit('join-marking', {
            name: `Burst_${i}`,
            studentId: String(3000 + i).padStart(4, '0'),
            email: null,
            userId: `burst-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(3000);

      // All should be in queue
      cy.get('.queue-card.marking .queue-count', { timeout: 10000 }).should('contain', '20 waiting');
    });

    it('queue order is preserved under concurrent load', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add users with known order
      cy.window().then((win) => {
        for (let i = 0; i < 10; i++) {
          win.socket.emit('join-marking', {
            name: `Order_${i}`,
            studentId: String(4000 + i).padStart(4, '0'),
            email: null,
            userId: `order-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(2000);

      // Verify order is maintained
      cy.get('.queue-card.marking .queue-list .queue-item', { timeout: 10000 }).first()
        .should('contain', 'Order_0');
    });
  });

  describe('UI Performance Under Load', () => {
    it('UI remains responsive with 30 users in queue', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add 30 users
      cy.addBulkUsers('marking', 30, 'UILoad');
      cy.wait(3000);

      // UI interactions should still work
      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('NewUser');
        cy.get('input[placeholder="e.g., 1234"]').type('9999');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click({ force: true });
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });
    });

    it('scrolling works with many queue items', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add many users
      cy.addBulkUsers('question', 40, 'ScrollTest');
      cy.wait(3000);

      // List should be scrollable
      cy.get('.queue-card.question .queue-list', { timeout: 10000 }).should('exist');
      cy.get('.queue-card.question').should('contain', 'ScrollTest_0');
    });
  });
});
