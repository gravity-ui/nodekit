import {type NextFunction, type Request, type Response} from 'express';
import {nodeKit} from '..';

export const addCtxMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    req.ctx = nodeKit.ctx.create('Main app context');

    req.ctx.log('CTX middleware');

    _res.on('finish', () => {
        req.ctx.end();
    });

    next();
};
