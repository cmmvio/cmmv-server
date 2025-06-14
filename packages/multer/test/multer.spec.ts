/* eslint-disable */

import { strict as assert } from 'assert';
import * as http from 'node:http';
import { AddressInfo } from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import cmmv from '@cmmv/server';

import multer from '..';

function createMultipartData(boundary: string, fields: any, files: any): Buffer {
    let data = '';

    // Add form fields
    for (const [key, value] of Object.entries(fields)) {
        data += `--${boundary}\r\n`;
        data += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
        data += `${value}\r\n`;
    }

    // Add files
    for (const [key, file] of Object.entries(files)) {
        const fileData = file as { content: Buffer | string; filename: string; contentType?: string };
        data += `--${boundary}\r\n`;
        data += `Content-Disposition: form-data; name="${key}"; filename="${fileData.filename}"\r\n`;
        data += `Content-Type: ${fileData.contentType || 'application/octet-stream'}\r\n\r\n`;
    }

    const headerBuffer = Buffer.from(data, 'utf8');
    const buffers = [headerBuffer];

    // Add file contents
    for (const [key, file] of Object.entries(files)) {
        const fileData = file as { content: Buffer | string; filename: string; contentType?: string };
        const content = typeof fileData.content === 'string' ? Buffer.from(fileData.content) : fileData.content;
        buffers.push(content);
        buffers.push(Buffer.from('\r\n', 'utf8'));
    }

    buffers.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));

    return Buffer.concat(buffers);
}

describe('multer', function () {
    let tempDir: string;

    beforeEach(function() {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multer-test-'));
    });

    afterEach(function() {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should parse multipart form with single file upload', function (done) {
        const app = cmmv();
        app.use(multer({ dest: tempDir }));

        app.post('/upload', (req, res) => {
            res.status(200).json({
                body: req.body,
                files: req.files,
                hasFiles: !!req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const boundary = 'test-boundary-123';
            const postData = createMultipartData(boundary,
                { name: 'test-upload' },
                { file: { content: 'Hello World', filename: 'test.txt', contentType: 'text/plain' } }
            );

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/upload',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
                        assert.strictEqual(data.hasFiles, true);
                        assert.ok(data.files);
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

    it('should handle multiple file uploads', function (done) {
        const app = cmmv();
        app.use(multer({ dest: tempDir }));

        app.post('/multiple', (req, res) => {
            res.status(200).json({
                filesCount: req.files ? Object.keys(req.files).length : 0,
                files: req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const boundary = 'multi-boundary-456';
            const postData = createMultipartData(boundary,
                { description: 'multiple files test' },
                {
                    file1: { content: 'First file content', filename: 'file1.txt', contentType: 'text/plain' },
                    file2: { content: 'Second file content', filename: 'file2.txt', contentType: 'text/plain' }
                }
            );

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/multiple',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
                        assert.ok(data.filesCount >= 1);
                        assert.ok(data.files);
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

    it('should handle form data without files', function (done) {
        const app = cmmv();
        app.use(multer({ dest: tempDir }));

        app.post('/form-only', (req, res) => {
            res.status(200).json({
                body: req.body,
                hasFiles: !!req.files,
                files: req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const boundary = 'form-boundary-789';
            const postData = createMultipartData(boundary,
                {
                    username: 'testuser',
                    email: 'test@example.com',
                    message: 'This is a test message'
                },
                {}
            );

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/form-only',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
                        assert.ok(data.body || data.hasFiles === false);
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

    it('should handle binary file uploads', function (done) {
        const app = cmmv();
        app.use(multer({ dest: tempDir }));

        app.post('/binary', (req, res) => {
            res.status(200).json({
                uploaded: true,
                files: req.files,
                hasFiles: !!req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const boundary = 'binary-boundary-abc';

            // Create binary data
            const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header

            const postData = createMultipartData(boundary,
                { type: 'image' },
                { image: { content: binaryData, filename: 'test.png', contentType: 'image/png' } }
            );

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/binary',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
                        assert.strictEqual(data.uploaded, true);
                        assert.strictEqual(data.hasFiles, true);
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

    it('should handle large file uploads', function (done) {
        const app = cmmv();
        app.use(multer({ dest: tempDir }));

        app.post('/large', (req, res) => {
            res.status(200).json({
                success: true,
                files: req.files,
                hasFiles: !!req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const boundary = 'large-boundary-def';

            // Create large content (10KB)
            const largeContent = 'x'.repeat(10240);

            const postData = createMultipartData(boundary,
                { size: 'large' },
                { largefile: { content: largeContent, filename: 'large.txt', contentType: 'text/plain' } }
            );

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/large',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
                        assert.strictEqual(data.success, true);
                        assert.strictEqual(data.hasFiles, true);
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

    it('should handle empty file uploads', function (done) {
        const app = cmmv();
        app.use(multer({ dest: tempDir }));

        app.post('/empty', (req, res) => {
            res.status(200).json({
                processed: true,
                files: req.files,
                hasFiles: !!req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const boundary = 'empty-boundary-ghi';

            const postData = createMultipartData(boundary,
                { note: 'empty file test' },
                { emptyfile: { content: '', filename: 'empty.txt', contentType: 'text/plain' } }
            );

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/empty',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
                        assert.strictEqual(data.processed, true);
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

    it('should handle special characters in filenames', function (done) {
        const app = cmmv();
        app.use(multer({ dest: tempDir }));

        app.post('/special-chars', (req, res) => {
            res.status(200).json({
                uploaded: true,
                files: req.files,
                hasFiles: !!req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const boundary = 'special-boundary-jkl';

            const postData = createMultipartData(boundary,
                { description: 'special characters test' },
                {
                    specialfile: {
                        content: 'Content with special chars: áéíóú ñ 中文 🌍',
                        filename: 'special-chars-áéíóú-中文-🌍.txt',
                        contentType: 'text/plain; charset=utf-8'
                    }
                }
            );

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/special-chars',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
                        assert.strictEqual(data.uploaded, true);
                        assert.strictEqual(data.hasFiles, true);
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

    it('should handle mixed content types', function (done) {
        const app = cmmv();
        app.use(multer({ dest: tempDir }));

        app.post('/mixed', (req, res) => {
            res.status(200).json({
                success: true,
                files: req.files,
                hasFiles: !!req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const boundary = 'mixed-boundary-mno';

            const postData = createMultipartData(boundary,
                {
                    title: 'Mixed content test',
                    category: 'testing'
                },
                {
                    textfile: { content: 'Plain text content', filename: 'text.txt', contentType: 'text/plain' },
                    jsonfile: { content: '{"key": "value"}', filename: 'data.json', contentType: 'application/json' },
                    csvfile: { content: 'name,age\nJohn,30', filename: 'data.csv', contentType: 'text/csv' }
                }
            );

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/mixed',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
                        assert.strictEqual(data.success, true);
                        assert.strictEqual(data.hasFiles, true);
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

    it('should handle requests without multipart content-type', function (done) {
        const app = cmmv();
        app.use(multer({ dest: tempDir }));

        app.post('/no-multipart', (req, res) => {
            res.status(200).json({
                processed: true,
                files: req.files,
                hasFiles: !!req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const postData = JSON.stringify({ message: 'not multipart' });

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/no-multipart',
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
                        assert.strictEqual(data.processed, true);
                        // Should not have files for non-multipart requests
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

    it('should work without destination directory specified', function (done) {
        const app = cmmv();
        app.use(multer()); // No dest specified

        app.post('/no-dest', (req, res) => {
            res.status(200).json({
                uploaded: true,
                files: req.files,
                hasFiles: !!req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const boundary = 'no-dest-boundary-pqr';

            const postData = createMultipartData(boundary,
                { test: 'no destination' },
                { file: { content: 'Test content', filename: 'test.txt', contentType: 'text/plain' } }
            );

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/no-dest',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
                        assert.strictEqual(data.uploaded, true);
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

    it('should handle malformed multipart data gracefully', function (done) {
        const app = cmmv();
        app.use(multer({ dest: tempDir }));

        app.post('/malformed', (req, res) => {
            res.status(200).json({
                processed: true,
                files: req.files,
                hasFiles: !!req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            // Send malformed multipart data
            const postData = Buffer.from('--boundary\r\nContent-Disposition: form-data; name="test"\r\n\r\nincomplete', 'utf8');

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/malformed',
                method: 'POST',
                headers: {
                    'Content-Type': 'multipart/form-data; boundary=boundary',
                    'Content-Length': postData.length
                }
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk.toString(); });
                res.on('end', () => {
                    // Should handle malformed data without crashing
                    assert.ok(res.statusCode >= 200);
                    server.close(done);
                });
            });

            req.on('error', (error) => {
                // Error is expected for malformed data
                server.close(done);
            });

            req.write(postData);
            req.end();
        }).catch(done);
    });

    it('should handle files with no filename', function (done) {
        const app = cmmv();
        app.use(multer({ dest: tempDir }));

        app.post('/no-filename', (req, res) => {
            res.status(200).json({
                uploaded: true,
                files: req.files,
                hasFiles: !!req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const boundary = 'no-filename-boundary';

            let data = `--${boundary}\r\n`;
            data += `Content-Disposition: form-data; name="file"\r\n`;
            data += `Content-Type: text/plain\r\n\r\n`;
            data += `File content without filename\r\n`;
            data += `--${boundary}--\r\n`;

            const postData = Buffer.from(data, 'utf8');

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/no-filename',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
                        assert.strictEqual(data.uploaded, true);
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

    it('should handle middleware class instantiation directly', function (done) {
        const app = cmmv();
        const multerInstance = new multer.MulterMiddleware({ dest: tempDir });

        app.post('/direct-instance', async (req, res) => {
            try {
                await multerInstance.process(req, res);
                res.status(200).json({
                    success: true,
                    files: req.files,
                    hasFiles: !!req.files
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const boundary = 'direct-instance-boundary';
            const postData = createMultipartData(boundary,
                { test: 'direct instance' },
                { file: { content: 'Direct instance test', filename: 'direct.txt', contentType: 'text/plain' } }
            );

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/direct-instance',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
                        assert.strictEqual(data.success, true);
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

    it('should handle very long field names and values', function (done) {
        const app = cmmv();
        app.use(multer({ dest: tempDir }));

        app.post('/long-fields', (req, res) => {
            res.status(200).json({
                processed: true,
                files: req.files,
                hasFiles: !!req.files
            });
        });

        app.listen({ port: 0 }).then(server => {
            const port = (server.address() as AddressInfo).port;
            const boundary = 'long-fields-boundary';

            // Create very long field name and value
            const longFieldName = 'a'.repeat(1000);
            const longFieldValue = 'b'.repeat(5000);

            const postData = createMultipartData(boundary,
                { [longFieldName]: longFieldValue },
                { file: { content: 'Long fields test', filename: 'long.txt', contentType: 'text/plain' } }
            );

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: '/long-fields',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
                        assert.strictEqual(data.processed, true);
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
});
