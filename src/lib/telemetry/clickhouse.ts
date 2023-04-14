import {TelemetryClickhouseTableDescription, Dict} from '../../types';
import {prepareBatchedQueue, DEFAULT_BACKLOG_SIZE, DEFAULT_BATCH_SIZE} from '../utils/batch';
import https from 'https';
import axios, {AxiosError} from 'axios';
import os from 'os';
import type {AppContext} from '../context';

function escape(input = '') {
    return input.replace(/\\/g, '\\').replace(/'/g, "\\'");
}

interface InsertData {
    [name: string]: number | string;
}

const DEFAULT_TABLE_NAME = 'apiRequests';

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

export function prepareClickhouseClient(ctx: Pick<AppContext, 'config' | 'log' | 'logError'>) {
    const config = ctx.config;

    const credentials = config.appTelemetryChAuth && config.appTelemetryChAuth.split(':');
    const user = credentials && credentials[0];
    const password = credentials && credentials[1];

    const port = config.appTelemetryChPort || 8443;

    const isActive = config.appTelemetryChHost && user && password && config.appTelemetryChDatabase;

    if (!isActive) {
        return () => {};
    }

    const dbName = config.appTelemetryChDatabase;
    const tables = Object.assign({}, DEFAULT_TABLES, config.appTelemetryChTables);

    const batchSize = config.appTelemetryChBatchSize || DEFAULT_BATCH_SIZE;
    const backlogSize = config.appTelemetryChBacklogSize || DEFAULT_BACKLOG_SIZE;

    const httpsAgent = new https.Agent({keepAlive: true});
    const axiosInstance = axios.create({httpsAgent});

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

    function sendBatchToClickhouseTable(tableName: string) {
        const table = tables && tables[tableName];
        if (!table) {
            throw new Error(`NodeKit Telemetry: unknown table name '${tableName}'`);
        }
        const tableColumns = Object.keys(table);

        return function sendBatchToClickhouse(batch: InsertData[]) {
            const insertValues = batch.map((line) => prepareInsertValues(table, line)).join(',');

            const query = `INSERT INTO ${dbName}.${tableName} (${tableColumns.join(
                ',',
            )}) Values ${insertValues}`;

            if (process.env.APP_DEBUG_TELEMETRY_CH) {
                ctx.log('[debug] NodeKit Telemetry: query prepared', {query});
            }

            return axiosInstance.post(`https://${config.appTelemetryChHost}:${port}`, query, {
                params: {
                    query: '',
                    user,
                    password,
                },
            });
        };
    }

    const queues: {[name: string]: {push: Function}} = {};
    Object.keys(tables as object).forEach((tableName: string) => {
        queues[tableName] = prepareBatchedQueue({
            fn: sendBatchToClickhouseTable(tableName),
            logError: (message: string, error?: AxiosError, extra?: Dict) => {
                if (error?.config?.params?.password) {
                    error.config.params.password = '[REDACTED]';
                }
                ctx.logError(message, error, extra);
            },
            backlogSize,
            batchSize,
        });
    });

    function sendStats(inputData: object): void;
    function sendStats(inputTableName: string, inputData: object): void;
    function sendStats(inputTableName: string | object, inputData?: object): void {
        let tableName: string;
        let data: object;
        if (inputData) {
            tableName = inputTableName as string;
            data = inputData;
        } else {
            tableName = DEFAULT_TABLE_NAME;
            data = inputTableName as object;
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
    }

    return sendStats;
}
