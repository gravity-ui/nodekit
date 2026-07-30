import path from 'path';

import {AppConfig, NodeKit} from '../..';

const MOCK_CONFIGS_PATH = './mockConfigs';

const FILE_CONFIG = {
    appName: 'fileConfigApp',
    appVersion: 'fileConfigVersion',
    appLoggingLevel: 'warn',
};

jest.doMock(path.resolve(MOCK_CONFIGS_PATH, 'common'), () => FILE_CONFIG, {virtual: true});

const ENV_KEYS = ['APP_NAME', 'APP_VERSION', 'APP_LOGGING_LEVEL'] as const;

const setupNodeKit = ({config, configsPath}: {config?: AppConfig; configsPath?: string} = {}) => {
    const nodekit = new NodeKit({
        disableDotEnv: true,
        configsPath,
        config: {appLoggingDestination: {write: jest.fn()}, ...config},
    });

    return nodekit.config;
};

// every NodeKit instance subscribes to shutdown signals, so the default listeners limit is not enough
const initialMaxListeners = process.getMaxListeners();

let envBackup: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeAll(() => {
    process.setMaxListeners(0);
});

afterAll(() => {
    process.setMaxListeners(initialMaxListeners);
});

beforeEach(() => {
    envBackup = {};

    ENV_KEYS.forEach((key) => {
        envBackup[key] = process.env[key];
        delete process.env[key];
    });
});

afterEach(() => {
    ENV_KEYS.forEach((key) => {
        const value = envBackup[key];

        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    });
});

describe('appName initialization', () => {
    test('falls back to the default name when nothing is provided', () => {
        const config = setupNodeKit();

        expect(config.appName).toEqual('namelessApp');
    });

    test('takes the name from the file config', () => {
        const config = setupNodeKit({configsPath: MOCK_CONFIGS_PATH});

        expect(config.appName).toEqual('fileConfigApp');
    });

    test('options config takes priority over the file config', () => {
        const config = setupNodeKit({
            configsPath: MOCK_CONFIGS_PATH,
            config: {appName: 'optionsApp'},
        });

        expect(config.appName).toEqual('optionsApp');
    });

    test('APP_NAME env takes priority over the options and file configs', () => {
        process.env.APP_NAME = 'envApp';

        const config = setupNodeKit({
            configsPath: MOCK_CONFIGS_PATH,
            config: {appName: 'optionsApp'},
        });

        expect(config.appName).toEqual('envApp');
    });

    test('empty APP_NAME env falls back to the options config', () => {
        process.env.APP_NAME = '';

        const config = setupNodeKit({config: {appName: 'optionsApp'}});

        expect(config.appName).toEqual('optionsApp');
    });
});

describe('appVersion initialization', () => {
    test('falls back to the default version when nothing is provided', () => {
        const config = setupNodeKit();

        expect(config.appVersion).toEqual('versionlessApp');
    });

    test('takes the version from the file config', () => {
        const config = setupNodeKit({configsPath: MOCK_CONFIGS_PATH});

        expect(config.appVersion).toEqual('fileConfigVersion');
    });

    test('options config takes priority over the file config', () => {
        const config = setupNodeKit({
            configsPath: MOCK_CONFIGS_PATH,
            config: {appVersion: 'optionsVersion'},
        });

        expect(config.appVersion).toEqual('optionsVersion');
    });

    test('APP_VERSION env takes priority over the options and file configs', () => {
        process.env.APP_VERSION = 'envVersion';

        const config = setupNodeKit({
            configsPath: MOCK_CONFIGS_PATH,
            config: {appVersion: 'optionsVersion'},
        });

        expect(config.appVersion).toEqual('envVersion');
    });

    test('empty APP_VERSION env falls back to the options config', () => {
        process.env.APP_VERSION = '';

        const config = setupNodeKit({config: {appVersion: 'optionsVersion'}});

        expect(config.appVersion).toEqual('optionsVersion');
    });
});

describe('appLoggingLevel initialization', () => {
    test('stays undefined when nothing is provided', () => {
        const config = setupNodeKit();

        expect(config.appLoggingLevel).toBeUndefined();
    });

    test('takes the level from the file config', () => {
        const config = setupNodeKit({configsPath: MOCK_CONFIGS_PATH});

        expect(config.appLoggingLevel).toEqual('warn');
    });

    test('options config takes priority over the file config', () => {
        const config = setupNodeKit({
            configsPath: MOCK_CONFIGS_PATH,
            config: {appLoggingLevel: 'error'},
        });

        expect(config.appLoggingLevel).toEqual('error');
    });

    test('APP_LOGGING_LEVEL env takes priority over the options and file configs', () => {
        process.env.APP_LOGGING_LEVEL = 'trace';

        const config = setupNodeKit({
            configsPath: MOCK_CONFIGS_PATH,
            config: {appLoggingLevel: 'error'},
        });

        expect(config.appLoggingLevel).toEqual('trace');
    });

    test('empty APP_LOGGING_LEVEL env falls back to the options config', () => {
        process.env.APP_LOGGING_LEVEL = '';

        const config = setupNodeKit({config: {appLoggingLevel: 'error'}});

        expect(config.appLoggingLevel).toEqual('error');
    });
});
