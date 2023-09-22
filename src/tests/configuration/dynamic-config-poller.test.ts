import { Dict } from "../../types";
import { AppContext } from "../../lib/context";

const MOCK_INTERVAL = 100;

jest.useFakeTimers({legacyFakeTimers: true});

jest.mock('axios', () => ({
    __esModule: true,
    default: {
        get: jest.fn()
            .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({
                data: {
                    gravity: 9.81,
                },
            }), 1)))
            .mockImplementationOnce(() => new Promise((_resolve, reject) => setTimeout(() => reject('URL did not respond'), 1)))
            .mockImplementationOnce(() => new Promise((_resolve, reject) => setTimeout(() => reject('axios timeout'), 100)))
            .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({
                data: {
                    gravity: 9.81,
                },
            }), 1)))
            .mockImplementationOnce(() => new Promise((_resolve, reject) => setTimeout(() => reject('axios timeout'), 100)))
}}));

function logNothing(_message: string, _extra?: Dict) {
}

const createMockAppContext = () => {
    const mockCtx = new (<new (name: string, config: Object) => AppContext>AppContext)('test', {parentContext: false, config: {}, logger: {}, utils: {}, tracer: {}, }) as jest.Mocked<AppContext>;
    mockCtx.log = jest.fn().mockImplementation(logNothing);
    mockCtx.logError = jest.fn().mockImplementation(logNothing);
    return mockCtx;
}

const mockAppContext = createMockAppContext();

const spyOnLog = jest.spyOn(mockAppContext, 'log');
const spyOnLogError = jest.spyOn(mockAppContext, 'logError');

const proceedWithTicksAndTimers = async (iterations: number, interval: number = MOCK_INTERVAL) => {
    for (let i = 0; i < iterations; i++) {
        jest.advanceTimersByTime(interval);
        await new Promise(process.nextTick);
    }
}

const MOCK_DYNAMIC_CONFIG = {
    url: 'mockUrl',
    interval: MOCK_INTERVAL,
}

const baseEnv = process.env;

beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...baseEnv };
})

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
    await proceedWithTicksAndTimers(POLLING_CALLS+SUCCESS_CALLS+ERROR_CALLS-1);
    //ASSERT
    expect((mockAppContext.dynamicConfig  as Record<string, any>).testPoller.gravity).toEqual(9.81);
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
    await proceedWithTicksAndTimers(POLLING_CALLS+SUCCESS_CALLS+ERROR_CALLS);
    //ASSERT
    expect((mockAppContext.dynamicConfig  as Record<string, any>).testPoller.gravity).toEqual(9.81);
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
    await proceedWithTicksAndTimers(POLLING_CALLS+SUCCESS_CALLS+ERROR_CALLS);
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
    await proceedWithTicksAndTimers(POLLING_CALLS+SUCCESS_CALLS+ERROR_CALLS-1);
    //ASSERT
    expect(spyOnLog).toHaveBeenCalledTimes(POLLING_CALLS+SUCCESS_CALLS);
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
    await proceedWithTicksAndTimers(POLLING_CALLS+SUCCESS_CALLS+ERROR_CALLS-1);
    //ASSERT
    expect(spyOnLog).not.toBeCalled();
    expect(spyOnLogError).toHaveBeenCalledTimes(ERROR_CALLS);
});