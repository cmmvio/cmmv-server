import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import * as MurmurHash3 from 'imurmurhash';

import {
    CM_ERR_HTTP2_INVALID_VERSION,
    CM_ERR_OPTIONS_NOT_OBJ,
    CM_ERR_QSP_NOT_FN,
    CM_ERR_INSTANCE_ALREADY_LISTENING,
    CM_ERR_HOOK_INVALID_HANDLER,
    CM_ERR_HOOK_INVALID_ASYNC_HANDLER,
    CM_ERR_ERROR_HANDLER_NOT_FN,
} from './errors';

import {
    kChildren,
    kContentTypeParsers,
    kErrorHandler,
    kHooks,
    kMiddlewares,
    kRequestPayloadStream,
    kResponseHeaders,
    kResponseIsError,
    kState,
} from './symbols';

import {
    Hooks,
    hookRunnerApplication,
    onRequestAbortHookRunner,
    onRequestHookRunner,
    preParsingHookRunner,
    supportedHooks,
} from './hooks';

import { buildErrorHandler, rootErrorHandler } from './error-handler';

import { HTTPMethod } from '../constants';
import { handleRequest } from './handle-request';
import { Router } from './router';
import request from './request';
import response from './response';
import View from './view';

import { utilsMerge, setPrototypeOf } from '../utils';

const trustProxyDefaultSymbol = '@@symbol:trust_proxy_default';
const mixin = require('merge-descriptors');

export class Application extends EventEmitter {
    request: any;

    response: any;

    options: any;

    constructor() {
        super();
        this.request = request;
        this.response = response;
    }

    private processOptions(options?) {
        if (typeof options !== 'object') throw new CM_ERR_OPTIONS_NOT_OBJ();

        if (
            options.querystringParser &&
            typeof options.querystringParser !== 'function'
        )
            throw new CM_ERR_QSP_NOT_FN(typeof options.querystringParser);

        options.http2 = Boolean(options.http2 === true);
        options.connectionTimeout = options.connectionTimeout || 0;
        options.keepAliveTimeout = options.keepAliveTimeout || 72000;
        options.maxRequestsPerSocket = options.maxRequestsPerSocket || 0;
        options.requestTimeout = options.requestTimeout || 0;
        options.bodyLimit = options.bodyLimit || 1048576;
        options.maxHeaderSize = options.maxHeaderSize || 16384;
        options.insecureHTTPParser = Boolean(
            options.insecureHTTPParser === true,
        );
        options.joinDuplicateHeaders = Boolean(
            options.joinDuplicateHeaders === true,
        );

        //Internal cache
        options.cache = Boolean(options.cache === true) || !options.cache;
        options.cacheTTL = options.cacheTTL || 5000;

        return options;
    }

    private injectApplication(server, options?) {
        const slice = Array.prototype.slice;
        const flatten = Array.prototype.flat;
        const self = this;

        const app: any = {
            router: new Router(),
            cache: Object.create(null),
            engines: Object.create(null),
            settings: Object.create(null),
            locals: Object.create(null),
            cachedRoutes: Object.create(null),
            mountpath: '/',
        };

        mixin(app, EventEmitter.prototype, false);

        HTTPMethod.forEach(method => {
            app[method] = ((path?: string, ...callbacks) => {
                if (method === 'get' && callbacks.length === 0)
                    return app.set(path);

                const route = app.router;
                route[method].call(route, path, callbacks);
                return this;
            }).bind(app);
        });

        app.addRoute = function addRoute(options: any) {
            app.router.route(options);
            return this;
        };

        /**
         * Proxy `Router#use()` to add middleware to the app router.
         * See Router#use() documentation for details.
         *
         * If the _fn_ parameter is an express app, then it will be
         * mounted at the _route_ specified.
         *
         * @public
         */
        app.use = function use(fn: any) {
            let offset = 0;
            let path = '/';

            if (fn.constructor.name === 'Promise') {
                return fn
                    .then(init => init.call(this, { app: this }, null, null))
                    .catch(err => {
                        throw new Error(err);
                    });
            }

            if (typeof fn !== 'function') {
                let arg = fn;

                while (Array.isArray(arg) && arg.length !== 0) arg = arg[0];

                if (typeof arg !== 'function') {
                    offset = 1;
                    path = fn;
                }
            } else {
                path = '';
            }

            const fns = flatten.call(slice.call(arguments, offset), Infinity);

            if (fns.length === 0)
                throw new TypeError('app.use() requires a middleware function');

            const router = this.router;

            fns.forEach((fn: any) => {
                if ((!fn || !fn.handle || !fn.set) && path !== '')
                    return router.use(path, fn);

                fn.mountpath = path;
                this[kMiddlewares].push(fn.handle ? fn.handle : fn);
            }, this);

            this.emit('mount');

            return this;
        };

        /**
         * Render the given view `name` name with `options`
         * and a callback accepting an error and the
         * rendered template string.
         *
         * Example:
         *
         *    app.render('email', { name: 'Tobi' }, function(err, html){
         *      // ...
         *    })
         *
         * @param {String} name
         * @param {Object|Function} options or fn
         * @param {Function} callback
         * @public
         */
        app.render = function render(name, options, callback) {
            const cache = this.cache;
            let done = callback;
            const engines = this.engines;
            let opts = options;
            const renderOptions: any = {};
            let view;

            if (typeof options === 'function') {
                done = options;
                opts = {};
            }

            utilsMerge(renderOptions, this.locals);

            if (opts._locals) utilsMerge(renderOptions, opts._locals);

            utilsMerge(renderOptions, opts);

            if (renderOptions.cache == null)
                renderOptions.cache = this.enabled('view cache');

            if (renderOptions.cache) view = cache[name];

            if (!view) {
                let View = this.get('view');

                view = new View(name, {
                    defaultEngine: this.get('view engine'),
                    root: this.get('views'),
                    engines: engines,
                });

                if (!view.path) {
                    const dirs =
                        Array.isArray(view.root) && view.root.length > 1
                            ? 'directories "' +
                              view.root.slice(0, -1).join('", "') +
                              '" or "' +
                              view.root[view.root.length - 1] +
                              '"'
                            : 'directory "' + view.root + '"';
                    let err: any = new Error(
                        'Failed to lookup view "' + name + '" in views ' + dirs,
                    );
                    err.view = view;
                    return done(err);
                }

                if (renderOptions.cache) cache[name] = view;
            }

            try {
                view.render(renderOptions, done);
            } catch (err) {
                callback(err);
            }
        };

        /**
         * Proxy to the app `Router#route()`
         * Returns a new `Route` instance for the _path_.
         *
         * Routes are isolated middleware stacks for specific paths.
         * See the Route api docs for details.
         *
         * @public
         */
        app.route = function route(method: string, path: string) {
            return this.router.find(method, path);
        };

        /**
         * Register the given template engine callback `fn`
         * as `ext`.
         *
         * By default will `require()` the engine based on the
         * file extension. For example if you try to render
         * a "foo.ejs" file Express will invoke the following internally:
         *
         *     app.engine('ejs', require('ejs').__express);
         *
         * For engines that do not provide `.__express` out of the box,
         * or if you wish to "map" a different extension to the template engine
         * you may use this method. For example mapping the EJS template engine to
         * ".html" files:
         *
         *     app.engine('html', require('ejs').renderFile);
         *
         * In this case EJS provides a `.renderFile()` method with
         * the same signature that Express expects: `(path, options, callback)`,
         * though note that it aliases this method as `ejs.__express` internally
         * so if you're using ".ejs" extensions you don't need to do anything.
         *
         * Some template engines do not follow this convention, the
         * [Consolidate.js](https://github.com/tj/consolidate.js)
         * library was created to map all of node's popular template
         * engines to follow this convention, thus allowing them to
         * work seamlessly within Express.
         *
         * @param {String} ext
         * @param {Function} fn
         * @return {app} for chaining
         * @public
         */
        app.engine = function engine(ext, fn) {
            if (typeof fn !== 'function')
                throw new Error('callback function required');

            const extension = ext[0] !== '.' ? '.' + ext : ext;

            this.engines[extension] = fn;

            return this;
        };

        /**
         * Assign `setting` to `val`, or return `setting`'s value.
         *
         *    app.set('foo', 'bar');
         *    app.set('foo');
         *    // => "bar"
         *
         * Mounted servers inherit their parent server's settings.
         *
         * @param {String} setting
         * @param {*} [val]
         * @return {Server} for chaining
         * @public
         */
        app.set = function set(setting: string, val: any) {
            if (arguments.length === 1) return this.settings[setting];

            this.settings[setting] = val;

            switch (setting) {
                case 'etag':
                    const { compileETag } = require('../utils');
                    this.set('etag fn', compileETag(val));
                    break;
                case 'query parser':
                    const { compileQueryParser } = require('../utils');
                    this.set('query parser fn', compileQueryParser(val));
                    break;
                case 'trust proxy':
                    const { compileTrust } = require('../utils');
                    this.set('trust proxy fn', compileTrust(val));
                    break;
            }

            return this;
        };

        /**
         * Proxy to `Router#param()` with one added api feature. The _name_ parameter
         * can be an array of names.
         *
         * See the Router#param() docs for more details.
         *
         * @param {String|Array} name
         * @param {Function} fn
         * @return {app} for chaining
         * @public
         */
        app.param = function param(name, fn) {
            if (Array.isArray(name)) {
                for (var i = 0; i < name.length; i++) this.param(name[i], fn);

                return this;
            }

            this.router.param(name, fn);

            return this;
        };

        /**
         * Return the app's absolute pathname
         * based on the parent(s) that have
         * mounted it.
         *
         * For example if the application was
         * mounted as "/admin", which itself
         * was mounted as "/blog" then the
         * return value would be "/blog/admin".
         *
         * @return {String}
         * @private
         */
        app.path = function path() {
            return this.parent ? this.parent.path() + this.mountpath : '';
        };

        /**
         * Check if `setting` is enabled (truthy).
         *
         *    app.enabled('foo')
         *    // => false
         *
         *    app.enable('foo')
         *    app.enabled('foo')
         *    // => true
         *
         * @param {String} setting
         * @return {Boolean}
         * @public
         */
        app.enabled = function enabled(setting) {
            return Boolean(this.set(setting));
        };

        /**
         * Check if `setting` is disabled.
         *
         *    app.disabled('foo')
         *    // => true
         *
         *    app.enable('foo')
         *    app.disabled('foo')
         *    // => false
         *
         * @param {String} setting
         * @return {Boolean}
         * @public
         */
        app.disabled = function disabled(setting) {
            return !this.set(setting);
        };

        /**
         * Enable `setting`.
         *
         * @param {String} setting
         * @return {app} for chaining
         * @public
         */
        app.enable = function enable(setting) {
            return this.set(setting, true);
        };

        /**
         * Disable `setting`.
         *
         * @param {String} setting
         * @return {app} for chaining
         * @public
         */
        app.disable = function disable(setting) {
            return this.set(setting, false);
        };

        app.setErrorHandler = function setErrorHandler(func) {
            self.throwIfAlreadyStarted('Cannot call "setErrorHandler"!');

            if (typeof func !== 'function')
                throw new CM_ERR_ERROR_HANDLER_NOT_FN();

            this[kErrorHandler] = buildErrorHandler(
                this[kErrorHandler],
                func.bind(this),
            );
            return this;
        };

        app.addHook = function addHook(name, fn) {
            self.throwIfAlreadyStarted('Cannot call "addHook"!');

            if (fn == null) throw new CM_ERR_HOOK_INVALID_HANDLER(name, fn);

            if (
                name === 'onSend' ||
                name === 'preSerialization' ||
                name === 'onError' ||
                name === 'preParsing'
            ) {
                if (fn.constructor.name === 'AsyncFunction' && fn.length !== 4)
                    throw new CM_ERR_HOOK_INVALID_ASYNC_HANDLER();
            } else if (name === 'onReady' || name === 'onListen') {
                if (fn.constructor.name === 'AsyncFunction' && fn.length !== 0)
                    throw new CM_ERR_HOOK_INVALID_ASYNC_HANDLER();
            } else if (name === 'onRequestAbort') {
                if (fn.constructor.name === 'AsyncFunction' && fn.length !== 1)
                    throw new CM_ERR_HOOK_INVALID_ASYNC_HANDLER();
            } else {
                if (fn.constructor.name === 'AsyncFunction' && fn.length === 3)
                    throw new CM_ERR_HOOK_INVALID_ASYNC_HANDLER();
            }

            if (name === 'onClose') this.onClose(fn.bind(this));
            else this[kHooks].add(name, fn);

            return this;
        };

        app.addContentTypeParser = function addContentTypeParser(
            contentType,
            fn,
        ) {
            if (fn == null)
                throw new CM_ERR_HOOK_INVALID_HANDLER(contentType, fn);

            if (Array.isArray(contentType)) {
                for (let key in contentType)
                    this[kContentTypeParsers][contentType[key]] = fn;
            } else if (typeof contentType === 'string')
                this[kContentTypeParsers][contentType] = fn;

            return this;
        };

        app.contentTypeParser = function contentTypeParser(
            contentType,
            handler,
            req,
            res,
        ) {
            if (
                this[kContentTypeParsers][contentType] &&
                typeof this[kContentTypeParsers][contentType] === 'function'
            ) {
                let result;
                try {
                    result = this[kContentTypeParsers][contentType].call(
                        this,
                        req,
                        res,
                        null,
                        handler,
                    );
                } catch (error) {
                    console.log(error);
                    handler(req, res);
                    return;
                }

                if (result && typeof result.then === 'function')
                    result
                        .then(() => {
                            handler(req, res);
                        })
                        .catch(err => {
                            console.error(err);
                        });
            } else {
                handler(req, res);
            }
        };

        app.createCache = function createCache(req, res, payload) {
            const cache = options.cache;

            if (cache && req.method === 'GET') {
                let cacheKey = req.query
                    ? `${req.method}:${req.url}?${new URLSearchParams(req.query).toString()}`
                    : `${req.method}:${req.url}`;

                cacheKey = MurmurHash3(cacheKey)
                    .result()
                    .toString(16)
                    .padStart(8, '0');
                const cachedRoute = this.cachedRoutes[cacheKey] ?? null;
                const ttl = options.cacheTTL;

                if (
                    (cachedRoute && cachedRoute.ttl < Date.now()) ||
                    !cachedRoute
                ) {
                    this.cachedRoutes[cacheKey] = {
                        ttl: Date.now() + ttl,
                        headers: res.getHeaders(),
                        payload: payload,
                    };
                }
            }
        };

        app.getCache = function getCache(req) {
            const cache = options.cache;

            if (cache && req.method === 'GET') {
                let cacheKey = req.query
                    ? `${req.method}:${req.url}?${new URLSearchParams(req.query).toString()}`
                    : `${req.method}:${req.url}`;

                cacheKey = MurmurHash3(cacheKey)
                    .result()
                    .toString(16)
                    .padStart(8, '0');
                const cachedRoute = this.cachedRoutes[cacheKey] ?? null;

                if (cachedRoute && cachedRoute.ttl > Date.now())
                    return cachedRoute;

                return null;
            }
        };

        // Cache cleanup
        if (options.cache) {
            setInterval(() => {
                if (
                    app.cachedRoutes &&
                    Object.keys(app.cachedRoutes).length > 0
                ) {
                    app.cachedRoutes = Object.keys(app.cachedRoutes)
                        .filter(key => app.cachedRoutes[key].ttl > Date.now())
                        .reduce((acc, key) => {
                            acc[key] = app.cachedRoutes[key];
                            return acc;
                        }, {});
                }
            }, options.cacheTTL);
        }

        for (const method in app)
            if (!server[method]) server[method] = app[method];

        app.set('etag', 'weak');
        app.set('env', process.env.NODE_ENV || 'dev');
        app.set('query parser', 'simple');
        app.set('subdomain offset', 2);
        app.set('trust proxy', false);
        app.set('jsonp callback name', 'callback');
        app.set('view', View);
        app.set('views', path.resolve('views'));

        if (process.env.NODE_ENV === 'production') app.enable('view cache');

        app.on('mount', function onmount(parent) {
            // inherit trust proxy
            if (
                app.settings[trustProxyDefaultSymbol] === true &&
                typeof parent.settings['trust proxy fn'] === 'function'
            ) {
                delete app.settings['trust proxy'];
                delete app.settings['trust proxy fn'];
            }

            // inherit protos
            setPrototypeOf(app.request, parent.request);
            setPrototypeOf(app.response, parent.response);
            setPrototypeOf(app.engines, parent.engines);
            setPrototypeOf(app.settings, parent.settings);
        });

        app.locals.settings = app.settings;

        server.app = app;
        server[kHooks] = new Hooks();
        server[kContentTypeParsers] = {};
        server[kMiddlewares] = [];
        server[kChildren] = [];
        server[kState] = {};
        server[kErrorHandler] = buildErrorHandler(
            rootErrorHandler,
            function (error, request, res) {
                console.error(error);
                res.status(409).send({ ok: false });
            },
        );
        server.runPreParsing = this.runPreParsing;
        server.request = this.request;
        server.response = this.response;
    }

    public createServerInstance(options?, httpHandler?) {
        let server = null;

        options = this.processOptions(options || {});

        this.options = options;

        if (options.serverFactory) {
            server = options.serverFactory(this._handler, options);
        } else if (options.http2) {
            if (options.https) {
                server = this.http2().createSecureServer(
                    options.https,
                    (req, res) => this._handler.call(server, req, res),
                );
            } else {
                server = this.http2().createServer(options, (req, res) =>
                    this._handler.call(server, req, res),
                );
            }
        } else {
            if (options.https) {
                server = https.createServer(options.https, (req, res) =>
                    this._handler.call(server, req, res),
                );
            } else {
                server = http.createServer(options, (req, res) =>
                    this._handler.call(server, req, res),
                );
            }

            server.keepAliveTimeout = options.keepAliveTimeout;
            server.requestTimeout = options.requestTimeout;

            if (options.maxRequestsPerSocket > 0)
                server.maxRequestsPerSocket = options.maxRequestsPerSocket;
        }

        if (!options.serverFactory)
            server.setTimeout(options.connectionTimeout);

        this.injectApplication.call(this, server, options);

        const listen = (listenOptions: { host: string; port: number }) => {
            server[kState].started = true;
            return server.listen.call(server, listenOptions);
        };

        return { server, listen };
    }

    private async _handler(this: any, req, res) {
        const cache = this.getCache(req);

        if (cache) {
            res.writeHead(200, cache.headers);
            res.end(cache.payload);
            return;
        }

        if(req.method === "OPTIONS") {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Max-Age': '86400',
                'Content-Type': 'text/plain charset=UTF-8',
                'Content-Length': '0',
                'Date': new Date().toISOString(),
                'Connection': 'close'
            });
            res.end();
        }
        else{
            this.route(req.method, req.url)
            .then(async route => {
                const request = Object.create(this.request);
                request.routeOptions = route.store;
                request.params = route.params;
                //request.query = route.searchParams;
                const response = Object.create(this.response);
                const hooks = this[kHooks];
                response[kResponseHeaders] = {};

                request.app = response.app = this;
                request.req = response.req = req;
                request.res = response.res = res;
                request.originalUrl = req.url;

                request.preParsing = hooks.preParsing;
                request.preHandler = hooks.preHandler;
                request.response = response;
                response.request = request;

                response.onSend = hooks.onSend;
                response.onError = hooks.onError;
                response.errorHandler = this[kErrorHandler];

                const middlewares = this[kMiddlewares] || [];
                let stack = [...middlewares, ...route.store.stack].flat();
                request.handler = stack[stack.length - 1];
                stack.pop();

                if (hooks.onRequest && hooks.onRequest.length > 0) {
                    onRequestHookRunner(
                        hooks.onRequest,
                        request,
                        response,
                        this.runPreParsing,
                    );
                } else {
                    this.runPreParsing(null, request, response);
                }

                if (
                    hooks.onRequestAbort !== null &&
                    hooks.onRequestAbort.length > 0
                ) {
                    req.on('close', () => {
                        /* istanbul ignore else */
                        if (req.aborted) {
                            onRequestAbortHookRunner(
                                hooks.onRequestAbort,
                                request,
                                this.handleOnRequestAbortHooksErrors.bind(
                                    null,
                                    response,
                                ),
                            );
                        }
                    });
                }
            })
            .catch(err => {
                //console.error(err);
                res.writeHead(404);
                res.end('Not Found');
            });
        }
    }

    private http2() {
        try {
            return require('node:http2');
        } catch (err) {
            throw new CM_ERR_HTTP2_INVALID_VERSION();
        }
    }

    public throwIfAlreadyStarted(msg) {
        if (this[kState]?.started)
            throw new CM_ERR_INSTANCE_ALREADY_LISTENING(msg);
    }

    runPreParsing(err, request, response) {
        if (response.sent === true) return;

        if (err != null) {
            response[kResponseIsError] = true;
            response.send(err);
            return;
        }

        //request[kRequestPayloadStream] = request.raw;

        if (
            (request.preParsing !== null,
            request.preParsing !== undefined,
            request.preParsing?.length > 0)
        ) {
            preParsingHookRunner(
                request.preParsing,
                request,
                response,
                handleRequest.bind(request.server),
            );
        } else {
            handleRequest.call(request.server, null, request, response);
        }
    }

    handleOnRequestAbortHooksErrors(reply, err) {
        if (err) console.error({ err }, 'onRequestAborted hook failed');
    }
}

export default (options?, httpHandler?: Function): { server; listen } => {
    return new Application().createServerInstance(options, httpHandler);
};
