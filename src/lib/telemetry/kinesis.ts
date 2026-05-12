import crypto from 'crypto';
import https from 'https';
import os from 'os';

import axios, {AxiosError, AxiosInstance} from 'axios';

import {TelemetryKinesisAuthConfig} from '../../types';
import type {AppContext} from '../context';

import {
    DEFAULT_TABLE_NAME,
    TELEMETRY_DEFAULTS,
    TelemetryClient,
    createNoopClient,
    prepareManagedQueue,
    redactAxiosError,
    safeStringify,
} from './common';

const DEFAULT_MAX_RECORDS_PER_REQUEST = 500;
const DEFAULT_MAX_REQUEST_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_RECORD_SIZE_BYTES = 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT = 10000;
const DEFAULT_KINESIS_REGION = 'us-east-1';
const PUT_RECORDS_TARGET = 'Kinesis_20131202.PutRecords';
const KINESIS_SERVICE = 'kinesis';
const PARTIAL_RETRY_ATTEMPTS = 3;

interface KinesisRecordRequest {
    Data: string;
    PartitionKey: string;
}

interface PutRecordsResponseEntry {
    SequenceNumber?: string;
    ShardId?: string;
    ErrorCode?: string;
    ErrorMessage?: string;
}

interface PutRecordsResponse {
    FailedRecordCount?: number;
    Records?: PutRecordsResponseEntry[];
}

interface PreparedRecord {
    record: KinesisRecordRequest;
    sizeBytes: number;
}

function sha256Hex(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
    return crypto.createHmac('sha256', key).update(data).digest();
}

export function computePartitionKey(data: Record<string, unknown>): string {
    const candidate =
        (typeof data.requestId === 'string' && data.requestId) ||
        (typeof data.traceId === 'string' && data.traceId) ||
        '';
    if (candidate) {
        return candidate;
    }
    return sha256Hex(safeStringify(data) || '').slice(0, 32);
}

interface SigV4Input {
    method: string;
    host: string;
    path: string;
    region: string;
    service: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    target: string;
    body: string;
    now?: Date;
}

export function signSigV4(input: SigV4Input): Record<string, string> {
    const now = input.now ?? new Date();
    const amzDate =
        now
            .toISOString()
            .replace(/[:-]/g, '')
            .replace(/\.\d{3}/, '')
            .slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);

    const canonicalHeaders =
        `content-type:application/x-amz-json-1.1\n` +
        `host:${input.host}\n` +
        `x-amz-date:${amzDate}\n` +
        `x-amz-target:${input.target}\n`;
    const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
    const payloadHash = sha256Hex(input.body);

    const canonicalRequest = [
        input.method,
        input.path,
        '',
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate = hmac('AWS4' + input.secretAccessKey, dateStamp);
    const kRegion = hmac(kDate, input.region);
    const kService = hmac(kRegion, input.service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization =
        `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Date': amzDate,
        'X-Amz-Target': input.target,
        Authorization: authorization,
    };
    if (input.sessionToken) {
        headers['X-Amz-Security-Token'] = input.sessionToken;
    }
    return headers;
}

export function prepareRecord(
    data: Record<string, unknown>,
    maxRecordSizeBytes: number,
): PreparedRecord | null {
    const json = safeStringify(data);
    const dataBuf = Buffer.from(json, 'utf8');
    if (dataBuf.length > maxRecordSizeBytes) {
        return null;
    }
    const partitionKey = computePartitionKey(data);
    const record: KinesisRecordRequest = {
        Data: dataBuf.toString('base64'),
        PartitionKey: partitionKey,
    };
    const sizeBytes =
        Buffer.byteLength(record.Data, 'utf8') +
        Buffer.byteLength(record.PartitionKey, 'utf8') +
        32;
    return {record, sizeBytes};
}

export function chunkRecords(
    records: PreparedRecord[],
    maxRecordsPerRequest: number,
    maxRequestSizeBytes: number,
): KinesisRecordRequest[][] {
    const chunks: KinesisRecordRequest[][] = [];
    let current: KinesisRecordRequest[] = [];
    let currentSize = 0;
    for (const item of records) {
        if (
            current.length >= maxRecordsPerRequest ||
            currentSize + item.sizeBytes > maxRequestSizeBytes
        ) {
            if (current.length > 0) {
                chunks.push(current);
            }
            current = [];
            currentSize = 0;
        }
        current.push(item.record);
        currentSize += item.sizeBytes;
    }
    if (current.length > 0) {
        chunks.push(current);
    }
    return chunks;
}

async function resolveAuthHeaders(
    auth: TelemetryKinesisAuthConfig,
    sigv4Args: Omit<SigV4Input, 'accessKeyId' | 'secretAccessKey' | 'sessionToken'>,
): Promise<Record<string, string>> {
    if (auth.type === 'iam') {
        return {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': sigv4Args.target,
            Authorization: `Bearer ${auth.token}`,
        };
    }
    if (auth.type === 'iam-provider') {
        const token = await auth.getToken();
        return {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': sigv4Args.target,
            Authorization: `Bearer ${token}`,
        };
    }
    return signSigV4({
        ...sigv4Args,
        accessKeyId: auth.accessKeyId,
        secretAccessKey: auth.secretAccessKey,
        sessionToken: auth.sessionToken,
    });
}

// Kinesis adapter for telemetry. Sends events to any Kinesis-compatible API endpoint via
// PutRecords. Records are batched, base64-encoded and signed with either SigV4 or Bearer
// token auth, depending on the configured credentials.
export function prepareKinesisClient(
    ctx: Pick<AppContext, 'config' | 'log' | 'logError'>,
): TelemetryClient {
    const {config} = ctx;
    const endpointCfg = config.appTelemetryKinesisEndpoint;
    const streamName = config.appTelemetryKinesisStreamName;
    const authCfg = config.appTelemetryKinesisAuth;
    const region = config.appTelemetryKinesisRegion || DEFAULT_KINESIS_REGION;

    if (!endpointCfg || !streamName || !authCfg) {
        return createNoopClient();
    }

    const endpoint: string = endpointCfg;
    const auth: TelemetryKinesisAuthConfig = authCfg;

    const tickInterval = config.appTelemetryKinesisSendInterval || TELEMETRY_DEFAULTS.tickInterval;
    const batchSize = config.appTelemetryKinesisBatchSize || TELEMETRY_DEFAULTS.batchSize;
    const backlogSize = config.appTelemetryKinesisBacklogSize || TELEMETRY_DEFAULTS.backlogSize;
    const maxRecordsPerRequest =
        config.appTelemetryKinesisMaxRecordsPerRequest || DEFAULT_MAX_RECORDS_PER_REQUEST;
    const maxRequestSizeBytes =
        config.appTelemetryKinesisMaxRequestSizeBytes || DEFAULT_MAX_REQUEST_SIZE_BYTES;
    const maxRecordSizeBytes =
        config.appTelemetryKinesisMaxRecordSizeBytes || DEFAULT_MAX_RECORD_SIZE_BYTES;
    const requestTimeout = config.appTelemetryKinesisRequestTimeout || DEFAULT_REQUEST_TIMEOUT;

    let url: URL;
    try {
        url = new URL(endpoint);
    } catch (e) {
        ctx.logError('NodeKit Telemetry [kinesis]: invalid endpoint', e as Error);
        return createNoopClient();
    }

    const httpsAgent = new https.Agent({keepAlive: true});
    const axiosInstance: AxiosInstance = axios.create({
        httpsAgent,
        timeout: requestTimeout,
        validateStatus: (s) => s >= 200 && s < 300,
    });

    async function putRecords(
        records: KinesisRecordRequest[],
    ): Promise<{retry: KinesisRecordRequest[]}> {
        const body = JSON.stringify({
            StreamName: streamName,
            Records: records,
        });
        const headers = await resolveAuthHeaders(auth, {
            method: 'POST',
            host: url.host,
            path: url.pathname || '/',
            region,
            service: KINESIS_SERVICE,
            target: PUT_RECORDS_TARGET,
            body,
        });

        try {
            const response = await axiosInstance.post<PutRecordsResponse>(endpoint, body, {
                headers,
            });
            const data: PutRecordsResponse = response.data || {};
            if (data.FailedRecordCount && data.Records) {
                const retry: KinesisRecordRequest[] = [];
                data.Records.forEach((entry: PutRecordsResponseEntry, idx: number) => {
                    if (entry.ErrorCode) {
                        retry.push(records[idx]);
                    }
                });
                if (retry.length > 0 && retry.length < records.length) {
                    return {retry};
                }
                if (retry.length === records.length) {
                    throw new Error(`Kinesis PutRecords: all ${retry.length} records failed`);
                }
            }
            return {retry: []};
        } catch (err) {
            const axErr = err as AxiosError;
            redactAxiosError(axErr);
            const status = axErr.response?.status;
            if (status === 401 || status === 403) {
                ctx.logError('NodeKit Telemetry [kinesis]: auth failed, will retry', axErr, {
                    status,
                });
            }
            throw axErr;
        }
    }

    const queue = prepareManagedQueue({
        fn: async (batch: unknown[]) => {
            const prepared: PreparedRecord[] = [];
            for (const event of batch) {
                const data = (
                    event && typeof event === 'object' ? event : {value: event}
                ) as Record<string, unknown>;
                const rec = prepareRecord(data, maxRecordSizeBytes);
                if (!rec) {
                    ctx.logError(
                        'NodeKit Telemetry [kinesis]: record exceeds size limit, dropping',
                        null,
                        {limit: maxRecordSizeBytes},
                    );
                    continue;
                }
                prepared.push(rec);
            }
            if (prepared.length === 0) {
                return;
            }

            const chunks = chunkRecords(prepared, maxRecordsPerRequest, maxRequestSizeBytes);
            for (const chunk of chunks) {
                let toSend = chunk;
                for (
                    let attempt = 0;
                    attempt < PARTIAL_RETRY_ATTEMPTS && toSend.length > 0;
                    attempt++
                ) {
                    const {retry} = await putRecords(toSend);
                    toSend = retry;
                    if (toSend.length > 0) {
                        await new Promise<void>((resolve) =>
                            setTimeout(resolve, 50 * Math.pow(2, attempt)),
                        );
                    }
                }
                if (toSend.length > 0) {
                    throw new Error(
                        `Kinesis PutRecords: ${toSend.length} records still failing after partial retries`,
                    );
                }
            }
        },
        logError: (m, e, extra) => ctx.logError(m, e, extra),
        tickInterval,
        batchSize,
        backlogSize,
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
            if (data === null || typeof data !== 'object') {
                ctx.logError('NodeKit Telemetry [kinesis]: invalid data payload');
                return;
            }
            const enriched =
                tableName === DEFAULT_TABLE_NAME
                    ? {host: os.hostname(), timestamp: Date.now(), _table: tableName, ...data}
                    : {_table: tableName, ...data};

            if (config.appTelemetryKinesisMirrorToLogs) {
                ctx.log('nodekit-telemetry-stats', {tableName, data: enriched});
            }
            queue.push(enriched);
        } catch (e) {
            try {
                ctx.logError('NodeKit Telemetry [kinesis]: sendStats failure', e as Error);
            } catch (_e) {
                // never throw out of sendStats
            }
        }
    }

    return {
        sendStats: sendStats as TelemetryClient['sendStats'],
        flush: () => queue.flush(),
        shutdown: () => queue.shutdown(),
        getMetrics: () => queue.getMetrics(),
    };
}
