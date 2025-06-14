/* eslint-disable */

import { strict as assert } from 'assert';
import * as http from 'node:http';
import { AddressInfo } from 'net';
import { EventEmitter } from 'events';
import * as util from 'util';
import cmmv, { json } from '@cmmv/server';

import { proxy, ProxyMiddleware } from '..';

// Helper function to create a fake request
const fakeRequest = function (method: string, headers?: any, url?: string) {
    return new FakeRequest(method, headers, url);
};

// Helper function to create a fake response
const fakeResponse = function () {
    return new FakeResponse();
};

// Create a simple HTTP server for testing proxy targets
function createTargetServer(port: number = 0): Promise<http.Server> {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            // Handle different test endpoints
            if (req.url === '/api/test') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Hello from target server', method: req.method }));
            } else if (req.url === '/api/echo') {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', () => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        body: body ? JSON.parse(body) : null,
                        headers: req.headers,
                        method: req.method,
                        url: req.url
                    }));
                });
            } else if (req.url === '/api/headers') {
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'X-Custom-Header': 'custom-value'
                });
                res.end(JSON.stringify({ headers: req.headers }));
            } else if (req.url === '/api/slow') {
                setTimeout(() => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Slow response' }));
                }, 100);
            } else if (req.url === '/api/error') {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        });

        server.listen(port, () => {
            resolve(server);
        });

        server.on('error', reject);
    });
}

describe('proxy', function () {
    let targetServer: http.Server;
    let targetPort: number;

    before(async function () {
        targetServer = await createTargetServer();
        targetPort = (targetServer.address() as AddressInfo).port;
    });

    after(function (done) {
        if (targetServer) {
            targetServer.close(done);
        } else {
            done();
        }
    });

    it('should create proxy middleware with default options', function () {
        const middleware = proxy({
            target: `http://localhost:${targetPort}`
        });

        assert.ok(typeof middleware === 'function');
    });

    it('should create ProxyMiddleware instance directly', function () {
        const middleware = new ProxyMiddleware({
            target: `http://localhost:${targetPort}`
        });

        assert.ok(middleware instanceof ProxyMiddleware);
        assert.equal(middleware.middlewareName, 'proxy');
    });

    it('should proxy GET requests successfully', function (done) {
        const app = cmmv();

        app.get('/proxy/*', proxy({
            target: `http://localhost:${targetPort}`,
            pathRewrite: {
                '^/proxy': '/api'
            }
        }));

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/proxy/test',
                method: 'GET'
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        assert.strictEqual(res.statusCode, 200);
                        assert.strictEqual(data.message, 'Hello from target server');
                        assert.strictEqual(data.method, 'GET');
                        server.close(done);
                    } catch (error) {
                        server.close(() => done(error));
                    }
                });
            });

            req.on('error', (error) => {
                server.close(() => done(error));
            });

            req.end();
        }).catch(done);
    });

    it('should proxy POST requests with body', function (done) {
        const app = cmmv();
        app.use(json());

        app.post('/proxy/*', proxy({
            target: `http://localhost:${targetPort}`,
            pathRewrite: {
                '^/proxy': '/api'
            }
        }));

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const postData = JSON.stringify({ name: 'test', value: 123 });

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/proxy/echo',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': postData.length
                }
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        assert.strictEqual(res.statusCode, 200);
                        assert.strictEqual(data.method, 'POST');
                        assert.deepStrictEqual(data.body, { name: 'test', value: 123 });
                        server.close(done);
                    } catch (error) {
                        server.close(() => done(error));
                    }
                });
            });

            req.on('error', (error) => {
                server.close(() => done(error));
            });

            req.write(postData);
            req.end();
        }).catch(done);
    });

    it('should handle custom headers', function (done) {
        const app = cmmv();

        app.get('/proxy/*', proxy({
            target: `http://localhost:${targetPort}`,
            pathRewrite: {
                '^/proxy': '/api'
            },
            headers: {
                'X-Proxy-Header': 'proxy-value'
            }
        }));

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/proxy/headers',
                method: 'GET'
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        assert.strictEqual(res.statusCode, 200);
                        assert.strictEqual(data.headers['x-proxy-header'], 'proxy-value');
                        assert.strictEqual(res.headers['x-custom-header'], 'custom-value');
                        server.close(done);
                    } catch (error) {
                        server.close(() => done(error));
                    }
                });
            });

            req.on('error', (error) => {
                server.close(() => done(error));
            });

            req.end();
        }).catch(done);
    });

    it('should handle changeOrigin option', function (done) {
        const app = cmmv();

        app.get('/proxy/*', proxy({
            target: `http://localhost:${targetPort}`,
            changeOrigin: true,
            pathRewrite: {
                '^/proxy': '/api'
            }
        }));

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/proxy/headers',
                method: 'GET',
                headers: {
                    'Host': 'original-host.com'
                }
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        assert.strictEqual(res.statusCode, 200);
                        // Host should be changed to target host
                        assert.strictEqual(data.headers.host, `localhost:${targetPort}`);
                        server.close(done);
                    } catch (error) {
                        server.close(() => done(error));
                    }
                });
            });

            req.on('error', (error) => {
                server.close(() => done(error));
            });

            req.end();
        }).catch(done);
    });

    it('should handle timeout option', function (done) {
        const app = cmmv();

        app.get('/proxy/*', proxy({
            target: `http://localhost:${targetPort}`,
            timeout: 50, // Very short timeout
            pathRewrite: {
                '^/proxy': '/api'
            }
        }));

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/proxy/slow', // This endpoint has 100ms delay
                method: 'GET'
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    // Should timeout before getting response
                    assert.strictEqual(res.statusCode, 500);
                    server.close(done);
                });
            });

            req.on('error', (error) => {
                server.close(() => done(error));
            });

            req.end();
        }).catch(done);
    });

    it('should handle filter option', function (done) {
        const app = cmmv();

        // Add a fallback route for non-proxied requests FIRST
        app.get('/proxy/fallback', (req, res) => {
            res.json({ message: 'Not proxied' });
        });

        app.get('/proxy/*', proxy({
            target: `http://localhost:${targetPort}`,
            pathRewrite: {
                '^/proxy': '/api'
            },
            filter: (req, res) => {
                // Only proxy requests with specific header
                return req.headers['x-proxy-allowed'] === 'true';
            }
        }));

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            // First request without the required header - use fallback route
            const options1 = {
                hostname: '127.0.0.1',
                port: port,
                path: '/proxy/fallback',
                method: 'GET'
            };

            const req1 = http.request(options1, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        assert.strictEqual(data.message, 'Not proxied');

                        // Second request with the required header
                        const options2 = {
                            hostname: '127.0.0.1',
                            port: port,
                            path: '/proxy/test',
                            method: 'GET',
                            headers: {
                                'X-Proxy-Allowed': 'true'
                            }
                        };

                        const req2 = http.request(options2, (res2) => {
                            let body2 = '';
                            res2.on('data', chunk => { body2 += chunk.toString(); });
                            res2.on('end', () => {
                                try {
                                    const data2 = JSON.parse(body2);
                                    assert.strictEqual(data2.message, 'Hello from target server');
                                    server.close(done);
                                } catch (error) {
                                    server.close(() => done(error));
                                }
                            });
                        });

                        req2.on('error', (error) => {
                            server.close(() => done(error));
                        });

                        req2.end();
                    } catch (error) {
                        server.close(() => done(error));
                    }
                });
            });

            req1.on('error', (error) => {
                server.close(() => done(error));
            });

            req1.end();
        }).catch(done);
    });

    it('should handle proxyReqPathResolver option', function (done) {
        const app = cmmv();

        app.get('/proxy/*', proxy({
            target: `http://localhost:${targetPort}`,
            proxyReqPathResolver: (req) => {
                // Custom path resolution
                return '/api/test';
            }
        }));

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/proxy/anything', // This will be resolved to /api/test
                method: 'GET'
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        assert.strictEqual(res.statusCode, 200);
                        assert.strictEqual(data.message, 'Hello from target server');
                        server.close(done);
                    } catch (error) {
                        server.close(() => done(error));
                    }
                });
            });

            req.on('error', (error) => {
                server.close(() => done(error));
            });

            req.end();
        }).catch(done);
    });

    it('should handle userResDecorator option', function (done) {
        const app = cmmv();

        app.get('/proxy/*', proxy({
            target: `http://localhost:${targetPort}`,
            pathRewrite: {
                '^/proxy': '/api'
            },
            userResDecorator: (proxyRes, proxyResData, req, res) => {
                // Modify the response
                const data = JSON.parse(proxyResData.toString());
                data.decorated = true;
                return data;
            }
        }));

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/proxy/test',
                method: 'GET'
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        assert.strictEqual(res.statusCode, 200);
                        assert.strictEqual(data.message, 'Hello from target server');
                        assert.strictEqual(data.decorated, true);
                        server.close(done);
                    } catch (error) {
                        server.close(() => done(error));
                    }
                });
            });

            req.on('error', (error) => {
                server.close(() => done(error));
            });

            req.end();
        }).catch(done);
    });

        it('should handle proxyErrorHandler option', function (done) {
        this.timeout(10000); // Increase timeout for this test
        const app = cmmv();

        app.get('/proxy/*', proxy({
            target: 'http://192.0.2.1:12345', // RFC5737 test address that should fail
            timeout: 500, // Very short timeout to fail quickly
            proxyErrorHandler: (err, req, res, next) => {
                if (!res.headersSent) {
                    res.statusCode = 502;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Proxy error handled', message: err.message }));
                }
            }
        }));

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/proxy/test',
                method: 'GET'
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        assert.strictEqual(res.statusCode, 502);
                        if (body) {
                            const data = JSON.parse(body);
                            assert.strictEqual(data.error, 'Proxy error handled');
                        }
                        server.close(done);
                    } catch (error) {
                        server.close(() => done(error));
                    }
                });
            });

            req.on('error', (error) => {
                server.close(() => done(error));
            });

            req.setTimeout(8000, () => {
                req.destroy();
                server.close(() => done(new Error('Request timeout')));
            });

            req.end();
        }).catch(done);
    });

    it('should handle HTTPS targets with secure option', function (done) {
        // This test would require an HTTPS target server
        // For now, we'll test the configuration
        const middleware = new ProxyMiddleware({
            target: 'https://httpbin.org',
            secure: false // Allow self-signed certificates
        });

        assert.ok(middleware instanceof ProxyMiddleware);
        done();
    });

    it('should handle multiple HTTP methods', function (done) {
        const app = cmmv();
        app.use(json());

        // Add proxy for all methods
        ['get', 'post', 'put', 'delete', 'patch'].forEach(method => {
            app[method]('/proxy/*', proxy({
                target: `http://localhost:${targetPort}`,
                pathRewrite: {
                    '^/proxy': '/api'
                }
            }));
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            // Test PUT method
            const putData = JSON.stringify({ method: 'PUT' });
            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/proxy/echo',
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': putData.length
                }
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        assert.strictEqual(res.statusCode, 200);
                        assert.strictEqual(data.method, 'PUT');
                        assert.deepStrictEqual(data.body, { method: 'PUT' });
                        server.close(done);
                    } catch (error) {
                        server.close(() => done(error));
                    }
                });
            });

            req.on('error', (error) => {
                server.close(() => done(error));
            });

            req.write(putData);
            req.end();
        }).catch(done);
    });

    it('should preserve response status codes', function (done) {
        const app = cmmv();

        app.get('/proxy/*', proxy({
            target: `http://localhost:${targetPort}`,
            pathRewrite: {
                '^/proxy': '/api'
            }
        }));

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/proxy/error', // This endpoint returns 500
                method: 'GET'
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        assert.strictEqual(res.statusCode, 500);
                        assert.strictEqual(data.error, 'Internal server error');
                        server.close(done);
                    } catch (error) {
                        server.close(() => done(error));
                    }
                });
            });

            req.on('error', (error) => {
                server.close(() => done(error));
            });

            req.end();
        }).catch(done);
    });

    it('should handle async filter function', function (done) {
        const app = cmmv();

        app.get('/proxy/*', proxy({
            target: `http://localhost:${targetPort}`,
            pathRewrite: {
                '^/proxy': '/api'
            },
            filter: async (req, res) => {
                // Simulate async operation
                await new Promise(resolve => setTimeout(resolve, 10));
                return req.headers['x-async-allowed'] === 'true';
            }
        }));

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/proxy/test',
                method: 'GET',
                headers: {
                    'X-Async-Allowed': 'true'
                }
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        assert.strictEqual(data.message, 'Hello from target server');
                        server.close(done);
                    } catch (error) {
                        server.close(() => done(error));
                    }
                });
            });

            req.on('error', (error) => {
                server.close(() => done(error));
            });

            req.end();
        }).catch(done);
    });
});

// Helper classes for testing
function FakeRequest(this: any, method?: string, headers?: any, url?: string) {
    this.headers = headers || {
        'host': 'localhost',
        'user-agent': 'test-agent'
    };
    this.method = method || 'GET';
    this.url = url || '/test';
    this.req = this; // Reference to original request
}

function FakeResponse(this: any) {
    this._headers = {};
    this.statusCode = 200;
    this.headersSent = false;
}

util.inherits(FakeResponse, EventEmitter);

FakeResponse.prototype.end = function end(data?: any) {
    const response = this;
    this.headersSent = true;

    process.nextTick(function () {
        response.emit('finish');
    });
};

FakeResponse.prototype.getHeader = function getHeader(name: string) {
    const key = name.toLowerCase();
    return this._headers[key];
};

FakeResponse.prototype.setHeader = function setHeader(name: string, value: any) {
    const key = name.toLowerCase();
    this._headers[key] = value;
};
