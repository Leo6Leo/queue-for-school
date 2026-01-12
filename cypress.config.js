import { defineConfig } from "cypress";
import fs from 'fs';
import path from 'path';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    setupNodeEvents(on, config) {
      on('task', {
        clearQueueData() {
          const filePath = path.join(__dirname, 'server', 'queue_data.json');
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return 'Queue data cleared';
          }
          return 'No queue data to clear';
        },
      });
    },
  },
});
