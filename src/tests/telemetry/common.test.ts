import {
    createNoopClient,
    prepareManagedQueue,
    redactAxiosError,
    redactHeaders,
    safeStringify,
} from '../../lib/telemetry/common';

describe('telemetry/common safeStringify', () => {
    test('serializes plain objects', () => {
        expect(safeStringify({a: 1, b: 'x'})).toBe('{"a":1,"b":"x"}');
    });
    test('handles cyclic references', () => {
        const cyclic: Record<string, unknown> = {a: 1};
        cyclic.self = cyclic;
        const out = safeStringify(cyclic);
        expect(out).toContain('[Circular]');
    });
    test('handles BigInt and symbols', () => {
        const out = safeStringify({big: BigInt(10), sym: Symbol('x')});
        expect(out).toContain('"10"');
        expect(out).toContain('Symbol(x)');
    });
    test('strips functions', () => {
        const out = safeStringify({fn: () => 1, value: 2});
        expect(out).toBe('{"value":2}');
    });
});

describe('telemetry/common redactHeaders', () => {
    test('redacts sensitive headers case-insensitively', () => {
        const out = redactHeaders({
            authorization: 'Bearer x',
            Cookie: 'c=1',
            'X-Custom': 'safe',
        });
        expect(out.authorization).toBe('[REDACTED]');
        expect(out.Cookie).toBe('[REDACTED]');
        expect(out['X-Custom']).toBe('safe');
    });
    test('returns empty object for undefined input', () => {
        expect(redactHeaders(undefined)).toEqual({});
    });
});

describe('telemetry/common redactAxiosError', () => {
    test('redacts sensitive request headers in both config and response.config', () => {
        const err = {
            config: {headers: {Authorization: 'Bearer top-secret'}},
            response: {
                config: {headers: {Authorization: 'Bearer top-secret'}},
            },
        };
        redactAxiosError(err);
        expect((err.config.headers as Record<string, string>).Authorization).toBe('[REDACTED]');
        expect((err.response.config.headers as Record<string, string>).Authorization).toBe(
            '[REDACTED]',
        );
    });
    test('redacts password/token query params', () => {
        const err = {
            config: {headers: {}, params: {user: 'u', password: 'p', token: 't', other: 'o'}},
        };
        redactAxiosError(err);
        expect(err.config.params.password).toBe('[REDACTED]');
        expect(err.config.params.token).toBe('[REDACTED]');
        expect(err.config.params.user).toBe('u');
        expect(err.config.params.other).toBe('o');
    });
});

describe('telemetry/common createNoopClient', () => {
    test('exposes the TelemetryClient shape and does nothing', async () => {
        const c = createNoopClient();
        expect(c.getMetrics()).toEqual({sent: 0, failed: 0, dropped: 0, backlogSize: 0});
        c.sendStats({a: 1});
        c.sendStats('t', {b: 2});
        await c.flush();
        await c.shutdown();
    });
});

describe('telemetry/common prepareManagedQueue', () => {
    test('flush drains pending events through fn', async () => {
        const fn = jest.fn().mockResolvedValue(undefined);
        const q = prepareManagedQueue({fn, tickInterval: 1000000, batchSize: 10});
        for (let i = 0; i < 25; i++) {
            q.push(i);
        }
        expect(q.getBacklogSize()).toBe(25);
        await q.flush();
        expect(fn).toHaveBeenCalledTimes(3);
        expect(q.getMetrics().sent).toBe(25);
        expect(q.getMetrics().backlogSize).toBe(0);
        await q.shutdown();
    });

    test('retries failed batches', async () => {
        let failOnce = true;
        const fn = jest.fn(async () => {
            if (failOnce) {
                failOnce = false;
                throw new Error('boom');
            }
        });
        const logError = jest.fn();
        const q = prepareManagedQueue({fn, logError, tickInterval: 1000000, batchSize: 10});
        for (let i = 0; i < 5; i++) {
            q.push(i);
        }
        await q.flush();
        expect(fn).toHaveBeenCalledTimes(2);
        expect(q.getMetrics().sent).toBe(5);
        await q.shutdown();
    });

    test('drops batch after exhausting retries and bumps failed metric', async () => {
        const fn = jest.fn(async () => {
            throw new Error('always-fails');
        });
        const logError = jest.fn();
        const q = prepareManagedQueue({
            fn,
            logError,
            tickInterval: 1000000,
            batchSize: 10,
            retriesNumber: 2,
        });
        q.push('x');
        // single flush attempts to deliver until retries are exhausted
        await q.flush();
        expect(q.getBacklogSize()).toBe(0);
        expect(q.getMetrics().failed).toBeGreaterThanOrEqual(1);
        await q.shutdown();
    });

    test('drops oldest events when backlog is full', () => {
        const fn = jest.fn().mockResolvedValue(undefined);
        const q = prepareManagedQueue({
            fn,
            tickInterval: 1000000,
            batchSize: 10,
            backlogSize: 3,
        });
        q.push('a');
        q.push('b');
        q.push('c');
        q.push('d'); // pushes out 'a'
        q.push('e'); // pushes out 'b'
        expect(q.getBacklogSize()).toBe(3);
        expect(q.getMetrics().dropped).toBe(2);
    });

    test('shutdown stops accepting new events', async () => {
        const fn = jest.fn().mockResolvedValue(undefined);
        const q = prepareManagedQueue({fn, tickInterval: 1000000});
        q.push('a');
        await q.shutdown();
        const accepted = q.push('b');
        expect(accepted).toBe(false);
        expect(q.getMetrics().dropped).toBeGreaterThanOrEqual(1);
    });
});
