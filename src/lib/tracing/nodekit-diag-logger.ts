import type {DiagLogFunction, DiagLogger} from '@opentelemetry/api';
import type {NodeKitLogger} from '../logging';
import type {Dict} from '../../types';

function logFn(
    this: unknown,
    logFunction: (extra: Dict | undefined, message: string) => void,
): DiagLogFunction {
    return (message, ...args) => {
        const data = args.reduce((acc: Record<string, unknown>, cur, index) => {
            if (typeof cur === 'object' && !Array.isArray(cur)) {
                Object.assign(acc, cur);
            } else if (Array.isArray(cur)) {
                acc[index] = cur;
            }

            return acc;
        }, {});

        return logFunction(data, `[opentelemetry] ${message}`);
    };
}

export const createNodekitDiagLogger = (logger: NodeKitLogger): DiagLogger => {
    return {
        verbose: logFn(logger.trace.bind(logger)),
        debug: logFn(logger.debug.bind(logger)),
        info: logFn(logger.info.bind(logger)),
        warn: logFn(logger.warn.bind(logger)),
        error: logFn(logger.error.bind(logger)),
    };
};
