/*!
 * CMMV Compression
 * Copyright(c) 2024 Andre Ferreira
 * MIT Licensed
 */

/*!
 * compression
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 *
 * @see https://github.com/expressjs/compression
 */

/**
 * fastify-compress
 * Copyright (c) 2017 Fastify
 * MIT Licensed
 *
 * @see https://github.com/fastify/fastify-compress
 */

import * as compressible from 'compressible';
import * as vary from 'vary';
import * as accepts from 'accepts';
import * as bytes from 'bytes';

import * as http from 'node:http';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';

export type CompressionOptions = zlib.ZlibOptions & {
    threshold?: number;
    cacheEnabled?: boolean;
    cacheTimeout?: number;
};

const onHeaders = require('on-headers');

export class CompressionMiddleware {
    public middlewareName: string = 'compression';

    private options: CompressionOptions;
    private cache: Map<string, { buffer: Buffer; timestamp: number }> =
        new Map();

    constructor(options?: CompressionOptions) {
        this.options = options || {};

        this.options.threshold =
            (options && options.threshold) || options?.threshold === 0
                ? bytes.parse(options.threshold)
                : 1024;

        if (this.options.threshold == null) this.options.threshold = 1024;
    }

    async process(req, res, next?) {
        if (req.app && typeof req.app.addHook == 'function')
            req.app.addHook('onSend', this.cmmvMiddleware.bind(this));
        else this.expressCompatibility.call(this, req, res, res.body, next);
    }

    async cmmvMiddleware(req, res, payload, done) {
        try {
            const accept = accepts(req as http.IncomingMessage);

            let method = accept.encoding(['br', 'gzip', 'deflate', 'identity']);

            if (this.filter(res) && this.shouldTransform(res)) {
                vary(res as http.ServerResponse, 'Accept-Encoding');

                if (req.method === 'HEAD') return;

                const encoding =
                    res.getHeader('Content-Encoding') || 'identity';
                let contentLenght = payload.length;

                if (
                    (Number(contentLenght) < this.options.threshold &&
                        !Number.isNaN(contentLenght)) ||
                    (res instanceof Response &&
                        payload.length < this.options.threshold)
                ) {
                    return payload;
                }

                if (!method || method === 'identity' || encoding !== 'identity')
                    return payload;

                const stream = this.createCompressionStream(method);

                if (!stream) return payload;

                if (typeof payload == 'string' || Buffer.isBuffer(payload)) {
                    res.set('Content-Encoding', method);
                    res.remove('Content-Length');

                    const compressedBuffer = await this.compressData(
                        typeof payload === 'string'
                            ? Buffer.from(payload)
                            : (payload as Buffer),
                        stream,
                    );

                    return compressedBuffer;
                }

                return payload;
            }
        } catch (err) {
            console.error(err);
            return new Error(err.message);
        }
    }

    expressCompatibility(req, res, next, opts) {
        const filter = opts.filter || shouldCompress;

        let ended = false;
        let length;
        let listeners = [];
        let stream;

        const _end = res.end;
        const _on = res.on;
        const _write = res.write;

        res.flush = function flush() {
            if (stream) stream.flush();
        };

        res.write = function write(chunk, encoding) {
            if (ended) return false;

            if (!this._header) this._implicitHeader();

            return stream
                ? stream.write(toBuffer(chunk, encoding))
                : _write.call(this, chunk, encoding);
        };

        res.end = function end(chunk, encoding) {
            if (ended) return false;

            if (!this._header) {
                // estimate the length
                if (!this.getHeader('Content-Length'))
                    length = chunkLength(chunk, encoding);

                this._implicitHeader();
            }

            if (!stream) return _end.call(this, chunk, encoding);

            // mark ended
            ended = true;

            // write Buffer for Node.js 0.8
            return chunk ? stream.end(toBuffer(chunk, encoding)) : stream.end();
        };

        res.on = function on(type, listener) {
            if (!listeners || type !== 'drain')
                return _on.call(this, type, listener);

            if (stream) return stream.on(type, listener);

            // buffer listeners for future stream
            listeners.push([type, listener]);

            return this;
        };

        function nocompress(msg) {
            addListeners(res, _on, listeners);
            listeners = null;
        }

        onHeaders(res, function onResponseHeaders() {
            if (!filter(req, res)) {
                nocompress('filtered');
                return;
            }

            if (!shouldTransform(req, res)) {
                nocompress('no transform');
                return;
            }

            vary(res, 'Accept-Encoding');

            if (
                Number(res.getHeader('Content-Length')) < opts.threshold ||
                length < opts.threshold
            ) {
                nocompress('size below threshold');
                return;
            }

            const encoding = res.getHeader('Content-Encoding') || 'identity';

            if (encoding !== 'identity') {
                nocompress('already encoded');
                return;
            }

            if (req.method === 'HEAD') {
                nocompress('HEAD request');
                return;
            }

            const accept = accepts(req);
            let method = accept.encoding(['gzip', 'deflate', 'identity']);

            if (method === 'deflate' && accept.encoding(['gzip']))
                method = accept.encoding(['gzip', 'identity']);

            if (!method || method === 'identity') {
                nocompress('not acceptable');
                return;
            }

            stream =
                method === 'gzip'
                    ? zlib.createGzip(opts)
                    : zlib.createDeflate(opts);

            addListeners(stream, stream.on, listeners);

            res.setHeader('Content-Encoding', method);
            res.removeHeader('Content-Length');

            stream.on('data', function onStreamData(chunk) {
                if (_write.call(res, chunk) === false) stream.pause();
            });

            stream.on('end', function onStreamEnd() {
                _end.call(res);
            });

            _on.call(res, 'drain', function onResponseDrain() {
                stream.resume();
            });
        });
    }

    createCompressionStream(method: string) {
        switch (method) {
            case 'br':
                return zlib.createBrotliCompress(this.options);
            case 'gzip':
                return zlib.createGzip(this.options);
            case 'deflate':
                return zlib.createDeflate(this.options);
            default:
                return null;
        }
    }

    compressData(
        inputBuffer: Buffer,
        compressionStream: zlib.Gzip | zlib.Deflate,
    ): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];

            if (compressionStream) {
                compressionStream.on('data', chunk => chunks.push(chunk));
                compressionStream.on('end', () =>
                    resolve(Buffer.concat(chunks)),
                );
                compressionStream.on('error', err => reject(err));
                compressionStream.end(inputBuffer);
            } else {
                reject('Compress method invalid!');
            }
        });
    }

    filter(res: any) {
        try {
            const type =
                res.getHeader('Content-Type') || res.headers['Content-Type'];
            return !(type === undefined || !compressible(type));
        } catch {
            return false;
        }
    }

    shouldTransform(res: any) {
        try {
            const cacheControl = res?.getHeader('Cache-Control');
            return (
                !cacheControl ||
                !/(?:^|,)\s*?no-transform\s*?(?:,|$)/.test(
                    cacheControl as string,
                )
            );
        } catch (err) {
            console.error(err);
        }
    }

    generateHash(encoding: string, body: Buffer): string {
        const hash = crypto.createHash('md5');
        hash.update(encoding + body.toString('base64'));
        return hash.digest('hex');
    }

    flush() {
        const now = Date.now();

        this.cache.forEach((value, key) => {
            if (now - value.timestamp >= this.options.cacheTimeout)
                this.cache.delete(key);
        });
    }

    /**
     * Provide a async iteratable for Readable.from
     */
    async *intoAsyncIterator(payload) {
        if (typeof payload === 'object') {
            if (Buffer.isBuffer(payload)) {
                yield payload;
                return;
            }

            if (payload instanceof ArrayBuffer) {
                yield Buffer.from(new Uint8Array(payload));
                return;
            }

            if (ArrayBuffer.isView(payload)) {
                yield Buffer.from(
                    payload.buffer,
                    payload.byteOffset,
                    payload.byteLength,
                );
                return;
            }

            if (Symbol.iterator in payload) {
                for (const chunk of payload) yield chunk;

                return;
            }

            if (Symbol.asyncIterator in payload) {
                for await (const chunk of payload) yield chunk;

                return;
            }
        }

        yield payload;
    }
}

export default async function (options?: CompressionOptions) {
    const middleware = new CompressionMiddleware(options);
    return (req, res, next) => middleware.process(req, res, next);
}

/**
 * Add bufferred listeners to stream
 * @private
 */

function addListeners(stream, on, listeners) {
    for (let i = 0; i < listeners.length; i++) {
        on.apply(stream, listeners[i]);
    }
}

/**
 * Get the length of a given chunk
 */
function chunkLength(chunk, encoding) {
    if (!chunk) return 0;

    return !Buffer.isBuffer(chunk)
        ? Buffer.byteLength(chunk, encoding)
        : chunk.length;
}

/**
 * Default filter function.
 * @private
 */
function shouldCompress(req, res) {
    const type = res.getHeader('Content-Type');

    if (type === undefined || !compressible(type)) return false;

    return true;
}

/**
 * Determine if the entity should be transformed.
 * @private
 */
function shouldTransform(req, res) {
    const cacheControlNoTransformRegExp = /(?:^|,)\s*?no-transform\s*?(?:,|$)/;
    const cacheControl = res.getHeader('Cache-Control');

    // Don't compress for Cache-Control: no-transform
    // https://tools.ietf.org/html/rfc7234#section-5.2.2.4
    return !cacheControl || !cacheControlNoTransformRegExp.test(cacheControl);
}

/**
 * Coerce arguments to Buffer
 * @private
 */
function toBuffer(chunk, encoding) {
    return !Buffer.isBuffer(chunk) ? Buffer.from(chunk, encoding) : chunk;
}
