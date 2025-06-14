<p align="center">
  <a href="https://cmmv.io/" target="blank"><img src="https://raw.githubusercontent.com/cmmvio/docs.cmmv.io/main/public/assets/logo_CMMV2_icon.png" width="300" alt="CMMV Logo" /></a>
</p>
<p align="center">Contract-Model-Model-View (CMMV) <br/> Building scalable and modular applications using contracts.</p>
<p align="center">
    <a href="https://www.npmjs.com/package/@cmmv/core"><img src="https://img.shields.io/npm/v/@cmmv/core.svg" alt="NPM Version" /></a>
    <a href="https://github.com/cmmvio/cmmv-server/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@cmmv/core.svg" alt="Package License" /></a>
    <a href="https://dl.circleci.com/status-badge/redirect/circleci/QyJWAYrZ9JTfN1eubSDo5u/JEtDUbr1cNkGRxfKFJo7oR/tree/main" target="_blank"><img src="https://dl.circleci.com/status-badge/img/circleci/QyJWAYrZ9JTfN1eubSDo5u/JEtDUbr1cNkGRxfKFJo7oR/tree/main.svg?style=svg" alt="CircleCI" /></a>
</p>

<p align="center">
  <a href="https://cmmv.io">Documentation</a> &bull;
  <a href="https://github.com/cmmvio/cmmv-server/issues">Report Issue</a>
</p>

## Description

``@cmmv/server`` is inspired by the popular [Express.js](https://expressjs.com/pt-br/) framework but has been entirely rewritten in TypeScript with performance improvements in mind. The project integrates common plugins like ``body-parser``, ``compression``, ``cookie-parser``, ``cors``, ``etag``, ``helmet`` and ``serve-static`` out of the box. Additionally, it plans to support any Express.js-compatible plugin in the near future.

## Installation

Install the ``@cmmv/server`` package via npm:

```bash
$ pnpm add @cmmv/server
```

## Quick Start

Below is a simple example of how to create a new CMMV application:

```typescript
import cmmv, { json, urlencoded, serverStatic } from '@cmmv/server';
import etag from '@cmmv/etag';
import cors from '@cmmv/cors';
import cookieParser from '@cmmv/cookie-parser';
import compression from '@cmmv/compression';
import helmet from '@cmmv/helmet';

const app = cmmv();
const host = '0.0.0.0';
const port = 3000;

app.use(serverStatic('public'));
app.use(cors());
app.use(etag({ algorithm: 'murmurhash' }));
app.use(cookieParser());
app.use(json({ limit: '50mb' }));
app.use(urlencoded({ limit: '50mb', extended: true }));
app.use(compression({ level: 6 }));
app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", 'example.com'],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: [],
            },
        },
    }),
);

app.set('view engine', 'pug');

app.get('/view', async (req, res) => {
    res.render('index', { title: 'Hey', message: 'Hello there!' });
});

app.get('/', async (req, res) => {
    res.send('Hello World');
});

app.get('/json', async (req, res) => {    
    res.json({ hello: 'world' });
});

app.get('/user/:id', async (req, res) => {
    res.send('User ' + req.params.id);
});

app.get('/users', async (req, res) => {
    res.json(req.query);
});

app.post('/test', async (req, res) => {
    console.log(req.body);
    res.send('ok');
});

app.listen({ host, port })
.then(server => {
    console.log(
        `Listen on http://${server.address().address}:${server.address().port}`,
    );
})
.catch(err => {
    throw Error(err.message);
});
```

## Features

* **Performance Optimized:** Faster and more efficient with improvements over Express.js.
* **Built-in Plugins:** Includes commonly used middleware like ``compression``, ``body-parser``, ``cookie-parser``, and more.
* **TypeScript First:** Fully written in TypeScript for better type safety and developer experience.
* **Express.js Compatibility:** Plans to support Express.js-compatible plugins.
* **HTTP/2 Support:** Native support for HTTP/2, improving speed and connection performance.

## Benchmarks

* [https://github.com/fastify/benchmarks](https://github.com/fastify/benchmarks)
* Machine: linux x64 | 32 vCPUs | 128.0GB Mem
* Node: v20.17.0
* Run: Sun Mar 16 2025 14:51:12 GMT+0000 (Coordinated Universal Time)
* Method: ``autocannon -c 100 -d 40 -p 10 localhost:3000``

|                          | Version  | Router | Requests/s | Latency (ms) | Throughput/Mb |
|--------------------------|----------|--------|------------|--------------|---------------|
| bare                     | v20.17.0 | ✗      | 51166.4    | 19.19        | 9.13          |
| cmmv                     | 0.9.4    | ✓      | 46879.2    | 21.03        | 8.40          |
| fastify                  | 5.2.1    | ✓      | 46488.0    | 21.19        | 8.33          |
| h3                       | 1.15.1   | ✗      | 34626.2    | 28.37        | 6.18          |
| restify                  | 11.1.0   | ✓      | 34020.6    | 28.88        | 6.07          |
| koa                      | 2.16.0   | ✗      | 31031.0    | 31.72        | 5.53          |
| express                  | 5.0.1    | ✓      | 12913.6    | 76.87        | 2.30          |

## Proxy Options

The proxy middleware now supports several hooks inspired by
[express-http-proxy](https://github.com/villadora/express-http-proxy). These
allow customization of both the outbound request and the returned response.

- `filter(req, res)`: Skip proxying when the function returns `false`.
- `proxyReqPathResolver(req)`: Resolve the path to use for the proxied request.
- `proxyReqOptDecorator(opts, req)`: Modify the request options before sending.
- `userResDecorator(proxyRes, data, req, res)`: Transform the response body.
- `proxyErrorHandler(err, req, res, next)`: Custom error handler for proxy
  failures.

Example usage:

```typescript
import proxy from '@cmmv/proxy';

app.use(
    proxy({
        target: 'https://example.com',
        filter: (req) => req.method === 'GET',
        proxyReqPathResolver: req => `/api${req.url}`,
        userResDecorator: (proxyRes, data) => {
            const body = JSON.parse(data.toString());
            body.extra = true;
            return JSON.stringify(body);
        },
    }),
);
```

