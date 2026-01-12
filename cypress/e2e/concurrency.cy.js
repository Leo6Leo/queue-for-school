describe('Concurrency & Load Test', () => {
  const VIRTUAL_USERS = 20;

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

  it('handles multiple concurrent joins', () => {
    cy.visit('/#student');

    // 1. Join as main test user
    cy.get('.queue-card.marking').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Main User');
        cy.get('input[placeholder="e.g., 1234"]').type('0000');
        cy.contains('Join Queue').click({ force: true });
        cy.contains('#1').should('be.visible');
    });

    // 2. Spawn virtual users via socket
    cy.window().then((win) => {
        for (let i = 0; i < VIRTUAL_USERS; i++) {
            win.socket.emit('join-marking', {
                name: `Virtual User ${i}`,
                studentId: String(1000 + i),
                email: null,
                userId: `virtual-uuid-${i}`
            });
        }
    });

    // 3. Verify UI updates count
    // Count should be VIRTUAL_USERS + 1 (Main User)
    cy.get('.queue-card.marking .queue-count').should(($el) => {
        const text = $el.text();
        expect(text).to.contain(`${VIRTUAL_USERS + 1} waiting`);
    });

    // 4. Verify list renders (check for a few random virtual users)
    cy.get('.queue-list').should('contain', 'Virtual User 0');
    cy.get('.queue-list').should('contain', `Virtual User ${VIRTUAL_USERS - 1}`);
  });

  it('handles rapid updates correctly', () => {
    cy.visit('/#student');
    
    // Join as main user
    cy.get('.queue-card.question').within(() => {
        cy.get('input[placeholder="Enter your name"]').type('Stress User');
        cy.contains('Join Queue').click({ force: true });
    });

    // Flood join/leave events
    cy.window().then((win) => {
        const interval = setInterval(() => {
            const id = Math.floor(Math.random() * 1000);
            win.socket.emit('join-question', {
                name: `Flash User ${id}`,
                userId: `flash-${id}`
            });
            // Immediately leave sometimes
            if (Math.random() > 0.5) {
                // We can't easily guess the entry ID for leave without listening, 
                // but we can just spam joins to test rendering load.
            }
        }, 50); // Every 50ms

        // Stop after 2 seconds
        setTimeout(() => clearInterval(interval), 2000);
    });

    // Wait for flood to finish
    cy.wait(2500);

    // Verify UI is still responsive (we are still in queue)
    cy.get('.queue-card.question').within(() => {
        cy.contains('Your Position').should('be.visible');
        cy.contains('Leave Queue').click({ force: true });
    });
    
    // Should be back to form
    cy.get('.queue-card.question input').should('be.visible');
  });
});
