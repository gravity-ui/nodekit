import pino from 'pino';
import {JaegerTracer} from 'jaeger-client';
import {Span, Tags, SpanContext, FORMAT_HTTP_HEADERS} from 'opentracing';
import {NodeKit} from '../nodekit';
import {AppConfig, AppContextParams, Dict} from '../types';
import {AppError} from './app-error';
import {extractErrorInfo} from './error-parser';
import {IncomingHttpHeaders} from 'http';

interface ContextParams {
    contextId?: string;
    config?: AppConfig;
    logger?: pino.Logger;
    tracer?: JaegerTracer;
    parentContext?: AppContext;
    parentSpanContext?: SpanContext;
    utils?: NodeKit['utils'];
    loggerPostfix?: string;
    tags?: Dict;
}

type ContextCallbackFunction<T> = (ctx: AppContext) => T;

export class AppContext {
    config: AppConfig;
    parentContext?: AppContext;

    protected appParams: AppContextParams;
    protected name: string;
    private logger: pino.Logger;
    private tracer: JaegerTracer;
    private span?: Span;
    private utils: NodeKit['utils'];
    private startTime: number;
    private endTime?: number;
    private loggerPrefix: string;
    private loggerPostfix: string;

    constructor(name: string, params: ContextParams) {
        this.name = name;
        this.startTime = Date.now();

        if (params.parentContext) {
            this.config = params.parentContext.config;
            this.logger = params.parentContext.logger;
            this.tracer = params.parentContext.tracer;
            this.utils = params.parentContext.utils;
            this.appParams = Object.assign({}, params.parentContext?.appParams);
            this.loggerPrefix = `${params.parentContext.loggerPrefix} [${this.name}]`.trim();
            this.loggerPostfix = params.loggerPostfix || params.parentContext.loggerPostfix;

            this.span = this.tracer.startSpan(this.name, {
                tags: this.utils.redactSensitiveKeys(params.tags || {}),
                childOf: params.parentSpanContext || params.parentContext?.span,
            });
        } else if (params.config && params.logger && params.tracer && params.utils) {
            this.appParams = {};
            this.config = params.config;
            this.logger = params.logger;
            this.tracer = params.tracer;
            this.utils = params.utils;
            this.loggerPrefix = '';
            this.loggerPostfix = params.loggerPostfix || '';
        } else {
            throw new Error(
                'AppContext constructor requires either parent context or configuration',
            );
        }
    }

    log(message: string, extra: Dict = {}) {
        this.logger.info(this.prepareExtra(extra), this.prepareLogMessage(message));
        this.span?.log(Object.assign({}, this.utils.redactSensitiveKeys(extra), {event: message}));
    }

    logError(message: string, error?: AppError | Error | unknown, extra: Dict = {}) {
        this.logger.error(
            Object.assign({}, extractErrorInfo(error), {
                extra: this.utils.redactSensitiveKeys(extra),
            }),
            this.prepareLogMessage(message),
        );

        this.span?.setTag(Tags.SAMPLING_PRIORITY, 1);
        this.span?.setTag(Tags.ERROR, true);
        this.span?.log(
            Object.assign({}, this.utils.redactSensitiveKeys(extra), {
                event: message,
                stack: error instanceof Error && error?.stack,
            }),
        );
    }

    create(name: string, params?: AppContextParams) {
        return new AppContext(name, {...params, parentContext: this});
    }

    call<T>(name: string, fn: ContextCallbackFunction<T>, params?: ContextParams): T;
    call<T>(
        name: string,
        fn: ContextCallbackFunction<Promise<T>>,
        params?: ContextParams,
    ): Promise<T>;
    call<T>(
        name: string,
        fn: ContextCallbackFunction<T | Promise<T>>,
        params?: ContextParams,
    ): T | Promise<T> {
        const ctx = this.create(name, params);

        let fnResult;
        try {
            fnResult = fn(ctx);
        } catch (error) {
            ctx.fail(error);
            throw error;
        }

        if (fnResult instanceof Promise) {
            return fnResult
                .then((result) => {
                    ctx.end();
                    return result;
                })
                .catch((error) => {
                    ctx.fail(error);
                    throw error;
                });
        } else {
            ctx.end();
        }
        return fnResult;
    }

    set<K extends keyof AppContextParams>(key: K, value: AppContextParams[K]) {
        this.appParams[key] = value;
    }

    get<K extends keyof AppContextParams>(key: K) {
        return this.appParams[key];
    }

    setTag(key: string, value: unknown) {
        this.span?.setTag(key, value);
    }

    end() {
        this.endTime = Date.now();
        if (this.span) {
            this.span.finish();
        }
    }

    fail(error?: AppError | Error | unknown) {
        this.endTime = Date.now();
        this.logError('context failed', error);
        if (this.span) {
            this.span.finish();
        }
    }

    getTime() {
        if (this.endTime) {
            return this.endTime - this.startTime;
        } else {
            return Date.now() - this.startTime;
        }
    }

    extractSpanContext(headers: IncomingHttpHeaders): SpanContext | undefined {
        return this.tracer.extract(FORMAT_HTTP_HEADERS, headers) as SpanContext;
    }

    getMetadata() {
        if (this.span) {
            const metadata = {};
            this.tracer.inject(this.span, FORMAT_HTTP_HEADERS, metadata);
            return metadata;
        } else {
            return {};
        }
    }

    private prepareLogMessage(message: string) {
        return `${this.loggerPrefix} ${message} ${this.loggerPostfix}`.trim();
    }

    private prepareExtra(extra: Dict) {
        const preparedExtra = this.utils.redactSensitiveKeys(extra);
        return Object.keys(preparedExtra).length ? preparedExtra : undefined;
    }
}
