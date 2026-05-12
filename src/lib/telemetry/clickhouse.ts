import https from 'https';
import os from 'os';

import axios, {AxiosError, AxiosInstance} from 'axios';

import {TelemetryClickhouseTableDescription} from '../../types';
import type {AppContext} from '../context';

import {
    DEFAULT_TABLE_NAME,
    TELEMETRY_DEFAULTS,
    TelemetryClient,
    createNoopClient,
    prepareManagedQueue,
    redactAxiosError,
} from './common';

function escape(input = '') {
    return input.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

interface InsertData {
    [name: string]: number | string;
}

const DEFAULT_TABLES: Record<string, TelemetryClickhouseTableDescription> = {
    [DEFAULT_TABLE_NAME]: {
        service: 'string',
        action: 'string',
        responseStatus: 'number',
        requestId: 'string',
        requestTime: 'number',
        requestMethod: 'string',
        requestUrl: 'string',
        timestamp: 'timestamp',
        host: 'string',
        responseSize: 'number',
        traceId: 'string',
        userId: 'string',
    },
};

// ClickHouse adapter for telemetry. Sends events via raw HTTPS POST with SQL INSERT statements.
// Built on top of the managed batched queue shared with other adapters.
export function prepareClickHouseClient(
    ctx: Pick<AppContext, 'config' | 'log' | 'logError'>,
): TelemetryClient {
    const {config} = ctx;

    const credentials = config.appTelemetryChAuth && config.appTelemetryChAuth.split(':');
    const user = credentials && credentials[0];
    const password = credentials && credentials[1];

    const port = config.appTelemetryChPort || 8443;

    const isActive = config.appTelemetryChHost && user && password && config.appTelemetryChDatabase;

    if (!isActive) {
        return createNoopClient();
    }

    const dbName = config.appTelemetryChDatabase;
    const tables = Object.assign({}, DEFAULT_TABLES, config.appTelemetryChTables);

    const tickInterval = config.appTelemetryChSendInterval || TELEMETRY_DEFAULTS.tickInterval;
    const batchSize = config.appTelemetryChBatchSize || TELEMETRY_DEFAULTS.batchSize;
    const backlogSize = config.appTelemetryChBacklogSize || TELEMETRY_DEFAULTS.backlogSize;

    const httpsAgent = new https.Agent({keepAlive: true});
    const axiosInstance: AxiosInstance = axios.create({httpsAgent});

    function prepareInsertValues(table: TelemetryClickhouseTableDescription, data: InsertData) {
        const columns = Object.keys(table);

        const values = columns
            .map((columnName) => {
                const columnType = table[columnName];
                if (columnType === 'number') {
                    const numberData = parseFloat(data[columnName] as string);
                    if (isNaN(numberData)) {
                        return 0;
                    } else {
                        return `${numberData}`;
                    }
                } else if (columnType === 'timestamp') {
                    const numberData = parseFloat(data[columnName] as string);
                    if (isNaN(numberData)) {
                        return 0;
                    } else {
                        return `${Math.floor(numberData / 1000)}`;
                    }
                } else if (columnType === 'string') {
                    if (data[columnName]) {
                        return `'${escape(data[columnName].toString())}'`;
                    } else {
                        return "''";
                    }
                } else {
                    return 'incorrect';
                }
            })
            .join(',');

        return `(${values})`;
    }

    function sendBatchToClickHouseTable(tableName: string) {
        const table = tables && tables[tableName];
        if (!table) {
            throw new Error(`NodeKit Telemetry: unknown table name '${tableName}'`);
        }
        const tableColumns = Object.keys(table);

        return async function sendBatchToClickHouse(batch: unknown[]): Promise<void> {
            const typedBatch = batch as InsertData[];
            const insertValues = typedBatch
                .map((line) => prepareInsertValues(table, line))
                .join(',');

            const query = `INSERT INTO ${dbName}.${tableName} (${tableColumns.join(
                ',',
            )}) Values ${insertValues}`;

            if (process.env.APP_DEBUG_TELEMETRY_CH) {
                ctx.log('[debug] NodeKit Telemetry: query prepared', {query});
            }

            try {
                await axiosInstance.post(`https://${config.appTelemetryChHost}:${port}`, query, {
                    params: {
                        query: '',
                        user,
                        password,
                    },
                });
            } catch (err) {
                const axErr = err as AxiosError;
                redactAxiosError(axErr);
                throw axErr;
            }
        };
    }

    const queues: {[name: string]: ReturnType<typeof prepareManagedQueue>} = {};
    Object.keys(tables as object).forEach((tableName: string) => {
        queues[tableName] = prepareManagedQueue({
            fn: sendBatchToClickHouseTable(tableName),
            logError: (message, error, extra) => ctx.logError(message, error, extra),
            tickInterval,
            backlogSize,
            batchSize,
        });
    });

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

            const dataToPush = Object.keys(DEFAULT_TABLES).includes(tableName)
                ? {
                      host: os.hostname(),
                      timestamp: Date.now(),
                      ...data,
                  }
                : data;

            if (config.appTelemetryChMirrorToLogs) {
                ctx.log('nodekit-telemetry-stats', {tableName, data: dataToPush});
            }

            if (queues[tableName]) {
                queues[tableName].push(dataToPush);
            } else {
                ctx.logError(`NodeKit Telemetry: unknown table '${tableName}'`);
            }
        } catch (e) {
            try {
                ctx.logError('NodeKit Telemetry [clickhouse]: sendStats failure', e as Error);
            } catch (_e) {
                // sendStats must never throw
            }
        }
    }

    async function flush(): Promise<void> {
        await Promise.all(Object.values(queues).map((q) => q.flush()));
    }

    async function shutdown(): Promise<void> {
        await Promise.all(Object.values(queues).map((q) => q.shutdown()));
    }

    function getMetrics() {
        const result = {sent: 0, failed: 0, dropped: 0, backlogSize: 0};
        for (const q of Object.values(queues)) {
            const m = q.getMetrics();
            result.sent += m.sent;
            result.failed += m.failed;
            result.dropped += m.dropped;
            result.backlogSize += m.backlogSize;
        }
        return result;
    }

    return {
        sendStats: sendStats as TelemetryClient['sendStats'],
        flush,
        shutdown,
        getMetrics,
    };
}
