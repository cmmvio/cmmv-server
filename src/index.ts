//import { readFileSync } from "node:fs";

import { Inspector } from '@cmmv/inspector';
import cmmv, { json, urlencoded, serverStatic } from '@cmmv/server';
import etag from '@cmmv/etag';
import cors from '@cmmv/cors';
import cookieParser from '@cmmv/cookie-parser';
import compression from '@cmmv/compression';
import helmet from '@cmmv/helmet';
import proxy from '@cmmv/proxy';
import multer from '@cmmv/multer';

process.on('SIGINT', async () => {
    await Inspector.stop();
    await Inspector.saveProfile('./profiles');
    process.exit(0);
});

(async () => {
    await Inspector.start();

    const app = cmmv({
        /*http2: true,
        https: {
            key: readFileSync("./cert/private-key.pem"),
            cert: readFileSync("./cert/certificate.pem"),
            passphrase: "1234"
        }*/
    });

    const host = '0.0.0.0';
    const port = 3000;

    app.use(serverStatic('public'));
    app.use(cors());
    app.use(etag({ algorithm: 'murmurhash' }));
    app.use(cookieParser());
    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ limit: '50mb', extended: true }));
    app.use(compression({ level: 6 }));
    app.use(multer());
    app.use(
        helmet({
            contentSecurityPolicy: {
                useDefaults: false,
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", 'example.com'],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    objectSrc: ["'none'"],
                    upgradeInsecureRequests: [],
                },
            },
        }),
    );

    app.set('view engine', 'pug');

    // Definindo rotas específicas para o proxy
    app.get(
        '/proxy',
        proxy({
            target: 'http://httpbin.org',
            changeOrigin: true,
            pathRewrite: {
                '^/proxy': '',
            },
        }),
    );

    app.get(
        '/proxy/*',
        proxy({
            target: 'http://httpbin.org',
            changeOrigin: true,
            pathRewrite: {
                '^/proxy': '',
            },
        }),
    );

    app.get('/view', (req, res) => {
        res.render('index', { title: 'Hey', message: 'Hello there!' });
    });

    app.get('/', async (req, res) => {
        res.send('Hello World');
    });

    app.get('/json', async (req, res) => {
        const schema = {
            type: 'object',
            properties: {
                hello: {
                    type: 'string',
                },
            },
        };

        res.json({ hello: 'world' }, schema);
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

    app.post('/upload', async (req, res) => {
        console.log(req.files);
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
})();
