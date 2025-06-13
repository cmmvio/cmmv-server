/*!
 * CMMV Proxy
 * Copyright(c) 2024 Andre Ferreira
 * MIT Licensed
 */

import * as http from 'http';
import * as https from 'https';
import * as url from 'url';

export interface ProxyOptions {
    target: string;
    changeOrigin?: boolean;
    pathRewrite?: { [key: string]: string };
    timeout?: number;
    headers?: { [key: string]: string };
    secure?: boolean;
}

export class ProxyMiddleware {
    public middlewareName: string = 'proxy';

    private options: ProxyOptions;
    private targetUrl: url.UrlWithStringQuery;

    constructor(options: ProxyOptions) {
        this.options = {
            changeOrigin: true,
            timeout: 30000,
            secure: true,
            ...options,
        };

        this.targetUrl = url.parse(this.options.target);
    }

    async process(req, res, next?) {
        try {
            await this.handleProxy(req, res);
            if (next) next();
        } catch (error) {
            console.error('Proxy error:', error);
            if (!res.headersSent) {
                res.statusCode = 500;
                res.end('Proxy error: ' + error.message);
            }
            if (next) next();
        }
    }

    private async handleProxy(req, res): Promise<void> {
        return new Promise((resolve, reject) => {
            let targetPath = req.url;
            if (this.options.pathRewrite) {
                for (const [pattern, replacement] of Object.entries(
                    this.options.pathRewrite,
                )) {
                    const regex = new RegExp(pattern);
                    targetPath = targetPath.replace(regex, replacement);
                }
            }

            const originalReq = req.req || req;

            const requestOptions = {
                hostname: this.targetUrl.hostname,
                port:
                    this.targetUrl.port ||
                    (this.targetUrl.protocol === 'https:' ? 443 : 80),
                path: targetPath,
                method: originalReq.method,
                headers: { ...originalReq.headers },
                timeout: this.options.timeout,
            };

            if (this.options.headers)
                Object.assign(requestOptions.headers, this.options.headers);

            if (this.options.changeOrigin)
                requestOptions.headers.host = this.targetUrl.host;

            const httpModule =
                this.targetUrl.protocol === 'https:' ? https : http;

            const proxyReq = httpModule.request(requestOptions, proxyRes => {
                res.statusCode = proxyRes.statusCode;

                Object.keys(proxyRes.headers).forEach(key => {
                    res.setHeader(key, proxyRes.headers[key]);
                });

                let responseData = Buffer.alloc(0);

                proxyRes.on('data', chunk => {
                    responseData = Buffer.concat([responseData, chunk]);
                });

                proxyRes.on('end', () => {
                    try {
                        res.end(responseData);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });

                proxyRes.on('error', error => {
                    reject(error);
                });
            });

            proxyReq.setTimeout(this.options.timeout, () => {
                proxyReq.destroy();
                reject(new Error('Proxy timeout'));
            });

            proxyReq.on('error', error => {
                reject(error);
            });

            if (originalReq.readable && originalReq !== req) {
                originalReq.pipe(proxyReq);
            } else if (req.body) {
                let bodyData;

                if (typeof req.body === 'string') {
                    bodyData = req.body;
                } else if (Buffer.isBuffer(req.body)) {
                    bodyData = req.body;
                } else if (typeof req.body === 'object') {
                    bodyData = JSON.stringify(req.body);
                    if (!requestOptions.headers['content-type']) {
                        requestOptions.headers['content-type'] = 'application/json';
                    }
                } else {
                    bodyData = String(req.body);
                }

                if (bodyData) {
                    const contentLength = Buffer.byteLength(bodyData, 'utf8');
                    requestOptions.headers['content-length'] = contentLength;
                    proxyReq.write(bodyData);
                }
                proxyReq.end();
            } else {
                proxyReq.end();
            }
        });
    }

    async onCall(req, res, payload, done) {
        if (done) done();
    }
}

export default function (options: ProxyOptions) {
    const middleware = new ProxyMiddleware(options);
    return (req, res, next) => middleware.process(req, res, next);
}

export const proxy = function (options: ProxyOptions) {
    const middleware = new ProxyMiddleware(options);
    return (req, res, next) => middleware.process(req, res, next);
};
