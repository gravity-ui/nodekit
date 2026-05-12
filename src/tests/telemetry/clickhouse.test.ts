import axios from 'axios';

import {prepareClickHouseClient} from '../../lib/telemetry/clickhouse';
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

const ACTIVE_CONFIG = {
    appTelemetryChHost: 'clickhouse.example.com',
    appTelemetryChAuth: 'user:secret-password',
    appTelemetryChDatabase: 'analytics',
    appTelemetryChSendInterval: 1000000,
    appTelemetryChBatchSize: 100,
};

describe('telemetry/clickhouse', () => {
    afterEach(() => {
        jest.resetAllMocks();
    });

    test('returns no-op client when required configuration is missing', () => {
        const ctx = makeFakeCtx();
        prepareClickHouseClient(ctx);
        expect(axiosMock.create).not.toHaveBeenCalled();
    });

    test('produces INSERT statement for the default apiRequests table', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: 'Ok'});

        const ctx = makeFakeCtx(ACTIVE_CONFIG);
        const client = prepareClickHouseClient(ctx);

        client.sendStats({
            service: 'svc',
            action: 'act',
            responseStatus: 200,
            requestId: 'r1',
            requestTime: 12.5,
            requestMethod: 'GET',
            requestUrl: '/path',
            responseSize: 100,
            traceId: 'tr1',
            userId: 'u1',
        });

        await client.flush();

        expect(instance.post).toHaveBeenCalledTimes(1);
        const [url, query, options] = instance.post.mock.calls[0];
        expect(url).toBe('https://clickhouse.example.com:8443');
        expect(query).toContain('INSERT INTO analytics.apiRequests');
        expect(query).toContain("'svc'");
        expect(query).toContain("'act'");
        expect(options.params.user).toBe('user');
        expect(options.params.password).toBe('secret-password');

        await client.shutdown();
    });

    test('escapes single quotes and backslashes in string columns', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: 'Ok'});

        const ctx = makeFakeCtx(ACTIVE_CONFIG);
        const client = prepareClickHouseClient(ctx);

        client.sendStats({
            service: "svc with 'quote' and \\backslash",
            action: 'plain',
        });
        await client.flush();

        const [, query] = instance.post.mock.calls[0];
        expect(query).toContain("'svc with \\'quote\\' and \\\\backslash'");

        await client.shutdown();
    });

    test('converts timestamps from ms to seconds and parses numeric columns', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: 'Ok'});

        const ctx = makeFakeCtx(ACTIVE_CONFIG);
        const client = prepareClickHouseClient(ctx);

        client.sendStats({
            service: 's',
            responseStatus: '404' as unknown as number,
            requestTime: 3.14,
            timestamp: 1700000000000,
        });
        await client.flush();

        const [, query] = instance.post.mock.calls[0];
        // timestamp must be ms / 1000
        expect(query).toContain('1700000000');
        expect(query).toContain('3.14');
        expect(query).toContain('404');
    });

    test('uses 0 for non-numeric values in number columns', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: 'Ok'});

        const ctx = makeFakeCtx(ACTIVE_CONFIG);
        const client = prepareClickHouseClient(ctx);

        client.sendStats({responseStatus: 'NaN-value' as unknown as number, service: 's'});
        await client.flush();

        const [, query] = instance.post.mock.calls[0];
        // responseStatus and similar bad numbers should fall back to 0
        expect(query).toMatch(/,0,/);
    });

    test('auto-enriches default table with host and timestamp', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: 'Ok'});

        const ctx = makeFakeCtx(ACTIVE_CONFIG);
        const client = prepareClickHouseClient(ctx);

        const before = Math.floor(Date.now() / 1000);
        client.sendStats({service: 's'});
        await client.flush();
        const after = Math.floor(Date.now() / 1000);

        const [, queryRaw] = instance.post.mock.calls[0];
        const query = String(queryRaw);
        // 10-digit timestamp (seconds, ms / 1000) must appear in the query
        const matches: RegExpMatchArray[] = Array.from(query.matchAll(/\b(\d{10})\b/g));
        expect(matches.length).toBeGreaterThan(0);
        const candidates = matches
            .map((m) => parseInt(m[1], 10))
            .filter((n) => n >= before - 1 && n <= after + 1);
        expect(candidates.length).toBeGreaterThan(0);
        // host should be a non-empty quoted string
        expect(query).toMatch(/'[^']+'/);
    });

    test('supports custom tables from configuration', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: 'Ok'});

        const ctx = makeFakeCtx({
            ...ACTIVE_CONFIG,
            appTelemetryChTables: {
                customEvents: {name: 'string', value: 'number'},
            },
        });
        const client = prepareClickHouseClient(ctx);

        client.sendStats('customEvents', {name: 'hello', value: 42});
        await client.flush();

        expect(instance.post).toHaveBeenCalledTimes(1);
        const [, query] = instance.post.mock.calls[0];
        expect(query).toContain('INSERT INTO analytics.customEvents');
        expect(query).toContain("'hello'");
        expect(query).toContain('42');

        await client.shutdown();
    });

    test('logs error for unknown table and does not throw', () => {
        setupAxios();
        const ctx = makeFakeCtx(ACTIVE_CONFIG);
        const client = prepareClickHouseClient(ctx);

        expect(() => client.sendStats('unknown', {a: 1})).not.toThrow();
        expect(ctx.logError).toHaveBeenCalledWith(
            expect.stringContaining("unknown table 'unknown'"),
        );
    });

    test('mirrors batches to logger when appTelemetryChMirrorToLogs=true', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: 'Ok'});

        const ctx = makeFakeCtx({...ACTIVE_CONFIG, appTelemetryChMirrorToLogs: true});
        const client = prepareClickHouseClient(ctx);

        client.sendStats({service: 's'});
        await client.flush();

        expect(ctx.log).toHaveBeenCalledWith(
            'nodekit-telemetry-stats',
            expect.objectContaining({tableName: 'apiRequests'}),
        );
    });

    test('does not leak password in error logs', async () => {
        const instance = setupAxios();
        const err = Object.assign(new Error('boom'), {
            config: {
                params: {user: 'user', password: 'secret-password'},
                headers: {Authorization: 'Bearer xxx'},
            },
            response: {
                status: 500,
                config: {params: {user: 'user', password: 'secret-password'}},
                data: {},
                headers: {},
                statusText: 'x',
            },
        });
        instance.post.mockRejectedValue(err);

        const ctx = makeFakeCtx(ACTIVE_CONFIG);
        const client = prepareClickHouseClient(ctx);
        client.sendStats({service: 's'});

        // give retries a chance
        await new Promise((r) => setTimeout(r, 50));

        const errStr = JSON.stringify(ctx.logError.mock.calls);
        expect(errStr).not.toContain('secret-password');

        await client.shutdown();
    });

    test('exposes flush / shutdown / getMetrics', async () => {
        const instance = setupAxios();
        instance.post.mockResolvedValue({status: 200, data: 'Ok'});

        const ctx = makeFakeCtx(ACTIVE_CONFIG);
        const client = prepareClickHouseClient(ctx);
        expect(typeof client.flush).toBe('function');
        expect(typeof client.shutdown).toBe('function');
        expect(typeof client.getMetrics).toBe('function');

        client.sendStats({service: 's'});
        await client.flush();
        expect(client.getMetrics().sent).toBeGreaterThan(0);
        await client.shutdown();
    });
});
