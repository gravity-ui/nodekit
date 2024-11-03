import type {AppContext} from '@gravity-ui/nodekit';

declare module 'express-serve-static-core' {
    interface Request {
        ctx: AppContext;
    }
}
