/**
 * CROSS-ROOM TESTS - Multi-Room Operations and Restrictions
 * Tests that users cannot be in queues in multiple rooms simultaneously.
 */

const TEST_ROOM_1 = 'cypress-test';
const TEST_ROOM_2 = 'cypress-test-2';
const API_URL = 'http://localhost:3001';

describe('Cross-Room Operations', () => {
  // Generate a unique user ID for each test file run
  let testUserId;

  beforeEach(() => {
    // Generate fresh user ID for this test
    testUserId = `cross-room-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Setup both test rooms via API
    cy.setupMultipleRooms();

    // Clear both rooms first via API calls to ensure clean state
    cy.request({
      method: 'POST',
      url: `${API_URL}/api/room-auth`,
      body: { room: TEST_ROOM_1, password: 'testpass' },
      failOnStatusCode: false
    });

    // Visit first room and set user ID
    cy.visitRoom(TEST_ROOM_1, 'student');
    cy.waitForSocket();

    // Set the unique user ID in localStorage
    cy.window().then((win) => {
      win.localStorage.setItem('ece297-queue-user-id', testUserId);
    });

    // Clear queues for both rooms
    cy.window().then((win) => {
      if (win.socket && win.socket.connected) {
        win.socket.emit('ta-clear-all', { room: TEST_ROOM_1 });
        win.socket.emit('ta-clear-all', { room: TEST_ROOM_2 });
      }
    });

    cy.wait(1000); // Wait for clear to propagate
  });

  afterEach(() => {
    // Clear queues after each test
    cy.window().then((win) => {
      if (win.socket && win.socket.connected) {
        win.socket.emit('ta-clear-all', { room: TEST_ROOM_1 });
        win.socket.emit('ta-clear-all', { room: TEST_ROOM_2 });
      }
    });
    cy.wait(500);
  });

  describe('Cross-Room Join Prevention', () => {
    it('prevents user from joining a queue in Room 2 when already in Room 1 marking queue', () => {
      // Visit Room 1 and ensure user ID is set
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      // Reload to pick up the user ID
      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      // Join marking queue in Room 1 via UI
      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Cross Room User');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('1234');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      // Wait for join confirmation
      cy.get('.queue-card.marking').contains('Your Position', { timeout: 10000 }).should('be.visible');
      cy.wait(1000);

      // Verify user is in Room 1 via API
      cy.request(`${API_URL}/api/user-status?userId=${testUserId}`).then((response) => {
        expect(response.body.inQueue).to.be.true;
        expect(response.body.room).to.equal(TEST_ROOM_1);
        expect(response.body.queueType).to.equal('marking');
      });

      // Visit Room 2 while maintaining the same user ID
      cy.visit(`/?ta=${TEST_ROOM_2}#student`);
      cy.waitForSocket();

      // Set the same user ID in the new page context
      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.wait(500);

      // Attempt to join Room 2's marking queue via socket emit
      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'Cross Room User',
          studentId: '5678',
          email: null,
          userId: testUserId,
          room: TEST_ROOM_2
        });
      });

      cy.wait(1000);

      // Should see error toast about being in another room
      cy.get('.toast-container .toast.error', { timeout: 10000 })
        .should('be.visible')
        .and('contain', 'already in a queue');
    });

    it('prevents user from joining a queue in Room 2 when already in Room 1 question queue', () => {
      // Visit Room 1
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      // Join question queue in Room 1
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Question User');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.question').contains('Your Position', { timeout: 10000 }).should('be.visible');
      cy.wait(1000);

      // Visit Room 2
      cy.visit(`/?ta=${TEST_ROOM_2}#student`);
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.wait(500);

      // Try to join Room 2's question queue
      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: 'Question User',
          email: null,
          userId: testUserId,
          room: TEST_ROOM_2
        });
      });

      cy.wait(1000);

      // Should see error
      cy.get('.toast-container .toast.error', { timeout: 10000 })
        .should('be.visible')
        .and('contain', 'already in a queue');
    });
  });

  describe('Same Room Multiple Queue Behavior', () => {
    it('allows user to be in both marking and question queue in the SAME room', () => {
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      // Join marking queue
      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Dual Queue User');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('7777');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.marking').contains('Your Position', { timeout: 10000 }).should('be.visible');
      cy.wait(500);

      // Join question queue in same room
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Dual Queue User');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.question').contains('Your Position', { timeout: 10000 }).should('be.visible');

      // Both should show position
      cy.get('.queue-card.marking').should('contain', 'Your Position');
      cy.get('.queue-card.question').should('contain', 'Your Position');
    });
  });

  describe('Leave and Switch Rooms', () => {
    it('allows user to join Room 2 after leaving Room 1 queue', () => {
      // Join Room 1
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Switcher');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('8888');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.marking').contains('Your Position', { timeout: 10000 }).should('be.visible');
      cy.wait(500);

      // Leave Room 1 queue
      cy.get('.queue-card.marking').within(() => {
        cy.contains('button', 'Leave Queue').click({ force: true });
      });

      cy.wait(1000);

      // Verify left via API
      cy.request(`${API_URL}/api/user-status?userId=${testUserId}`).then((response) => {
        expect(response.body.inQueue).to.be.false;
      });

      // Now join Room 2 - should succeed
      cy.visit(`/?ta=${TEST_ROOM_2}#student`);
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Switcher');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('8888');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.marking').contains('Your Position', { timeout: 10000 }).should('be.visible');

      // Verify in Room 2 via API
      cy.request(`${API_URL}/api/user-status?userId=${testUserId}`).then((response) => {
        expect(response.body.inQueue).to.be.true;
        expect(response.body.room).to.equal(TEST_ROOM_2);
      });
    });
  });

  describe('User Status API', () => {
    it('API correctly reports user is not in any queue initially', () => {
      cy.request(`${API_URL}/api/user-status?userId=${testUserId}`).then((response) => {
        expect(response.body.inQueue).to.be.false;
      });
    });

    it('API correctly reports user room and queue after joining', () => {
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('API Test User');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('1111');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.marking').contains('Your Position', { timeout: 10000 }).should('be.visible');
      cy.wait(1000);

      cy.request(`${API_URL}/api/user-status?userId=${testUserId}`).then((response) => {
        expect(response.body.inQueue).to.be.true;
        expect(response.body.room).to.equal(TEST_ROOM_1);
        expect(response.body.queueType).to.equal('marking');
      });
    });

    it('API correctly reports user left after leaving queue', () => {
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Leave Test User');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.question').contains('Your Position', { timeout: 10000 }).should('be.visible');
      cy.wait(500);

      cy.get('.queue-card.question').within(() => {
        cy.contains('button', 'Leave Queue').click({ force: true });
      });

      cy.wait(1000);

      cy.request(`${API_URL}/api/user-status?userId=${testUserId}`).then((response) => {
        expect(response.body.inQueue).to.be.false;
      });
    });
  });

  describe('Room Navigation Scenarios', () => {
    it('user sees their position when returning to original room', () => {
      // Join Room 1
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Navigator');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('2222');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.marking').contains('Your Position', { timeout: 10000 }).should('be.visible');
      cy.get('.queue-card.marking').contains('#1').should('be.visible');

      cy.wait(1000);

      // Visit Room 2 (just viewing, not joining)
      cy.visit(`/?ta=${TEST_ROOM_2}#student`);
      cy.waitForSocket();

      // Set same user ID
      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.wait(500);

      // Should see empty form in Room 2
      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').should('be.visible');
      });

      // Go back to Room 1
      cy.visit(`/?ta=${TEST_ROOM_1}#student`);
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.wait(1500);

      // Should still see position
      cy.get('.queue-card.marking', { timeout: 10000 }).should('contain', 'Your Position');
      cy.get('.queue-card.marking').should('contain', '#1');
    });

    it('Room 2 shows queues are independent from Room 1', () => {
      // Add users to Room 1 via socket
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();
      cy.wait(500);

      cy.window().then((win) => {
        for (let i = 0; i < 5; i++) {
          win.socket.emit('join-marking', {
            name: `Room1User_${i}`,
            studentId: `100${i}`,
            email: null,
            userId: `room1-user-${i}-${Date.now()}`,
            room: TEST_ROOM_1
          });
        }
      });

      cy.wait(1500);

      // Verify Room 1 has 5 users
      cy.get('.queue-card.marking .queue-count').should('contain', '5 waiting');

      // Visit Room 2
      cy.visit(`/?ta=${TEST_ROOM_2}#student`);
      cy.waitForSocket();
      cy.wait(1000);

      // Room 2 should be empty
      cy.get('.queue-card.marking .queue-count').should('contain', '0 waiting');
    });
  });

  describe('TA Clears Room Does Not Affect Other Rooms', () => {
    it('TA clearing Room 1 does not affect Room 2 queues', () => {
      // Add users to Room 1
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();
      cy.wait(500);

      cy.window().then((win) => {
        for (let i = 0; i < 3; i++) {
          win.socket.emit('join-marking', {
            name: `ClearR1User_${i}`,
            studentId: `300${i}`,
            email: null,
            userId: `clear-r1-${i}-${Date.now()}`,
            room: TEST_ROOM_1
          });
        }
      });

      cy.wait(500);

      // Add to Room 2
      cy.window().then((win) => {
        for (let i = 0; i < 2; i++) {
          win.socket.emit('join-marking', {
            name: `ClearR2User_${i}`,
            studentId: `400${i}`,
            email: null,
            userId: `clear-r2-${i}-${Date.now()}`,
            room: TEST_ROOM_2
          });
        }
      });

      cy.wait(1000);

      // Clear Room 1
      cy.window().then((win) => {
        win.socket.emit('ta-clear-all', { room: TEST_ROOM_1 });
      });

      cy.wait(1000);

      // Room 1 should be empty
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();
      cy.wait(1000);
      cy.get('.queue-card.marking .queue-count').should('contain', '0 waiting');

      // Room 2 should still have 2 users
      cy.visit(`/?ta=${TEST_ROOM_2}#student`);
      cy.waitForSocket();
      cy.wait(1000);
      cy.get('.queue-card.marking .queue-count').should('contain', '2 waiting');
    });
  });

  describe('Cross-Room Follow Prevention', () => {
    it('prevents user from following a question in Room 2 when in a queue in Room 1', () => {
      // User joins marking queue in Room 1
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Follower Test User');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('1234');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.marking').contains('Your Position', { timeout: 10000 }).should('be.visible');
      cy.wait(500);

      // Another user adds a question in Room 2
      const questionUserId = `question-user-${Date.now()}`;
      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: 'Question Asker',
          email: null,
          description: 'Help with pathfinding',
          userId: questionUserId,
          room: TEST_ROOM_2
        });
      });

      cy.wait(500);

      // Visit Room 2 and try to follow the question
      cy.visit(`/?ta=${TEST_ROOM_2}#student`);
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.wait(500);

      // Try to follow the question via socket
      cy.window().then((win) => {
        // Get the question entry ID first
        const questionQueue = win.document.querySelector('.queue-card.question');
        // Emit follow-question event
        win.socket.emit('follow-question', {
          entryId: 'some-entry-id', // We'll get this from the queue
          userId: testUserId,
          name: 'Follower Test User',
          room: TEST_ROOM_2
        });
      });

      cy.wait(500);

      // Should see error toast about being in another room
      cy.get('.toast-container .toast.error', { timeout: 10000 })
        .should('be.visible')
        .and('contain', 'cannot follow questions');
    });

    it('allows user to follow a question in the same room they are queued in', () => {
      // User joins marking queue in Room 1
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      // Add a question to Room 1 from another user
      const questionUserId = `question-user-same-room-${Date.now()}`;
      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: 'Question Person',
          email: null,
          description: 'Need help with M2',
          userId: questionUserId,
          room: TEST_ROOM_1
        });
      });

      cy.wait(500);

      // Verify the question appears
      cy.get('.queue-card.question').should('contain', 'Question Person');

      // Current user joins marking queue
      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Same Room Follower');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('9999');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.marking').contains('Your Position', { timeout: 10000 }).should('be.visible');
      cy.wait(500);

      // Now try to follow the question - should work since same room
      cy.get('.queue-card.question .queue-item').first().within(() => {
        cy.get('button').contains('Me too').click({ force: true });
      });

      cy.wait(500);

      // Should see success toast or the button should change to "Following"
      cy.get('.queue-card.question .queue-item').first().within(() => {
        cy.get('button').should('contain', 'Following');
      });
    });

    it('user can follow questions after leaving queue in other room', () => {
      // User joins queue in Room 1
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Leave Then Follow');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('7777');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.marking').contains('Your Position', { timeout: 10000 }).should('be.visible');
      cy.wait(500);

      // Leave the queue in Room 1
      cy.get('.queue-card.marking').within(() => {
        cy.contains('button', 'Leave Queue').click({ force: true });
      });

      cy.wait(1000);

      // Verify left via API
      cy.request(`${API_URL}/api/user-status?userId=${testUserId}`).then((response) => {
        expect(response.body.inQueue).to.be.false;
      });

      // Add a question to Room 2 from another user
      const questionUserId = `question-user-follow-after-${Date.now()}`;
      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: 'Room 2 Question',
          email: null,
          description: 'Help with algorithms',
          userId: questionUserId,
          room: TEST_ROOM_2
        });
      });

      cy.wait(500);

      // Visit Room 2 and follow the question - should work now
      cy.visit(`/?ta=${TEST_ROOM_2}#student`);
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.wait(500);

      // Verify the question appears
      cy.get('.queue-card.question').should('contain', 'Room 2 Question');

      // Enter name first (required for following)
      cy.get('.queue-card.question input[placeholder="Enter your name"]').clear().type('Leave Then Follow');

      // Try to follow the question - should work
      cy.get('.queue-card.question .queue-item').first().within(() => {
        cy.get('button').contains('Me too').click({ force: true });
      });

      cy.wait(500);

      // Should see success toast
      cy.get('.toast-container .toast.success', { timeout: 10000 })
        .should('be.visible')
        .and('contain', 'Following');
    });
  });

  describe('Edge Cases', () => {
    it('user removed by TA can immediately join another room', () => {
      // Join Room 1
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Remove Me');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('5555');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.marking').contains('Your Position', { timeout: 10000 }).should('be.visible');
      cy.wait(500);

      // TA clears Room 1 (simulating removal)
      cy.window().then((win) => {
        win.socket.emit('ta-clear-all', { room: TEST_ROOM_1 });
      });

      cy.wait(1500);

      // Verify user is no longer in queue
      cy.request(`${API_URL}/api/user-status?userId=${testUserId}`).then((response) => {
        expect(response.body.inQueue).to.be.false;
      });

      // Should now be able to join Room 2
      cy.visit(`/?ta=${TEST_ROOM_2}#student`);
      cy.waitForSocket();

      cy.window().then((win) => {
        win.localStorage.setItem('ece297-queue-user-id', testUserId);
      });

      cy.reload();
      cy.waitForSocket();
      cy.wait(500);

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').clear().type('Remove Me');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('5555');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.marking').contains('Your Position', { timeout: 10000 }).should('be.visible');

      // Verify in Room 2
      cy.request(`${API_URL}/api/user-status?userId=${testUserId}`).then((response) => {
        expect(response.body.inQueue).to.be.true;
        expect(response.body.room).to.equal(TEST_ROOM_2);
      });
    });

    it('different users can join different rooms without issues', () => {
      // First user joins Room 1
      cy.visitRoom(TEST_ROOM_1, 'student');
      cy.waitForSocket();
      cy.wait(500);

      const user1Id = `user1-${Date.now()}`;
      const user2Id = `user2-${Date.now()}`;

      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'User1',
          studentId: '1111',
          email: null,
          userId: user1Id,
          room: TEST_ROOM_1
        });
      });

      cy.wait(500);

      // Second user joins Room 2
      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'User2',
          studentId: '2222',
          email: null,
          userId: user2Id,
          room: TEST_ROOM_2
        });
      });

      cy.wait(1000);

      // Verify Room 1 has User1
      cy.get('.queue-card.marking').should('contain', 'User1');
      cy.get('.queue-card.marking').should('not.contain', 'User2');

      // Verify Room 2 has User2
      cy.visit(`/?ta=${TEST_ROOM_2}#student`);
      cy.waitForSocket();
      cy.wait(1000);
      cy.get('.queue-card.marking').should('contain', 'User2');
      cy.get('.queue-card.marking').should('not.contain', 'User1');

      // Verify via API
      cy.request(`${API_URL}/api/user-status?userId=${user1Id}`).then((response) => {
        expect(response.body.inQueue).to.be.true;
        expect(response.body.room).to.equal(TEST_ROOM_1);
      });

      cy.request(`${API_URL}/api/user-status?userId=${user2Id}`).then((response) => {
        expect(response.body.inQueue).to.be.true;
        expect(response.body.room).to.equal(TEST_ROOM_2);
      });
    });
  });
});
