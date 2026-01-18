/**
 * CHAOS ENGINEERING TESTS - Race Conditions, Network Issues & Malformed Data
 * Tests application resilience under chaotic conditions.
 */

const TEST_ROOM = 'cypress-test';

describe('Chaos Engineering Tests', () => {
  beforeEach(() => {
    cy.setupTestRoom();
    cy.resetTestState();
  });

  afterEach(() => {
    cy.clearQueues();
  });

  describe('Race Conditions', () => {
    it('handles simultaneous joins from multiple users', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        // Fire 50 joins simultaneously
        for (let i = 0; i < 50; i++) {
          win.socket.emit('join-question', {
            name: `RaceUser_${i}`,
            email: null,
            userId: `race-${i}-${Date.now()}-${Math.random()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(3000);
      cy.get('.queue-card.question .queue-count', { timeout: 10000 }).should('contain', '50 waiting');
    });

    it('handles TA calling while students are joining', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Start with 5 users
      cy.window().then((win) => {
        for (let i = 0; i < 5; i++) {
          win.socket.emit('join-marking', {
            name: `TACallRace_${i}`,
            studentId: `000${i}`,
            email: null,
            userId: `ta-race-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(500);

      // Simultaneously add more users AND call next
      cy.window().then((win) => {
        win.socket.emit('ta-checkin', { queueType: 'marking', room: TEST_ROOM });
        for (let i = 5; i < 10; i++) {
          win.socket.emit('join-marking', {
            name: `TACallRace_${i}`,
            studentId: `000${i}`,
            email: null,
            userId: `ta-race-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(1500);
      cy.get('.queue-card.marking', { timeout: 10000 }).should('be.visible');
    });

    it('handles multiple TAs calling simultaneously', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        for (let i = 0; i < 10; i++) {
          win.socket.emit('join-marking', {
            name: `MultiTA_${i}`,
            studentId: `000${i}`,
            email: null,
            userId: `multi-ta-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(500);

      // Multiple "TAs" call at once
      cy.window().then((win) => {
        win.socket.emit('ta-checkin', { queueType: 'marking', room: TEST_ROOM });
        win.socket.emit('ta-checkin', { queueType: 'marking', room: TEST_ROOM });
        win.socket.emit('ta-checkin', { queueType: 'marking', room: TEST_ROOM });
      });

      cy.wait(1000);
      cy.get('.queue-card.marking', { timeout: 10000 }).should('be.visible');
    });

    it('handles leave and join in rapid succession', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('RapidLeaveJoin');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click({ force: true });
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });

      cy.wait(500);

      // Rapid operations via socket
      cy.window().then((win) => {
        win.socket.emit('join-question', { name: 'Rapid1', email: null, userId: `rapid-1-${Date.now()}`, room: TEST_ROOM });
        win.socket.emit('join-question', { name: 'Rapid2', email: null, userId: `rapid-2-${Date.now()}`, room: TEST_ROOM });
      });

      cy.wait(1500);
      cy.get('.queue-card.question', { timeout: 10000 }).should('be.visible');
    });
  });

  describe('Malformed Data Handling', () => {
    it('handles join with empty name via socket', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: '',
          email: null,
          userId: `empty-name-test-${Date.now()}`,
          room: TEST_ROOM
        });
      });

      cy.wait(500);
      cy.get('.queue-card.question', { timeout: 10000 }).should('be.visible');
    });

    it('handles join with null userId', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: 'NullUserIdTest',
          email: null,
          userId: null,
          room: TEST_ROOM
        });
      });

      cy.wait(500);
      cy.get('.queue-card.question', { timeout: 10000 }).should('be.visible');
    });

    it('handles join with undefined fields', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: 'UndefinedFields',
          room: TEST_ROOM
          // Missing userId and email
        });
      });

      cy.wait(500);
      cy.get('.queue-card.question', { timeout: 10000 }).should('be.visible');
    });

    it('handles leave with invalid entryId', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('leave-queue', {
          queueType: 'marking',
          entryId: 'nonexistent-entry-id-12345',
          userId: 'some-user',
          room: TEST_ROOM
        });
      });

      cy.wait(500);
      cy.get('body').should('be.visible');
    });

    it('handles invalid queueType', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('ta-checkin', { queueType: 'invalid-queue-type', room: TEST_ROOM });
        win.socket.emit('ta-next', { queueType: 'nonexistent', room: TEST_ROOM });
      });

      cy.wait(500);
      cy.get('body').should('be.visible');
    });

    it('handles extremely long name', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();
      const longName = 'a'.repeat(200);

      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: longName,
          email: 'test@test.com',
          userId: `long-name-user-${Date.now()}`,
          room: TEST_ROOM
        });
      });

      cy.wait(500);
      cy.get('.queue-card.question', { timeout: 10000 }).should('be.visible');
    });
  });

  describe('Connection Resilience', () => {
    it('recovers after disconnect/reconnect', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('DisconnectUser');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click({ force: true });
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });

      cy.wait(1000);

      cy.window().then((win) => {
        win.socket.disconnect();
      });

      cy.wait(500);
      cy.get('.connection-status').should('contain', 'Disconnected');

      cy.window().then((win) => {
        win.socket.connect();
      });

      cy.wait(3000);
      cy.get('.connection-status').should('contain', 'Connected');
      cy.get('.queue-card.question').within(() => {
        cy.contains('Your Position').should('be.visible');
      });
    });

    it('handles multiple rapid reconnects', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        for (let i = 0; i < 5; i++) {
          win.socket.disconnect();
          win.socket.connect();
        }
      });

      cy.wait(3000);
      cy.get('.queue-card', { timeout: 10000 }).should('be.visible');
    });
  });

  describe('State Corruption Recovery', () => {
    it('handles cleared localStorage mid-session', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('ClearStorageUser');
        cy.contains('button', 'Join Queue').click({ force: true });
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });

      cy.window().then((win) => {
        win.localStorage.clear();
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(1000);
      
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').should('be.visible');
      });
    });

    it('handles corrupted userId in localStorage', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', '{"invalid": "json');
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);
      
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('CorruptedIDUser');
        cy.contains('button', 'Join Queue').click({ force: true });
      });

      cy.wait(1000);
      cy.get('.queue-card.question', { timeout: 10000 }).should('be.visible');
    });
  });

  describe('TA Edge Chaos', () => {
    it('TA calls next on empty combined queue', () => {
      cy.loginAsTA();

      cy.window().then((win) => {
        win.socket.emit('ta-checkin', { queueType: 'combined', room: TEST_ROOM });
      });

      cy.wait(500);
      cy.get('.queue-card.combined', { timeout: 10000 }).should('be.visible');
      cy.contains('No one in queue').should('be.visible');
    });

    it('TA finishes assisting when nobody is being assisted', () => {
      cy.loginAsTA();

      cy.window().then((win) => {
        win.socket.emit('ta-next', { queueType: 'marking', room: TEST_ROOM });
        win.socket.emit('ta-next', { queueType: 'question', room: TEST_ROOM });
        win.socket.emit('ta-next', { queueType: 'combined', room: TEST_ROOM });
      });

      cy.wait(500);
      cy.get('.queue-card.combined', { timeout: 10000 }).should('be.visible');
    });

    it('TA removes non-existent entry', () => {
      cy.loginAsTA();

      cy.window().then((win) => {
        win.socket.emit('ta-remove', {
          queueType: 'marking',
          entryId: 'does-not-exist-12345',
          room: TEST_ROOM
        });
      });

      cy.wait(500);
      cy.get('.queue-card.combined', { timeout: 10000 }).should('be.visible');
    });

    it('handles rapid clear-all operations', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add users
      cy.window().then((win) => {
        for (let i = 0; i < 20; i++) {
          win.socket.emit('join-question', {
            name: `ClearTest_${i}`,
            email: null,
            userId: `clear-test-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(1000);

      // Rapid clear
      cy.window().then((win) => {
        win.socket.emit('ta-clear-all', { room: TEST_ROOM });
        win.socket.emit('ta-clear-all', { room: TEST_ROOM });
        win.socket.emit('ta-clear-all', { room: TEST_ROOM });
      });

      cy.wait(1000);
      cy.get('.queue-card.question').within(() => {
        cy.contains('0 waiting').should('be.visible');
      });
    });
  });

  describe('Push Back Chaos', () => {
    it('handles push back for non-existent entry', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('push-back', {
          queueType: 'marking',
          entryId: 'fake-entry-id',
          userId: 'fake-user',
          room: TEST_ROOM
        });
      });

      cy.wait(500);
      cy.get('body').should('be.visible');
    });

    it('handles push back with wrong queueType', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'WrongQueue',
          studentId: '1234',
          email: null,
          userId: `wrong-queue-user-${Date.now()}`,
          room: TEST_ROOM
        });
      });

      cy.wait(500);

      cy.window().then((win) => {
        // Try to push back in wrong queue
        win.socket.emit('push-back', {
          queueType: 'question', // Wrong queue!
          entryId: 'some-id',
          userId: `wrong-queue-user`,
          room: TEST_ROOM
        });
      });

      cy.wait(500);
      cy.get('.queue-card.marking', { timeout: 10000 }).should('be.visible');
    });
  });

  describe('Hash Routing Chaos', () => {
    it('handles rapid hash changes', () => {
      cy.visitWithRoom();
      cy.wait(500);

      cy.window().then((win) => {
        win.location.hash = 'student';
        win.location.hash = 'ta';
        win.location.hash = 'student';
        win.location.hash = '';
        win.location.hash = 'student';
      });

      cy.wait(1500);
      cy.get('body').should('be.visible');
    });

    it('handles navigation to All Rooms and back', () => {
      cy.visitWithRoom('student');
      cy.wait(500);

      // Navigate to All Rooms
      cy.visit('/#all');
      cy.contains('Active Rooms', { timeout: 10000 }).should('be.visible');

      // Navigate back to student
      cy.visitWithRoom('student');
      cy.get('.queue-card', { timeout: 10000 }).should('be.visible');
    });
  });

  describe('All Rooms View Chaos', () => {
    it('handles All Rooms view with real-time updates', () => {
      cy.visit('/#all');
      cy.waitForSocket();
      cy.wait(1000);

      // Add user while viewing All Rooms
      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'AllRoomsTest',
          studentId: '1234',
          email: null,
          userId: `all-rooms-test-${Date.now()}`,
          room: TEST_ROOM
        });
      });

      cy.wait(1500);

      // Should update without crash
      cy.get('body').should('be.visible');
      cy.contains('Active Rooms').should('be.visible');
    });
  });

  describe('Special Characters and Unicode', () => {
    it('handles special characters in names', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Test <script>alert(1)</script>');
        cy.contains('button', 'Join Queue').click({ force: true });
      });

      cy.wait(500);
      cy.get('.queue-card.question', { timeout: 10000 }).should('be.visible');
    });

    it('handles unicode characters in names', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('测试用户 🎉');
        cy.contains('button', 'Join Queue').click({ force: true });
      });

      cy.wait(500);
      cy.get('.queue-card.question').should('contain', '测试用户');
    });
  });
});
