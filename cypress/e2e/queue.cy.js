/**
 * Queue System E2E Tests
 * Tests core functionality of the ECE297 Queue system
 */

describe('Queue System E2E', () => {
  beforeEach(() => {
    // Setup test room and reset state
    cy.setupTestRoom();
    cy.resetTestState();
  });

  afterEach(() => {
    cy.clearQueues();
  });

  describe('Student Queue Operations', () => {
    it('allows a student to join the marking queue', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.marking').within(() => {
        // Verify button is disabled initially
        cy.contains('button', 'Join Queue').should('be.disabled');

        // Fill form
        cy.get('input[placeholder="Enter your name"]').type('Cypress Student');
        cy.get('input[placeholder="e.g., 1234"]').type('1234');

        // Wait for form validation
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      // Verify joined
      cy.get('.queue-card.marking', { timeout: 10000 }).within(() => {
        cy.contains('Your Position').should('be.visible');
        cy.contains('#1').should('be.visible');
        cy.contains('button', 'Leave Queue').should('be.visible');
      });
    });

    it('allows a student to join the question queue', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Question Student');
        // Question queue shouldn't require student ID
        cy.get('input[placeholder="e.g., 1234"]').should('not.exist');

        // Wait for form validation
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
      });

      cy.get('.queue-card.question', { timeout: 10000 }).within(() => {
        cy.contains('Your Position').should('be.visible');
      });
    });

    it('validates input for marking queue', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.marking').within(() => {
        // Empty Name - button should be disabled
        cy.get('input[placeholder="e.g., 1234"]').type('1234');
        cy.contains('button', 'Join Queue').should('be.disabled');

        // Name filled but invalid ID (letters)
        cy.get('input[placeholder="Enter your name"]').type('Bad ID User');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('abcd');
        cy.contains('button', 'Join Queue').should('be.disabled');

        // Invalid ID (too short)
        cy.get('input[placeholder="e.g., 1234"]').clear().type('123');
        cy.contains('button', 'Join Queue').should('be.disabled');

        // Valid input
        cy.get('input[placeholder="e.g., 1234"]').clear().type('5678');
        cy.contains('button', 'Join Queue').should('not.be.disabled');
      });
    });

    it('persists queue state after reload', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Reload User');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('Your Position').should('be.visible');
      });

      // Wait for state to persist
      cy.wait(1000);

      // Reload page and wait for restoration
      cy.reload();
      cy.waitForSocket();
      cy.wait(2000);

      // Verify state persists
      cy.get('.queue-card.question', { timeout: 10000 }).within(() => {
        cy.contains('Your Position').should('be.visible');
        cy.contains('button', 'Leave Queue').should('be.visible');
      });
    });

    it('allows leaving and re-joining queue', () => {
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.question').within(() => {
        // Join
        cy.get('input[placeholder="Enter your name"]').type('Leaver');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('Your Position').should('be.visible');

        // Leave
        cy.contains('button', 'Leave Queue').click({ force: true });
      });

      cy.wait(500);

      cy.get('.queue-card.question').within(() => {
        // Verify form returns
        cy.get('input[placeholder="Enter your name"]').should('be.visible');

        // Re-join
        cy.get('input[placeholder="Enter your name"]').type('Returner');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('Your Position').should('be.visible');
      });
    });
  });

  describe('TA Queue Management', () => {
    it('allows TA to login and see dashboard', () => {
      cy.loginAsTA();
      cy.contains('TA Dashboard').should('be.visible');
      cy.contains('All Students').should('be.visible');
    });

    it('allows TA to call and assist a student', () => {
      // First add a student
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Test Student A');
        cy.get('input[placeholder="e.g., 1234"]').type('9999');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('Your Position').should('be.visible');
      });

      // Wait for state to sync
      cy.wait(1000);

      // TA logs in
      cy.loginAsTA();

      // TA sees student
      cy.contains('Test Student A', { timeout: 10000 }).should('exist');

      // Call next marking student
      cy.contains('button', 'Next Marking').click({ force: true });

      cy.wait(500);

      // Look for the start assisting button
      cy.get('body').then(($body) => {
        if ($body.find('button:contains("Start Assisting")').length > 0) {
          cy.contains('button', 'Start Assisting').first().click({ force: true });
        }
      });

      cy.wait(500);

      // Look for Finish button
      cy.get('body').then(($body) => {
        if ($body.find('button:contains("Finish Assisting")').length > 0) {
          cy.contains('button', 'Finish Assisting').click({ force: true });
        } else if ($body.find('button:contains("Finish")').length > 0) {
          cy.contains('button', 'Finish').first().click({ force: true });
        }
      });

      cy.wait(500);
      
      // Student should be removed from queue
      cy.get('.queue-card.combined').should('contain', 'No one in queue');
    });

    it('supports TA clearing all queues', () => {
      // Add students to queue
      cy.visitWithRoom('student');
      cy.waitForSocket();

      cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Clear Me');
        cy.get('input[placeholder="e.g., 1234"]').type('1111');
        cy.contains('button', 'Join Queue').should('not.be.disabled').click();
        cy.contains('Your Position').should('be.visible');
      });

      cy.wait(1000);

      // TA logs in
      cy.loginAsTA();

      cy.contains('Clear Me', { timeout: 10000 }).should('exist');
      cy.contains('Danger Zone').scrollIntoView().should('exist');

      // Mock confirm dialog
      cy.on('window:confirm', () => true);

      cy.contains('button', 'Clear All Queues').click({ force: true });
      cy.wait(1000);

      cy.contains('Clear Me').should('not.exist');
      cy.contains('No one in queue').should('exist');
    });

    it('allows TA to call specific student', () => {
      // Add multiple students via socket
      cy.visitWithRoom('student');
      cy.waitForSocket();
      cy.addBulkUsers('marking', 3, 'Student');
      cy.wait(1000);

      cy.loginAsTA();

      // All students should be visible
      cy.contains('Student_0', { timeout: 10000 }).should('exist');
      cy.contains('Student_1').should('exist');
      cy.contains('Student_2').should('exist');

      // Click on specific student's Call button
      cy.contains('Student_1')
        .parents('.queue-item')
        .within(() => {
          cy.contains('button', 'Call').click({ force: true });
        });

      cy.wait(500);

      // Student_1 should be in called state
      cy.contains('Start Assisting Student_1', { timeout: 5000 }).should('exist');
    });
  });

  describe('Navigation', () => {
    it('navigates between home, student, and TA views', () => {
      cy.visitWithRoom();

      // Home page
      cy.contains('ECE297 Queue').should('be.visible');
      cy.contains('Student').should('be.visible');
      cy.contains('TA Login').should('be.visible');

      // Go to student view
      cy.contains('a', 'Student').click();
      cy.get('.queue-card.marking', { timeout: 10000 }).should('be.visible');
      cy.get('.queue-card.question').should('be.visible');

      // Go back home using home link
      cy.get('.page-header').within(() => {
        cy.get('a').first().click({ force: true });
      });

      // Should be back at home
      cy.contains('ECE297 Queue').should('be.visible');
    });

    it('shows room badge correctly', () => {
      cy.visitWithRoom('student');
      cy.contains('cypress-test', { timeout: 10000 }).should('be.visible');
    });
  });
});
