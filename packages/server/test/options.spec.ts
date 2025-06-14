import { strict as assert } from 'assert';
import * as http from 'node:http';
import { AddressInfo } from 'net';
import cmmv from '..';

describe('options', function () {
    it('should respond only for existing routes', function (done) {
        const app = cmmv();

        app.get('/foo', function (req, res) {
            res.send('ok');
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            // Test existing route first
            const req1 = http.request({
                host: '127.0.0.1',
                port,
                path: '/foo',
                method: 'OPTIONS'
            }, res1 => {
                let body1 = '';
                res1.on('data', chunk => { body1 += chunk.toString(); });
                res1.on('end', () => {
                    try {
                        assert.strictEqual(res1.statusCode, 204);
                        assert.ok(res1.headers.allow);
                        assert.ok(res1.headers.allow.includes('GET'));
                        done();
                    } catch (err) {
                        server.close(() => done(err));
                    }
                });
            });

            req1.on('error', err => {
                server.close(() => done(err));
            });

            req1.end();
        }).catch(done);
    });

    it('should include all available methods for a route', function (done) {
        const app = cmmv();

        app.get('/test', function (req, res) {
            res.send('get');
        });

        app.post('/test', function (req, res) {
            res.send('post');
        });

        app.put('/test', function (req, res) {
            res.send('put');
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            const req = http.request({
                host: '127.0.0.1',
                port,
                path: '/test',
                method: 'OPTIONS'
            }, res => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        assert.strictEqual(res.statusCode, 204);
                        assert.ok(res.headers.allow);

                        const allowHeader = res.headers.allow as string;
                        assert.ok(allowHeader.includes('GET'));
                        assert.ok(allowHeader.includes('POST'));
                        assert.ok(allowHeader.includes('PUT'));

                        server.close(done);
                    } catch (err) {
                        server.close(() => done(err));
                    }
                });
            });

            req.on('error', err => {
                server.close(() => done(err));
            });

            req.end();
        }).catch(done);
    });

    it('should handle OPTIONS for root path', function (done) {
        const app = cmmv();

        app.get('/', function (req, res) {
            res.send('root');
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;

            const req = http.request({
                host: '127.0.0.1',
                port,
                path: '/',
                method: 'OPTIONS'
            }, res => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        assert.strictEqual(res.statusCode, 204);
                        assert.ok(res.headers.allow);
                        assert.ok((res.headers.allow as string).includes('GET'));

                        server.close(done);
                    } catch (err) {
                        server.close(() => done(err));
                    }
                });
            });

            req.on('error', err => {
                server.close(() => done(err));
            });

            req.end();
        }).catch(done);
    });
});
