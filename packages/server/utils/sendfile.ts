/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 *
 * @see https://github.com/expressjs/express/blob/master/lib/response.js#L234
 */

import * as onFinished from 'on-finished';

export const sendfile = async (res, file, options, callback) => {
    let done = false;
    let streaming;

    try {
        const fileResult = await file;
        const { stream } = fileResult;

        function onaborted() {
            if (done) return;
            done = true;

            const err: any = new Error('Request aborted');
            err.code = 'ECONNABORTED';
            callback(err);
        }

        function ondirectory() {
            if (done) return;
            done = true;

            const err: any = new Error('EISDIR, read');
            err.code = 'EISDIR';
            callback(err);
        }

        function onerror(err: Error) {
            if (done) return;
            done = true;
            callback(err);
        }

        function onend() {
            if (done) return;
            done = true;
            callback();
        }

        function onfile() {
            streaming = false;
        }

        function onfinish(err?: Error) {
            if (err && (err as any).code === 'ECONNRESET') return onaborted();
            if (err) return onerror(err);
            if (done) return;

            setTimeout(() => {
                if (streaming !== false && !done) {
                    onaborted();
                    return;
                }

                if (done) return;
                done = true;
                callback();
            }, 0);
        }

        function onstream() {
            streaming = true;
        }

        stream.on('directory', ondirectory);
        stream.on('end', onend);
        stream.on('error', onerror);
        stream.on('file', onfile);
        stream.on('stream', onstream);
        onFinished(res.raw, onfinish);

        if (options.headers) {
            Object.entries(options.headers).forEach(([key, value]) => {
                res.header(key, value as string);
            });
        }

        stream.pipe(res.raw);
    } catch (err) {
        if (!done) {
            done = true;
            callback(err as Error);
        }
    }
};
