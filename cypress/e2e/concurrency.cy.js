/**
 * Concurrency & Load Tests
 * Tests concurrent user operations and rapid event handling
 */

const TEST_ROOM = 'cypress-test';

describe('Concurrency & Load Test', () => {
  const VIRTUAL_USERS = 20;

  beforeEach(() => {
    cy.setupTestRoom();
    cy.resetTestState();
  });

  afterEach(() => {
    cy.clearQueues();
  });

  it('handles multiple concurrent joins', () => {
    cy.visitWithRoom('student');
    cy.waitForSocket();

    // 1. Join as main test user
    cy.get('.queue-card.marking').within(() => {
      cy.get('input[placeholder="Enter your name"]').type('Main User');
      cy.get('input[placeholder="e.g., 1234"]').type('0000');
      cy.contains('button', 'Join Queue').click({ force: true });
      cy.contains('#1', { timeout: 10000 }).should('be.visible');
    });

    // 2. Spawn virtual users via socket
    cy.window().then((win) => {
      for (let i = 0; i < VIRTUAL_USERS; i++) {
        win.socket.emit('join-marking', {
          name: `Virtual User ${i}`,
          studentId: String(1000 + i).padStart(4, '0'),
          email: null,
          userId: `virtual-uuid-${i}-${Date.now()}`,
          room: TEST_ROOM
        });
      }
    });

    cy.wait(2000);

    // 3. Verify UI updates count
    // Count should be VIRTUAL_USERS + 1 (Main User)
    cy.get('.queue-card.marking .queue-count', { timeout: 10000 }).should(($el) => {
      const text = $el.text();
      expect(text).to.contain(`${VIRTUAL_USERS + 1} waiting`);
    });

    // 4. Verify list renders (check for a few random virtual users)
    cy.get('.queue-list').should('contain', 'Virtual User 0');
    cy.get('.queue-list').should('contain', `Virtual User ${VIRTUAL_USERS - 1}`);
  });

  it('handles rapid updates correctly', () => {
    cy.visitWithRoom('student');
    cy.waitForSocket();

    // Join as main user
    cy.get('.queue-card.question').within(() => {
      cy.get('input[placeholder="Enter your name"]').type('Stress User');
      cy.contains('button', 'Join Queue').should('not.be.disabled').click({ force: true });
      cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
    });

    cy.wait(500);

    // Flood join events
    cy.window().then((win) => {
      let count = 0;
      const interval = setInterval(() => {
        const id = Math.floor(Math.random() * 10000);
        win.socket.emit('join-question', {
          name: `Flash User ${id}`,
          email: null,
          userId: `flash-${id}-${Date.now()}`,
          room: TEST_ROOM
        });
        count++;
        if (count >= 30) clearInterval(interval);
      }, 50); // Every 50ms
    });

    // Wait for flood to finish
    cy.wait(3000);

    // Verify UI is still responsive (we are still in queue)
    cy.get('.queue-card.question').within(() => {
      cy.contains('Your Position').should('be.visible');
      cy.contains('button', 'Leave Queue').click({ force: true });
    });

    cy.wait(500);

    // Should be back to form
    cy.get('.queue-card.question input').should('be.visible');
  });

  it('handles concurrent TA operations', () => {
    cy.visitWithRoom('student');
    cy.waitForSocket();

    // Add multiple users
    cy.addBulkUsers('marking', 10, 'ConcurrentUser');
    cy.wait(1500);

    // Login as TA
    cy.loginAsTA();
    cy.wait(500);

    // Rapid call operations
    for (let i = 0; i < 3; i++) {
      cy.contains('button', 'Next Marking').click({ force: true });
      cy.wait(300);
    }

    // UI should still be responsive
    cy.get('.queue-card.combined', { timeout: 10000 }).should('be.visible');
    cy.contains('Start Assisting').should('be.visible');
  });

  it('maintains correct queue order under concurrent load', () => {
    cy.visitWithRoom('student');
    cy.waitForSocket();

    // Add users in specific order
    cy.window().then((win) => {
      for (let i = 0; i < 5; i++) {
        win.socket.emit('join-marking', {
          name: `OrderedUser_${i}`,
          studentId: `100${i}`,
          email: null,
          userId: `ordered-${i}-${Date.now()}`,
          room: TEST_ROOM
        });
      }
    });

    cy.wait(1000);

    // Verify order is maintained
    cy.get('.queue-card.marking .queue-list .queue-item', { timeout: 10000 }).then(($items) => {
      const names = [];
      $items.each((i, el) => {
        const name = Cypress.$(el).text();
        if (name.includes('OrderedUser')) {
          names.push(name);
        }
      });

      // First user should be OrderedUser_0
      expect(names[0]).to.include('OrderedUser_0');
    });
  });

  it('handles multiple users leaving simultaneously', () => {
    cy.visitWithRoom('student');
    cy.waitForSocket();

    // Add users
    const users = [];
    cy.window().then((win) => {
      for (let i = 0; i < 10; i++) {
        const userId = `sim-leave-${i}-${Date.now()}`;
        users.push(userId);
        win.socket.emit('join-question', {
          name: `SimLeave_${i}`,
          email: null,
          userId: userId,
          room: TEST_ROOM
        });
      }
    });

    cy.wait(1000);

    // Verify all joined
    cy.get('.queue-card.question .queue-count').should('contain', '10 waiting');

    // Clear all (simulates everyone leaving)
    cy.clearQueues();

    cy.wait(1000);

    // Should show empty
    cy.get('.queue-card.question .queue-count').should('contain', '0 waiting');
  });

  it('handles socket reconnection during operations', () => {
    cy.visitWithRoom('student');
    cy.waitForSocket();

    // Get the user ID before joining
    let userId;
    cy.window().then((win) => {
      userId = win.localStorage.getItem('ece297-queue-user-id');
    });

    // Join queue
    cy.get('.queue-card.question').within(() => {
      cy.get('input[placeholder="Enter your name"]').clear().type('Reconnect Test');
      cy.contains('button', 'Join Queue').click({ force: true });
      cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
    });

    cy.wait(1000);

    // Verify user is in queue via API before disconnecting
    cy.window().then((win) => {
      const uid = win.localStorage.getItem('ece297-queue-user-id');
      cy.request(`http://localhost:3001/api/user-status?userId=${uid}`).then((response) => {
        expect(response.body.inQueue).to.be.true;
        expect(response.body.queueType).to.equal('question');
      });
    });

    // Disconnect the socket
    cy.window().then((win) => {
      win.socket.disconnect();
    });

    cy.wait(1000);

    // Verify socket is disconnected
    cy.window().its('socket.connected').should('be.false');

    // Reconnect the socket
    cy.window().then((win) => {
      win.socket.connect();
    });

    // Wait for reconnection
    cy.window().its('socket.connected', { timeout: 10000 }).should('be.true');
    cy.wait(2000);

    // Should restore state and show position
    cy.get('.queue-card.question', { timeout: 10000 }).within(() => {
      cy.contains('Your Position').should('be.visible');
    });

    // Also verify via API that user is still in queue
    cy.window().then((win) => {
      const uid = win.localStorage.getItem('ece297-queue-user-id');
      cy.request(`http://localhost:3001/api/user-status?userId=${uid}`).then((response) => {
        expect(response.body.inQueue).to.be.true;
      });
    });
  });
});
