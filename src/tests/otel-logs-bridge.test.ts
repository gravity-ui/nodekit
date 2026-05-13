import {type AnyValueMap, SeverityNumber, logs} from '@opentelemetry/api-logs';
import {LoggerProvider} from '@opentelemetry/sdk-logs';

import {NodeKit, NodeKitLogger} from '..';
import {PinoLogRecordProcessor} from '../lib/tracing/pino-log-record-processor';
import {prepareSensitiveKeysRedacter} from '../lib/utils/redact-sensitive-keys';
import type {Dict} from '../types';

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

const noopRedact = prepareSensitiveKeysRedacter([]);

// Emits a log record through a local LoggerProvider, avoiding global OTel state.
function buildAndEmit(
    processor: PinoLogRecordProcessor,
    opts: {
        body?: unknown;
        severityNumber?: SeverityNumber;
        severityText?: string;
        eventName?: string;
        attributes?: AnyValueMap;
        scope?: string;
    },
) {
    const provider = new LoggerProvider({processors: [processor]});
    const logger = provider.getLogger(opts.scope ?? 'test-scope');
    logger.emit({
        body: opts.body as string | undefined,
        severityNumber: opts.severityNumber,
        severityText: opts.severityText,
        eventName: opts.eventName,
        attributes: opts.attributes,
    });
}

describe('PinoLogRecordProcessor', () => {
    test('routes INFO log record to pino info', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger, noopRedact);

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
        const processor = new PinoLogRecordProcessor(logger, noopRedact);

        for (const [severity] of cases) {
            buildAndEmit(processor, {body: `msg-${severity}`, severityNumber: severity});
        }

        expect(calls.map((c) => c.level)).toEqual(cases.map(([, level]) => level));
    });

    test('UNSPECIFIED severity falls back to severityText', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger, noopRedact);

        buildAndEmit(processor, {
            body: 'msg',
            severityNumber: SeverityNumber.UNSPECIFIED,
            severityText: 'ERROR',
        });

        expect(calls[0]).toMatchObject({level: 'error'});
    });

    test('undefined severity falls back to severityText', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger, noopRedact);

        buildAndEmit(processor, {body: 'msg', severityText: 'WARN'});

        expect(calls[0]).toMatchObject({level: 'warn'});
    });

    test('defaults to info when both severityNumber and severityText are absent', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger, noopRedact);

        const provider = new LoggerProvider({processors: [processor]});
        provider.getLogger('test').emit({body: 'no severity'});

        expect(calls[0]).toMatchObject({level: 'info', message: 'no severity'});
    });

    test('includes OTel attributes in extra', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger, noopRedact);

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
        const processor = new PinoLogRecordProcessor(logger, noopRedact);

        buildAndEmit(processor, {
            body: 'msg',
            scope: '@opentelemetry/instrumentation-openai',
        });

        expect(calls[0].extra).toMatchObject({
            otelScope: '@opentelemetry/instrumentation-openai',
        });
    });

    test('otelScope overrides attribute with the same key', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger, noopRedact);

        buildAndEmit(processor, {
            body: 'msg',
            scope: 'real-scope',
            attributes: {otelScope: 'custom-from-attr'},
        });

        expect(calls[0].extra?.otelScope).toBe('real-scope');
    });

    test('uses eventName as message fallback when body is empty', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger, noopRedact);

        buildAndEmit(processor, {body: undefined, eventName: 'db.query'});

        expect(calls[0].message).toBe('db.query');
    });

    test('redacts sensitive keys from attributes', () => {
        const {logger, calls} = makeLogger();
        const redact = prepareSensitiveKeysRedacter(['authorization', 'password']);
        const processor = new PinoLogRecordProcessor(logger, redact);

        buildAndEmit(processor, {
            body: 'request',
            attributes: {
                authorization: 'Bearer secret-token',
                password: 'p@ssw0rd',
                'gen_ai.usage.input_tokens': 512,
            },
        });

        expect(calls[0].extra).toMatchObject({
            authorization: '[REDACTED]',
            password: '[REDACTED]',
            'gen_ai.usage.input_tokens': 512,
        });
    });

    test('redacts sensitive keys from object body', () => {
        const {logger, calls} = makeLogger();
        const redact = prepareSensitiveKeysRedacter(['password']);
        const processor = new PinoLogRecordProcessor(logger, redact);

        const provider = new LoggerProvider({processors: [processor]});
        provider.getLogger('test').emit({body: {user: 'alice', password: 'secret'}});

        expect(calls[0].message).toBe('{"user":"alice","password":"[REDACTED]"}');
    });

    test('serializes object body to JSON string', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger, noopRedact);

        const provider = new LoggerProvider({processors: [processor]});
        provider.getLogger('test').emit({body: {event: 'request', status: 200}});

        expect(calls[0].message).toBe('{"event":"request","status":200}');
    });

    test('handles undefined body gracefully', () => {
        const {logger, calls} = makeLogger();
        const processor = new PinoLogRecordProcessor(logger, noopRedact);

        const provider = new LoggerProvider({processors: [processor]});
        provider.getLogger('test').emit({body: undefined});

        expect(calls[0].message).toBe('');
    });

    test('forceFlush resolves immediately', async () => {
        const {logger} = makeLogger();
        await expect(
            new PinoLogRecordProcessor(logger, noopRedact).forceFlush(),
        ).resolves.toBeUndefined();
    });

    test('shutdown resolves immediately', async () => {
        const {logger} = makeLogger();
        await expect(
            new PinoLogRecordProcessor(logger, noopRedact).shutdown(),
        ).resolves.toBeUndefined();
    });
});

describe('NodeKit experimentalAppTracingLogsBridge', () => {
    // OTel global LoggerProvider can only be set once per process.
    // We use a custom destination so pino writes to our mock — this must be
    // the first (and only) NodeKit that registers the global provider.
    test('OTel log record appears in pino output when bridge is enabled', () => {
        const destination = {write: jest.fn()};

        const nodekit = new NodeKit({
            config: {
                appTracingEnabled: true,
                experimentalAppTracingLogsBridge: true,
                appLoggingDestination: destination,
            },
        });

        expect(nodekit).toBeDefined();
        expect(logs.getLoggerProvider().constructor.name).not.toBe('NoopLoggerProvider');

        logs.getLoggerProvider()
            .getLogger('test-lib')
            .emit({
                body: 'bridged message',
                severityNumber: SeverityNumber.INFO,
                attributes: {'custom.attr': 'value'},
            });

        const written = destination.write.mock.calls
            .flatMap((args: string[]) => args)
            .map((raw: string) => {
                try {
                    return JSON.parse(raw);
                } catch {
                    return null;
                }
            })
            .find((log: {msg?: string} | null) => log?.msg === 'bridged message');

        expect(written).toMatchObject({
            msg: 'bridged message',
            otelScope: 'test-lib',
            'custom.attr': 'value',
        });
    });

    test('does not throw when experimentalAppTracingLogsBridge is false', () => {
        const nodekit = new NodeKit({
            config: {
                appTracingEnabled: true,
                experimentalAppTracingLogsBridge: false,
            },
        });

        expect(nodekit).toBeDefined();
    });
});
