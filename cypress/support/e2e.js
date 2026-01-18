import './commands';

// Prevent Cypress from failing on uncaught exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
  // Log the error but don't fail the test
  console.log('Uncaught exception:', err.message);
  
  // Return false to prevent the error from failing the test
  // This is useful for errors that occur in the application but shouldn't fail tests
  return false;
});

// Add custom error handler for better debugging
Cypress.on('fail', (error, runnable) => {
  console.error('Test failed:', runnable.title);
  console.error('Error:', error.message);
  throw error;
});

// Global before hook - runs once before all tests
before(() => {
  // Clear any leftover data from previous test runs
  cy.log('Starting test suite');
});

// Global afterEach hook - runs after each test
afterEach(function() {
  // Log test result
  if (this.currentTest.state === 'failed') {
    cy.log(`Test "${this.currentTest.title}" failed`);
  }
});
