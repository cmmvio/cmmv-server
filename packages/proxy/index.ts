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

            const requestOptions = {
                hostname: this.targetUrl.hostname,
                port:
                    this.targetUrl.port ||
                    (this.targetUrl.protocol === 'https:' ? 443 : 80),
                path: targetPath,
                method: req.method,
                headers: { ...req.headers },
                timeout: this.options.timeout,
            };

            if (this.options.headers)
                Object.assign(requestOptions.headers, this.options.headers);

            if (this.options.changeOrigin)
                requestOptions.headers.host = this.targetUrl.host;

            delete requestOptions.headers['content-length'];
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

            if (req.body) {
                if (typeof req.body === 'string') {
                    proxyReq.write(req.body);
                } else {
                    proxyReq.write(JSON.stringify(req.body));
                }
            }

            proxyReq.end();
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
