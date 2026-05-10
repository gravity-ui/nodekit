import {SeverityNumber} from '@opentelemetry/api-logs';
import type {SdkLogRecord} from '@opentelemetry/sdk-logs';

import type {NodeKitLogger} from '../logging';

type PinoLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

function severityToLevel(severity: SeverityNumber | undefined): PinoLevel {
    if (severity === undefined) return 'info';
    if (severity <= SeverityNumber.TRACE4) return 'trace';
    if (severity <= SeverityNumber.DEBUG4) return 'debug';
    if (severity <= SeverityNumber.INFO4) return 'info';
    if (severity <= SeverityNumber.WARN4) return 'warn';
    return 'error';
}

function bodyToString(body: SdkLogRecord['body']): string {
    if (body === undefined || body === null) return '';
    if (typeof body === 'string') return body;
    if (typeof body === 'object') return JSON.stringify(body);
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
 */
export class PinoLogRecordProcessor {
    constructor(private readonly logger: NodeKitLogger) {}

    onEmit(logRecord: SdkLogRecord): void {
        const message = bodyToString(logRecord.body);
        const level = severityToLevel(logRecord.severityNumber);

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
