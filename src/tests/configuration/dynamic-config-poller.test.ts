/* eslint-disable global-require */
import {AppContext} from '../../lib/context';
import {Dict} from '../../types';

const MOCK_INTERVAL = 100;

jest.useFakeTimers({legacyFakeTimers: true});

jest.mock('axios', () => ({
    __esModule: true,
    default: {
        get: jest
            .fn()
            .mockImplementation(
                () =>
                    new Promise((resolve) =>
                        setTimeout(
                            () =>
                                resolve({
                                    data: {
                                        gravity: 9.81,
                                    },
                                }),
                            1,
                        ),
                    ),
            )
            .mockImplementationOnce(
                () =>
                    new Promise((_resolve, reject) =>
                        setTimeout(() => reject('URL did not respond'), 1),
                    ),
            )
            .mockImplementationOnce(
                () =>
                    new Promise((_resolve, reject) =>
                        setTimeout(() => reject('axios timeout'), 100),
                    ),
            )
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) =>
                        setTimeout(
                            () =>
                                resolve({
                                    data: {
                                        gravity: 9.81,
                                    },
                                }),
                            1,
                        ),
                    ),
            )
            .mockImplementationOnce(
                () =>
                    new Promise((_resolve, reject) =>
                        setTimeout(() => reject('axios timeout'), 100),
                    ),
            ),
    },
}));

function logNothing(_message: string, _extra?: Dict) {}

const createMockAppContext = () => {
    const mockCtx = new (AppContext as new (name: string, config: Object) => AppContext)('test', {
        parentContext: false,
        config: {},
        logger: {},
        utils: {},
        tracer: {},
    }) as jest.Mocked<AppContext>;
    mockCtx.log = jest.fn().mockImplementation(logNothing);
    mockCtx.logError = jest.fn().mockImplementation(logNothing);
    return mockCtx;
};

const mockAppContext = createMockAppContext();

const spyOnLog = jest.spyOn(mockAppContext, 'log');
const spyOnLogError = jest.spyOn(mockAppContext, 'logError');

const proceedWithTicksAndTimers = async (iterations: number, interval: number = MOCK_INTERVAL) => {
    for (let i = 0; i < iterations; i++) {
        jest.advanceTimersByTime(interval);
        await new Promise(process.nextTick);
    }
};

const MOCK_DYNAMIC_CONFIG = {
    url: 'mockUrl',
    interval: MOCK_INTERVAL,
};

const baseEnv = process.env;

beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = {...baseEnv};
});

afterEach(() => {
    process.env = baseEnv;
});

test('check if we successfully set ctx.dynamicConfig after several error calls', async () => {
    //ARRANGE
    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const poller = new DynamicConfigPoller(mockAppContext, 'testPoller', MOCK_DYNAMIC_CONFIG);
    //ACT
    poller.startPolling();
    const POLLING_CALLS = 3;
    const SUCCESS_CALLS = 1;
    const ERROR_CALLS = 2;
    // we subtract 1 because we dont't care if our poller move to startPolling again after onSuccess in this test
    await proceedWithTicksAndTimers(POLLING_CALLS + SUCCESS_CALLS + ERROR_CALLS - 1);
    //ASSERT
    expect(
        (mockAppContext.dynamicConfig as Record<string, {gravity: number}>).testPoller.gravity,
    ).toEqual(9.81);
});

test('check if we do not rewrite already set ctx.dynamicConfig after error call', async () => {
    //ARRANGE
    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const poller = new DynamicConfigPoller(mockAppContext, 'testPoller', MOCK_DYNAMIC_CONFIG);
    //ACT
    poller.startPolling();
    const POLLING_CALLS = 4;
    const SUCCESS_CALLS = 1;
    const ERROR_CALLS = 3;
    await proceedWithTicksAndTimers(POLLING_CALLS + SUCCESS_CALLS + ERROR_CALLS);
    //ASSERT
    expect(
        (mockAppContext.dynamicConfig as Record<string, {gravity: number}>).testPoller.gravity,
    ).toEqual(9.81);
});

test('check if we continue to poll for config after success', async () => {
    //ARRANGE
    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const poller = new DynamicConfigPoller(mockAppContext, 'testPoller', MOCK_DYNAMIC_CONFIG);
    const spyOnStartPolling = jest.spyOn(poller, 'startPolling');
    //ACT
    poller.startPolling();
    const POLLING_CALLS = 4;
    const SUCCESS_CALLS = 1;
    const ERROR_CALLS = 2;
    await proceedWithTicksAndTimers(POLLING_CALLS + SUCCESS_CALLS + ERROR_CALLS);
    //ASSERT
    expect(spyOnStartPolling).toHaveBeenCalledTimes(POLLING_CALLS);
});

test('check if we log stuff with APP_DEBUG_DYNAMIC_CONFIG=debug', async () => {
    //ARRANGE
    process.env.APP_DEBUG_DYNAMIC_CONFIG = 'debug';
    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const poller = new DynamicConfigPoller(mockAppContext, 'testPoller', MOCK_DYNAMIC_CONFIG);
    //ACT
    poller.startPolling();
    const POLLING_CALLS = 3;
    const SUCCESS_CALLS = 1;
    const ERROR_CALLS = 2;
    // we subtract 1 because we dont't care if our poller move to startPolling again after onSuccess in this test
    await proceedWithTicksAndTimers(POLLING_CALLS + SUCCESS_CALLS + ERROR_CALLS - 1);
    //ASSERT
    expect(spyOnLog).toHaveBeenCalledTimes(POLLING_CALLS + SUCCESS_CALLS);
    expect(spyOnLogError).toHaveBeenCalledTimes(ERROR_CALLS);
});

test('check if we do not log stuff without APP_DEBUG_DYNAMIC_CONFIG flag', async () => {
    //ARRANGE
    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const poller = new DynamicConfigPoller(mockAppContext, 'testPoller', MOCK_DYNAMIC_CONFIG);
    //ACT
    poller.startPolling();
    const POLLING_CALLS = 3;
    const SUCCESS_CALLS = 1;
    const ERROR_CALLS = 2;
    // we subtract 1 because we dont't care if our poller move to startPolling again after onSuccess in this test
    await proceedWithTicksAndTimers(POLLING_CALLS + SUCCESS_CALLS + ERROR_CALLS - 1);
    //ASSERT
    expect(spyOnLog).not.toHaveBeenCalled();
    expect(spyOnLogError).toHaveBeenCalledTimes(ERROR_CALLS);
});

test('should include dynamic headers when dynamicHeaders are provided', async () => {
    // ARRANGE
    const mockGetAuthHeaderValue = jest.fn().mockResolvedValue('Bearer token123');
    const mockGetRequestId = jest.fn().mockResolvedValue('req-123');
    const mockAxiosGet = jest.fn().mockResolvedValue({
        data: {gravity: 9.81},
    });

    const axiosMock = {
        __esModule: true,
        default: {
            get: mockAxiosGet,
        },
    };

    jest.doMock('axios', () => axiosMock);

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const authMockContext = createMockAppContext();

    const poller = new DynamicConfigPoller(authMockContext, 'test-namespace', {
        url: 'https://example.com/config',
        dynamicHeaders: {
            Authorization: mockGetAuthHeaderValue,
            'X-Request-ID': mockGetRequestId,
        },
    });

    // ACT
    await poller.startPolling();

    // ASSERT
    expect(mockGetAuthHeaderValue).toHaveBeenCalledTimes(1);
    expect(mockGetRequestId).toHaveBeenCalledTimes(1);
    expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com/config'),
        {
            headers: {
                Authorization: 'Bearer token123',
                'X-Request-ID': 'req-123',
            },
        },
    );
});

test('should handle auth header fetch error gracefully', async () => {
    // ARRANGE
    const mockGetAuthHeaderValue = jest.fn().mockRejectedValue(new Error('Auth failed'));
    const mockAxiosGet = jest.fn();
    const mockLogError = jest.fn();

    const axiosMock = {
        __esModule: true,
        default: {
            get: mockAxiosGet,
        },
    };

    jest.doMock('axios', () => axiosMock);

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const authMockContext = createMockAppContext();
    authMockContext.logError = mockLogError;

    const poller = new DynamicConfigPoller(authMockContext, 'test-namespace', {
        url: 'https://example.com/config',
        dynamicHeaders: {
            Authorization: mockGetAuthHeaderValue,
        },
    });

    // ACT
    await poller.startPolling();

    // ASSERT
    expect(mockGetAuthHeaderValue).toHaveBeenCalledTimes(1);
    expect(mockLogError).toHaveBeenCalledWith(
        'Dynamic config: error on preparing headers',
        expect.any(Error),
        {namespace: 'test-namespace'},
    );
    expect(mockAxiosGet).not.toHaveBeenCalled();
});

test('should work without headers when no headers are provided', async () => {
    // ARRANGE
    const mockAxiosGet = jest.fn().mockResolvedValue({
        data: {gravity: 9.81},
    });

    const axiosMock = {
        __esModule: true,
        default: {
            get: mockAxiosGet,
        },
    };

    jest.doMock('axios', () => axiosMock);

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const authMockContext = createMockAppContext();

    const poller = new DynamicConfigPoller(authMockContext, 'test-namespace', {
        url: 'https://example.com/config',
    });

    // ACT
    await poller.startPolling();

    // ASSERT
    expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com/config'),
        {},
    );
});

test('should include static headers when headers are provided', async () => {
    // ARRANGE
    const mockAxiosGet = jest.fn().mockResolvedValue({
        data: {gravity: 9.81},
    });

    const axiosMock = {
        __esModule: true,
        default: {
            get: mockAxiosGet,
        },
    };

    jest.doMock('axios', () => axiosMock);

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const authMockContext = createMockAppContext();

    const poller = new DynamicConfigPoller(authMockContext, 'test-namespace', {
        url: 'https://example.com/config',
        headers: {
            'X-API-Key': 'static-key',
            'User-Agent': 'MyApp/1.0',
            'Content-Type': 'application/json',
        },
    });

    // ACT
    await poller.startPolling();

    // ASSERT
    expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com/config'),
        {
            headers: {
                'X-API-Key': 'static-key',
                'User-Agent': 'MyApp/1.0',
                'Content-Type': 'application/json',
            },
        },
    );
});

test('should combine static and dynamic headers correctly', async () => {
    // ARRANGE
    const mockGetAuthHeaderValue = jest.fn().mockResolvedValue('Bearer token123');
    const mockGetRequestId = jest.fn().mockResolvedValue('req-456');
    const mockAxiosGet = jest.fn().mockResolvedValue({
        data: {gravity: 9.81},
    });

    const axiosMock = {
        __esModule: true,
        default: {
            get: mockAxiosGet,
        },
    };

    jest.doMock('axios', () => axiosMock);

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const authMockContext = createMockAppContext();

    const poller = new DynamicConfigPoller(authMockContext, 'test-namespace', {
        url: 'https://example.com/config',
        headers: {
            'User-Agent': 'MyApp/1.0',
            'Content-Type': 'application/json',
        },
        dynamicHeaders: {
            Authorization: mockGetAuthHeaderValue,
            'X-Request-ID': mockGetRequestId,
        },
    });

    // ACT
    await poller.startPolling();

    // ASSERT
    expect(mockGetAuthHeaderValue).toHaveBeenCalledTimes(1);
    expect(mockGetRequestId).toHaveBeenCalledTimes(1);
    expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com/config'),
        {
            headers: {
                'User-Agent': 'MyApp/1.0',
                'Content-Type': 'application/json',
                Authorization: 'Bearer token123',
                'X-Request-ID': 'req-456',
            },
        },
    );
});

test('should apply transform to raw response data before storing', async () => {
    // ARRANGE
    const mockAxiosGet = jest.fn().mockResolvedValue({
        data: {featureA: true, featureB: false},
    });

    jest.doMock('axios', () => ({__esModule: true, default: {get: mockAxiosGet}}));

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const ctx = createMockAppContext();

    const transform = jest.fn((raw: {featureA: boolean; featureB: boolean}) => ({
        featureA: raw.featureA ?? false,
        featureB: raw.featureB ?? false,
        featureC: false,
    }));

    const poller = new DynamicConfigPoller(ctx, 'test-namespace', {
        url: 'https://example.com/config',
        transform,
    });

    // ACT
    await poller.startPolling();

    // ASSERT
    expect(transform).toHaveBeenCalledWith({featureA: true, featureB: false});
    expect((ctx.dynamicConfig as Record<string, unknown>)['test-namespace']).toEqual({
        featureA: true,
        featureB: false,
        featureC: false,
    });
});

test('should store null when transform returns null', async () => {
    // ARRANGE
    const mockAxiosGet = jest.fn().mockResolvedValue({data: {featureA: true}});

    jest.doMock('axios', () => ({__esModule: true, default: {get: mockAxiosGet}}));

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const ctx = createMockAppContext();

    const poller = new DynamicConfigPoller(ctx, 'test-namespace', {
        url: 'https://example.com/config',
        transform: () => null,
    });

    // ACT
    await poller.startPolling();

    // ASSERT
    expect((ctx.dynamicConfig as Record<string, unknown>)['test-namespace']).toBeNull();
});

test('should store raw data when transform is not provided', async () => {
    // ARRANGE
    const rawData = {featureA: true, featureB: false};
    const mockAxiosGet = jest.fn().mockResolvedValue({data: rawData});

    jest.doMock('axios', () => ({__esModule: true, default: {get: mockAxiosGet}}));

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const ctx = createMockAppContext();

    const poller = new DynamicConfigPoller(ctx, 'test-namespace', {
        url: 'https://example.com/config',
    });

    // ACT
    await poller.startPolling();

    // ASSERT
    expect((ctx.dynamicConfig as Record<string, unknown>)['test-namespace']).toEqual(rawData);
});

test('should log error and continue polling when transform throws', async () => {
    // ARRANGE
    const mockAxiosGet = jest.fn().mockResolvedValue({data: {featureA: true}});

    jest.doMock('axios', () => ({__esModule: true, default: {get: mockAxiosGet}}));

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const ctx = createMockAppContext();
    const mockLogError = jest.fn();
    ctx.logError = mockLogError;

    const previousValue = {featureA: false};
    (ctx.dynamicConfig as Record<string, unknown>)['test-namespace'] = previousValue;

    const poller = new DynamicConfigPoller(ctx, 'test-namespace', {
        url: 'https://example.com/config',
        interval: MOCK_INTERVAL,
        transform: () => {
            throw new Error('transform error');
        },
    });
    const spyOnStartPolling = jest.spyOn(poller, 'startPolling');

    // ACT
    await poller.startPolling();
    await proceedWithTicksAndTimers(1);

    // ASSERT
    expect(mockLogError).toHaveBeenCalledWith(
        'Dynamic config: transform failed',
        expect.any(Error),
        {namespace: 'test-namespace'},
    );
    expect((ctx.dynamicConfig as Record<string, unknown>)['test-namespace']).toEqual(previousValue);
    expect(spyOnStartPolling).toHaveBeenCalled();
});

test('should allow dynamic headers to override static headers', async () => {
    // ARRANGE
    const mockGetAuthHeaderValue = jest.fn().mockResolvedValue('Bearer dynamic-token');
    const mockAxiosGet = jest.fn().mockResolvedValue({
        data: {gravity: 9.81},
    });

    const axiosMock = {
        __esModule: true,
        default: {
            get: mockAxiosGet,
        },
    };

    jest.doMock('axios', () => axiosMock);

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const authMockContext = createMockAppContext();

    const poller = new DynamicConfigPoller(authMockContext, 'test-namespace', {
        url: 'https://example.com/config',
        headers: {
            Authorization: 'Bearer static-token',
            'User-Agent': 'MyApp/1.0',
        },
        dynamicHeaders: {
            Authorization: mockGetAuthHeaderValue,
        },
    });

    // ACT
    await poller.startPolling();

    // ASSERT
    expect(mockGetAuthHeaderValue).toHaveBeenCalledTimes(1);
    expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com/config'),
        {
            headers: {
                Authorization: 'Bearer dynamic-token',
                'User-Agent': 'MyApp/1.0',
            },
        },
    );
});

test('should use custom fetch and not call axios when `fetch` is provided', async () => {
    // ARRANGE
    const mockAxiosGet = jest.fn();
    jest.doMock('axios', () => ({__esModule: true, default: {get: mockAxiosGet}}));

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const ctx = createMockAppContext();

    const fetcher = jest.fn().mockResolvedValue({gravity: 9.81});

    const poller = new DynamicConfigPoller(ctx, 'test-namespace', {
        fetch: fetcher,
    });

    // ACT
    await poller.startPolling();

    // ASSERT
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(ctx);
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect((ctx.dynamicConfig as Record<string, unknown>)['test-namespace']).toEqual({
        gravity: 9.81,
    });
});

test('should apply transform to the value returned by a custom `fetch`', async () => {
    // ARRANGE
    jest.doMock('axios', () => ({__esModule: true, default: {get: jest.fn()}}));

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const ctx = createMockAppContext();

    const transform = jest.fn((raw: {featureA: boolean}) => ({
        featureA: raw.featureA,
        featureB: false,
    }));

    const poller = new DynamicConfigPoller(ctx, 'test-namespace', {
        fetch: () => Promise.resolve({featureA: true}),
        transform,
    });

    // ACT
    await poller.startPolling();

    // ASSERT
    expect(transform).toHaveBeenCalledWith({featureA: true});
    expect((ctx.dynamicConfig as Record<string, unknown>)['test-namespace']).toEqual({
        featureA: true,
        featureB: false,
    });
});

test('should keep previous value and reschedule when custom `fetch` rejects', async () => {
    // ARRANGE
    jest.doMock('axios', () => ({__esModule: true, default: {get: jest.fn()}}));

    const {DynamicConfigPoller} = require('../../lib/dynamic-config-poller');
    const ctx = createMockAppContext();
    const mockLogError = jest.fn();
    ctx.logError = mockLogError;

    const previousValue = {featureA: false};
    (ctx.dynamicConfig as Record<string, unknown>)['test-namespace'] = previousValue;

    const poller = new DynamicConfigPoller(ctx, 'test-namespace', {
        interval: MOCK_INTERVAL,
        fetch: () => Promise.reject(new Error('fetch failed')),
    });
    const spyOnStartPolling = jest.spyOn(poller, 'startPolling');

    // ACT
    await poller.startPolling();
    await proceedWithTicksAndTimers(1);

    // ASSERT
    expect(mockLogError).toHaveBeenCalledWith(
        'Dynamic config: fetch failed',
        expect.any(Error),
        expect.objectContaining({namespace: 'test-namespace'}),
    );
    expect((ctx.dynamicConfig as Record<string, unknown>)['test-namespace']).toEqual(previousValue);
    expect(spyOnStartPolling).toHaveBeenCalled();
});
