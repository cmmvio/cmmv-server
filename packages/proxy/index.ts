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
    filter?: (req: any, res: any) => boolean | Promise<boolean>;
    proxyReqPathResolver?: (req: any) => string | Promise<string>;
    proxyReqOptDecorator?: (
        options: http.RequestOptions,
        req: any,
    ) => http.RequestOptions | Promise<http.RequestOptions>;
    userResDecorator?: (
        proxyRes: http.IncomingMessage,
        proxyResData: Buffer,
        req: any,
        res: any,
    ) => any | Promise<any>;
    proxyErrorHandler?: (err: any, req: any, res: any, next?: any) => void;
}

export class ProxyMiddleware {
    public middlewareName: string = 'proxy';

    private options: ProxyOptions;
    private targetUrl: url.UrlWithStringQuery;

    constructor(options: ProxyOptions) {
        this.targetUrl = url.parse(options.target);

        this.options = {
            changeOrigin: true,
            timeout: 30000,
            secure: this.targetUrl.protocol === 'https:',
            ...options,
        };
    }

    async process(req, res, next?) {
        try {
            if (this.options.filter) {
                const shouldProxy = await Promise.resolve(
                    this.options.filter(req, res),
                );
                if (!shouldProxy) {
                    if (next) return next();
                    return;
                }
            }

            await this.handleProxy(req, res);
            if (next) next();
        } catch (error) {
            if (this.options.proxyErrorHandler) {
                return this.options.proxyErrorHandler(error, req, res, next);
            }

            console.error('Proxy error:', error);
            if (!res.headersSent) {
                res.statusCode = 500;
                res.end('Proxy error: ' + error.message);
            }
            if (next) next();
        }
    }

    private async handleProxy(req, res): Promise<void> {
        return new Promise(async (resolve, reject) => {
            let targetPath = req.url;

            try {
                if (this.options.proxyReqPathResolver) {
                    const resolved = await Promise.resolve(
                        this.options.proxyReqPathResolver(req),
                    );
                    if (resolved) targetPath = resolved;
                } else if (this.options.pathRewrite) {
                    for (const [pattern, replacement] of Object.entries(
                        this.options.pathRewrite,
                    )) {
                        const regex = new RegExp(pattern);
                        targetPath = targetPath.replace(regex, replacement);
                    }
                }
            } catch (e) {
                return reject(e);
            }

            const originalReq = req.req || req;

            let requestOptions: http.RequestOptions = {
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
                requestOptions.headers['host'] = this.targetUrl.host;

            try {
                if (this.options.proxyReqOptDecorator) {
                    const decorated = await Promise.resolve(
                        this.options.proxyReqOptDecorator(
                            requestOptions,
                            originalReq,
                        ),
                    );
                    if (decorated) requestOptions = decorated;
                }
            } catch (e) {
                return reject(e);
            }

            const httpModule =
                this.options.secure || this.targetUrl.protocol === 'https:'
                    ? https
                    : http;

            if (this.targetUrl.protocol === 'https:') {
                (requestOptions as https.RequestOptions).rejectUnauthorized =
                    this.options.secure;
            }

            const proxyReq = httpModule.request(requestOptions, proxyRes => {
                res.statusCode = proxyRes.statusCode || 500;

                Object.keys(proxyRes.headers).forEach(key => {
                    res.setHeader(key, proxyRes.headers[key]);
                });

                let responseData = Buffer.alloc(0);

                proxyRes.on('data', chunk => {
                    responseData = Buffer.concat([responseData, chunk]);
                });

                proxyRes.on('end', async () => {
                    try {
                        let dataToSend: any = responseData;

                        if (this.options.userResDecorator) {
                            const decorated = await Promise.resolve(
                                this.options.userResDecorator(
                                    proxyRes,
                                    responseData,
                                    req,
                                    res,
                                ),
                            );
                            if (decorated !== undefined) {
                                if (
                                    Buffer.isBuffer(decorated) ||
                                    typeof decorated === 'string'
                                ) {
                                    dataToSend = decorated;
                                } else {
                                    dataToSend = Buffer.from(
                                        JSON.stringify(decorated),
                                    );
                                    if (!res.getHeader('content-type')) {
                                        res.setHeader(
                                            'content-type',
                                            'application/json',
                                        );
                                    }
                                }
                            }
                        }

                        res.end(dataToSend);
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
                        requestOptions.headers['content-type'] =
                            'application/json';
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
