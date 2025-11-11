import {
    type AttributeValue,
    type Attributes,
    type Context,
    type Span,
    SpanKind,
    SpanStatusCode,
    propagation,
    trace,
} from '@opentelemetry/api';
import {IncomingHttpHeaders} from 'http';

import {NodeKit} from '../nodekit';
import {AppConfig, AppContextParams, AppDynamicConfig, Dict} from '../types';

import {api, core} from '@opentelemetry/sdk-node';
import {AppError} from './app-error';
import {REQUEST_ID_HEADER, REQUEST_ID_PARAM_NAME} from './consts';
import {extractErrorInfo} from './error-parser';
import {getTracingServiceName} from './tracing/init-tracing';
import {headerGetter, headerSetter} from './utils/header-utils';
import {NodeKitLogger} from './logging';

type ContextParams = ContextInitialParams | ContextParentParams;

interface ContextInitialParams {
    contextId?: string;
    config: AppConfig;
    logger: NodeKitLogger;
    stats: AppTelemetrySendStats;
    parentSpanContext?: Context;
    spanKind?: SpanKind;
    utils: NodeKit['utils'];
    dynamicConfig?: AppDynamicConfig;
    loggerPostfix?: string;
    loggerExtra?: Dict;
    tags?: Dict;
}

interface ContextProperties {
    inheritable?: boolean;
}

export interface AppTelemetrySendStats {
    (table: string, data: {[name: string]: string | number}): void;
    (data: {[name: string]: string | number}): void;
}

interface ContextParentParams
    extends Pick<
        ContextInitialParams,
        'parentSpanContext' | 'loggerPostfix' | 'loggerExtra' | 'tags' | 'spanKind'
    > {
    parentContext: AppContext;
}

function isContextParentParams(v: ContextParams): v is ContextParentParams {
    return Boolean((v as ContextParentParams).parentContext);
}

type ContextCallbackFunction<T> = (ctx: AppContext) => T;

export class AppContext {
    name: string;
    config: AppConfig;
    parentContext?: AppContext;
    utils: NodeKit['utils'];
    stats: AppTelemetrySendStats;
    dynamicConfig: AppDynamicConfig;

    get abortSignal(): AbortSignal {
        return this.abortController.signal;
    }

    protected appParams: AppContextParams;
    private logger: NodeKitLogger;
    private span?: Span;
    private startTime: number;
    private endTime?: number;
    private loggerPrefix: string;
    private loggerPostfix: string;
    private loggerExtra?: Dict;
    private abortController: AbortController;
    private parentAbortListener?: () => void;
    private nonInheritableParamNames: Set<keyof AppContextParams>;

    constructor(name: string, params: ContextParams) {
        this.name = name;
        this.startTime = Date.now();
        this.abortController = new AbortController();
        this.nonInheritableParamNames = new Set<keyof AppContextParams>();

        if (isContextParentParams(params)) {
            this.config = params.parentContext.config;
            this.logger = params.parentContext.logger;
            this.utils = params.parentContext.utils;
            this.dynamicConfig = params.parentContext.dynamicConfig;

            this.appParams = Object.assign(
                {},
                Object.fromEntries(
                    Object.entries(params.parentContext?.appParams || {}).filter(
                        ([key]) =>
                            !params.parentContext.nonInheritableParamNames.has(
                                key as keyof AppContextParams,
                            ),
                    ),
                ),
            );

            this.loggerPrefix = `${params.parentContext.loggerPrefix} [${this.name}]`.trim();
            this.loggerPostfix = params.loggerPostfix || params.parentContext.loggerPostfix;
            this.loggerExtra = this.mergeExtra(
                params.parentContext.loggerExtra,
                params.loggerExtra,
            );

            this.parentAbortListener = () => {
                if (!this.isEnded()) {
                    this.end();
                }
            };
            params.parentContext.abortSignal.addEventListener('abort', this.parentAbortListener);

            if (this.isTracingEnabled(this.tracer)) {
                let parentSpanContext: Context | undefined;

                if (params?.parentSpanContext) {
                    parentSpanContext = params?.parentSpanContext;
                } else if (params.parentContext.span) {
                    parentSpanContext = trace.setSpan(
                        api.context.active(),
                        params.parentContext.span,
                    );
                }

                this.span = this.tracer.startSpan(
                    this.name,
                    {
                        attributes: this.createAttributes(
                            this.utils.redactSensitiveKeys(params.tags || {}),
                        ),
                        kind: params.spanKind,
                    },
                    parentSpanContext,
                );

                // fill traceId and spanId at logger extra data
                const traceId = this.getTraceId();
                const spanId = this.getSpanId();

                if (traceId && !this.getLoggerExtra('traceId')) {
                    this.addLoggerExtra('traceId', traceId);
                }
                if (spanId) {
                    this.addLoggerExtra('spanId', spanId);
                }
            }
            this.stats = params.parentContext.stats;

            this.parentContext = params.parentContext;
        } else if (params.config && params.logger && params.utils) {
            this.appParams = {};
            this.config = params.config;
            this.logger = params.logger;
            this.utils = params.utils;
            this.dynamicConfig = params.dynamicConfig || {};
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
        if (this.isEnded()) {
            this.logger.warn(this.prepareLogMessage('Context already ended'));
        }

        const preparedExtra = this.prepareExtra(extra);

        this.logger.info(preparedExtra, this.prepareLogMessage(message));
        this.span?.addEvent(message, this.createAttributes({...preparedExtra}));
    }

    logError(message: string, error?: AppError | Error | unknown, extra?: Dict) {
        if (this.isEnded()) {
            this.logger.warn(this.prepareLogMessage('Trying to call logError in ended context'));
        }

        const preparedMessage = this.prepareLogMessage(message);
        const preparedExtra = this.prepareExtra(extra);
        const logObject = this.getLogObject(error, extra);
        this.logger.error(logObject, preparedMessage);

        this.span?.setStatus({
            code: SpanStatusCode.ERROR,
            message: message,
        });
        this.span?.addEvent(
            message,
            this.createAttributes({
                ...preparedExtra,
                event: message,
                stack: error instanceof Error && error?.stack,
            }),
        );
    }

    logWarn(message: string, error?: AppError | Error | unknown, extra?: Dict) {
        if (this.isEnded()) {
            this.logger.warn(this.prepareLogMessage('Trying to call logWarn in ended context'));
        }

        const preparedMessage = this.prepareLogMessage(message);
        const preparedExtra = this.prepareExtra(extra);
        const logObject = this.getLogObject(error, extra);
        this.logger.warn(logObject, preparedMessage);
        this.span?.addEvent(
            message,
            this.createAttributes({
                ...preparedExtra,
                event: message,
                stack: error instanceof Error && error.stack,
            }),
        );
    }

    create(name: string, params?: Omit<ContextParentParams, 'parentContext'>) {
        if (this.isEnded()) {
            throw new Error('Trying to create child context from already ended context');
        }
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

    set<K extends keyof AppContextParams>(
        key: K,
        value: AppContextParams[K],
        properties: ContextProperties = {inheritable: true},
    ) {
        this.appParams[key] = value;
        if (properties.inheritable) {
            this.nonInheritableParamNames.delete(key);
        } else {
            this.nonInheritableParamNames.add(key);
        }
    }

    get<K extends keyof AppContextParams>(key: K) {
        return this.appParams[key];
    }

    setTag(key: string, value: AttributeValue) {
        if (this.isEnded()) {
            this.logger.warn(this.prepareLogMessage('Trying to call setTag in ended context'));
        }
        this.span?.setAttribute(key, value);
    }

    isEnded() {
        return this.abortSignal.aborted;
    }

    end() {
        if (this.isEnded()) {
            this.logger.warn(this.prepareLogMessage('Trying to call end in ended context'));
            return;
        }
        this.removeParentAbortListener();
        this.abortController.abort();
        this.endTime = Date.now();
        if (this.span) {
            this.span.end();
        }
    }

    fail(error?: AppError | Error | unknown) {
        if (this.isEnded()) {
            this.logger.warn(this.prepareLogMessage('Trying to call fail in ended context'));
            return;
        }
        this.logError('context failed', error);
        this.removeParentAbortListener();
        this.abortController.abort();
        this.endTime = Date.now();
        if (this.span) {
            this.span.end();
        }
    }

    getTime() {
        if (this.endTime) {
            return this.endTime - this.startTime;
        } else {
            return Date.now() - this.startTime;
        }
    }

    extractSpanContext(headers: IncomingHttpHeaders) {
        return propagation.extract(api.context.active(), headers, headerGetter);
    }

    getMetadata() {
        const metadata: Record<string, string> = {};
        const requestId = this.get(REQUEST_ID_PARAM_NAME);
        if (requestId) {
            metadata[REQUEST_ID_HEADER] = requestId;
        }
        if (this.span) {
            propagation.inject(
                trace.setSpan(api.context.active(), this.span),
                metadata,
                headerSetter,
            );
        }
        return metadata;
    }

    getTraceId(): string | undefined {
        if (!this.span) {
            if (this.config.appTracingEnabled) {
                this.log('Span is undefined');
            }
            return undefined;
        }
        return this.span.spanContext().traceId;
    }

    getSpanId() {
        if (!this.span) return undefined;
        return this.span.spanContext().spanId;
    }

    // allow add extra logger data, after ctx already initialized (ex. to add traceId from ctx)
    addLoggerExtra(key: string, value: unknown) {
        this.loggerExtra = this.mergeExtra(this.loggerExtra, {[key]: value});
    }

    getLoggerExtra(key: string): unknown {
        return this.loggerExtra?.[key];
    }

    clearLoggerExtra() {
        this.loggerExtra = Object.assign({}, this.parentContext?.loggerExtra);
    }

    get tracer() {
        if (!this.config.appTracingEnabled) return undefined;
        return trace.getTracer(getTracingServiceName(this.config));
    }

    private isTracingEnabled(_tracer?: api.Tracer): _tracer is api.Tracer {
        return this.config.appTracingEnabled === true;
    }

    private prepareLogMessage(message: string) {
        return `${this.loggerPrefix} ${message} ${this.loggerPostfix}`.trim();
    }

    private prepareExtra(extra: Dict | undefined) {
        const mergedExtra = this.mergeExtra(this.loggerExtra, extra);

        const preparedExtra = this.utils.redactSensitiveKeys(mergedExtra);
        return Object.keys(preparedExtra).length ? preparedExtra : undefined;
    }

    private mergeExtra(extraParent: Dict | undefined, extraCurrent: Dict | undefined) {
        return Object.assign({}, extraParent, extraCurrent);
    }

    private getLogObject(error: Error | unknown, extra: Dict | undefined) {
        if (error) {
            return {...this.prepareExtra(extra), ...extractErrorInfo(error)};
        } else if (extra) {
            return this.prepareExtra(extra);
        } else {
            return this.loggerExtra;
        }
    }

    private createAttributes(dict: Dict) {
        const attributes: Attributes = {};
        Object.entries(dict).forEach(([key, value]) => {
            if (core.isAttributeValue(value) && typeof key === 'string') {
                attributes[key] = value;
            }
        });

        return attributes;
    }

    private removeParentAbortListener() {
        if (this.parentContext && this.parentAbortListener) {
            this.parentContext.abortSignal.removeEventListener('abort', this.parentAbortListener);
            this.parentAbortListener = undefined;
        }
    }
}
