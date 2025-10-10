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
    expect(spyOnLog).not.toBeCalled();
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
