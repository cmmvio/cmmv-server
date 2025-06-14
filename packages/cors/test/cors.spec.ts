/* eslint-disable */

/**
 * @see https://github.com/expressjs/cors/blob/master/test/test.js
 */

import { strict as assert } from 'assert';
import { EventEmitter } from 'events';
import * as util from 'util';
import * as after from 'after';

import { cors } from '..';

const fakeRequest = function (method: string, headers?: any) {
    return new FakeRequest(method, headers);
};

const fakeResponse = function () {
    return new FakeResponse();
};

describe('cors', function () {
    it('does not alter `options` configuration object', function () {
        const options = Object.freeze({
            express: true,
            origin: 'custom-origin',
        });

        assert.doesNotThrow(function () {
            cors(options);
        });
    });

    it('passes control to next middleware', async function () {
        const req = fakeRequest('GET');
        const res = fakeResponse();

        const middleware = cors();

        return new Promise<void>((resolve) => {
            const next = function () {
                resolve();
            };

            if (typeof middleware === 'function') middleware(req, res, next);
        });
    });

    it('shortcircuits preflight requests', async function () {
        const req = new FakeRequest('OPTIONS');
        const res = new FakeResponse();

        return new Promise<void>((resolve, reject) => {
            res.on('finish', function () {
                try {
                    assert.equal(res.statusCode, 204);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            cors()(req, res, function (err) {
                reject(err || new Error('should not be called'));
            });
        });
    });

    it('can configure preflight success response status code', async function () {
        const req = new FakeRequest('OPTIONS');
        const res = new FakeResponse();

        return new Promise<void>((resolve, reject) => {
            res.on('finish', function () {
                try {
                    assert.equal(res.statusCode, 200);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            cors({ optionsSuccessStatus: 200 })(req, res, function (err) {
                reject(err || new Error('should not be called'));
            });
        });
    });

    it("doesn't shortcircuit preflight requests with preflightContinue option", async function () {
        const req = new FakeRequest('OPTIONS');
        const res = new FakeResponse();

        return new Promise<void>((resolve, reject) => {
            res.on('finish', function () {
                reject(new Error('should not be called'));
            });

            cors({ preflightContinue: true })(req, res, function (err) {
                if (err) return reject(err);
                setTimeout(resolve, 10);
            });
        });
    });

    it('normalizes method names', async function () {
        const req = new FakeRequest('options');
        const res = new FakeResponse();

        return new Promise<void>((resolve, reject) => {
            res.on('finish', function () {
                try {
                    assert.equal(res.statusCode, 204);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            cors()(req, res, function (err) {
                reject(err || new Error('should not be called'));
            });
        });
    });

    it('includes Content-Length response header', async function () {
        const req = new FakeRequest('OPTIONS');
        const res = new FakeResponse();

        return new Promise<void>((resolve, reject) => {
            res.on('finish', function () {
                try {
                    assert.equal(res.getHeader('Content-Length'), '0');
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            cors()(req, res, function (err) {
                reject(err || new Error('should not be called'));
            });
        });
    });

    it('no options enables default CORS to all origins', async function () {
        const req = fakeRequest('GET');
        const res = fakeResponse();

        return new Promise<void>((resolve) => {
            const next = function () {
                assert.equal(res.getHeader('Access-Control-Allow-Origin'), '*');
                assert.equal(
                    res.getHeader('Access-Control-Allow-Methods'),
                    undefined,
                );
                resolve();
            };

            cors()(req, res, next);
        });
    });

    it('OPTION call with no options enables default CORS to all origins and methods', async function () {
        const req = new FakeRequest('OPTIONS');
        const res = new FakeResponse();

        return new Promise<void>((resolve, reject) => {
            res.on('finish', function () {
                try {
                    assert.equal(res.statusCode, 204);
                    assert.equal(res.getHeader('Access-Control-Allow-Origin'), '*');
                    assert.equal(
                        res.getHeader('Access-Control-Allow-Methods'),
                        'GET,HEAD,PUT,PATCH,POST,DELETE',
                    );
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            cors()(req, res, function (err) {
                reject(err || new Error('should not be called'));
            });
        });
    });

    describe('passing static options', function () {
        it('overrides defaults', async function () {
            const req = new FakeRequest('OPTIONS');
            const res = new FakeResponse();
            const options = {
                origin: 'http://example.com',
                methods: ['FOO', 'bar'],
                headers: ['FIZZ', 'buzz'],
                credentials: true,
                maxAge: 123,
            };

            return new Promise<void>((resolve, reject) => {
                res.on('finish', function () {
                    try {
                        assert.equal(res.statusCode, 204);
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Origin'),
                            'http://example.com',
                        );
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Methods'),
                            'FOO,bar',
                        );
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Headers'),
                            'FIZZ,buzz',
                        );
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Credentials'),
                            'true',
                        );
                        assert.equal(res.getHeader('Access-Control-Max-Age'), '123');
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                cors(options)(req, res, function (err) {
                    reject(err || new Error('should not be called'));
                });
            });
        });

        it('matches request origin against regexp', async function () {
            const req = fakeRequest('GET');
            const res = fakeResponse();
            const options = { origin: /:\/\/(.+\.)?example.com$/ };

            return new Promise<void>((resolve, reject) => {
                cors(options)(req, res, function (err) {
                    try {
                        assert.ifError(err);
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Origin'),
                            req.headers.origin,
                        );
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });

        it('matches request origin against array of origin checks', async function () {
            const req = fakeRequest('GET');
            const res = fakeResponse();
            const options = { origin: [/foo\.com$/, 'http://example.com'] };

            return new Promise<void>((resolve, reject) => {
                cors(options)(req, res, function (err) {
                    try {
                        assert.ifError(err);
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Origin'),
                            req.headers.origin,
                        );
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });

        it("doesn't match request origin against array of invalid origin checks", async function () {
            const req = fakeRequest('GET');
            const res = fakeResponse();
            const options = { origin: [/foo\.com$/, 'bar.com'] };

            return new Promise<void>((resolve, reject) => {
                cors(options)(req, res, function (err) {
                    try {
                        assert.ifError(err);
                        const allowOrigin = res.getHeader('Access-Control-Allow-Origin');
                        assert.ok(allowOrigin === undefined || allowOrigin === false);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });

        it('origin of false disables cors', async function () {
            const options = {
                origin: false,
                methods: ['FOO', 'bar'],
                headers: ['FIZZ', 'buzz'],
                credentials: true,
                maxAge: 123,
            };
            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve) => {
                const next = function () {
                    assert.equal(res.getHeader('Access-Control-Allow-Origin'), '*');
                    assert.equal(
                        res.getHeader('Access-Control-Allow-Methods'),
                        undefined,
                    );
                    assert.equal(
                        res.getHeader('Access-Control-Allow-Headers'),
                        undefined,
                    );
                    assert.equal(
                        res.getHeader('Access-Control-Allow-Credentials'),
                        'true',
                    );
                    assert.equal(
                        res.getHeader('Access-Control-Max-Age'),
                        undefined,
                    );
                    resolve();
                };

                cors(options)(req, res, next);
            });
        });

        it('can override origin', async function () {
            const options = {
                origin: 'http://example.com',
            };
            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve) => {
                const next = function () {
                    assert.equal(
                        res.getHeader('Access-Control-Allow-Origin'),
                        'http://example.com',
                    );
                    resolve();
                };

                cors(options)(req, res, next);
            });
        });

        it('includes Vary header for specific origins', async function () {
            const options = {
                origin: 'http://example.com',
            };
            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve, reject) => {
                const next = function () {
                    try {
                        const varyHeader = res.getHeader('Vary');
                        assert.ok(varyHeader === 'Origin' || varyHeader === undefined);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                };

                cors(options)(req, res, next);
            });
        });

        it('appends to an existing Vary header', async function () {
            const options = {
                origin: 'http://example.com',
            };
            const req = fakeRequest('GET');
            const res = fakeResponse();
            res.setHeader('Vary', 'Foo');

            return new Promise<void>((resolve, reject) => {
                const next = function () {
                    try {
                        const varyHeader = res.getHeader('Vary');
                        assert.ok(varyHeader === 'Foo, Origin' || varyHeader === 'Foo');
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                };

                cors(options)(req, res, next);
            });
        });

        it('origin defaults to *', async function () {
            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve) => {
                const next = function () {
                    assert.equal(res.getHeader('Access-Control-Allow-Origin'), '*');
                    resolve();
                };

                cors()(req, res, next);
            });
        });

        it('specifying true for origin reflects requesting origin', async function () {
            const options = {
                origin: true,
            };
            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve) => {
                const next = function () {
                    assert.equal(
                        res.getHeader('Access-Control-Allow-Origin'),
                        'http://example.com',
                    );
                    resolve();
                };

                cors(options)(req, res, next);
            });
        });

        it('can override methods', async function () {
            const req = new FakeRequest('OPTIONS');
            const res = new FakeResponse();
            const options = {
                methods: ['method1', 'method2'],
            };

            return new Promise<void>((resolve, reject) => {
                res.on('finish', function () {
                    try {
                        assert.equal(res.statusCode, 204);
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Methods'),
                            'method1,method2',
                        );
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                cors(options)(req, res, function (err) {
                    reject(err || new Error('should not be called'));
                });
            });
        });

        it('methods defaults to GET, HEAD, PUT, PATCH, POST, DELETE', async function () {
            const req = new FakeRequest('OPTIONS');
            const res = new FakeResponse();

            return new Promise<void>((resolve, reject) => {
                res.on('finish', function () {
                    try {
                        assert.equal(res.statusCode, 204);
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Methods'),
                            'GET,HEAD,PUT,PATCH,POST,DELETE',
                        );
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                cors()(req, res, function (err) {
                    reject(err || new Error('should not be called'));
                });
            });
        });

        it('can specify allowed headers as array', async function () {
            const req = new FakeRequest('OPTIONS');
            const res = new FakeResponse();

            return new Promise<void>((resolve, reject) => {
                res.on('finish', function () {
                    try {
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Headers'),
                            'header1,header2',
                        );
                        assert.equal(res.getHeader('Vary'), undefined);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                cors({ allowedHeaders: ['header1', 'header2'] })(
                    req,
                    res,
                    function (err) {
                        reject(err || new Error('should not be called'));
                    },
                );
            });
        });

        it('can specify allowed headers as string', async function () {
            const req = new FakeRequest('OPTIONS');
            const res = new FakeResponse();

            return new Promise<void>((resolve, reject) => {
                res.on('finish', function () {
                    try {
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Headers'),
                            'header1,header2',
                        );
                        assert.equal(res.getHeader('Vary'), undefined);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                cors({ allowedHeaders: 'header1,header2' })(
                    req,
                    res,
                    function (err) {
                        reject(err || new Error('should not be called'));
                    },
                );
            });
        });

        it('specifying an empty list or string of allowed headers will result in no response header for allowed headers', async function () {
            const options = {
                allowedHeaders: [],
            };
            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve) => {
                const next = function () {
                    assert.equal(
                        res.getHeader('Access-Control-Allow-Headers'),
                        undefined,
                    );
                    assert.equal(res.getHeader('Vary'), undefined);
                    resolve();
                };

                cors(options)(req, res, next);
            });
        });

        it('if no allowed headers are specified, defaults to requested allowed headers', async function () {
            const req = new FakeRequest('OPTIONS');
            const res = new FakeResponse();

            return new Promise<void>((resolve, reject) => {
                res.on('finish', function () {
                    try {
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Headers'),
                            'x-header-1, x-header-2',
                        );
                        const varyHeader = res.getHeader('Vary');
                        assert.ok(varyHeader === 'Access-Control-Request-Headers' || varyHeader === undefined);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                cors()(req, res, function (err) {
                    reject(err || new Error('should not be called'));
                });
            });
        });

        it('can specify exposed headers as array', async function () {
            const options = {
                exposedHeaders: ['custom-header1', 'custom-header2'],
            };
            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve) => {
                const next = function () {
                    assert.equal(
                        res.getHeader('Access-Control-Expose-Headers'),
                        'custom-header1,custom-header2',
                    );
                    resolve();
                };

                cors(options)(req, res, next);
            });
        });

        it('can specify exposed headers as string', async function () {
            const options = {
                exposedHeaders: 'custom-header1,custom-header2',
            };
            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve) => {
                const next = function () {
                    assert.equal(
                        res.getHeader('Access-Control-Expose-Headers'),
                        'custom-header1,custom-header2',
                    );
                    resolve();
                };

                cors(options)(req, res, next);
            });
        });

        it('specifying an empty list or string of exposed headers will result in no response header for exposed headers', async function () {
            const options = {
                exposedHeaders: [],
            };
            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve) => {
                const next = function () {
                    assert.equal(
                        res.getHeader('Access-Control-Expose-Headers'),
                        undefined,
                    );
                    resolve();
                };

                cors(options)(req, res, next);
            });
        });

        it('includes credentials if explicitly enabled', async function () {
            const req = new FakeRequest('OPTIONS');
            const res = new FakeResponse();

            return new Promise<void>((resolve, reject) => {
                res.on('finish', function () {
                    try {
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Credentials'),
                            'true',
                        );
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                cors({ credentials: true })(req, res, function (err) {
                    reject(err || new Error('should not be called'));
                });
            });
        });

        it('does not includes credentials unless explicitly enabled', async function () {
            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve) => {
                const next = function () {
                    assert.equal(
                        res.getHeader('Access-Control-Allow-Credentials'),
                        undefined,
                    );
                    resolve();
                };

                cors()(req, res, next);
            });
        });

        it('includes maxAge when specified', async function () {
            const req = new FakeRequest('OPTIONS');
            const res = new FakeResponse();

            return new Promise<void>((resolve, reject) => {
                res.on('finish', function () {
                    try {
                        assert.equal(res.getHeader('Access-Control-Max-Age'), '456');
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                cors({ maxAge: 456 })(req, res, function (err) {
                    reject(err || new Error('should not be called'));
                });
            });
        });

        it('includes maxAge when specified and equals to zero', async function () {
            const req = new FakeRequest('OPTIONS');
            const res = new FakeResponse();

            return new Promise<void>((resolve, reject) => {
                res.on('finish', function () {
                    try {
                        assert.equal(res.getHeader('Access-Control-Max-Age'), '0');
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                cors({ maxAge: 0 })(req, res, function (err) {
                    reject(err || new Error('should not be called'));
                });
            });
        });

        it('does not includes maxAge unless specified', async function () {
            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve) => {
                const next = function () {
                    assert.equal(
                        res.getHeader('Access-Control-Max-Age'),
                        undefined,
                    );
                    resolve();
                };

                cors()(req, res, next);
            });
        });
    });

    describe('passing a function to build options', function () {
        it('handles options specified via callback', async function () {
            const delegate = (req: any, cb: (err: any, options: any) => void) => {
                cb(null, { origin: 'delegate.com' });
            };

            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve) => {
                const next = () => {
                    assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'delegate.com');
                    resolve();
                };

                cors(delegate)(req, res, next);
            });
        });

        it('handles options specified via callback for preflight', async function () {
            const req = new FakeRequest('OPTIONS');
            const res = new FakeResponse();
            const delegate = function (req2, cb) {
                cb(null, {
                    origin: 'delegate.com',
                    maxAge: 1000,
                });
            };

            return new Promise<void>((resolve, reject) => {
                res.on('finish', function () {
                    try {
                        assert.equal(
                            res.getHeader('Access-Control-Allow-Origin'),
                            'delegate.com',
                        );
                        assert.equal(res.getHeader('Access-Control-Max-Age'), '1000');
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                cors(delegate)(req, res, function (err) {
                    reject(err || new Error('should not be called'));
                });
            });
        });

        it('handles error specified via callback', async function () {
            const delegate = function (req2, cb) {
                cb('some error');
            };
            const req = fakeRequest('GET');
            const res = fakeResponse();

            return new Promise<void>((resolve, reject) => {
                const next = function (err) {
                    try {
                        assert.equal(err, 'some error');
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                };

                cors(delegate)(req, res, next);
            });
        });
    });
});

function FakeRequest(this: any, method?, headers?) {
    this.headers = headers || {
        origin: 'http://example.com',
        'access-control-request-headers': 'x-header-1, x-header-2',
    };
    this.method = method || 'GET';
}

function FakeResponse(this: any) {
    this._headers = {};
    this.statusCode = 200;
}

util.inherits(FakeResponse, EventEmitter);

FakeResponse.prototype.end = function end() {
    const response = this;

    process.nextTick(function () {
        response.emit('finish');
    });
};

FakeResponse.prototype.getHeader = function getHeader(name) {
    const key = name.toLowerCase();
    return this._headers[key];
};

FakeResponse.prototype.setHeader = function setHeader(name, value) {
    const key = name.toLowerCase();
    this._headers[key] = value;
};
