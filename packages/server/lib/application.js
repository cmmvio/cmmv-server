"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Application = void 0;
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const node_events_1 = require("node:events");
const errors_1 = require("./errors");
const symbols_1 = require("./symbols");
const hooks_1 = require("./hooks");
const error_handler_1 = require("./error-handler");
const constants_1 = require("../constants");
const router_1 = require("./router");
const request_1 = require("./request");
const response_1 = require("./response");
const handle_request_1 = require("./handle-request");
class Application extends node_events_1.EventEmitter {
    constructor() {
        super();
        this.request = request_1.default;
        this.response = response_1.default;
    }
    processOptions(options) {
        if (typeof options !== 'object')
            throw new errors_1.CM_ERR_OPTIONS_NOT_OBJ();
        if (options.querystringParser &&
            typeof options.querystringParser !== 'function')
            throw new errors_1.CM_ERR_QSP_NOT_FN(typeof options.querystringParser);
        options.http2 = Boolean(options.http2 === true);
        options.connectionTimeout = options.connectionTimeout || 0;
        options.keepAliveTimeout = options.keepAliveTimeout || 72000;
        options.maxRequestsPerSocket = options.maxRequestsPerSocket || 0;
        options.requestTimeout = options.requestTimeout || 0;
        options.bodyLimit = options.bodyLimit || 1048576;
        options.maxHeaderSize = options.maxHeaderSize || 16384;
        options.insecureHTTPParser = Boolean(options.insecureHTTPParser === true);
        options.joinDuplicateHeaders = Boolean(options.joinDuplicateHeaders === true);
        return options;
    }
    injectApplication(server, options) {
        const slice = Array.prototype.slice;
        const flatten = Array.prototype.flat;
        const self = this;
        const app = {
            router: new router_1.Router(),
            cache: Object.create(null),
            engines: Object.create(null),
            settings: Object.create(null),
            locals: Object.create(null),
            mountpath: '/',
        };
        constants_1.HTTPMethod.forEach(method => {
            app[method] = ((path, ...callbacks) => {
                if (method === 'get' && callbacks.length === 0)
                    return app.set(path);
                const route = app.router;
                route[method].call(route, path, callbacks);
                return this;
            }).bind(app);
        });
        /**
         * Proxy `Router#use()` to add middleware to the app router.
         * See Router#use() documentation for details.
         *
         * If the _fn_ parameter is an express app, then it will be
         * mounted at the _route_ specified.
         *
         * @public
         */
        app.use = function use(fn) {
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
                while (Array.isArray(arg) && arg.length !== 0)
                    arg = arg[0];
                if (typeof arg !== 'function') {
                    offset = 1;
                    path = fn;
                }
            }
            else {
                path = '';
            }
            const fns = flatten.call(slice.call(arguments, offset), Infinity);
            if (fns.length === 0)
                throw new TypeError('app.use() requires a middleware function');
            const router = this.router;
            fns.forEach((fn) => {
                if ((!fn || !fn.handle || !fn.set) && path !== '')
                    return router.use(path, fn);
                fn.mountpath = path;
                this[symbols_1.kMiddlewares].push(fn.handle ? fn.handle : fn);
            }, this);
            this.emit('mount');
            return this;
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
        app.route = function route(method, path) {
            return this.router.find(method, path);
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
        app.set = function set(setting, val) {
            if (arguments.length === 1)
                return this.settings[setting];
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
        app.setErrorHandler = function setErrorHandler(func) {
            self.throwIfAlreadyStarted('Cannot call "setErrorHandler"!');
            if (typeof func !== 'function')
                throw new errors_1.CM_ERR_ERROR_HANDLER_NOT_FN();
            this[symbols_1.kErrorHandler] = (0, error_handler_1.buildErrorHandler)(this[symbols_1.kErrorHandler], func.bind(this));
            return this;
        };
        app.addHook = function addHook(name, fn) {
            self.throwIfAlreadyStarted('Cannot call "addHook"!');
            if (fn == null)
                throw new errors_1.CM_ERR_HOOK_INVALID_HANDLER(name, fn);
            if (name === 'onSend' ||
                name === 'preSerialization' ||
                name === 'onError' ||
                name === 'preParsing') {
                if (fn.constructor.name === 'AsyncFunction' && fn.length !== 4)
                    throw new errors_1.CM_ERR_HOOK_INVALID_ASYNC_HANDLER();
            }
            else if (name === 'onReady' || name === 'onListen') {
                if (fn.constructor.name === 'AsyncFunction' && fn.length !== 0)
                    throw new errors_1.CM_ERR_HOOK_INVALID_ASYNC_HANDLER();
            }
            else if (name === 'onRequestAbort') {
                if (fn.constructor.name === 'AsyncFunction' && fn.length !== 1)
                    throw new errors_1.CM_ERR_HOOK_INVALID_ASYNC_HANDLER();
            }
            else {
                if (fn.constructor.name === 'AsyncFunction' && fn.length === 3)
                    throw new errors_1.CM_ERR_HOOK_INVALID_ASYNC_HANDLER();
            }
            if (name === 'onClose')
                this.onClose(fn.bind(this));
            else
                this[symbols_1.kHooks].add(name, fn);
            return this;
        };
        app.addContentTypeParser = function addContentTypeParser(contentType, fn) {
            if (fn == null)
                throw new errors_1.CM_ERR_HOOK_INVALID_HANDLER(contentType, fn);
            if (Array.isArray(contentType)) {
                for (let key in contentType)
                    this[symbols_1.kContentTypeParsers][contentType[key]] = fn;
            }
            else if (typeof contentType === 'string')
                this[symbols_1.kContentTypeParsers][contentType] = fn;
            return this;
        };
        app.contentTypeParser = function contentTypeParser(contentType, handler, req, res) {
            if (this[symbols_1.kContentTypeParsers][contentType] &&
                typeof this[symbols_1.kContentTypeParsers][contentType] === 'function') {
                let result;
                try {
                    result = this[symbols_1.kContentTypeParsers][contentType].call(this, req, res, null, handler);
                }
                catch (error) {
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
            }
            else {
                handler(req, res);
            }
        };
        for (const method in app)
            if (!server[method])
                server[method] = app[method];
        app.set('etag', 'weak');
        app.set('env', process.env.NODE_ENV || 'dev');
        app.set('query parser', 'simple');
        app.set('subdomain offset', 2);
        app.set('trust proxy', false);
        app.set('jsonp callback name', 'callback');
        app.set('views', path.resolve('views'));
        server.app = app;
        server[symbols_1.kHooks] = new hooks_1.Hooks();
        server[symbols_1.kContentTypeParsers] = {};
        server[symbols_1.kMiddlewares] = [];
        server[symbols_1.kChildren] = [];
        server[symbols_1.kState] = {};
        server[symbols_1.kErrorHandler] = (0, error_handler_1.buildErrorHandler)(error_handler_1.rootErrorHandler, function (error, request, res) {
            console.error(error);
            res.status(409).send({ ok: false });
        });
        server.runPreParsing = this.runPreParsing;
        server.request = this.request;
        server.response = this.response;
    }
    createServerInstance(options, httpHandler) {
        let server = null;
        options = this.processOptions(options || {});
        if (options.serverFactory) {
            server = options.serverFactory(this._handler, options);
        }
        else if (options.http2) {
            if (options.https) {
                server = this.http2().createSecureServer(options.https, (req, res) => this._handler.call(server, req, res));
            }
            else {
                server = this.http2().createServer(options, (req, res) => this._handler.call(server, req, res));
            }
        }
        else {
            if (options.https) {
                server = https.createServer(options.https, (req, res) => this._handler.call(server, req, res));
            }
            else {
                server = http.createServer(options, (req, res) => this._handler.call(server, req, res));
            }
            server.keepAliveTimeout = options.keepAliveTimeout;
            server.requestTimeout = options.requestTimeout;
            if (options.maxRequestsPerSocket > 0)
                server.maxRequestsPerSocket = options.maxRequestsPerSocket;
        }
        if (!options.serverFactory)
            server.setTimeout(options.connectionTimeout);
        this.injectApplication.call(this, server, options);
        const listen = (listenOptions) => {
            server[symbols_1.kState].started = true;
            return server.listen.call(server, listenOptions);
        };
        return { server, listen };
    }
    async _handler(req, res) {
        this.route(req.method, req.url)
            .then(async (route) => {
            const request = Object.create(this.request);
            const response = Object.create(this.response);
            const hooks = this[symbols_1.kHooks];
            response[symbols_1.kResponseHeaders] = {};
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
            response.errorHandler = this[symbols_1.kErrorHandler];
            const middlewares = this[symbols_1.kMiddlewares] || [];
            let stack = [...middlewares, ...route.store.stack].flat();
            request.handler = stack[stack.length - 1];
            if (hooks.onRequest &&
                hooks.onRequest.length > 0) {
                (0, hooks_1.onRequestHookRunner)(hooks.onRequest, request, response, this.runPreParsing);
            }
            else {
                this.runPreParsing(null, request, response);
            }
            if (hooks.onRequestAbort !== null &&
                hooks.onRequestAbort.length > 0) {
                req.on('close', () => {
                    /* istanbul ignore else */
                    if (req.aborted) {
                        (0, hooks_1.onRequestAbortHookRunner)(hooks.onRequestAbort, request, this.handleOnRequestAbortHooksErrors.bind(null, response));
                    }
                });
            }
        })
            .catch(err => {
            console.error(err);
            res.writeHead(404);
            res.end('Not Found');
        });
    }
    http2() {
        try {
            return require('node:http2');
        }
        catch (err) {
            throw new errors_1.CM_ERR_HTTP2_INVALID_VERSION();
        }
    }
    throwIfAlreadyStarted(msg) {
        if (this[symbols_1.kState]?.started)
            throw new errors_1.CM_ERR_INSTANCE_ALREADY_LISTENING(msg);
    }
    runPreParsing(err, request, response) {
        if (response.sent === true)
            return;
        if (err != null) {
            response[symbols_1.kResponseIsError] = true;
            response.send(err);
            return;
        }
        //request[kRequestPayloadStream] = request.raw;
        if ((request.preParsing !== null, request.preParsing !== undefined, request.preParsing?.length > 0)) {
            (0, hooks_1.preParsingHookRunner)(request.preParsing, request, response, handle_request_1.handleRequest.bind(request.server));
        }
        else {
            handle_request_1.handleRequest.call(request.server, null, request, response);
        }
    }
    handleOnRequestAbortHooksErrors(reply, err) {
        if (err)
            console.error({ err }, 'onRequestAborted hook failed');
    }
}
exports.Application = Application;
exports.default = (options, httpHandler) => {
    return new Application().createServerInstance(options, httpHandler);
};
