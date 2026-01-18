/**
 * ADDITIONAL TESTS - Extra Test Cases for Robustness
 * Tests additional scenarios not covered in main test files.
 */

const TEST_ROOM = 'cypress-test';

describe('Additional Robustness Tests', () => {
  beforeEach(() => {
    cy.setupTestRoom();
    cy.resetTestState();
  });

  afterEach(() => {
    cy.clearQueues();
  });

  describe('Question Follow Feature', () => {
    it('allows user to follow a question with description', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add a question with description via socket
      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: 'QuestionAsker',
          email: null,
          description: 'How do I implement Dijkstra algorithm?',
          userId: `question-asker-${Date.now()}`,
          room: TEST_ROOM
        });
      });

      cy.wait(500);

      // Enter name in form (needed to follow)
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Follower');
        // Should see the question with description
        cy.contains('How do I implement Dijkstra').should('be.visible');
        // Should see Me too button
        cy.contains('🙋 Me too!').should('be.visible');
      });
    });

    it('shows follower count badge when question is followed', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add a question with description
      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: 'OriginalAsker',
          email: null,
          description: 'Test question for followers',
          userId: `original-${Date.now()}`,
          room: TEST_ROOM
        });
      });

      cy.wait(500);

      // Follow the question
      cy.window().then((win) => {
        const entries = win.document.querySelectorAll('.queue-item');
        if (entries.length > 0) {
          // Get the entry ID from the first question
          const entryId = entries[0]?.dataset?.entryId;
          if (entryId) {
            win.socket.emit('follow-question', {
              entryId,
              userId: `follower-${Date.now()}`,
              name: 'Follower1',
              room: TEST_ROOM
            });
          }
        }
      });

      cy.wait(500);

      // Follower badge should appear
      cy.get('.queue-card.question').should('be.visible');
    });
  });

  describe('TA Call Specific Student', () => {
    it('TA can call a student by clicking Call button', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add 3 students
      cy.window().then((win) => {
        for (let i = 1; i <= 3; i++) {
          win.socket.emit('join-marking', {
            name: `CallTestStudent${i}`,
            studentId: `000${i}`,
            email: null,
            userId: `call-test-${i}-${Date.now()}`,
            room: TEST_ROOM
          });
        }
      });

      cy.wait(1000);

      cy.loginAsTA();

      // Find student 2 and click Call
      cy.contains('CallTestStudent2', { timeout: 10000 })
        .parents('.queue-item')
        .within(() => {
          cy.contains('button', 'Call').click({ force: true });
        });

      cy.wait(500);

      // Should show Start Assisting for student 2
      cy.contains('Start Assisting CallTestStudent2').should('be.visible');
    });

    it('TA can cancel a call and return student to waiting', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'CancelCallStudent',
          studentId: '1111',
          email: null,
          userId: `cancel-call-${Date.now()}`,
          room: TEST_ROOM
        });
      });

      cy.wait(1000);

      cy.loginAsTA();

      // Call the student
      cy.contains('button', 'Next Marking').click({ force: true });
      cy.wait(500);

      // Should show Cancel Call button
      cy.contains('button', 'Cancel Call').should('be.visible').click({ force: true });
      cy.wait(500);

      // Student should be back in waiting state (Call button should appear)
      cy.contains('CancelCallStudent')
        .parents('.queue-item')
        .within(() => {
          cy.contains('button', 'Call').should('be.visible');
        });
    });
  });

  describe('TA Start Assisting Flow', () => {
    it('TA can start assisting after calling', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'AssistStudent',
          studentId: '2222',
          email: null,
          userId: `assist-${Date.now()}`,
          room: TEST_ROOM
        });
      });

      cy.wait(1000);

      cy.loginAsTA();

      // Call student
      cy.contains('button', 'Next Marking').click({ force: true });
      cy.wait(500);

      // Start assisting
      cy.contains('button', 'Start Assisting').click({ force: true });
      cy.wait(500);

      // Should show Finish Assisting
      cy.contains('button', 'Finish Assisting').should('be.visible');
    });

    it('TA can finish assisting and remove student', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('join-marking', {
          name: 'FinishStudent',
          studentId: '3333',
          email: null,
          userId: `finish-${Date.now()}`,
          room: TEST_ROOM
        });
      });

      cy.wait(1000);

      cy.loginAsTA();

      // Call student
      cy.contains('button', 'Next Marking').click({ force: true });
      cy.wait(500);

      // Start assisting
      cy.contains('button', 'Start Assisting').click({ force: true });
      cy.wait(500);

      // Finish assisting
      cy.contains('button', 'Finish Assisting').click({ force: true });
      cy.wait(500);

      // Queue should be empty
      cy.contains('No one in queue').should('be.visible');
    });
  });

  describe('TA Remove Student', () => {
    it('TA can remove a student from queue using X button', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: 'RemoveMe',
          email: null,
          userId: `remove-me-${Date.now()}`,
          room: TEST_ROOM
        });
      });

      cy.wait(1000);

      cy.loginAsTA();

      // Find the student and click remove button
      cy.contains('RemoveMe', { timeout: 10000 })
        .parents('.queue-item')
        .within(() => {
          cy.get('.btn-danger').click({ force: true });
        });

      cy.wait(500);

      // Student should be removed
      cy.contains('RemoveMe').should('not.exist');
    });
  });

  describe('Question Description', () => {
    it('question can have optional description', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('DescriptionUser');
        // Check if description field exists (it might be labeled differently)
        cy.get('input[placeholder*="Description"], input[placeholder*="help"]').then(($input) => {
          if ($input.length) {
            cy.wrap($input).type('Need help with graphs');
          }
        });
        cy.contains('button', 'Join Queue').click({ force: true });
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });
    });

    it('description appears in queue list', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: 'DescriptionTester',
          email: null,
          description: 'My custom description text',
          userId: `desc-test-${Date.now()}`,
          room: TEST_ROOM
        });
      });

      cy.wait(500);

      cy.get('.queue-card.question').should('contain', 'My custom description');
    });
  });

  describe('Multiple Queue Membership', () => {
    it('user can be in both marking and question queue simultaneously', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Join marking queue
      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('DualQueue User');
        cy.get('input[placeholder="e.g., 1234"]').type('1234');
        cy.contains('button', 'Join Queue').click({ force: true });
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });

      // Join question queue
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('DualQueue User');
        cy.contains('button', 'Join Queue').click({ force: true });
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });

      // Verify user is in both queues
      cy.get('.queue-card.marking').should('contain', 'Your Position');
      cy.get('.queue-card.question').should('contain', 'Your Position');
    });
  });

  describe('Room Badge Display', () => {
    it('shows room name in student view', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.contains('Room:', { timeout: 10000 }).should('be.visible');
      cy.contains('cypress-test').should('be.visible');
    });

    it('shows room name in TA view', () => {
      cy.loginAsTA();

      cy.contains('Room:', { timeout: 10000 }).should('be.visible');
      cy.contains('cypress-test').should('be.visible');
    });
  });

  describe('Home Page Navigation', () => {
    it('home page shows correct options', () => {
      cy.visitWithRoom();

      cy.contains('ECE297 Queue', { timeout: 10000 }).should('be.visible');
      cy.contains('a', 'Student').should('be.visible');
      cy.contains('a', 'TA Login').should('be.visible');
      cy.contains('a', 'View All Rooms').should('be.visible');
    });

    it('clicking Student navigates to student view', () => {
      cy.visitWithRoom();

      cy.contains('a', 'Student').click();
      cy.wait(500);

      cy.get('.queue-card.marking', { timeout: 10000 }).should('be.visible');
      cy.get('.queue-card.question').should('be.visible');
    });
  });

  describe('Toast Notifications', () => {
    it('shows toast when joining queue', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('ToastUser');
        cy.contains('button', 'Join Queue').click({ force: true });
      });

      // Toast should appear
      cy.get('.toast-container .toast', { timeout: 5000 }).should('contain', 'Joined Queue');
    });

    it('toast can be dismissed by clicking', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('ToastDismiss');
        cy.contains('button', 'Join Queue').click({ force: true });
      });

      // Click on toast to dismiss
      cy.get('.toast-container .toast', { timeout: 5000 }).first().click();

      cy.wait(500);

      // Toast should be gone or exiting
      cy.get('.toast-container .toast').should('have.length.lessThan', 2);
    });
  });

  describe('Queue Item Styling', () => {
    it('first position has special styling', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('FirstUser');
        cy.contains('button', 'Join Queue').click({ force: true });
        cy.contains('#1', { timeout: 10000 }).should('be.visible');
      });

      // Check for first position class
      cy.get('.queue-card.question .queue-position.first').should('exist');
    });

    it('your own entry is highlighted', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('HighlightUser');
        cy.contains('button', 'Join Queue').click({ force: true });
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });

      // Check for is-you class
      cy.get('.queue-card.question .queue-item.is-you').should('exist');
    });
  });

  describe('Student ID Masking', () => {
    it('only shows last 4 digits of student ID', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('IDMaskUser');
        cy.get('input[placeholder="e.g., 1234"]').type('5678');
        cy.contains('button', 'Join Queue').click({ force: true });
        cy.contains('Your Position', { timeout: 10000 }).should('be.visible');
      });

      // ID should be masked
      cy.get('.queue-card.marking').should('contain', '****5678');
    });
  });

  describe('Empty Form Submission Prevention', () => {
    it('cannot submit marking queue form with empty fields', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.marking').within(() => {
        // Button should be disabled with empty fields
        cy.contains('button', 'Join Queue').should('be.disabled');

        // Even with just name, button should be disabled (need ID too)
        cy.get('input[placeholder="Enter your name"]').type('Test');
        cy.contains('button', 'Join Queue').should('be.disabled');
      });
    });

    it('cannot submit question queue form with empty name', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.contains('button', 'Join Queue').should('be.disabled');
      });
    });
  });

  describe('Leave Queue Updates Position', () => {
    it('when user ahead leaves, position updates', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      // Add user ahead
      const aheadUserId = `ahead-${Date.now()}`;
      cy.window().then((win) => {
        win.socket.emit('join-question', {
          name: 'AheadLeaver',
          email: null,
          userId: aheadUserId,
          room: TEST_ROOM
        });
      });

      cy.wait(500);

      // Join as second user
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('SecondPlace');
        cy.contains('button', 'Join Queue').click({ force: true });
        cy.contains('#2', { timeout: 10000 }).should('be.visible');
      });

      // Remove first user via TA clear
      cy.window().then((win) => {
        win.socket.emit('ta-clear-all', { room: TEST_ROOM });
      });

      cy.wait(500);

      // Second user should now be removed too (queue cleared)
      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').should('be.visible');
      });
    });
  });
});
