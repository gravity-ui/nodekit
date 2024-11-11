import {type NextFunction, type Request, type Response} from 'express';

export const logRequestMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    const childCtx = req.ctx.create('Log request parameters');

    childCtx.log('log request middleware');
    childCtx.setTag('request.method', req.method);
    childCtx.setTag('request.url', req.url);

    childCtx.end();
    next();
};
