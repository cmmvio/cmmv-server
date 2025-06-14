import * as request from 'supertest';
import cmmv from '..';

describe('options', function () {
    it('should respond only for existing routes', function (done) {
        const app = cmmv();
        app.get('/foo', function (req, res) {
            res.send('ok');
        });

        app.listen({ host: '127.0.0.1', port: 0 }).then(server => {
            request(server)
                .options('/foo')
                .expect(204)
                .expect('Allow', /GET/)
                .end(function (err) {
                    if (err) {
                        server.close();
                        return done(err);
                    }
                    request(server)
                        .options('/bar')
                        .expect(404, err2 => {
                            server.close();
                            done(err2 || undefined);
                        });
                });
        });
    });
});
