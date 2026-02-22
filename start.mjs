import http from 'node:http';
import handler from './server.mjs';

const PORT = process.env.PORT || 3100;
const BIND = process.env.BIND || '127.0.0.1';

const server = http.createServer((req, res) => handler(req, res));
server.listen(PORT, BIND, () => {
  console.log(`Qualia Holding Board → http://${BIND}:${PORT}`);
});
