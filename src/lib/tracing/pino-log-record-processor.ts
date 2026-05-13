import type {pino} from 'pino';

import {SeverityNumber} from '@opentelemetry/api-logs';
import type {SdkLogRecord} from '@opentelemetry/sdk-logs';

import type {Dict} from '../../types';
import type {NodeKitLogger} from '../logging';
import type {SensitiveKeysRedacter} from '../utils/redact-sensitive-keys';

type PinoLevel = Extract<pino.Level, keyof NodeKitLogger>;

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

function bodyToString(body: SdkLogRecord['body'], redact: SensitiveKeysRedacter): string {
    if (body === undefined || body === null) return '';
    if (typeof body === 'string') return body;
    try {
        if (typeof body === 'object') {
            return JSON.stringify(redact(body as Dict));
        }
    } catch {
        return '[Unserializable OTel log body]';
    }
    return String(body);
}

/**
 * Bridges OTel Log Records emitted by instrumented libraries into pino.
 * See AppConfig.experimentalAppTracingLogsBridge for full documentation.
 */
export class PinoLogRecordProcessor {
    private readonly logger: NodeKitLogger;
    private readonly redact: SensitiveKeysRedacter;

    constructor(logger: NodeKitLogger, redact: SensitiveKeysRedacter) {
        this.logger = logger;
        this.redact = redact;
    }

    onEmit(logRecord: SdkLogRecord): void {
        const message = bodyToString(logRecord.body, this.redact) || logRecord.eventName || '';

        const level = severityToLevel(logRecord.severityNumber, logRecord.severityText);

        const extra: Record<string, unknown> = {
            ...this.redact(logRecord.attributes as Dict),
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
