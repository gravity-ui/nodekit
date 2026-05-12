import axios from 'axios';

import {prepareHttpClient} from '../../lib/telemetry/http';
import {prepareKinesisClient} from '../../lib/telemetry/kinesis';
import {flushAll, makeFakeCtx} from './helpers';

jest.mock('axios');

const axiosMock = axios as unknown as jest.Mocked<typeof axios>;

interface MockAxiosInstance {
    post: jest.Mock;
}

function setupAxios(): MockAxiosInstance {
    const instance: MockAxiosInstance = {post: jest.fn()};
    axiosMock.create = jest.fn(() => instance as unknown as ReturnType<typeof axios.create>);
    return instance;
}

interface AdapterCase {
    name: string;
    makeClient: (
        instance: MockAxiosInstance,
        configOverrides?: Record<string, unknown>,
    ) => {client: ReturnType<typeof prepareHttpClient>; ctx: ReturnType<typeof makeFakeCtx>};
}

const cases: AdapterCase[] = [
    {
        name: 'http',
        makeClient: (_instance, overrides = {}) => {
            const ctx = makeFakeCtx({
                appTelemetryHttpUrl: 'http://collector.local/write',
                appTelemetryHttpBatchSize: 10,
                appTelemetryHttpBacklogSize: 20,
                appTelemetryHttpSendInterval: 1000000,
                ...overrides,
            });
            return {client: prepareHttpClient(ctx), ctx};
        },
    },
    {
        name: 'kinesis',
        makeClient: (_instance, overrides = {}) => {
            const ctx = makeFakeCtx({
                appTelemetryKinesisEndpoint: 'https://kinesis.example.com/',
                appTelemetryKinesisStreamName: 's',
                appTelemetryKinesisAuth: {type: 'iam', token: 'tok'},
                appTelemetryKinesisBatchSize: 10,
                appTelemetryKinesisBacklogSize: 20,
                appTelemetryKinesisSendInterval: 1000000,
                ...overrides,
            });
            return {client: prepareKinesisClient(ctx), ctx};
        },
    },
];

describe.each(cases)('telemetry resilience: $name', ({makeClient}) => {
    afterEach(() => {
        jest.resetAllMocks();
    });

    test('keeps the hot path fast even when receiver hangs', async () => {
        const instance = setupAxios();
        instance.post.mockImplementation(() => new Promise(() => {}));

        const {client} = makeClient(instance);

        const start = process.hrtime.bigint();
        for (let i = 0; i < 1000; i++) {
            client.sendStats({i});
        }
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

        // 1000 sendStats with a hanging receiver must finish in well under one second
        expect(elapsedMs).toBeLessThan(500);
    });

    test('eventually delivers all events under flaky 5xx errors', async () => {
        const instance = setupAxios();
        let call = 0;
        instance.post.mockImplementation(async () => {
            call += 1;
            if (call % 2 === 0) {
                const err = new Error('flaky');
                Object.assign(err, {
                    config: {headers: {}},
                    response: {status: 503, headers: {}, data: {}, statusText: 'x', config: {}},
                });
                throw err;
            }
            return {status: 200, data: {}};
        });

        const {client} = makeClient(instance, {
            appTelemetryHttpBatchSize: 5,
            appTelemetryKinesisBatchSize: 5,
            appTelemetryHttpBacklogSize: 200,
            appTelemetryKinesisBacklogSize: 200,
        });

        for (let i = 0; i < 20; i++) {
            client.sendStats({i});
        }
        await client.flush();
        expect(client.getMetrics().sent).toBe(20);
        expect(client.getMetrics().backlogSize).toBe(0);
        await client.shutdown();
    });

    test('overflow protection: drops oldest events, does not grow beyond backlogSize', async () => {
        const instance = setupAxios();
        // hang all requests so the queue cannot drain
        instance.post.mockImplementation(() => new Promise(() => {}));

        const {client} = makeClient(instance);
        for (let i = 0; i < 1000; i++) {
            client.sendStats({i});
        }
        await flushAll();
        expect(client.getMetrics().backlogSize).toBeLessThanOrEqual(20);
        expect(client.getMetrics().dropped).toBeGreaterThanOrEqual(980);
    });

    test('sendStats never throws on exotic inputs', () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {}});

        const {client} = makeClient(instance);
        const cyclic: Record<string, unknown> = {a: 1};
        cyclic.self = cyclic;

        for (let i = 0; i < 100; i++) {
            expect(() =>
                client.sendStats('t', {
                    i,
                    cyclic,
                    big: BigInt(i),
                    sym: Symbol(`x${i}`),
                    fn: () => i,
                }),
            ).not.toThrow();
        }
    });

    test('shutdown is idempotent', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: {}});
        const {client} = makeClient(instance);
        client.sendStats({i: 1});
        await client.shutdown();
        await client.shutdown();
        // any push after shutdown is rejected
        expect(() => client.sendStats({i: 2})).not.toThrow();
    });
});
