import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

const URL = 'http://localhost:3001';
const CLIENTS_COUNT = 50;
const JOIN_DELAY_MS = 50;

console.log(`Starting load test with ${CLIENTS_COUNT} clients connecting to ${URL}...`);

const clients = [];
let joinedCount = 0;

for (let i = 0; i < CLIENTS_COUNT; i++) {
    setTimeout(() => {
        const socket = io(URL, {
            transports: ['websocket'],
            forceNew: true
        });

        const userId = uuidv4();
        const name = `LoadTestUser_${i}`;
        const studentId = String(1000 + i);

        socket.on('connect', () => {
            // console.log(`Client ${i} connected`);
            socket.emit('register-user', { userId });

            // Randomly join marking or question
            if (Math.random() > 0.5) {
                socket.emit('join-marking', { name, studentId, email: null, userId });
            } else {
                socket.emit('join-question', { name, email: null, userId });
            }
        });

        socket.on('joined-queue', (data) => {
            joinedCount++;
            process.stdout.write(`\rJoined: ${joinedCount}/${CLIENTS_COUNT}`);
            if (joinedCount === CLIENTS_COUNT) {
                console.log('\nAll clients joined successfully!');
                console.log('Keeping connections open for 10 seconds...');
                setTimeout(() => {
                    console.log('Disconnecting...');
                    clients.forEach(c => c.disconnect());
                    console.log('Done.');
                    process.exit(0);
                }, 10000);
            }
        });

        socket.on('error', (err) => {
            console.error(`Client ${i} error:`, err);
        });

        clients.push(socket);

    }, i * JOIN_DELAY_MS);
}
