import {type NextFunction, type Request, type Response} from 'express';

export const logRequestMiddleware = (_req: Request, _res: Response, next: NextFunction) => {
    const mwCtx = _req.ctx.create('Log request parameters');

    mwCtx.setTag('request.method', _req.method);
    mwCtx.setTag('request.url', _req.url);

    mwCtx.end();
    next();
};
