import axios, {AxiosError} from 'axios';

import {
    chunkRecords,
    computePartitionKey,
    prepareKinesisClient,
    prepareRecord,
    signSigV4,
} from '../../lib/telemetry/kinesis';
import {makeFakeCtx} from './helpers';

jest.mock('axios');

interface MockAxiosInstance {
    post: jest.Mock;
}

const axiosMock = axios as unknown as jest.Mocked<typeof axios>;

function setupAxios(): MockAxiosInstance {
    const instance: MockAxiosInstance = {post: jest.fn()};
    axiosMock.create = jest.fn(() => instance as unknown as ReturnType<typeof axios.create>);
    return instance;
}

function makeAxiosError(status: number): AxiosError {
    const err = new Error(`status ${status}`) as AxiosError;
    err.config = {
        headers: {Authorization: 'Bearer secret-token'},
    } as AxiosError['config'];
    err.response = {
        status,
        statusText: 'x',
        headers: {},
        config: err.config as AxiosError['config'],
        data: {},
    } as AxiosError['response'];
    return err;
}

describe('telemetry/kinesis pure helpers', () => {
    describe('computePartitionKey', () => {
        test('prefers requestId', () => {
            expect(computePartitionKey({requestId: 'r1', traceId: 't1'})).toBe('r1');
        });
        test('falls back to traceId', () => {
            expect(computePartitionKey({traceId: 't1'})).toBe('t1');
        });
        test('falls back to deterministic hash of payload', () => {
            const a = computePartitionKey({a: 1, b: 2});
            const b = computePartitionKey({a: 1, b: 2});
            expect(a).toBe(b);
            expect(a).toHaveLength(32);
            // different payload → different key
            const c = computePartitionKey({a: 1, b: 3});
            expect(a).not.toBe(c);
        });
    });

    describe('prepareRecord', () => {
        test('encodes Data as base64', () => {
            const prepared = prepareRecord({hello: 'world'}, 1024 * 1024);
            if (prepared === null) {
                throw new Error('expected prepared record');
            }
            const decoded = Buffer.from(prepared.record.Data, 'base64').toString('utf8');
            expect(JSON.parse(decoded)).toEqual({hello: 'world'});
        });

        test('returns null when payload exceeds limit', () => {
            const big = {payload: 'x'.repeat(2000)};
            expect(prepareRecord(big, 1000)).toBeNull();
        });
    });

    describe('chunkRecords', () => {
        test('splits by record count', () => {
            const items = Array.from({length: 1200}, (_, i) => ({
                record: {Data: '', PartitionKey: `p${i}`},
                sizeBytes: 100,
            }));
            const chunks = chunkRecords(items, 500, 10 * 1024 * 1024);
            expect(chunks).toHaveLength(3);
            expect(chunks[0]).toHaveLength(500);
            expect(chunks[1]).toHaveLength(500);
            expect(chunks[2]).toHaveLength(200);
        });

        test('splits by request size', () => {
            const items = Array.from({length: 10}, (_, i) => ({
                record: {Data: '', PartitionKey: `p${i}`},
                sizeBytes: 600_000,
            }));
            const chunks = chunkRecords(items, 500, 1_000_000);
            // each chunk holds only one record since 2 * 600k > 1M
            expect(chunks).toHaveLength(10);
        });
    });

    describe('signSigV4', () => {
        test('produces deterministic Authorization header for fixed input', () => {
            const headers = signSigV4({
                method: 'POST',
                host: 'kinesis.example.com',
                path: '/',
                region: 'ru-central1',
                service: 'kinesis',
                accessKeyId: 'AKID',
                secretAccessKey: 'SECRET',
                target: 'Kinesis_20131202.PutRecords',
                body: '{}',
                now: new Date('2024-01-02T03:04:05.000Z'),
            });
            expect(headers['X-Amz-Date']).toBe('20240102T030405Z');
            expect(headers['X-Amz-Target']).toBe('Kinesis_20131202.PutRecords');
            expect(headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\//);
            expect(headers.Authorization).toContain('20240102/ru-central1/kinesis/aws4_request');
            // recomputing yields the same signature
            const headers2 = signSigV4({
                method: 'POST',
                host: 'kinesis.example.com',
                path: '/',
                region: 'ru-central1',
                service: 'kinesis',
                accessKeyId: 'AKID',
                secretAccessKey: 'SECRET',
                target: 'Kinesis_20131202.PutRecords',
                body: '{}',
                now: new Date('2024-01-02T03:04:05.000Z'),
            });
            expect(headers).toEqual(headers2);
        });

        test('includes session token when provided', () => {
            const headers = signSigV4({
                method: 'POST',
                host: 'h',
                path: '/',
                region: 'r',
                service: 'kinesis',
                accessKeyId: 'AKID',
                secretAccessKey: 'SECRET',
                sessionToken: 'sess',
                target: 'T',
                body: '',
            });
            expect(headers['X-Amz-Security-Token']).toBe('sess');
        });
    });
});

describe('telemetry/kinesis client', () => {
    afterEach(() => {
        jest.resetAllMocks();
    });

    function makeConfig(overrides: Record<string, unknown> = {}) {
        return {
            appTelemetryKinesisEndpoint: 'https://kinesis.example.com/',
            appTelemetryKinesisStreamName: 'stream-a',
            appTelemetryKinesisAuth: {type: 'iam' as const, token: 'iam-secret-token'},
            appTelemetryKinesisRegion: 'ru-central1',
            appTelemetryKinesisSendInterval: 1000000,
            appTelemetryKinesisBatchSize: 100,
            ...overrides,
        };
    }

    test('returns no-op when endpoint or stream or auth is missing', () => {
        const ctx = makeFakeCtx();
        prepareKinesisClient(ctx);
        expect(axiosMock.create).not.toHaveBeenCalled();
    });

    test('sends PutRecords request with base64-encoded Data and correct StreamName', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {FailedRecordCount: 0, Records: []}});

        const ctx = makeFakeCtx(makeConfig());
        const client = prepareKinesisClient(ctx);

        client.sendStats({requestId: 'req-1', value: 1});
        client.sendStats({requestId: 'req-2', value: 2});

        await client.flush();

        expect(instance.post).toHaveBeenCalledTimes(1);
        const [url, body] = instance.post.mock.calls[0];
        expect(url).toBe('https://kinesis.example.com/');
        const parsed = JSON.parse(body as string);
        expect(parsed.StreamName).toBe('stream-a');
        expect(parsed.Records).toHaveLength(2);
        const decoded = Buffer.from(parsed.Records[0].Data, 'base64').toString('utf8');
        expect(JSON.parse(decoded)).toMatchObject({requestId: 'req-1', value: 1});
        expect(parsed.Records[0].PartitionKey).toBe('req-1');

        await client.shutdown();
    });

    test('uses Bearer auth header for iam auth type', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {}});

        const ctx = makeFakeCtx(makeConfig());
        const client = prepareKinesisClient(ctx);
        client.sendStats({x: 1});
        await client.flush();

        const [, , options] = instance.post.mock.calls[0];
        expect(options.headers.Authorization).toBe('Bearer iam-secret-token');
        expect(options.headers['X-Amz-Target']).toBe('Kinesis_20131202.PutRecords');

        await client.shutdown();
    });

    test('uses SigV4 signing for sigv4 auth type', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {}});

        const ctx = makeFakeCtx(
            makeConfig({
                appTelemetryKinesisAuth: {
                    type: 'sigv4',
                    accessKeyId: 'AKID',
                    secretAccessKey: 'SECRET',
                },
            }),
        );
        const client = prepareKinesisClient(ctx);
        client.sendStats({x: 1});
        await client.flush();

        const [, , options] = instance.post.mock.calls[0];
        expect(options.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\//);

        await client.shutdown();
    });

    test('retries only failed records on partial failure', async () => {
        const instance = setupAxios();
        instance.post
            .mockResolvedValueOnce({
                status: 200,
                data: {
                    FailedRecordCount: 1,
                    Records: [
                        {SequenceNumber: 's0', ShardId: 'sh0'},
                        {ErrorCode: 'ProvisionedThroughputExceededException'},
                        {SequenceNumber: 's2', ShardId: 'sh0'},
                    ],
                },
            })
            .mockResolvedValueOnce({
                status: 200,
                data: {FailedRecordCount: 0, Records: [{SequenceNumber: 's1'}]},
            });

        const ctx = makeFakeCtx(makeConfig());
        const client = prepareKinesisClient(ctx);
        client.sendStats({requestId: 'r0'});
        client.sendStats({requestId: 'r1'});
        client.sendStats({requestId: 'r2'});

        await client.flush();

        expect(instance.post).toHaveBeenCalledTimes(2);
        const second = JSON.parse(instance.post.mock.calls[1][1] as string);
        expect(second.Records).toHaveLength(1);
        expect(second.Records[0].PartitionKey).toBe('r1');

        await client.shutdown();
    });

    test('drops oversized records and reports via logError', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {}});

        const ctx = makeFakeCtx(makeConfig({appTelemetryKinesisMaxRecordSizeBytes: 200}));
        const client = prepareKinesisClient(ctx);
        client.sendStats({small: 1});
        client.sendStats({big: 'x'.repeat(500)});

        await client.flush();

        expect(instance.post).toHaveBeenCalledTimes(1);
        const parsed = JSON.parse(instance.post.mock.calls[0][1] as string);
        expect(parsed.Records).toHaveLength(1);
        expect(ctx.logError).toHaveBeenCalledWith(
            expect.stringContaining('exceeds size limit'),
            null,
            expect.objectContaining({limit: 200}),
        );

        await client.shutdown();
    });

    test('redacts auth secrets in axios errors', async () => {
        const instance = setupAxios();
        instance.post.mockRejectedValue(makeAxiosError(401));

        const ctx = makeFakeCtx(makeConfig());
        const client = prepareKinesisClient(ctx);
        client.sendStats({x: 1});

        // wait for one round of retries to flush through logError calls
        await new Promise((r) => setTimeout(r, 50));

        const errStr = JSON.stringify(ctx.logError.mock.calls);
        expect(errStr).not.toContain('secret-token');
        expect(errStr).not.toContain('iam-secret-token');

        await client.shutdown();
    });

    test('iam-provider auth fetches token via callback', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {}});
        const getToken = jest.fn().mockResolvedValue('dynamic-token');

        const ctx = makeFakeCtx(
            makeConfig({
                appTelemetryKinesisAuth: {type: 'iam-provider', getToken},
            }),
        );
        const client = prepareKinesisClient(ctx);
        client.sendStats({x: 1});
        await client.flush();

        expect(getToken).toHaveBeenCalled();
        const [, , options] = instance.post.mock.calls[0];
        expect(options.headers.Authorization).toBe('Bearer dynamic-token');

        await client.shutdown();
    });

    test('sendStats does not throw on bad input', () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {}});

        const ctx = makeFakeCtx(makeConfig());
        const client = prepareKinesisClient(ctx);

        expect(() => client.sendStats(null as unknown as object)).not.toThrow();
        const cyclic: Record<string, unknown> = {a: 1};
        cyclic.self = cyclic;
        expect(() =>
            client.sendStats('t', {cyclic, big: BigInt(10), sym: Symbol('s')}),
        ).not.toThrow();
    });

    test('invalid endpoint URL falls back to no-op client', () => {
        const ctx = makeFakeCtx(makeConfig({appTelemetryKinesisEndpoint: 'not a valid url'}));
        prepareKinesisClient(ctx);
        const calls = ctx.logError.mock.calls.flat().map(String).join(' ');
        expect(calls).toContain('invalid endpoint');
        expect(calls).toContain('Invalid URL');
    });
});
