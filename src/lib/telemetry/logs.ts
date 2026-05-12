import os from 'os';

import type {AppContext} from '../context';
import {DEFAULT_TABLE_NAME, TelemetryClient, createNoopClient} from './common';

const RESERVED_KEYS = new Set(['_telemetry', '_telemetry_type', '_telemetry_table']);

// Telemetry adapter that writes events to the application logger with a well-known marker.
// Actual delivery to storage is handled by the log collection infrastructure (stdout / journald /
// file collector forwarding marked records to downstream sinks).
export function prepareLogsClient(
    ctx: Pick<AppContext, 'config' | 'log' | 'logError'>,
): TelemetryClient {
    const {config} = ctx;

    if (config.appTelemetryLogsEnabled === false) {
        return createNoopClient();
    }

    const sampleRate = clamp(config.appTelemetryLogsSampleRate ?? 1, 0, 1);
    const namespace = config.appTelemetryLogsNamespace || 'telemetry';
    const random = config.appTelemetryLogsRandom || Math.random;

    const metrics = {sent: 0, failed: 0, dropped: 0, backlogSize: 0};

    function sendStats(arg1: string | object, arg2?: object): void {
        try {
            let tableName: string;
            let data: object;
            if (arg2 === undefined) {
                tableName = DEFAULT_TABLE_NAME;
                data = arg1 as object;
            } else {
                tableName = arg1 as string;
                data = arg2;
            }
            if (typeof tableName !== 'string' || !tableName) {
                ctx.logError('NodeKit Telemetry [logs]: invalid table name');
                return;
            }
            if (data === null || typeof data !== 'object') {
                ctx.logError('NodeKit Telemetry [logs]: invalid data payload');
                return;
            }

            // sampling: cheap to short-circuit before building the payload
            if (sampleRate < 1 && random() >= sampleRate) {
                metrics.dropped += 1;
                return;
            }

            // strip reserved keys from user data so they cannot overwrite the marker
            const cleanData: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
                if (!RESERVED_KEYS.has(k)) {
                    cleanData[k] = v;
                }
            }

            // nest user data under a namespace to avoid collisions with other log fields
            const record = {
                _telemetry: true,
                _telemetry_type: tableName === DEFAULT_TABLE_NAME ? 'api_request' : 'custom',
                _telemetry_table: tableName,
                [namespace]:
                    tableName === DEFAULT_TABLE_NAME
                        ? {host: os.hostname(), timestamp: Date.now(), ...cleanData}
                        : cleanData,
            };

            ctx.log('nodekit-telemetry-stats', record);
            metrics.sent += 1;
        } catch (e) {
            metrics.failed += 1;
            try {
                ctx.logError('NodeKit Telemetry [logs]: sendStats failure', e as Error);
            } catch (_e) {
                // sendStats must never throw
            }
        }
    }

    return {
        sendStats: sendStats as TelemetryClient['sendStats'],
        flush: async () => {},
        shutdown: async () => {},
        getMetrics: () => ({...metrics}),
    };
}

function clamp(v: number, min: number, max: number): number {
    if (Number.isNaN(v)) return max;
    return Math.min(Math.max(v, min), max);
}
