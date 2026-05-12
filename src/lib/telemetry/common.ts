import type {AppContext} from '../context';
import {Dict} from '../../types';
import {
    DEFAULT_BACKLOG_SIZE,
    DEFAULT_BATCH_SIZE,
    DEFAULT_RETRIES_NUMBER,
    DEFAULT_TICK_INTERVAL,
} from '../utils/batch';

export interface TelemetryMetrics {
    sent: number;
    failed: number;
    dropped: number;
    backlogSize: number;
}

export interface TelemetryClient {
    sendStats: {
        (data: object): void;
        (tableName: string, data: object): void;
    };
    flush: () => Promise<void>;
    shutdown: () => Promise<void>;
    getMetrics: () => TelemetryMetrics;
}

type SendFn = (batch: unknown[]) => Promise<void>;

export interface ManagedQueueArgs {
    fn: SendFn;
    logError?: AppContext['logError'];
    tickInterval?: number;
    backlogSize?: number;
    batchSize?: number;
    retriesNumber?: number;
}

interface QueueMessage {
    retries: number;
    payload: unknown;
}

// Managed batched queue with sent/failed/dropped/backlogSize counters and flush/shutdown support.
// The original prepareBatchedQueue is kept untouched and is still used by clickhouse.ts.
export function prepareManagedQueue({
    fn,
    // eslint-disable-next-line no-console
    logError = console.error,
    tickInterval = DEFAULT_TICK_INTERVAL,
    backlogSize = DEFAULT_BACKLOG_SIZE,
    batchSize = DEFAULT_BATCH_SIZE,
    retriesNumber = DEFAULT_RETRIES_NUMBER,
}: ManagedQueueArgs) {
    let queue: QueueMessage[] = [];
    const metrics: TelemetryMetrics = {sent: 0, failed: 0, dropped: 0, backlogSize: 0};
    let inFlight = 0;
    const inFlightResolvers: Array<() => void> = [];
    let stopped = false;
    let lastError: Error | undefined;

    function notifyIdle() {
        if (inFlight === 0 && inFlightResolvers.length) {
            const resolvers = inFlightResolvers.splice(0, inFlightResolvers.length);
            resolvers.forEach((r) => r());
        }
    }

    function trimBacklog() {
        if (queue.length > backlogSize) {
            const deleteCount = queue.length - backlogSize;
            queue.splice(0, deleteCount);
            metrics.dropped += deleteCount;
            try {
                logError('NodeKit Telemetry: old payloads removed from queue', null, {
                    queueLength: queue.length + deleteCount,
                    deleteCount,
                } as Dict);
            } catch (_e) {
                // logError must never propagate out of the queue
            }
        }

        const survived: QueueMessage[] = [];
        let dead = 0;
        for (const item of queue) {
            if (item.retries > 0) {
                survived.push(item);
            } else {
                dead += 1;
            }
        }
        if (dead > 0) {
            metrics.failed += dead;
            try {
                logError('NodeKit Telemetry: failed to process batch', lastError, {
                    batchSize: dead,
                } as Dict);
            } catch (_e) {
                // logError must never propagate out of the queue
            }
        }
        queue = survived;
    }

    function sendOnce() {
        if (!queue.length) {
            return;
        }
        const batch = queue.splice(0, Math.min(batchSize, queue.length));
        const payloads = batch.map((b) => b.payload);
        inFlight += 1;
        fn(payloads)
            .then(() => {
                metrics.sent += batch.length;
            })
            .catch((error: Error) => {
                lastError = error;
                batch.forEach((b) => {
                    b.retries -= 1;
                });
                queue.unshift(...batch);
            })
            .then(() => {
                inFlight -= 1;
                notifyIdle();
            });
    }

    const timer = setInterval(() => {
        if (stopped) return;
        trimBacklog();
        sendOnce();
    }, tickInterval);

    if (typeof timer.unref === 'function') {
        timer.unref();
    }

    function push(payload: unknown): boolean {
        if (stopped) {
            metrics.dropped += 1;
            return false;
        }
        if (queue.length >= backlogSize) {
            // drop the oldest message to keep the hot path non-blocking
            queue.shift();
            metrics.dropped += 1;
        }
        queue.push({retries: retriesNumber, payload});
        return true;
    }

    function getBacklogSize() {
        return queue.length;
    }

    function getMetrics(): TelemetryMetrics {
        return {...metrics, backlogSize: queue.length};
    }

    async function drain() {
        while (queue.length > 0) {
            trimBacklog();
            if (queue.length === 0) break;
            sendOnce();
            if (inFlight > 0) {
                await new Promise<void>((resolve) => inFlightResolvers.push(resolve));
            }
        }
        if (inFlight > 0) {
            await new Promise<void>((resolve) => inFlightResolvers.push(resolve));
        }
    }

    async function flush() {
        await drain();
    }

    async function shutdown() {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        await drain();
    }

    return {push, getBacklogSize, getMetrics, flush, shutdown};
}

export interface NoopClient extends TelemetryClient {}

export function createNoopClient(): NoopClient {
    const sendStats = ((..._args: unknown[]) => {}) as TelemetryClient['sendStats'];
    return {
        sendStats,
        flush: async () => {},
        shutdown: async () => {},
        getMetrics: () => ({sent: 0, failed: 0, dropped: 0, backlogSize: 0}),
    };
}

export const TELEMETRY_DEFAULTS = {
    tickInterval: DEFAULT_TICK_INTERVAL,
    batchSize: DEFAULT_BATCH_SIZE,
    backlogSize: DEFAULT_BACKLOG_SIZE,
    retriesNumber: DEFAULT_RETRIES_NUMBER,
};

// Safely serialises a value: handles cyclic references, BigInt, symbols and functions
// so that sendStats never throws on exotic inputs.
export function safeStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, val) => {
        if (typeof val === 'bigint') return val.toString();
        if (typeof val === 'symbol') return val.toString();
        if (typeof val === 'function') return undefined;
        if (val && typeof val === 'object') {
            if (seen.has(val as object)) return '[Circular]';
            seen.add(val as object);
        }
        return val;
    });
}

export const DEFAULT_TABLE_NAME = 'apiRequests';

const SENSITIVE_HEADER_PATTERN =
    /^(authorization|x-yacloud-subjecttoken|x-api-key|x-amz-security-token|cookie|set-cookie)$/i;

export function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> {
    if (!headers) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
        out[k] = SENSITIVE_HEADER_PATTERN.test(k) ? '[REDACTED]' : v;
    }
    return out;
}

// Strips sensitive request headers and credentials from an axios error in-place so it can be
// safely passed to logError.
export function redactAxiosError(err: {
    config?: {headers?: unknown; params?: Record<string, unknown>};
    response?: {config?: {headers?: unknown; params?: Record<string, unknown>}};
}): void {
    const targets = [err.config, err.response?.config];
    for (const t of targets) {
        if (!t) continue;
        if (t.headers) {
            t.headers = redactHeaders(t.headers as Record<string, string>);
        }
        if (t.params && typeof t.params === 'object') {
            for (const k of Object.keys(t.params)) {
                if (/password|token|secret|authorization/i.test(k)) {
                    t.params[k] = '[REDACTED]';
                }
            }
        }
    }
}
