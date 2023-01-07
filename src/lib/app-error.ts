import {extractErrorInfo} from './error-parser';

interface AppErrorArgs<T = {}> {
    code?: string | number;
    details?: T;
    debug?: object;

    name?: string;
    stack?: string;
}

interface AppErrorWrapArgs extends AppErrorArgs {
    message?: string;
}

export class AppError<T = {}> extends Error {
    static isAppError(error: AppError | Error | unknown): error is AppError {
        return error instanceof AppError;
    }

    static wrap(error: Error | unknown, args: AppErrorWrapArgs = {}) {
        return new AppError(args.message || (error as Error)?.message, {
            code: args.code,
            details: args.details,
            debug: {
                ...extractErrorInfo(error)?.err?.debug,
                ...args.debug,
            },
            name: (error as Error)?.name,
            stack: (error as Error)?.stack,
        });
    }

    code?: string | number;
    details?: T;
    debug?: object;

    constructor(message?: string, args: AppErrorArgs<T> = {}) {
        super(message);
        if (args.code) {
            this.code = args.code;
        }
        if (args.details) {
            this.details = args.details;
        }
        if (args.debug) {
            this.debug = args.debug;
        }
        if (args.name) {
            this.name = args.name;
        }
        if (args.stack) {
            this.stack = args.stack;
        }
    }
}
