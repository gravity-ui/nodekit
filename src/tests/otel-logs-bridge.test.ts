import {SeverityNumber, type AnyValueMap, logs} from '@opentelemetry/api-logs';
import {LoggerProvider} from '@opentelemetry/sdk-logs';

import {NodeKit, NodeKitLogger} from '..';
import {PinoLogRecordProcessor} from '../lib/tracing/pino-log-record-processor';
import type {Dict} from '../types';

// ── helpers ────────────────────────────────────────────────────────────────

type LogCall = {level: string; extra: Dict | undefined; message: string};

function makeLogger(): {logger: NodeKitLogger; calls: LogCall[]} {
    const calls: LogCall[] = [];

    function record(level: string) {
        return (msgOrExtra: string | Dict | undefined, msg?: string) => {
            calls.push({
                level,
                extra: typeof msgOrExtra === 'object' ? (msgOrExtra as Dict) : undefined,
                message: msg ?? (msgOrExtra as string),
            });
        };
    }

    const logger: NodeKitLogger = {
        trace: record('trace'),
        debug: record('debug'),
        info: record('info'),
        warn: record('warn'),
        error: record('error'),
    };

    return {logger, calls};
}

/**
 * Build a minimal LogRecord and call processor.onEmit() directly.
 * Avoids global LoggerProvider state between tests.
 */
function buildAndEmit(
    processor: PinoLogRecordProcessor,
    opts: {
        body?: unknown;
        severityNumber?: SeverityNumber;
        attributes?: AnyValueMap;
        scope?: string;
    },
) {
    const provider = new LoggerProvider({processors: [processor]});
    const logger = provider.getLogger(opts.scope ?? 'test-scope');
    logger.emit({
        body: opts.body as string | undefined,
        severityNumber: opts.severityNumber ?? SeverityNumber.INFO,
        attributes: opts.attributes,
    });
}

// ── PinoLogRecordProcessor unit tests ─────────────────────────────────────

describe('PinoLogRecordProcessor', () => {
    test('routes INFO log record to pino info', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger);

        buildAndEmit(processor, {body: 'hello world', severityNumber: SeverityNumber.INFO});

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({level: 'info', message: 'hello world'});
    });

    test('maps all severity levels correctly', () => {
        const cases: [SeverityNumber, string][] = [
            [SeverityNumber.TRACE, 'trace'],
            [SeverityNumber.TRACE4, 'trace'],
            [SeverityNumber.DEBUG, 'debug'],
            [SeverityNumber.DEBUG4, 'debug'],
            [SeverityNumber.INFO, 'info'],
            [SeverityNumber.INFO4, 'info'],
            [SeverityNumber.WARN, 'warn'],
            [SeverityNumber.WARN4, 'warn'],
            [SeverityNumber.ERROR, 'error'],
            [SeverityNumber.FATAL, 'error'],
        ];

        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger);

        for (const [severity] of cases) {
            buildAndEmit(processor, {body: `msg-${severity}`, severityNumber: severity});
        }

        expect(calls.map((c) => c.level)).toEqual(cases.map(([, level]) => level));
    });

    test('defaults to info when severityNumber is not set', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger);

        const provider = new LoggerProvider({processors: [processor]});
        // emit without severityNumber
        provider.getLogger('test').emit({body: 'no severity'});

        expect(calls[0]).toMatchObject({level: 'info', message: 'no severity'});
    });

    test('includes OTel attributes in extra', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger);

        buildAndEmit(processor, {
            body: 'openai call',
            attributes: {
                'gen_ai.usage.input_tokens': 512,
                'gen_ai.response.model': 'gpt-4o',
            },
        });

        expect(calls[0].extra).toMatchObject({
            'gen_ai.usage.input_tokens': 512,
            'gen_ai.response.model': 'gpt-4o',
        });
    });

    test('includes otelScope with instrumentation library name', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger);

        buildAndEmit(processor, {
            body: 'msg',
            scope: '@opentelemetry/instrumentation-openai',
        });

        expect(calls[0].extra).toMatchObject({
            otelScope: '@opentelemetry/instrumentation-openai',
        });
    });

    test('serializes object body to JSON string', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger);

        const provider = new LoggerProvider({processors: [processor]});
        provider.getLogger('test').emit({body: {event: 'request', status: 200}});

        expect(calls[0].message).toBe('{"event":"request","status":200}');
    });

    test('handles undefined body gracefully', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger);

        const provider = new LoggerProvider({processors: [processor]});
        provider.getLogger('test').emit({body: undefined});

        expect(calls[0].message).toBe('');
    });

    test('forceFlush resolves immediately', async () => {
        const {logger} = makeLogger();
        await expect(new PinoLogRecordProcessor(logger).forceFlush()).resolves.toBeUndefined();
    });

    test('shutdown resolves immediately', async () => {
        const {logger} = makeLogger();
        await expect(new PinoLogRecordProcessor(logger).shutdown()).resolves.toBeUndefined();
    });
});

// ── NodeKit integration ────────────────────────────────────────────────────

describe('NodeKit appTracingLogsBridge', () => {
    /**
     * OTel global LoggerProvider can only be set once per process.
     * We use a custom destination so pino writes to our mock — this must be
     * the first (and only) NodeKit that registers the global provider.
     */
    test('OTel log record appears in pino output when bridge is enabled', () => {
        const destination = {write: jest.fn()};

        new NodeKit({
            config: {
                appTracingEnabled: true,
                appTracingLogsBridge: true,
                appLoggingDestination: destination,
            },
        });

        expect(logs.getLoggerProvider().constructor.name).not.toBe('NoopLoggerProvider');

        logs.getLoggerProvider().getLogger('test-lib').emit({
            body: 'bridged message',
            severityNumber: SeverityNumber.INFO,
            attributes: {'custom.attr': 'value'},
        });

        const written = destination.write.mock.calls
            .flatMap((args: string[]) => args)
            .map((raw: string) => { try { return JSON.parse(raw); } catch { return null; } })
            .find((log: {msg?: string} | null) => log?.msg === 'bridged message');

        expect(written).toMatchObject({
            msg: 'bridged message',
            otelScope: 'test-lib',
            'custom.attr': 'value',
        });
    });

    test('does not throw when appTracingLogsBridge is false', () => {
        expect(() => {
            new NodeKit({
                config: {
                    appTracingEnabled: true,
                    appTracingLogsBridge: false,
                },
            });
        }).not.toThrow();
    });
});
