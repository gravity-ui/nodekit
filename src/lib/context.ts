import {IncomingHttpHeaders} from 'http';

import {JaegerTracer} from 'jaeger-client';
import {FORMAT_HTTP_HEADERS, Span, SpanContext, Tags} from 'opentracing';
import pino from 'pino';

import {NodeKit} from '../nodekit';
import {AppConfig, AppContextParams, AppDynamicConfig, Dict} from '../types';

import {AppError} from './app-error';
import {REQUEST_ID_HEADER, REQUEST_ID_PARAM_NAME} from './consts';
import {extractErrorInfo} from './error-parser';

type ContextParams = ContextInitialParams | ContextParentParams;

interface ContextInitialParams {
    contextId?: string;
    config: AppConfig;
    logger: pino.Logger;
    tracer: JaegerTracer;
    stats: AppTelemetrySendStats;
    parentSpanContext?: SpanContext;
    utils: NodeKit['utils'];
    dynamicConfig?: AppDynamicConfig;
    loggerPostfix?: string;
    loggerExtra?: Dict;
    tags?: Dict;
}

export interface AppTelemetrySendStats {
    (table: string, data: {[name: string]: string | number}): void;
    (data: {[name: string]: string | number}): void;
}

interface ContextParentParams
    extends Pick<
        ContextInitialParams,
        'parentSpanContext' | 'loggerPostfix' | 'loggerExtra' | 'tags'
    > {
    parentContext: AppContext;
}

function isContextParentParams(v: ContextParams): v is ContextParentParams {
    return Boolean((v as ContextParentParams).parentContext);
}

type ContextCallbackFunction<T> = (ctx: AppContext) => T;

export class AppContext {
    config: AppConfig;
    parentContext?: AppContext;
    utils: NodeKit['utils'];
    stats: AppTelemetrySendStats;
    dynamicConfig: AppDynamicConfig;

    protected appParams: AppContextParams;
    protected name: string;
    private logger: pino.Logger;
    private tracer: JaegerTracer;
    private span?: Span;
    private startTime: number;
    private endTime?: number;
    private loggerPrefix: string;
    private loggerPostfix: string;
    private loggerExtra?: Dict;

    constructor(name: string, params: ContextParams) {
        this.name = name;
        this.startTime = Date.now();

        if (isContextParentParams(params)) {
            this.config = params.parentContext.config;
            this.logger = params.parentContext.logger;
            this.tracer = params.parentContext.tracer;
            this.utils = params.parentContext.utils;
            this.dynamicConfig = params.parentContext.dynamicConfig;
            this.appParams = Object.assign({}, params.parentContext?.appParams);
            this.loggerPrefix = `${params.parentContext.loggerPrefix} [${this.name}]`.trim();
            this.loggerPostfix = params.loggerPostfix || params.parentContext.loggerPostfix;
            this.loggerExtra = this.mergeExtra(
                params.parentContext.loggerExtra,
                params.loggerExtra,
            );

            this.span = this.tracer.startSpan(this.name, {
                tags: this.utils.redactSensitiveKeys(params.tags || {}),
                childOf: params.parentSpanContext || params.parentContext?.span,
            });
            this.stats = params.parentContext.stats;
        } else if (params.config && params.logger && params.tracer && params.utils) {
            this.appParams = {};
            this.config = params.config;
            this.logger = params.logger;
            this.tracer = params.tracer;
            this.utils = params.utils;
            this.dynamicConfig = {};
            this.loggerPrefix = '';
            this.loggerPostfix = params.loggerPostfix || '';
            this.loggerExtra = params.loggerExtra;
            this.stats = params.stats;
        } else {
            throw new Error(
                'AppContext constructor requires either parent context or configuration',
            );
        }
    }

    log(message: string, extra?: Dict) {
        const preparedExtra = this.prepareExtra(this.mergeExtra(this.loggerExtra, extra));

        this.logger.info(preparedExtra, this.prepareLogMessage(message));
        this.span?.log(Object.assign({}, preparedExtra, {event: message}));
    }

    logError(message: string, error?: AppError | Error | unknown, extra?: Dict) {
        if (error) {
            this.logger.error(
                Object.assign(
                    {},
                    extractErrorInfo(error),
                    this.prepareExtra(this.mergeExtra(this.loggerExtra, extra)),
                ),
                this.prepareLogMessage(message),
            );
        } else if (extra) {
            this.logger.error(
                this.prepareExtra(this.mergeExtra(this.loggerExtra, extra)),
                this.prepareLogMessage(message),
            );
        } else {
            this.logger.error(this.prepareLogMessage(message));
        }

        this.span?.setTag(Tags.SAMPLING_PRIORITY, 1);
        this.span?.setTag(Tags.ERROR, true);
        this.span?.log(
            Object.assign({}, this.prepareExtra(this.mergeExtra(this.loggerExtra, extra)), {
                event: message,
                stack: error instanceof Error && error?.stack,
            }),
        );
    }

    create(name: string, params?: Omit<ContextParentParams, 'parentContext'>) {
        return new AppContext(name, {parentContext: this, ...params});
    }

    call<T>(
        name: string,
        fn: ContextCallbackFunction<T>,
        params?: Omit<ContextParentParams, 'parentContext'>,
    ): T;
    call<T>(
        name: string,
        fn: ContextCallbackFunction<Promise<T>>,
        params?: Omit<ContextParentParams, 'parentContext'>,
    ): Promise<T>;
    call<T>(
        name: string,
        fn: ContextCallbackFunction<T | Promise<T>>,
        params?: Omit<ContextParentParams, 'parentContext'>,
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
        const metadata: Record<string, string> = {};
        const requestId = this.get(REQUEST_ID_PARAM_NAME);
        if (requestId) {
            metadata[REQUEST_ID_HEADER] = requestId;
        }
        if (this.span) {
            this.tracer.inject(this.span, FORMAT_HTTP_HEADERS, metadata);
        }
        return metadata;
    }

    getTraceId() {
        // @ts-ignore
        return this.span?._spanContext?.toTraceId();
    }

    private prepareLogMessage(message: string) {
        return `${this.loggerPrefix} ${message} ${this.loggerPostfix}`.trim();
    }

    private prepareExtra(extra?: Dict) {
        if (extra === undefined) {
            return extra;
        }
        const preparedExtra = this.utils.redactSensitiveKeys(extra);
        return Object.keys(preparedExtra).length ? preparedExtra : undefined;
    }

    private mergeExtra(extraParent?: Dict, extraCurrent?: Dict) {
        if (extraParent === undefined) {
            return extraCurrent;
        }
        return Object.assign({}, extraParent, extraCurrent);
    }
}
