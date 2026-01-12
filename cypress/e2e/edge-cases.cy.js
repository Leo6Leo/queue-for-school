describe('Edge Cases & Stress Tests', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.window().then((win) => {
      win.sessionStorage.clear();
      if (win.socket) {
          win.socket.emit('ta-clear-all');
      }
    });
    cy.wait(500);
  });

  it('verifies push back hidden for position 1 if alone', () => {
    cy.visit('/#student');
    cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('First User');
        cy.get('input[placeholder="e.g., 1234"]').type('1111');
        cy.contains('Join Queue').click({ force: true });
        
        // Should be #1
        cy.contains('#1').should('be.visible');
        
        // Push Back should NOT be visible if alone
        cy.contains('Push Back').should('not.exist');
    });
  });

  it('prevents same user from joining marking queue twice', () => {
    cy.visit('/#student');
    
    // 1. Join normally
    cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Double User');
        cy.get('input[placeholder="e.g., 1234"]').type('2222');
        cy.contains('Join Queue').click({ force: true });
        cy.contains('Your Position').should('be.visible');
    });

    // 2. Try to join again via socket
    cy.window().then((win) => {
        const userId = win.localStorage.getItem('ece297-queue-user-id');
        win.socket.emit('join-marking', {
            name: 'Double User',
            studentId: '2222',
            email: null,
            userId: userId
        });
    });

    // 3. Expect Error Toast
    // Use .toast class selector for robustness
    cy.get('.toast').should('contain', 'You are already in the marking queue');
  });

  it('handles 100 concurrent marking queue joins', () => {
    const USERS = 100;
    cy.visit('/#student');

    cy.window().then((win) => {
        for (let i = 0; i < USERS; i++) {
            win.socket.emit('join-marking', {
                name: `Load User ${i}`,
                studentId: String(1000 + i),
                email: null,
                userId: `load-uuid-${i}`
            });
        }
    });

    cy.get('.queue-card.marking .queue-count', { timeout: 10000 }).should(($el) => {
        expect($el.text()).to.include(`${USERS} waiting`);
    });
  });
});