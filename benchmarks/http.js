'use strict';

const http = require('http');

const requestListener = (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello world');
    }
};

const server = http.createServer(requestListener);
server.listen(5002, "0.0.0.0", () => {
    console.log("Server is running on http://0.0.0.0:5002");
});