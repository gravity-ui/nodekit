import axios from 'axios';

import {NodeKit} from '../../nodekit';
import {DynamicConfigSetup} from '../../lib/dynamic-config-poller';

jest.mock('axios', () => ({__esModule: true, default: {get: jest.fn()}}));

const baseEnv = process.env;
const nodekit = new NodeKit({
    disableDotEnv: true,
    config: {appLoggingDestination: {write: jest.fn()}, appTracingEnabled: false},
});
const config = nodekit.ctx.dynamicConfig as Record<string, unknown>;

beforeEach(() => {
    process.env = {...baseEnv};
    delete process.env.NODEKIT_DYNAMIC_CONFIG_FEATURES;
    delete process.env.NODEKIT_DYNAMIC_CONFIG_OTHER;
    delete process.env.CUSTOM_FEATURES_JSON;
    delete config.features;
    delete config.other;
    jest.useFakeTimers();
    jest.mocked(axios.get)
        .mockReset()
        .mockResolvedValue({data: {remote: true}});
});

afterEach(() => {
    process.env = baseEnv;
    jest.restoreAllMocks();
    jest.useRealTimers();
});

test.each<DynamicConfigSetup>([
    {url: 'https://example.com/features.json', dynamicHeaders: {Authorization: jest.fn()}},
    {fetch: jest.fn()},
    {filePath: '/missing/features.json'},
])('loads the default environment override synchronously without polling (%j)', (source) => {
    process.env.NODEKIT_DYNAMIC_CONFIG_FEATURES = '{"enabled":false}';

    nodekit.setupDynamicConfig('features', source);

    expect(config.features).toEqual({enabled: false});
    expect(axios.get).not.toHaveBeenCalled();
    if (source.fetch) {
        expect(source.fetch).not.toHaveBeenCalled();
    }
    if (source.dynamicHeaders) {
        expect(source.dynamicHeaders.Authorization).not.toHaveBeenCalled();
    }
    expect(jest.getTimerCount()).toBe(0);
});

test('uses a custom environment variable instead of the default name', () => {
    process.env.NODEKIT_DYNAMIC_CONFIG_FEATURES = '{"enabled":false}';
    process.env.CUSTOM_FEATURES_JSON = '{"enabled":true}';

    nodekit.setupDynamicConfig('features', {
        url: 'https://example.com/config',
        envVarName: 'CUSTOM_FEATURES_JSON',
    });

    expect(config.features).toEqual({enabled: true});
});

test('loads environment overrides for independent namespaces', () => {
    process.env.NODEKIT_DYNAMIC_CONFIG_FEATURES = '{}';
    process.env.NODEKIT_DYNAMIC_CONFIG_OTHER = 'false';

    nodekit.setupDynamicConfig('features', {url: 'https://example.com/features'});
    nodekit.setupDynamicConfig('other', {url: 'https://example.com/other'});

    expect(config.features).toEqual({});
    expect(config.other).toBe(false);
});

test.each<DynamicConfigSetup>([
    {url: 'https://example.com/config'},
    {fetch: jest.fn()},
    {filePath: '/missing/features.json'},
])('stores the final environment config without applying the source transform (%j)', (source) => {
    process.env.NODEKIT_DYNAMIC_CONFIG_FEATURES = '{"enabled":true}';
    const transform = jest.fn((raw: unknown) => JSON.parse(raw as string));

    nodekit.setupDynamicConfig('features', {...source, transform});

    expect(transform).not.toHaveBeenCalled();
    expect(config.features).toEqual({enabled: true});
    expect(axios.get).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
});

test.each(['', '{"secret":"do-not-expose",broken}'])(
    'rejects invalid JSON without exposing its contents or falling back (%j)',
    (value) => {
        process.env.NODEKIT_DYNAMIC_CONFIG_FEATURES = value;
        const previous = {enabled: false};
        config.features = previous;

        expect(() =>
            nodekit.setupDynamicConfig('features', {url: 'https://example.com/config'}),
        ).toThrow(SyntaxError);
        expect(() =>
            nodekit.setupDynamicConfig('features', {url: 'https://example.com/features'}),
        ).toThrow(
            /^Dynamic config: environment variable "NODEKIT_DYNAMIC_CONFIG_FEATURES" must contain valid JSON$/,
        );
        expect(config.features).toBe(previous);
        expect(axios.get).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    },
);

test.each([undefined, 'CUSTOM_FEATURES_JSON'])(
    'polls the URL when the selected variable is absent (%s)',
    async (envVarName) => {
        if (envVarName) {
            process.env.NODEKIT_DYNAMIC_CONFIG_FEATURES = '{"ignored":true}';
        }

        const transform = jest.fn((value) => ({...value, transformed: true}));
        nodekit.setupDynamicConfig('features', {
            url: 'https://example.com/config',
            envVarName,
            transform,
        });
        await Promise.resolve();

        expect(axios.get).toHaveBeenCalledWith(
            expect.stringContaining('https://example.com/config?'),
            {},
        );
        expect(transform).toHaveBeenCalledWith({remote: true});
        expect(config.features).toEqual({remote: true, transformed: true});
        expect(jest.getTimerCount()).toBe(1);
    },
);
