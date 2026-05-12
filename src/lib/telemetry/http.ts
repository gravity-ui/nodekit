import os from 'os';
import https from 'https';
import http from 'http';

import axios, {AxiosError, AxiosInstance} from 'axios';

import type {AppContext} from '../context';
import {
    DEFAULT_TABLE_NAME,
    TELEMETRY_DEFAULTS,
    TelemetryClient,
    createNoopClient,
    prepareManagedQueue,
    redactAxiosError,
    redactHeaders,
} from './common';

const DEFAULT_TABLE_HEADER = 'X-Telemetry-Table';

// Generic HTTP telemetry adapter. Sends batched events as JSON POST requests to an arbitrary
// HTTP endpoint. The receiver can be any HTTP collector (sidecar agent, edge proxy,
// OpenTelemetry collector, custom receiver) that forwards events to the final storage.
export function prepareHttpClient(
    ctx: Pick<AppContext, 'config' | 'log' | 'logError'>,
): TelemetryClient {
    const {config} = ctx;

    if (!config.appTelemetryHttpUrl) {
        return createNoopClient();
    }

    const url = config.appTelemetryHttpUrl;
    const userHeaders = config.appTelemetryHttpHeaders || {};
    const tableHeader = config.appTelemetryHttpTableHeader || DEFAULT_TABLE_HEADER;

    const tickInterval = config.appTelemetryHttpSendInterval || TELEMETRY_DEFAULTS.tickInterval;
    const batchSize = config.appTelemetryHttpBatchSize || TELEMETRY_DEFAULTS.batchSize;
    const backlogSize = config.appTelemetryHttpBacklogSize || TELEMETRY_DEFAULTS.backlogSize;
    const requestTimeout = config.appTelemetryHttpRequestTimeout ?? 5000;

    const httpsAgent = new https.Agent({keepAlive: true});
    const httpAgent = new http.Agent({keepAlive: true});

    const axiosInstance: AxiosInstance = axios.create({
        httpsAgent,
        httpAgent,
        timeout: requestTimeout,
        // do not treat 5xx as success
        validateStatus: (status) => status >= 200 && status < 300,
    });

    function makeSender(tableName: string) {
        return async function send(batch: unknown[]): Promise<void> {
            const body = batch.map((event) =>
                Object.assign({}, event, {
                    _table: tableName,
                }),
            );

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...userHeaders,
                [tableHeader]: tableName,
            };

            try {
                await axiosInstance.post(url, body, {headers});
            } catch (err) {
                const axErr = err as AxiosError;
                redactAxiosError(axErr);
                // 4xx (except 408 and 429) are terminal, not worth retrying
                const status = axErr.response?.status;
                if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
                    ctx.logError('NodeKit Telemetry [http]: terminal 4xx, dropping batch', axErr, {
                        status,
                        tableName,
                        batchSize: batch.length,
                        headers: redactHeaders(headers),
                    });
                    // swallow: batch is dropped, not requeued
                    return;
                }
                throw axErr;
            }
        };
    }

    // one queue per table so that routing metadata never gets mixed between tables
    const queues: Map<string, ReturnType<typeof prepareManagedQueue>> = new Map();

    function getQueueFor(tableName: string) {
        let q = queues.get(tableName);
        if (!q) {
            q = prepareManagedQueue({
                fn: makeSender(tableName),
                logError: (msg, err, extra) => ctx.logError(msg, err, extra),
                tickInterval,
                batchSize,
                backlogSize,
            });
            queues.set(tableName, q);
        }
        return q;
    }

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
                ctx.logError('NodeKit Telemetry [http]: invalid table name');
                return;
            }
            if (data === null || typeof data !== 'object') {
                ctx.logError('NodeKit Telemetry [http]: invalid data payload');
                return;
            }

            const enriched =
                tableName === DEFAULT_TABLE_NAME
                    ? {host: os.hostname(), timestamp: Date.now(), ...data}
                    : data;

            if (config.appTelemetryHttpMirrorToLogs) {
                ctx.log('nodekit-telemetry-stats', {tableName, data: enriched});
            }

            getQueueFor(tableName).push(enriched);
        } catch (e) {
            try {
                ctx.logError('NodeKit Telemetry [http]: sendStats failure', e as Error);
            } catch (_e) {
                // sendStats must never throw
            }
        }
    }

    async function flush() {
        await Promise.all(Array.from(queues.values()).map((q) => q.flush()));
    }

    async function shutdown() {
        await Promise.all(Array.from(queues.values()).map((q) => q.shutdown()));
    }

    function getMetrics() {
        const result = {sent: 0, failed: 0, dropped: 0, backlogSize: 0};
        for (const q of queues.values()) {
            const m = q.getMetrics();
            result.sent += m.sent;
            result.failed += m.failed;
            result.dropped += m.dropped;
            result.backlogSize += m.backlogSize;
        }
        return result;
    }

    return {sendStats: sendStats as TelemetryClient['sendStats'], flush, shutdown, getMetrics};
}
