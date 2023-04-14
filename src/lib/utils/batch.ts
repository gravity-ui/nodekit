import type {AppContext} from '../context';

export const TICK_INTERVAL = 3000;

export const DEFAULT_BACKLOG_SIZE = 500;
export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_RETRIES_NUMBER = 3;

interface BatchedQueueArgs {
    fn: Function;
    logError?: AppContext['logError'];
    backlogSize?: number;
    batchSize?: number;
    retriesNumber?: number;
}

interface QueueMessage {
    retries: number;
    payload: unknown;
}

interface QueueAcc {
    pending: QueueMessage[];
    failed: QueueMessage[];
}

export function prepareBatchedQueue({
    fn,
    // eslint-disable-next-line no-console
    logError = console.error,
    backlogSize = DEFAULT_BACKLOG_SIZE,
    batchSize = DEFAULT_BATCH_SIZE,
    retriesNumber = DEFAULT_RETRIES_NUMBER,
}: BatchedQueueArgs) {
    let queue: QueueMessage[] = [];
    let lastError: Error;

    function cleanup() {
        const queueLength = queue.length;
        if (queueLength > backlogSize) {
            const deleteCount = queueLength - backlogSize;
            queue.splice(0, deleteCount);
            logError('NodeKit Telemetry: old payloads removed from queue', null, {
                queueLength,
                deleteCount,
            });
        }

        const {pending, failed} = queue.reduce<QueueAcc>(
            (acc, element) => {
                acc[element.retries > 0 ? 'pending' : 'failed'].push(element);
                return acc;
            },
            {pending: [], failed: []},
        );

        if (failed.length > 0) {
            logError('NodeKit Telemetry: failed to process batch', lastError, {
                batchSize: failed.length,
            });
        }

        queue = pending;
    }

    function send() {
        if (!queue.length) {
            return;
        }

        const batch = queue.splice(0, Math.min(batchSize, queue.length));
        fn(batch.map((element) => element.payload)).catch((error: Error) => {
            lastError = error;
            batch.forEach((element) => {
                element.retries -= 1;
            });
            queue.unshift(...batch);
        });
    }

    const tickIntervalTimer = setInterval(() => {
        cleanup();
        send();
    }, TICK_INTERVAL);
    process.on('SIGTERM', () => clearInterval(tickIntervalTimer));

    function getBacklogSize() {
        return queue.length;
    }

    function push(payload: unknown) {
        queue.push({
            retries: retriesNumber,
            payload,
        });
    }
    return {push, getBacklogSize};
}
