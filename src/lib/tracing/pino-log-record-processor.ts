import {SeverityNumber} from '@opentelemetry/api-logs';
import type {SdkLogRecord} from '@opentelemetry/sdk-logs';

import type {NodeKitLogger} from '../logging';

type PinoLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

function severityTextToLevel(severityText: string | undefined): PinoLevel | undefined {
    const value = severityText?.toLowerCase();
    if (!value) return undefined;
    if (value.startsWith('trace')) return 'trace';
    if (value.startsWith('debug')) return 'debug';
    if (value.startsWith('info')) return 'info';
    if (value.startsWith('warn')) return 'warn';
    if (value.startsWith('error')) return 'error';
    if (value.startsWith('fatal')) return 'error';
    return undefined;
}

function severityToLevel(
    severityNumber: SeverityNumber | undefined,
    severityText: string | undefined,
): PinoLevel {
    // UNSPECIFIED (= 0) and undefined are both falsy — fall back to severityText, then 'info'
    if (!severityNumber) {
        return severityTextToLevel(severityText) ?? 'info';
    }
    if (severityNumber <= SeverityNumber.TRACE4) return 'trace';
    if (severityNumber <= SeverityNumber.DEBUG4) return 'debug';
    if (severityNumber <= SeverityNumber.INFO4) return 'info';
    if (severityNumber <= SeverityNumber.WARN4) return 'warn';
    return 'error';
}

function bodyToString(body: SdkLogRecord['body']): string {
    if (body === undefined || body === null) return '';
    if (typeof body === 'string') return body;
    try {
        if (typeof body === 'object') return JSON.stringify(body);
    } catch {
        return '[Unserializable OTel log body]';
    }
    return String(body);
}

/**
 * LogRecordProcessor that bridges OpenTelemetry Log Records into pino.
 *
 * OTel-instrumented libraries (e.g. @opentelemetry/instrumentation-openai) emit
 * log records via `logger.emit()`. Without a registered LoggerProvider those
 * records are silently dropped. This processor catches every emitted record and
 * writes it to the NodeKit pino logger so all OTel logs appear in the same
 * stdout stream as ctx.log() calls.
 *
 * Each log line includes:
 *  - all attributes from the original LogRecord (e.g. gen_ai.usage.input_tokens)
 *  - `otelScope` – name of the instrumentation library that produced the record
 *  - `traceId` / `spanId` – when the record was emitted inside an active span
 *
 * Note: `otelScope`, `traceId` and `spanId` are written after spreading
 * logRecord.attributes, so they take precedence if the same keys appear in attributes.
 *
 * Note: should be enabled during NodeKit initialization, before any other code
 * initializes an OpenTelemetry LoggerProvider.
 */
export class PinoLogRecordProcessor {
    private readonly logger: NodeKitLogger;

    constructor(logger: NodeKitLogger) {
        this.logger = logger;
    }

    onEmit(logRecord: SdkLogRecord): void {
        const message = bodyToString(logRecord.body) || logRecord.eventName || '';

        const level = severityToLevel(logRecord.severityNumber, logRecord.severityText);

        const extra: Record<string, unknown> = {
            ...logRecord.attributes,
            otelScope: logRecord.instrumentationScope.name,
        };

        if (logRecord.spanContext) {
            extra.traceId = logRecord.spanContext.traceId;
            extra.spanId = logRecord.spanContext.spanId;
        }

        this.logger[level](extra, message);
    }

    forceFlush(): Promise<void> {
        return Promise.resolve();
    }

    shutdown(): Promise<void> {
        return Promise.resolve();
    }
}
