import axios, {AxiosError} from 'axios';

import {prepareHttpClient} from '../../lib/telemetry/http';
import {flushAll, makeFakeCtx} from './helpers';

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
    err.config = {headers: {Authorization: 'Bearer secret-token'}} as AxiosError['config'];
    err.response = {
        status,
        statusText: 'x',
        headers: {},
        config: err.config as AxiosError['config'],
        data: {},
    } as AxiosError['response'];
    return err;
}

describe('telemetry/http', () => {
    afterEach(() => {
        jest.resetAllMocks();
    });

    test('returns a no-op client when URL is not configured', () => {
        const ctx = makeFakeCtx();
        const client = prepareHttpClient(ctx);
        client.sendStats({a: 1});
        expect(axiosMock.create).not.toHaveBeenCalled();
    });

    test('sends a batch as JSON POST with table header', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {}});

        const ctx = makeFakeCtx({
            appTelemetryHttpUrl: 'http://collector.local/write',
            appTelemetryHttpBatchSize: 100,
            appTelemetryHttpSendInterval: 1000000,
            appTelemetryHttpHeaders: {'X-Project': 'p1'},
        });
        const client = prepareHttpClient(ctx);

        for (let i = 0; i < 5; i++) {
            client.sendStats({i});
        }

        await client.flush();

        expect(instance.post).toHaveBeenCalledTimes(1);
        const [url, body, options] = instance.post.mock.calls[0];
        expect(url).toBe('http://collector.local/write');
        expect(Array.isArray(body)).toBe(true);
        expect(body).toHaveLength(5);
        expect(options.headers['Content-Type']).toBe('application/json');
        expect(options.headers['X-Project']).toBe('p1');
        expect(options.headers['X-Telemetry-Table']).toBe('apiRequests');
        expect(body[0]._table).toBe('apiRequests');
        expect(typeof body[0].host).toBe('string');
        expect(typeof body[0].timestamp).toBe('number');

        await client.shutdown();
    });

    test('splits oversized payloads into multiple POST requests by batchSize', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {}});

        const ctx = makeFakeCtx({
            appTelemetryHttpUrl: 'http://collector.local/write',
            appTelemetryHttpBatchSize: 50,
            appTelemetryHttpSendInterval: 1000000,
            appTelemetryHttpBacklogSize: 1000,
        });
        const client = prepareHttpClient(ctx);

        for (let i = 0; i < 120; i++) {
            client.sendStats('customTable', {i});
        }

        await client.flush();

        expect(instance.post).toHaveBeenCalledTimes(3);
        const totalLength = instance.post.mock.calls.reduce(
            (acc, [, body]) => acc + (body as unknown[]).length,
            0,
        );
        expect(totalLength).toBe(120);

        const metrics = client.getMetrics();
        expect(metrics.sent).toBe(120);

        await client.shutdown();
    });

    test('routes different tables through separate header values', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {}});

        const ctx = makeFakeCtx({
            appTelemetryHttpUrl: 'http://collector.local/write',
            appTelemetryHttpSendInterval: 1000000,
        });
        const client = prepareHttpClient(ctx);

        client.sendStats('t1', {a: 1});
        client.sendStats('t2', {b: 2});

        await client.flush();

        expect(instance.post).toHaveBeenCalledTimes(2);
        const tables = instance.post.mock.calls.map(
            ([, , options]) => options.headers['X-Telemetry-Table'],
        );
        expect(tables.sort()).toEqual(['t1', 't2']);

        await client.shutdown();
    });

    test('drops batch on terminal 4xx and does not requeue', async () => {
        const instance = setupAxios();
        instance.post.mockRejectedValue(makeAxiosError(400));

        const ctx = makeFakeCtx({
            appTelemetryHttpUrl: 'http://collector.local/write',
            appTelemetryHttpSendInterval: 1000000,
        });
        const client = prepareHttpClient(ctx);

        client.sendStats({i: 1});
        await client.flush();

        // first call only — batch is swallowed
        expect(instance.post).toHaveBeenCalledTimes(1);
        expect(ctx.logError).toHaveBeenCalledWith(
            expect.stringContaining('terminal 4xx'),
            expect.anything(),
            expect.objectContaining({status: 400}),
        );
        expect(client.getMetrics().backlogSize).toBe(0);

        await client.shutdown();
    });

    test('retries on 5xx and succeeds eventually', async () => {
        const instance = setupAxios();
        instance.post
            .mockRejectedValueOnce(makeAxiosError(503))
            .mockResolvedValueOnce({status: 200, data: {}});

        const ctx = makeFakeCtx({
            appTelemetryHttpUrl: 'http://collector.local/write',
            appTelemetryHttpSendInterval: 1000000,
        });
        const client = prepareHttpClient(ctx);

        client.sendStats({i: 1});
        await client.flush();

        expect(instance.post).toHaveBeenCalledTimes(2);
        expect(client.getMetrics().sent).toBe(1);

        await client.shutdown();
    });

    test('drops oldest events when backlog overflows', async () => {
        const instance = setupAxios();
        // hold the request so the backlog can fill up
        let resolveHold: () => void = () => {};
        instance.post.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveHold = () => resolve({status: 200, data: {}});
                }),
        );

        const ctx = makeFakeCtx({
            appTelemetryHttpUrl: 'http://collector.local/write',
            appTelemetryHttpBatchSize: 10,
            appTelemetryHttpBacklogSize: 20,
            appTelemetryHttpSendInterval: 1000000,
        });
        const client = prepareHttpClient(ctx);

        for (let i = 0; i < 100; i++) {
            client.sendStats({i});
        }

        await flushAll();
        expect(client.getMetrics().dropped).toBeGreaterThanOrEqual(80);
        expect(client.getMetrics().backlogSize).toBeLessThanOrEqual(20);

        resolveHold();
        await flushAll();
    });

    test('does not leak auth headers into error logs', async () => {
        const instance = setupAxios();
        instance.post.mockRejectedValue(makeAxiosError(400));

        const ctx = makeFakeCtx({
            appTelemetryHttpUrl: 'http://collector.local/write',
            appTelemetryHttpSendInterval: 1000000,
            appTelemetryHttpHeaders: {Authorization: 'Bearer top-secret'},
        });
        const client = prepareHttpClient(ctx);

        client.sendStats({i: 1});
        await client.flush();

        const errStr = JSON.stringify(ctx.logError.mock.calls);
        expect(errStr).not.toContain('top-secret');
        expect(errStr).not.toContain('secret-token');

        await client.shutdown();
    });

    test('sendStats never throws on bad input', () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {}});

        const ctx = makeFakeCtx({appTelemetryHttpUrl: 'http://collector.local/write'});
        const client = prepareHttpClient(ctx);

        expect(() => client.sendStats(null as unknown as object)).not.toThrow();
        expect(() => client.sendStats('', {a: 1})).not.toThrow();
        const cyclic: Record<string, unknown> = {a: 1};
        cyclic.self = cyclic;
        expect(() => client.sendStats('t', {cyclic, big: BigInt(10)})).not.toThrow();
    });

    test('flush drains the queue', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {}});

        const ctx = makeFakeCtx({
            appTelemetryHttpUrl: 'http://collector.local/write',
            appTelemetryHttpBatchSize: 3,
            appTelemetryHttpSendInterval: 1000000,
        });
        const client = prepareHttpClient(ctx);

        for (let i = 0; i < 10; i++) {
            client.sendStats({i});
        }

        await client.flush();
        expect(client.getMetrics().sent).toBe(10);
        expect(client.getMetrics().backlogSize).toBe(0);
    });
});
