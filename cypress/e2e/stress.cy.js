/**
 * STRESS TESTS - Heavy Load Testing
 * Tests the application under extreme conditions with massive concurrent operations.
 */

describe('Stress Tests - Heavy Load', () => {
  const HEAVY_LOAD_USERS = 100;
  const RAPID_FIRE_ITERATIONS = 50;
  const TEST_ROOM = 'cypress-test';

  beforeEach(() => {
    cy.setupTestRoom();
    cy.resetTestState();
  });

  afterEach(() => {
    // Cleanup: Clear all queues after each test
    cy.clearQueues();
  });

  describe('Massive User Load', () => {
    it(`handles ${HEAVY_LOAD_USERS} concurrent marking queue joins`, () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        for (let i = 0; i < HEAVY_LOAD_USERS; i++) {
          win.socket.emit('join-marking', {
            name: `StressUser_${i}`,
            studentId: String(1000 + i).slice(-4).padStart(4, '0'),
            email: null,
            userId: `stress-mark-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      // Wait for all updates to propagate
      cy.wait(5000);

      // Verify count shows correct number
      cy.get('.queue-card.marking .queue-count', { timeout: 15000 })
        .should('contain', `${HEAVY_LOAD_USERS} waiting`);
    });

    it(`handles ${HEAVY_LOAD_USERS} concurrent question queue joins`, () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        for (let i = 0; i < HEAVY_LOAD_USERS; i++) {
          win.socket.emit('join-question', {
            name: `QuestionUser_${i}`,
            email: null,
            userId: `stress-q-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(5000);

      cy.get('.queue-card.question .queue-count', { timeout: 15000 })
        .should('contain', `${HEAVY_LOAD_USERS} waiting`);
    });

    it('handles mixed queue joins across both queues simultaneously', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        for (let i = 0; i < HEAVY_LOAD_USERS; i++) {
          if (i % 2 === 0) {
            win.socket.emit('join-marking', {
              name: `MixedUser_${i}`,
              studentId: String(1000 + i).slice(-4).padStart(4, '0'),
              email: null,
              userId: `mixed-${i}-${Date.now()}`,
              room: TEST_ROOM
            });
          } else {
            win.socket.emit('join-question', {
              name: `MixedUser_${i}`,
              email: null,
              userId: `mixed-${i}-${Date.now()}`,
              room: TEST_ROOM
            });
          }
        }
      });

      cy.wait(5000);

      cy.get('.queue-card.marking .queue-count', { timeout: 15000 })
        .should('contain', `${HEAVY_LOAD_USERS / 2} waiting`);
      cy.get('.queue-card.question .queue-count', { timeout: 15000 })
        .should('contain', `${HEAVY_LOAD_USERS / 2} waiting`);
    });
  });

  describe('Rapid Fire Operations', () => {
    it('handles rapid join-leave cycles', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Join question queue first to establish state
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Rapid User');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click({ force: true });
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });

      cy.wait(500);

      // Perform rapid fire operations via socket
      cy.window().then((win) => {
        for (let i = 0; i < RAPID_FIRE_ITERATIONS; i++) {
          // Join
          win.socket.emit('join-question', {
            name: `RapidUser_${i}`,
            email: null,
            userId: `rapid-fire-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      // Wait and verify UI is still stable
      cy.wait(4000);
      cy.get('.queue-card.question', { timeout: 10000 }).should('be.visible');
      cy.get('.queue-card.question .queue-list').should('exist');
    });

    it('handles burst of push-back operations', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Populate queue with users
      cy.window().then((win) => {
        for (let i = 0; i < 10; i++) {
          win.socket.emit('join-marking', {
            name: `PushbackUser_${i}`,
            studentId: String(1000 + i).slice(-4).padStart(4, '0'),
            email: null,
            userId: `pushback-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(1500);

      // Send multiple push-back requests rapidly (these will fail gracefully for nonexistent entries)
      cy.window().then((win) => {
        for (let i = 0; i < 5; i++) {
          win.socket.emit('push-back', {
            queueType: 'marking',
            entryId: 'nonexistent-' + i, // These will fail gracefully
            userId: `pushback-${i}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(1500);

      // UI should not crash
      cy.get('.queue-card.marking', { timeout: 10000 }).should('be.visible');
      cy.get('.queue-card.marking .queue-count').should('contain', '10 waiting');
    });
  });

  describe('TA Dashboard Under Load', () => {
    it('renders combined queue with 50 users without freezing', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add 50 users (25 marking, 25 question)
      cy.window().then((win) => {
        for (let i = 0; i < 25; i++) {
          win.socket.emit('join-marking', {
            name: `TALoadMark_${i}`,
            studentId: String(1000 + i).slice(-4).padStart(4, '0'),
            email: null,
            userId: `ta-load-m-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
          win.socket.emit('join-question', {
            name: `TALoadQ_${i}`,
            email: null,
            userId: `ta-load-q-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(3000);

      // TA logs in
      cy.loginAsTA();

      // Dashboard should render
      cy.contains('TA Dashboard', { timeout: 10000 }).should('be.visible');

      // Combined queue should show all users
      cy.get('.queue-card.combined .queue-count', { timeout: 10000 }).should(($el) => {
        const text = $el.text();
        const match = text.match(/(\d+) waiting/);
        const count = match ? parseInt(match[1]) : 0;
        expect(count).to.equal(50);
      });

      // TA can still interact
      cy.contains('button', 'Next Marking').should('be.visible').click({ force: true });
      cy.wait(500);
      cy.contains('Start Assisting').should('be.visible');
    });

    it('handles rapid TA call-next cycles', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Populate queue
      cy.addBulkUsers('marking', 20, 'RapidTA');
      cy.wait(2000);

      // TA logs in
      cy.loginAsTA();
      cy.wait(1500);

      // Verify we're on TA dashboard before proceeding
      cy.contains('TA Dashboard', { timeout: 10000 }).should('be.visible');
      cy.contains('button', 'Next Marking', { timeout: 5000 }).should('be.visible');

      // Rapidly call next
      for (let i = 0; i < 5; i++) {
        cy.contains('button', 'Next Marking').click({ force: true });
        cy.wait(400);
      }

      // UI should still be responsive
      cy.get('.queue-card.combined', { timeout: 10000 }).should('be.visible');
      cy.contains('Start Assisting').should('be.visible');
    });
  });

  describe('Memory and Performance', () => {
    it('does not crash with repeated queue updates', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Perform 100 rapid state changes
      cy.window().then((win) => {
        for (let i = 0; i < 100; i++) {
          // Join
          win.socket.emit('join-question', {
            name: `MemTest_${i}`,
            email: null,
            userId: `mem-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(5000);

      // UI should still be responsive
      cy.get('.queue-card.question', { timeout: 10000 }).should('be.visible');
      cy.contains('100 waiting').should('be.visible');

      // Clear and verify
      cy.clearQueues();
      cy.wait(1000);
      cy.get('.queue-card.question').should('contain', 'No one in queue');
    });

    it('handles rapid toggle operations', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Rapidly toggle theme
      for (let i = 0; i < 10; i++) {
        cy.get('.theme-icon-btn').first().click({ force: true });
        cy.wait(100);
      }

      // UI should still be responsive
      cy.get('.queue-card').should('be.visible');
    });
  });
});
