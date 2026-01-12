describe('Queue System E2E', () => {
  beforeEach(() => {
    // Reset to home to ensure socket is loaded
    cy.visit('/');

    // Clear client session (TA auth)
    cy.window().then((win) => {
      win.sessionStorage.clear();
      // Reset server state via socket
      if (win.socket) {
          win.socket.emit('ta-clear-all');
      }
    });
    
    // Wait for clear to propagate (optional but safer)
    cy.wait(500);
  });

  it('allows a student to join the marking queue', () => {
    cy.visit('/#student');
    
    // Check validation in Marking Queue card
    // Use within() to scope to the specific queue card
    cy.get('.queue-card.marking').within(() => {
        // Verify button is disabled initially (validation)
        cy.contains('Join Queue').should('be.disabled');

        // Fill form
        cy.get('input[placeholder="Enter your name"]').type('Cypress Student');
        cy.get('input[placeholder="e.g., 1234"]').type('1234');
        
        cy.contains('Join Queue').click({ force: true });
    });

    // Verify joined
    cy.get('.queue-card.marking').within(() => {
        cy.contains('Your Position').should('be.visible');
        cy.contains('#').should('be.visible');
        cy.contains('Leave Queue').should('be.visible');
    });
  });

  it('allows a student to join the question queue', () => {
    cy.visit('/#student');
    
    cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Question Student');
        // Question queue shouldn't ask for ID
        cy.get('input[placeholder="e.g., 1234"]').should('not.exist');
        
        cy.contains('Join Queue').click({ force: true });
    });

    cy.get('.queue-card.question').within(() => {
        cy.contains('Your Position').should('be.visible');
    });
  });

  it('validates input for marking queue', () => {
    cy.visit('/#student');
    
    cy.get('.queue-card.marking').within(() => {
        // Empty Name
        cy.get('input[placeholder="e.g., 1234"]').type('1234');
        cy.contains('Join Queue').should('be.disabled');
        
        // Invalid ID (letters)
        cy.get('input[placeholder="Enter your name"]').type('Bad ID User');
        cy.get('input[placeholder="e.g., 1234"]').clear().type('abcd');
        cy.contains('Join Queue').should('be.disabled');
        
        // Invalid ID (short)
        cy.get('input[placeholder="e.g., 1234"]').clear().type('123');
        cy.contains('Join Queue').should('be.disabled');

        // Valid
        cy.get('input[placeholder="e.g., 1234"]').clear().type('5678');
        cy.contains('Join Queue').should('not.be.disabled');
    });
  });

  it('persists queue state after reload', () => {
    cy.visit('/#student');
    
    cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Reload User');
        cy.contains('Join Queue').click({ force: true });
        cy.contains('Your Position').should('be.visible');
    });

    // Reload page
    cy.reload();

    // Verify state persists
    cy.get('.queue-card.question').within(() => {
        cy.contains('Your Position').should('be.visible');
        cy.contains('Leave Queue').should('be.visible');
    });
  });

  it('allows leaving and re-joining', () => {
    cy.visit('/#student');
    
    // Join
    cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Leaver');
        cy.contains('Join Queue').click({ force: true });
        cy.contains('Leave Queue').click({ force: true });
        
        // Verify form returns
        cy.get('input[placeholder="Enter your name"]').should('be.visible');
        
        // Re-join
        cy.get('input[placeholder="Enter your name"]').type('Returner');
        cy.contains('Join Queue').click({ force: true });
        cy.contains('Your Position').should('be.visible');
    });
  });

  it('allows TA to login and manage queue', () => {
    // 1. Student joins first
    cy.visit('/#student');
    cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Test Student A');
        cy.get('input[placeholder="e.g., 1234"]').type('9999');
        cy.contains('Join Queue').click({ force: true });
    });

    // 2. TA Logs in
    cy.visit('/#ta');
    cy.get('input[type="password"]').type('ece297ta');
    cy.contains('button', 'Login').click({ force: true });

    // 3. TA sees student
    cy.contains('TA Dashboard').should('be.visible');
    cy.contains('Test Student A').should('be.visible');
    
    // In merged view, we have specific call buttons or "Next Marking"
    cy.contains('Next Marking').click({ force: true });

    // 4. Student status updates
    cy.contains('Start Assisting Test Student A').should('be.visible');
    
    // 5. Start Assisting
    cy.contains('Start Assisting Test Student A').click({ force: true });
    cy.contains('Finish Assisting').should('be.visible');
    
    // 6. Finish
    cy.contains('Finish Assisting').click({ force: true });
    cy.contains('Test Student A').should('not.exist');
  });

  it('supports TA clearing the queue', () => {
    // Join some students
    cy.visit('/#student');
    cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Clear Me');
        cy.get('input[placeholder="e.g., 1234"]').type('1111');
        cy.contains('Join Queue').click({ force: true });
    });

    // TA Clear
    cy.visit('/#ta');
    // If not logged in (session cleared?), re-login
    cy.get('body').then($body => {
        if ($body.text().includes('TA Login')) {
            cy.get('input[type="password"]').type('ece297ta');
            cy.contains('button', 'Login').click({ force: true });
        }
    });

    cy.contains('Danger Zone').should('be.visible');
    
    // Mock confirm
    cy.on('window:confirm', () => true);
    
    cy.contains('Clear All Queues').click({ force: true });
    cy.contains('Clear Me').should('not.exist');
    cy.contains('No one in queue').should('be.visible');
  });
});
