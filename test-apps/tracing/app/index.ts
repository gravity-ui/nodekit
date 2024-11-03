import {NodeKit} from '@gravity-ui/nodekit';
import path from 'path';
import express, {type Request, type Response} from 'express';
import {addCtxMiddleware, logRequestMiddleware} from './middlewares';

export const nodeKit = new NodeKit({configsPath: path.resolve(__dirname, 'configs')});

const app = express();
const port = 3000;

app.use(addCtxMiddleware);
app.use(logRequestMiddleware);

app.get('/', (req: Request, res: Response) => {
    const content = 'Hello, world';
    req.ctx.setTag('content', content);
    res.send(content);
});

app.get('/error', (req: Request, res: Response) => {
    req.ctx.call('Do some work...', () => {
        try {
            const json = JSON.parse('\\\\\\');
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
