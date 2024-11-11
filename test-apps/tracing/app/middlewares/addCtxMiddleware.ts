import {type NextFunction, type Request, type Response} from 'express';
import {nodeKit} from '..';

export const addCtxMiddleware = (req: Request, res: Response, next: NextFunction) => {
    req.ctx = nodeKit.ctx.create('Main app context', {
        parentSpanContext: nodeKit.ctx.extractSpanContext(req.headers),
    });

    req.ctx.log('CTX middleware');

    res.on('finish', () => {
        req.ctx.end();
    });

    next();
};
