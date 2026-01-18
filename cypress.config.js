import { defineConfig } from "cypress";
import fs from 'fs';
import path from 'path';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    retries: {
      runMode: 2,
      openMode: 0
    },
    setupNodeEvents(on, config) {
      on('task', {
        clearQueueData() {
          const filePath = path.join(process.cwd(), 'server', 'queue_data.json');
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return 'Queue data cleared';
          }
          return 'No queue data to clear';
        },
        log(message) {
          console.log(message);
          return null;
        }
      });
    },
  },
});
