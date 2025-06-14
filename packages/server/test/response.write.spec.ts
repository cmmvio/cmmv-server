import { strict as assert } from 'assert';
import * as http from 'node:http';
import { AddressInfo } from 'net';
import cmmv from '..';

describe('response.write', function() {
  it('should stream data using Server-Sent Events', function(done) {
    const app = cmmv();

    app.get('/stream', (req, res) => {
      res.set('Content-Type', 'text/event-stream');
      res.flushHeaders();
      res.write('data: first\n\n');
      res.write('data: second\n\n');
      res.res.end();
    });

    app.listen({ port: 0 }).then(server => {
      const port = (server.address() as AddressInfo).port;
      http.get({ host: '127.0.0.1', port, path: '/stream' }, res2 => {
        let body = '';
        res2.on('data', chunk => { body += chunk.toString(); });
        res2.on('end', () => {
          assert.strictEqual(body, 'data: first\n\ndata: second\n\n');
          server.close(done);
        });
      }).on('error', done);
    }).catch(done);
  });
});
