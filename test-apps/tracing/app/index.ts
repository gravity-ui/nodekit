import {NodeKit} from '@gravity-ui/nodekit';
import path from 'path';
import express, {type Request, type Response} from 'express';
import {addCtxMiddleware, logRequestMiddleware} from './middlewares';

export const nodeKit = new NodeKit({configsPath: path.resolve(__dirname, 'configs')});
const app = express();
const port = 3000;

app.use(addCtxMiddleware);
app.use(logRequestMiddleware);

const getRouteContextName = (req: Request) => `${req.method} : ${req.path}`;

app.get('/', (req: Request, res: Response) => {
    const ctxName = getRouteContextName(req);
    req.ctx.log(ctxName);
    const childCtx = req.ctx.create(ctxName);
    const content = 'Hello, world';
    childCtx.setTag('content', content);
    childCtx.end();

    res.send(content);
});

app.get('/error', (req: Request, res: Response) => {
    const ctxName = getRouteContextName(req);

    req.ctx.log(ctxName);

    req.ctx.call(ctxName, (ctx) => {
        try {
            const json = JSON.parse('\\\\\\');
            ctx.end();
            return res.send(json);
        } catch (e: unknown) {
            res.status(500).send('Error');

            throw e;
        }
    });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
