import * as FindMyWay from 'find-my-way';
export declare class Router {
    private path;
    router: FindMyWay.Instance<FindMyWay.HTTPVersion.V2>;
    stack: Map<FindMyWay.HTTPMethod, Array<Function>>;
    constructor(path?: string);
    route: FindMyWay.Instance<FindMyWay.HTTPVersion.V2>;
    find(method: string, path: string): Promise<unknown>;
    private mergeRoutes;
    acl(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    bind(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    checkout(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    connect(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    copy(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    delete(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    get(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    head(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    link(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    lock(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    'm-search'(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    merge(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    mkactivity(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    mkcalendar(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    mkcol(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    move(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    notify(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    options(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    patch(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    post(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    propfind(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    proppatch(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    purge(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    put(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    rebind(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    report(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    search(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    source(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    subscribe(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    trace(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    unbind(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    unlink(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    unlock(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    unsubscribe(path: string | Function, ...callbacks: Array<(req: Request, res: Response, next?: Function) => void>): void;
    use(path: string, fn: Function): void;
}
