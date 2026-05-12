import {prepareLogsClient} from '../../lib/telemetry/logs';
import {makeFakeCtx} from './helpers';

describe('telemetry/logs', () => {
    test('factory returns a TelemetryClient with the expected shape', () => {
        const ctx = makeFakeCtx();
        const client = prepareLogsClient(ctx);
        expect(typeof client.sendStats).toBe('function');
        expect(typeof client.flush).toBe('function');
        expect(typeof client.shutdown).toBe('function');
        expect(typeof client.getMetrics).toBe('function');
    });

    test('returns a no-op client when explicitly disabled', () => {
        const ctx = makeFakeCtx({appTelemetryLogsEnabled: false});
        const client = prepareLogsClient(ctx);
        client.sendStats({a: 1});
        client.sendStats('customTable', {b: 2});
        expect(ctx.log).not.toHaveBeenCalled();
        expect(ctx.logError).not.toHaveBeenCalled();
    });

    test('writes a record with telemetry marker keys for the default table', () => {
        const ctx = makeFakeCtx();
        const client = prepareLogsClient(ctx);

        client.sendStats({service: 'srv', action: 'act'});

        expect(ctx.log).toHaveBeenCalledTimes(1);
        const [, payload] = ctx.log.mock.calls[0];
        expect(payload._telemetry).toBe(true);
        expect(payload._telemetry_type).toBe('api_request');
        expect(payload._telemetry_table).toBe('apiRequests');
        expect(payload.telemetry.service).toBe('srv');
        expect(payload.telemetry.action).toBe('act');
        expect(typeof payload.telemetry.host).toBe('string');
        expect(typeof payload.telemetry.timestamp).toBe('number');
    });

    test('uses _telemetry_type=custom for non-default table and skips host/timestamp', () => {
        const ctx = makeFakeCtx();
        const client = prepareLogsClient(ctx);

        client.sendStats('customTable', {x: 1});

        const [, payload] = ctx.log.mock.calls[0];
        expect(payload._telemetry_type).toBe('custom');
        expect(payload._telemetry_table).toBe('customTable');
        expect(payload.telemetry).toEqual({x: 1});
    });

    test('reserved keys in user data cannot override marker keys', () => {
        const ctx = makeFakeCtx();
        const client = prepareLogsClient(ctx);

        client.sendStats('t', {
            _telemetry: false,
            _telemetry_type: 'fake',
            _telemetry_table: 'fake',
            value: 42,
        });

        const [, payload] = ctx.log.mock.calls[0];
        expect(payload._telemetry).toBe(true);
        expect(payload._telemetry_type).toBe('custom');
        expect(payload._telemetry_table).toBe('t');
        expect(payload.telemetry.value).toBe(42);
        expect(payload.telemetry._telemetry).toBeUndefined();
    });

    test('respects custom namespace', () => {
        const ctx = makeFakeCtx({appTelemetryLogsNamespace: 'tel'});
        const client = prepareLogsClient(ctx);

        client.sendStats('t', {value: 1});

        const [, payload] = ctx.log.mock.calls[0];
        expect(payload.tel).toEqual({value: 1});
        expect(payload.telemetry).toBeUndefined();
    });

    test('sampling skips records and bumps dropped metric', () => {
        let counter = 0;
        const sequence = [0.05, 0.5, 0.95, 0.05, 0.5];
        const random = jest.fn(() => sequence[counter++ % sequence.length]);

        const ctx = makeFakeCtx({
            appTelemetryLogsSampleRate: 0.1,
            appTelemetryLogsRandom: random,
        });
        const client = prepareLogsClient(ctx);

        for (let i = 0; i < 5; i++) {
            client.sendStats('t', {i});
        }

        // 0.05 pass, 0.5 drop, 0.95 drop, 0.05 pass, 0.5 drop
        expect(ctx.log).toHaveBeenCalledTimes(2);
        const metrics = client.getMetrics();
        expect(metrics.sent).toBe(2);
        expect(metrics.dropped).toBe(3);
    });

    test('rejects invalid payloads without throwing', () => {
        const ctx = makeFakeCtx();
        const client = prepareLogsClient(ctx);

        expect(() => client.sendStats(null as unknown as object)).not.toThrow();
        expect(() => client.sendStats('', {a: 1})).not.toThrow();
        expect(() => client.sendStats('t', null as unknown as object)).not.toThrow();
        expect(ctx.logError).toHaveBeenCalled();
        expect(ctx.log).not.toHaveBeenCalled();
    });

    test('does not throw on exotic inputs (BigInt, symbols, cycles)', () => {
        const ctx = makeFakeCtx();
        const client = prepareLogsClient(ctx);

        const cyclic: Record<string, unknown> = {a: 1};
        cyclic.self = cyclic;

        expect(() => {
            client.sendStats('t', {big: BigInt(10), sym: Symbol('x'), cyclic});
        }).not.toThrow();
        expect(ctx.log).toHaveBeenCalledTimes(1);
    });

    test('flush and shutdown resolve immediately (no I/O)', async () => {
        const ctx = makeFakeCtx();
        const client = prepareLogsClient(ctx);
        await expect(client.flush()).resolves.toBeUndefined();
        await expect(client.shutdown()).resolves.toBeUndefined();
    });
});
