import axios from 'axios';

import {prepareClickHouseClient} from '../../lib/telemetry/clickhouse';
import type {TelemetryClient} from '../../lib/telemetry/common';
import {prepareHttpClient} from '../../lib/telemetry/http';
import {prepareKinesisClient} from '../../lib/telemetry/kinesis';
import {prepareLogsClient} from '../../lib/telemetry/logs';
import type {AppConfig} from '../../types';
import {FakeCtx, makeFakeCtx} from './helpers';

jest.mock('axios');

const axiosMock = axios as unknown as jest.Mocked<typeof axios>;

function setupAxios() {
    const instance = {post: jest.fn().mockResolvedValue({status: 200, data: {}})};
    axiosMock.create = jest.fn(() => instance as unknown as ReturnType<typeof axios.create>);
    return instance;
}

interface AdapterCase {
    name: string;
    factory: (ctx: FakeCtx) => TelemetryClient;
    activeConfig: AppConfig;
    emptyConfig: AppConfig;
}

const cases: AdapterCase[] = [
    {
        name: 'clickhouse',
        factory: prepareClickHouseClient,
        activeConfig: {
            appTelemetryChHost: 'ch.example.com',
            appTelemetryChAuth: 'user:password',
            appTelemetryChDatabase: 'analytics',
            appTelemetryChSendInterval: 1000000,
        },
        emptyConfig: {},
    },
    {
        name: 'http',
        factory: prepareHttpClient,
        activeConfig: {
            appTelemetryHttpUrl: 'http://collector.local/write',
            appTelemetryHttpSendInterval: 1000000,
        },
        emptyConfig: {},
    },
    {
        name: 'kinesis',
        factory: prepareKinesisClient,
        activeConfig: {
            appTelemetryKinesisEndpoint: 'https://kinesis.example.com/',
            appTelemetryKinesisStreamName: 'stream',
            appTelemetryKinesisAuth: {type: 'iam', token: 'tok'},
            appTelemetryKinesisSendInterval: 1000000,
        },
        emptyConfig: {},
    },
    {
        name: 'logs',
        factory: prepareLogsClient,
        activeConfig: {appTelemetryLogsEnabled: true},
        emptyConfig: {appTelemetryLogsEnabled: false},
    },
];

describe.each(cases)('telemetry contract: $name', ({factory, activeConfig, emptyConfig}) => {
    beforeEach(() => {
        setupAxios();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    test('factory returns a TelemetryClient shape', () => {
        const ctx = makeFakeCtx(activeConfig);
        const client = factory(ctx);
        expect(typeof client.sendStats).toBe('function');
        expect(typeof client.flush).toBe('function');
        expect(typeof client.shutdown).toBe('function');
        expect(typeof client.getMetrics).toBe('function');
    });

    test('factory returns a no-op (no I/O) when configuration is empty/disabled', () => {
        const ctx = makeFakeCtx(emptyConfig);
        const client = factory(ctx);
        client.sendStats({a: 1});
        client.sendStats('customTable', {b: 2});
        // empty config must not produce any actual delivery
        expect(client.getMetrics().sent).toBe(0);
    });

    test('sendStats supports both signatures (data) and (tableName, data)', async () => {
        const ctx = makeFakeCtx(activeConfig);
        const client = factory(ctx);

        expect(() => client.sendStats({service: 's', action: 'a'})).not.toThrow();
        expect(() => client.sendStats('apiRequests', {service: 's2', action: 'a2'})).not.toThrow();

        await client.flush();
    });

    test('sendStats never throws on bad input', () => {
        const ctx = makeFakeCtx(activeConfig);
        const client = factory(ctx);

        expect(() => client.sendStats(null as unknown as object)).not.toThrow();
        expect(() => client.sendStats(undefined as unknown as object)).not.toThrow();
        expect(() => client.sendStats('', {a: 1})).not.toThrow();
        expect(() => client.sendStats('t', null as unknown as object)).not.toThrow();
        const cyclic: Record<string, unknown> = {a: 1};
        cyclic.self = cyclic;
        expect(() =>
            client.sendStats('t', {cyclic, big: BigInt(7), sym: Symbol('z'), fn: () => 1}),
        ).not.toThrow();
    });

    test('flush and shutdown resolve without errors', async () => {
        const ctx = makeFakeCtx(activeConfig);
        const client = factory(ctx);
        client.sendStats({a: 1});
        await expect(client.flush()).resolves.toBeUndefined();
        await expect(client.shutdown()).resolves.toBeUndefined();
    });

    test('getMetrics returns sent/failed/dropped/backlogSize numeric fields', () => {
        const ctx = makeFakeCtx(activeConfig);
        const client = factory(ctx);
        const m = client.getMetrics();
        expect(typeof m.sent).toBe('number');
        expect(typeof m.failed).toBe('number');
        expect(typeof m.dropped).toBe('number');
        expect(typeof m.backlogSize).toBe('number');
    });
});
