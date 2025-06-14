/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 *
 * @see https://github.com/expressjs/express/blob/master/lib/request.js
 *
 * koa
 * Copyright (c) 2019 Koa contributors
 * MIT Licensed
 *
 * @see https://github.com/koajs/koa/blob/master/lib/request.js
 *
 * fastify
 * Copyright (c) 2016-2024 The Fastify Team
 * MIT Licensed
 *
 * @see https://github.com/fastify/fastify/blob/main/lib/request.js
 */
import { isIP } from 'node:net';

import * as proxyaddr from 'proxy-addr';
import * as qs from 'qs';

export default {
    app: undefined,
    req: undefined,
    res: undefined,
    originalUrl: undefined,
    memoizedURL: undefined,

    /**
     * Parse the query string of `req.url`.
     *
     * This uses the "query parser" setting to parse the raw
     * string into an object.
     *
     * @return {String}
     * @api public
     */
    get query(): Record<string, any> {
        const { parseurl } = require('../utils');
        const querystring = parseurl(this.req).query;
        return qs.parse(querystring);
    },

    /**
     * Get query string.
     *
     * @return {String}
     * @api public
     */
    get querystring() {
        if (!this.req) return '';
        const { parseurl } = require('../utils');
        return parseurl(this.req).query || '';
    },

    /**
     * Get the search string. Same as the query string
     * except it includes the leading ?.
     *
     * @return {String}
     * @api public
     */
    get search() {
        if (!this.querystring) return '';
        return `?${this.querystring}`;
    },

    /**
     * Return the request socket.
     *
     * @return {Connection}
     * @api public
     */
    get socket() {
        return this.req.socket;
    },

    /**
     * Return the protocol string "http" or "https"
     * when requested with TLS. When the "trust proxy"
     * setting trusts the socket address, the
     * "X-Forwarded-Proto" header field will be trusted
     * and used if present.
     *
     * If you're running behind a reverse proxy that
     * supplies https for you this may be enabled.
     *
     * @return {String}
     * @public
     */
    get protocol() {
        if (this.socket.encrypted) return 'https';
        if (!this.app.proxy) return 'http';
        const proto = this.get('X-Forwarded-Proto');
        return proto ? proto.split(/\s*,\s*/, 1)[0] : 'http';
    },

    /**
     * Return request header, alias as request.header
     *
     * @return {Object}
     * @api public
     */
    get headers() {
        return this.req.headers;
    },

    /**
     * Get request URL.
     *
     * @return {String}
     * @api public
     */
    get url() {
        return this.req.url;
    },

    /**
     * Get origin of URL.
     *
     * @return {String}
     * @api public
     */
    get origin() {
        return `${this.protocol}://${this.host}`;
    },

    /**
     * Get full request URL.
     *
     * @return {String}
     * @api public
     */
    get href() {
        // support: `GET http://example.com/foo`
        if (/^https?:\/\//i.test(this.originalUrl)) return this.originalUrl;
        return this.origin + this.originalUrl;
    },

    /**
     * Short-hand for:
     *
     *    req.protocol === 'https'
     *
     * @return {Boolean}
     * @public
     */
    get secure(): boolean {
        return this.protocol === 'https';
    },

    /**
     * Get request method.
     *
     * @return {String}
     * @api public
     */
    get method() {
        return this.req.method;
    },

    /**
     * Get request pathname.
     *
     * @return {String}
     * @api public
     */
    get path() {
        const { parseurl } = require('../utils');
        return parseurl(this.req).pathname;
    },

    /**
     * Parse the "Host" header field to a host.
     *
     * When the "trust proxy" setting trusts the socket
     * address, the "X-Forwarded-Host" header field will
     * be trusted.
     *
     * @return {String}
     * @public
     */
    get host(): string {
        const trust = this.app.get('trust proxy fn');
        let host = this.get('X-Forwarded-Host');

        if (!host || !trust(this.socket.remoteAddress, 0)) {
            if (this.req.httpVersionMajor >= 2) host = this.get(':authority');
            else host = this.get('Host');
        } else if (host.indexOf(',') !== -1) {
            // Note: X-Forwarded-Host is normally only ever a
            //       single value, but this is to be safe.
            host = host.substring(0, host.indexOf(',')).trimRight();
        }

        if (!host) return '';
        return host.split(/\s*,\s*/, 1)[0];
    },

    /**
     * Parse the "Host" header field hostname
     * and support X-Forwarded-Host when a
     * proxy is enabled.
     *
     * @return {String} hostname
     * @api public
     */
    get hostname() {
        const host = this.host;
        if (!host) return '';
        if (host[0] === '[') return this.URL.hostname || ''; // IPv6
        return host.split(':', 1)[0];
    },

    /**
     * Get WHATWG parsed URL.
     * Lazily memoized.
     *
     * @return {URL|Object}
     * @api public
     */
    get URL() {
        /* istanbul ignore else */
        if (!this.memoizedURL) {
            const originalUrl = this.originalUrl || ''; // avoid undefined in template string
            try {
                this.memoizedURL = new URL(`${this.origin}${originalUrl}`);
            } catch (err) {
                this.memoizedURL = Object.create(null);
            }
        }

        return this.memoizedURL;
    },

    /**
     * Check if the request is fresh, aka
     * Last-Modified and/or the ETag
     * still match.
     *
     * @return {Boolean}
     * @api public
     */
    get fresh(): boolean {
        const { fresh } = require('../utils');
        const method = this.method;
        const res = this.res;
        const status = res.statusCode;

        if ('GET' !== method && 'HEAD' !== method) return false;

        if ((status >= 200 && status < 300) || 304 === status) {
            return fresh(this.headers, {
                etag: res.get('ETag'),
                'last-modified': res.get('Last-Modified'),
            });
        }

        return false;
    },

    /**
     * Check if the request is stale, aka
     * "Last-Modified" and / or the "ETag" for the
     * resource has changed.
     *
     * @return {Boolean}
     * @api public
     */
    get stale() {
        return !this.fresh;
    },

    /**
     * Check if the request is idempotent.
     *
     * @return {Boolean}
     * @api public
     */
    get idempotent() {
        const methods = ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE'];
        return !!~methods.indexOf(this.method);
    },

    /**
     * Return the remote address from the trusted proxy.
     *
     * The is the remote address on the socket unless
     * "trust proxy" is set.
     *
     * @return {String}
     * @public
     */
    get ip(): string {
        const trust = this.app.get('trust proxy fn');
        return proxyaddr(this.req, trust); // Retorna o IP como string
    },

    /**
     * When "trust proxy" is set, trusted proxy addresses + client.
     *
     * For example if the value were "client, proxy1, proxy2"
     * you would receive the array `["client", "proxy1", "proxy2"]`
     * where "proxy2" is the furthest down-stream and "proxy1" and
     * "proxy2" were trusted.
     *
     * @return {Array}
     * @public
     */
    get ips(): string[] {
        const trust = this.app.get('trust proxy fn');
        const addrs = proxyaddr.all(this.req, trust);
        addrs.reverse().pop();
        return addrs;
    },

    /**
     * Return parsed Content-Length when present.
     *
     * @return {Number|void}
     * @api public
     */
    _length: undefined,

    get length(): number {
        const len = this._length || this.get('Content-Length');
        if (len === '') return;
        return ~~len;
    },

    set length(value) {
        this._length = value;
    },

    /**
     * Return subdomains as an array.
     *
     * Subdomains are the dot-separated parts of the host before the main domain of
     * the app. By default, the domain of the app is assumed to be the last two
     * parts of the host. This can be changed by setting "subdomain offset".
     *
     * For example, if the domain is "tobi.ferrets.example.com":
     * If "subdomain offset" is not set, req.subdomains is `["ferrets", "tobi"]`.
     * If "subdomain offset" is 3, req.subdomains is `["tobi"]`.
     *
     * @return {Array}
     * @public
     */
    get subdomains(): string[] {
        const hostname = this.hostname;
        if (!hostname) return [];

        var offset = this.app.get('subdomain offset');
        var subdomains = !isIP(hostname)
            ? hostname.split('.').reverse()
            : [hostname];

        return subdomains.slice(offset);
    },

    /**
     * Check if the request was an _XMLHttpRequest_.
     *
     * @return {Boolean}
     * @public
     */
    get xhr(): boolean {
        const val = this.get('X-Requested-With') || '';
        return val.toLowerCase() === 'xmlhttprequest';
    },

    /**
     * Cookies
     */
    _cookies: undefined,

    get cookies() {
        return this._cookies;
    },

    set cookies(value) {
        this._cookies = value;
    },

    _signedCookies: undefined,

    get signedCookies() {
        return this._signedCookies;
    },

    set signedCookies(value) {
        this._signedCookies = value;
    },

    /**
     * Return request header.
     *
     * The `Referrer` header field is special-cased,
     * both `Referrer` and `Referer` are interchangeable.
     *
     * Examples:
     *
     *     this.get('Content-Type');
     *     // => "text/plain"
     *
     *     this.get('content-type');
     *     // => "text/plain"
     *
     *     this.get('Something');
     *     // => ''
     *
     * @param {String} field
     * @return {String}
     * @api public
     */
    header(name): string {
        if (!name) throw new TypeError('name argument is required to req.get');

        if (typeof name !== 'string')
            throw new TypeError('name must be a string to req.get');

        switch ((name = name.toLowerCase())) {
            case 'referer':
            case 'referrer':
                return (
                    this.req.headers.referrer || this.req.headers.referer || ''
                );
            default:
                return this.req.headers[name] || '';
        }
    },

    /**
     * Return request header.
     *
     * The `Referrer` header field is special-cased,
     * both `Referrer` and `Referer` are interchangeable.
     *
     * Examples:
     *
     *     req.get('Content-Type');
     *     // => "text/plain"
     *
     *     req.get('content-type');
     *     // => "text/plain"
     *
     *     req.get('Something');
     *     // => undefined
     *
     * Aliased as `req.header()`.
     *
     * @param {String} name
     * @return {String}
     * @public
     */
    get(name): string {
        return this.header(name);
    },

    /**
     * Get accept object.
     * Lazily memoized.
     *
     * @return {Object}
     * @api private
     */
    _accept: undefined,

    get accept() {
        return this._accept || (this._accept = require('accepts')(this.req));
    },

    /**
     * Return the request mime type void of
     * parameters such as "charset".
     *
     * @return {String}
     * @api public
     */

    get type() {
        const type = this.get('Content-Type');
        if (!type) return '';
        return type.split(';')[0];
    },

    /**
     * To do: update docs.
     *
     * Check if the given `type(s)` is acceptable, returning
     * the best match when true, otherwise `undefined`, in which
     * case you should respond with 406 "Not Acceptable".
     *
     * The `type` value may be a single MIME type string
     * such as "application/json", an extension name
     * such as "json", a comma-delimited list such as "json, html, text/plain",
     * an argument list such as `"json", "html", "text/plain"`,
     * or an array `["json", "html", "text/plain"]`. When a list
     * or array is given, the _best_ match, if any is returned.
     *
     * Examples:
     *
     *     // Accept: text/html
     *     req.accepts('html');
     *     // => "html"
     *
     *     // Accept: text/*, application/json
     *     req.accepts('html');
     *     // => "html"
     *     req.accepts('text/html');
     *     // => "text/html"
     *     req.accepts('json, text');
     *     // => "json"
     *     req.accepts('application/json');
     *     // => "application/json"
     *
     *     // Accept: text/*, application/json
     *     req.accepts('image/png');
     *     req.accepts('png');
     *     // => undefined
     *
     *     // Accept: text/*;q=.5, application/json
     *     req.accepts(['html', 'json']);
     *     req.accepts('html', 'json');
     *     req.accepts('html, json');
     *     // => "json"
     *
     * @param {String|Array} type(s)
     * @return {String|Array|Boolean}
     * @public
     */
    accepts(...args) {
        return this.accept.types(...args);
    },

    /**
     * Check if the given `encoding`s are accepted.
     *
     * @param {String} ...encoding
     * @return {String|Array}
     * @public
     */
    acceptsEncodings(...args) {
        return this.accept.encodings(...args);
    },

    /**
     * Check if the given `charset`s are acceptable,
     * otherwise you should respond with 406 "Not Acceptable".
     *
     * @param {String} ...charset
     * @return {String|Array}
     * @public
     */
    acceptsCharsets(...args) {
        return this.accept.charsets(...args);
    },

    /**
     * Check if the given `lang`s are acceptable,
     * otherwise you should respond with 406 "Not Acceptable".
     *
     * @param {String} ...lang
     * @return {String|Array}
     * @public
     */
    acceptsLanguages(...args) {
        return this.accept.languages(...args);
    },

    /**
     * Parse Range header field, capping to the given `size`.
     *
     * Unspecified ranges such as "0-" require knowledge of your resource length. In
     * the case of a byte range this is of course the total number of bytes. If the
     * Range header field is not given `undefined` is returned, `-1` when unsatisfiable,
     * and `-2` when syntactically invalid.
     *
     * When ranges are returned, the array has a "type" property which is the type of
     * range that is required (most commonly, "bytes"). Each array element is an object
     * with a "start" and "end" property for the portion of the range.
     *
     * The "combine" option can be set to `true` and overlapping & adjacent ranges
     * will be combined into a single range.
     *
     * NOTE: remember that ranges are inclusive, so for example "Range: users=0-3"
     * should respond with 4 users when available, not 3.
     *
     * @param {number} size
     * @param {object} [options]
     * @param {boolean} [options.combine=false]
     * @return {number|array}
     * @public
     */
    range(size, options) {
        const { parseRange } = require('../utils');
        const range = this.get('Range');
        if (!range) return;
        return parseRange(size, range, options);
    },

    /**
     * Check if the incoming request contains the "Content-Type"
     * header field, and it contains the given mime `type`.
     *
     * Examples:
     *
     *      // With Content-Type: text/html; charset=utf-8
     *      req.is('html');
     *      req.is('text/html');
     *      req.is('text/*');
     *      // => true
     *
     *      // When Content-Type is application/json
     *      req.is('json');
     *      req.is('application/json');
     *      req.is('application/*');
     *      // => true
     *
     *      req.is('html');
     *      // => false
     *
     * @param {String|Array} types...
     * @return {String|false|null}
     * @public
     */
    is(...types: any) {
        const typeis = require('typeis');
        let arr = types;

        if (!Array.isArray(types)) {
            arr = new Array(types.length);

            for (let i = 0; i < arr.length; i++) arr[i] = types[i];
        }

        return typeis(this, arr);
    },
};
