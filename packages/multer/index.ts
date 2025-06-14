/*!
 * CMMV Multer (File Upload)
 * Copyright(c) 2024 Andre Ferreira
 * MIT Licensed
 */

/*!
 * formidable
 * Copyright(c) 2011 Felix Geisendoerfer
 * MIT Licensed
 *
 * @see https://github.com/node-formidable/formidable
 */

import { IncomingForm, File } from 'formidable';

export interface MulterFile extends File {}

export interface MulterOptions {
    dest?: string;
}

export class MulterMiddleware {
    public middlewareName: string = 'multer';

    private options: MulterOptions;

    constructor(options?: MulterOptions) {
        this.options = options || {};
    }

    async process(req, res, next?) {
        if (req.app && typeof req.app.addContentTypeParser == 'function') {
            req.app.addContentTypeParser(
                'multipart/form-data',
                this.cmmvMiddleware.bind(this),
            );
        } else this.expressMiddleware.call(this, req, res, next);
    }

    expressMiddleware(req, res, done) {
        this.cmmvMiddleware(req, res, null, done);
    }

    cmmvMiddleware(req, res, payload, done) {
        return new Promise<void>((resolve) => {
            const form = new IncomingForm({ uploadDir: this.options.dest });

            form.parse(req.req || req, (err, fields, files) => {
                if (err) {
                    resolve(err);
                    return;
                }

                req.body = Object.assign({}, req.body, fields);
                req.files = files?.file || files?.files || files;
                resolve();
            });
        });
    }
}

export default Object.assign(
    async function (options?: MulterOptions) {
        const middleware = new MulterMiddleware(options);
        return (req, res, next) => middleware.process(req, res, next);
    },
    { MulterMiddleware }
);

export const multer = function (options?: MulterOptions) {
    const middleware = new MulterMiddleware(options);
    return (req, res, next) => middleware.process(req, res, next);
};