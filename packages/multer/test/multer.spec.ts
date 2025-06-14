/* eslint-disable */

import { strict as assert } from 'assert';
import * as request from 'supertest';
import cmmv from '@cmmv/server';

import multer from '..';

function createServer(opts?: any) {
    const app = cmmv();
    app.use(multer(opts));
    app.post('/', (req, res) => {
        res.status(200).json({ body: req.body, files: req.files });
    });
    return app;
}

describe('multer', function () {
    it('parses multipart form and exposes files', function (done) {
        const server = createServer();
        request(server)
            .post('/')
            .field('name', 'test')
            .attach('file', Buffer.from('hello'), 'hello.txt')
            .expect(200)
            .expect(res => {
                const data = JSON.parse(res.text);
                assert.equal(data.body.name, 'test');
                assert.ok(data.files.file);
            })
            .end(done);
    });
});
