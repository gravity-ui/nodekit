import {NodeKit} from '@gravity-ui/nodekit';
import path from 'path';
import express, {type Request, type Response} from 'express';
import {addCtxMiddleware, logRequestMiddleware} from './middlewares';
import axios from 'axios';

export const nodeKit = new NodeKit({configsPath: path.resolve(__dirname, 'configs')});
const app = express();
const port = 3000;

app.use(addCtxMiddleware);
app.use(logRequestMiddleware);

const getRouteContextName = (req: Request) => `${req.method} : ${req.path}`;

app.get('/', (req: Request, res: Response) => {
    const ctxName = getRouteContextName(req);

    const childCtx = req.ctx.create(ctxName);
    childCtx.log(ctxName);
    const content = 'Hello, world';
    childCtx.setTag('content', content);
    childCtx.end();

    res.send(content);
});

app.get('/error', (req: Request, res: Response) => {
    const ctxName = getRouteContextName(req);

    req.ctx.call(ctxName, (ctx) => {
        ctx.log(ctxName);

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

app.get('/propagation', (req: Request, res: Response) => {
    const ctxName = getRouteContextName(req);

    req.ctx.call(ctxName, (ctx) => {
        const metadata = ctx.getMetadata();
        axios
            .get('http://localhost:16686/api/services', {headers: metadata})
            .then(function (response) {
                ctx.setTag('response', JSON.stringify(response?.data));
                ctx.setTag('metadata', JSON.stringify(metadata));
                ctx.end();
                res.send(JSON.stringify(response?.data));
            })
            .catch(function (error) {
                res.status(500).send('Internal server ertror');
                throw error;
            });
    });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
