import type {AppConfig} from '../../types';

export interface FakeCtx {
    config: AppConfig;
    log: jest.Mock;
    logError: jest.Mock;
}

export function makeFakeCtx(config: AppConfig = {}): FakeCtx {
    return {
        config,
        log: jest.fn(),
        logError: jest.fn(),
    };
}

export function flushPromises(): Promise<void> {
    return new Promise((resolve) => process.nextTick(resolve));
}

export async function flushAll(times = 5): Promise<void> {
    for (let i = 0; i < times; i++) {
        // eslint-disable-next-line no-await-in-loop
        await flushPromises();
    }
}

export function collectLogStrings(mocks: jest.Mock[]): string {
    return mocks
        .flatMap((m) => m.mock.calls)
        .map((args) => JSON.stringify(args))
        .join('\n');
}
