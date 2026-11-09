import {SpanStatusCode} from '@opentelemetry/api';
import {tracing} from '@opentelemetry/sdk-node';

import {AppContext} from '../lib/context';
import {isTrueEnvValue} from '../lib/utils/is-true-env';
import prepareSensitiveHeadersRedacter from '../lib/utils/redact-sensitive-headers';

describe('context ending', () => {
    let exporter: tracing.InMemorySpanExporter;
    let provider: tracing.BasicTracerProvider;
    let root: AppContext;
    let logger: {
        info: jest.Mock;
        warn: jest.Mock;
        error: jest.Mock;
        debug: jest.Mock;
        trace: jest.Mock;
    };

    beforeEach(() => {
        exporter = new tracing.InMemorySpanExporter();
        provider = new tracing.BasicTracerProvider({
            spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
        });
        jest.spyOn(AppContext.prototype, 'tracer', 'get').mockReturnValue(
            provider.getTracer('context-ending'),
        );
        logger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            trace: jest.fn(),
        };
        root = new AppContext('root', {
            config: {appTracingEnabled: true},
            logger,
            stats: jest.fn(),
            utils: {
                redactSensitiveKeys: (value) => value,
                redactSensitiveHeaders: prepareSensitiveHeadersRedacter(),
                redactSensitiveQueryParams: (value = '') => value,
                isTrueEnvValue,
            },
        });
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await provider.shutdown();
    });

    test('records synchronous cleanup logs before ending the span without ended warnings', async () => {
        const ctx = root.create('operation');
        let endedDuringAbort: boolean | undefined;
        ctx.abortSignal.addEventListener('abort', () => {
            endedDuringAbort = ctx.isEnded();
            ctx.log('polling stopped');
            ctx.logWarn('cleanup warning');
            ctx.logError('cleanup error');
            ctx.setTag('cleanup', 'done');
        });

        ctx.end();
        await provider.forceFlush();

        expect(endedDuringAbort).toBe(true);
        expect(ctx.isEnded()).toBe(true);
        expect(logger.info).toHaveBeenCalledWith(expect.any(Object), '[operation] polling stopped');
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(expect.any(Object), '[operation] cleanup warning');
        expect(logger.error).toHaveBeenCalledWith(expect.any(Object), '[operation] cleanup error');
        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(1);
        expect(spans[0].events.map(({name}) => name)).toEqual([
            'polling stopped',
            'cleanup warning',
            'cleanup error',
        ]);
        expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
        expect(spans[0].attributes.cleanup).toBe('done');
    });

    test('records fail from a synchronous abort handler without ending twice', async () => {
        const ctx = root.create('operation');
        const error = new Error('cleanup failed');
        ctx.abortSignal.addEventListener('abort', () => ctx.fail(error));

        ctx.end();
        await provider.forceFlush();

        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({err: expect.objectContaining({message: 'cleanup failed'})}),
            '[operation] context failed',
        );
        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(1);
        expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    });

    test('rejects new children and ends the span once when an abort listener calls end again', () => {
        const tracer = provider.getTracer('context-ending');
        const span = tracer.startSpan('operation');
        jest.spyOn(tracer, 'startSpan').mockReturnValueOnce(span);
        const endSpan = jest.spyOn(span, 'end');
        const ctx = root.create('operation');
        let creationError: unknown;
        const onAbort = jest.fn(() => {
            try {
                ctx.create('late child');
            } catch (error) {
                creationError = error;
            }
            ctx.end();
        });
        ctx.abortSignal.addEventListener('abort', onAbort);

        ctx.end();

        expect(creationError).toEqual(
            new Error('Trying to create child context from already ended context'),
        );
        expect(onAbort).toHaveBeenCalledTimes(1);
        expect(endSpan).toHaveBeenCalledTimes(1);
        expect(logger.warn).not.toHaveBeenCalled();
        ctx.end();
        expect(endSpan).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith('[operation] Trying to call end in ended context');
    });

    test('closes descendants and allows their synchronous cleanup to log', async () => {
        const parent = root.create('parent');
        const child = parent.create('child');
        const grandchild = child.create('grandchild');
        const onChildAbort = jest.fn(() => {
            child.log('child stopped');
            parent.end();
        });
        const onGrandchildAbort = jest.fn(() => grandchild.log('grandchild stopped'));
        child.abortSignal.addEventListener('abort', onChildAbort);
        grandchild.abortSignal.addEventListener('abort', onGrandchildAbort);

        parent.end();
        await provider.forceFlush();

        for (const ctx of [parent, child, grandchild]) {
            expect(ctx.isEnded()).toBe(true);
            expect(ctx.abortSignal.aborted).toBe(true);
        }
        expect(onChildAbort).toHaveBeenCalledTimes(1);
        expect(onGrandchildAbort).toHaveBeenCalledTimes(1);
        expect(logger.warn).not.toHaveBeenCalled();
        expect(exporter.getFinishedSpans().map(({name}) => name)).toEqual([
            'grandchild',
            'child',
            'parent',
        ]);
    });

    test.each([
        ['log', 'Context already ended'],
        ['logWarn', 'Trying to call logWarn in ended context'],
        ['logError', 'Trying to call logError in ended context'],
    ] as const)('keeps the %s warning for asynchronous abort cleanup', async (method, warning) => {
        const ctx = root.create('operation');
        let cleanup: Promise<void> | undefined;
        ctx.abortSignal.addEventListener('abort', () => {
            cleanup = Promise.resolve().then(() => ctx[method]('late cleanup'));
        });

        ctx.end();
        expect(logger.warn).not.toHaveBeenCalled();
        await cleanup;

        expect(logger.warn).toHaveBeenCalledWith(`[operation] ${warning}`);
    });

    test('leaves the context ended when ending its span throws', () => {
        const tracer = provider.getTracer('context-ending');
        const span = tracer.startSpan('operation');
        jest.spyOn(tracer, 'startSpan').mockReturnValueOnce(span);
        const error = new Error('span end failed');
        const endSpan = jest.spyOn(span, 'end').mockImplementationOnce(() => {
            throw error;
        });
        const ctx = root.create('operation');

        expect(() => ctx.end()).toThrow(error);
        expect(ctx.isEnded()).toBe(true);
        expect(ctx.abortSignal.aborted).toBe(true);
        ctx.log('late log');
        ctx.end();
        expect(logger.warn).toHaveBeenCalledWith('[operation] Context already ended');
        expect(logger.warn).toHaveBeenCalledWith('[operation] Trying to call end in ended context');
        expect(endSpan).toHaveBeenCalledTimes(1);
    });
});
