import * as FindMyWay from 'find-my-way';
import {
    CM_ERR_ROUTE_HANDLER_NOT_FN,
    CM_ERR_ROUTE_MISSING_HANDLER,
} from './errors';

export class Router {
    public router: FindMyWay.Instance<FindMyWay.HTTPVersion.V2>;

    public stack: Map<FindMyWay.HTTPMethod, Array<Function>> = new Map<
        FindMyWay.HTTPMethod,
        Array<Function>
    >();

    public params: Map<string, Function[]> = new Map<string, Function[]>();

    public optionsAllow: Map<string, Set<string>> = new Map<
        string,
        Set<string>
    >();

    public registeredRoutes: {
        method: FindMyWay.HTTPMethod;
        path: string;
        options: any;
    }[] = [];

    constructor(private path: string = '') {
        if (!this.router) {
            this.router = FindMyWay({
                caseSensitive: false,
                ignoreTrailingSlash: true,
                ignoreDuplicateSlashes: true,
                allowUnsafeRegex: true,
            });

            this.stack = new Map<FindMyWay.HTTPMethod, Array<Function>>();
        }
    }

    public param(valueOrObject: string | string[], cb) {
        //compatibility Expressjs
        if (
            typeof valueOrObject === 'string' &&
            !this.params.has(valueOrObject)
        )
            this.params.set(valueOrObject, []);

        if (typeof valueOrObject === 'string') {
            const stack = this.params.get(valueOrObject);
            stack.push(cb);
            this.params.set(valueOrObject, stack);
        } else if (Array.isArray(valueOrObject)) {
            valueOrObject.forEach(item => {
                if (typeof item === 'string' && !this.params.has(item))
                    this.params.set(item, []);

                const stack = this.params.get(item);
                stack.push(cb);
                this.params.set(item, stack);
            });
        }
    }

    public hasRoute(method: string, path: string) {
        const httpMethod = method?.toUpperCase() as FindMyWay.HTTPMethod;
        return this.router.hasRoute(httpMethod, path);
    }

    public find(method: string, path: string) {
        return new Promise((resolve, reject) => {
            if (method && path) {
                const httpMethod =
                    method?.toUpperCase() as FindMyWay.HTTPMethod;

                const route = this.router.find(httpMethod, path);

                if (route) resolve(route);
                else reject();
            } else {
                reject();
            }
        });
    }

    public route(options: any) {
        const opts = { ...options };

        const path = opts.url || opts.path || '';
        const finalPath = this.path ? this.path + path : path;

        if (!opts.handler)
            throw new CM_ERR_ROUTE_MISSING_HANDLER(opts.method, path);

        if (
            opts.errorHandler !== undefined &&
            typeof opts.errorHandler !== 'function'
        )
            throw new CM_ERR_ROUTE_HANDLER_NOT_FN(opts.method, path);

        const methods = Array.isArray(opts.method)
            ? opts.method
            : [opts.method];

        for (let method of methods) {
            if (!this.router.hasRoute(method, finalPath)) {
                this.router.on(method, finalPath, (req, res) => {}, {
                    stack: [opts.handler],
                    config: opts.config,
                });
            } else {
                const handler = this.router.find(method, finalPath);
                this.router.off(method, finalPath);
                this.router.on(method, finalPath, (req, res) => {}, {
                    stack: [...handler.store.stack, ...opts.handler],
                    config: opts.config,
                });
            }
        }
    }

    private mergeRoutes(
        method: FindMyWay.HTTPMethod,
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        if (typeof path !== 'function') {
            let finalPath = this.path ? this.path + path : path;

            if (typeof finalPath === 'string') {
                if (!this.optionsAllow.has(finalPath))
                    this.optionsAllow.set(finalPath, new Set<string>());

                const allowed = this.optionsAllow.get(finalPath);
                allowed?.add(method);

                if (!this.router.hasRoute(method, finalPath)) {
                    this.router.on(method, finalPath, (req, res) => {}, {
                        stack: callbacks,
                    });

                    this.registeredRoutes.push({
                        method,
                        path: finalPath,
                        options: { callbacks },
                    });
                } else {
                    const handler = this.router.find(method, finalPath);
                    this.router.off(method, finalPath);
                    this.router.on(method, finalPath, (req, res) => {}, {
                        stack: [...handler.store.stack, ...callbacks],
                    });
                }
            }
        } else {
            const stack = this.stack.has(method) ? this.stack.get(method) : [];
            stack.push(path);
            this.stack.set(method, stack);
        }
    }

    public acl(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('ACL', path, ...callbacks);
    }

    public bind(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('BIND', path, ...callbacks);
    }

    public checkout(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('CHECKOUT', path, ...callbacks);
    }

    public connect(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('CONNECT', path, ...callbacks);
    }

    public copy(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('COPY', path, ...callbacks);
    }

    public delete(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('DELETE', path, ...callbacks);
    }

    public get(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('GET', path, ...callbacks);
        this.mergeRoutes('HEAD', path, ...callbacks);
    }

    public head(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('HEAD', path, ...callbacks);
    }

    public link(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('LINK', path, ...callbacks);
    }

    public lock(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('LOCK', path, ...callbacks);
    }

    public 'm-search'(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('M-SEARCH', path, ...callbacks);
    }

    public merge(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('MERGE', path, ...callbacks);
    }

    public mkactivity(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('MKACTIVITY', path, ...callbacks);
    }

    public mkcalendar(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('MKCALENDAR', path, ...callbacks);
    }

    public mkcol(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('MKCOL', path, ...callbacks);
    }

    public move(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('MOVE', path, ...callbacks);
    }

    public notify(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('NOTIFY', path, ...callbacks);
    }

    public options(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('OPTIONS', path, ...callbacks);
    }

    public patch(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('PATCH', path, ...callbacks);
    }

    public post(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('POST', path, ...callbacks);
    }

    public propfind(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('PROPFIND', path, ...callbacks);
    }

    public proppatch(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('PROPPATCH', path, ...callbacks);
    }

    public purge(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('PURGE', path, ...callbacks);
    }

    public put(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('PUT', path, ...callbacks);
    }

    public rebind(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('REBIND', path, ...callbacks);
    }

    public report(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('REPORT', path, ...callbacks);
    }

    public search(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('SEARCH', path, ...callbacks);
    }

    public source(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('SOURCE', path, ...callbacks);
    }

    public subscribe(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('SUBSCRIBE', path, ...callbacks);
    }

    public trace(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('TRACE', path, ...callbacks);
    }

    public unbind(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('UNBIND', path, ...callbacks);
    }

    public unlink(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('UNLINK', path, ...callbacks);
    }

    public unlock(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('UNLOCK', path, ...callbacks);
    }

    public unsubscribe(
        path: string | Function,
        ...callbacks: Array<
            (req: Request, res: Response, next?: Function) => void
        >
    ) {
        this.mergeRoutes('UNSUBSCRIBE', path, ...callbacks);
    }
    /**
     * Return list of registered routes.
     */
    public listRoutes() {
        return this.registeredRoutes.slice();
    }

    /**
     * Return allowed methods for the given path.
     */
    public allowedMethods(path: string) {
        return this.optionsAllow.get(path) || new Set<string>();
    }

    public use(path: string, fn: Function) {
        //console.log(path, fn);
    }
}
