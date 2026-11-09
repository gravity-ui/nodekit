import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import type {AppConfig} from '../..';

let directory: string;

beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'nodekit-config-selectors-'));
    mkdirSync(join(directory, 'team'));
    const files = {
        'common.js': {
            appName: 'common',
            appVersion: 'common',
            appEnv: 'ignored',
            appInstallation: 'ignored',
        },
        'staging.js': {appName: 'staging'},
        'production.js': {appName: 'production'},
        'team/common.js': {appVersion: 'team'},
        'team/staging.js': {appName: 'team-staging'},
    };
    for (const [name, config] of Object.entries(files)) {
        writeFileSync(join(directory, name), `module.exports = ${JSON.stringify(config)};`);
    }
});

afterEach(() => {
    rmSync(directory, {recursive: true, force: true});
});

function loadConfig(config: AppConfig, env: NodeJS.ProcessEnv = {}) {
    const output = execFileSync(
        process.execPath,
        [
            '-e',
            `const {NodeKit} = require(process.argv[1]);
        const nodekit = new NodeKit({
            disableDotEnv: true,
            configsPath: process.cwd(),
            config: {...JSON.parse(process.argv[2]), appTracingEnabled: false},
        });
        const {appName, appVersion, appEnv, appInstallation} = nodekit.config;
        process.stdout.write(JSON.stringify({
            config: {appName, appVersion, appEnv, appInstallation},
            env: {APP_ENV: process.env.APP_ENV, APP_INSTALLATION: process.env.APP_INSTALLATION},
        }));`,
            require.resolve('../..'),
            JSON.stringify(config),
        ],
        {cwd: directory, env, encoding: 'utf8', timeout: 10_000},
    );

    return JSON.parse(output);
}

describe('configuration selectors', () => {
    test.each([
        [{}, {}, 'common', 'common', undefined, undefined],
        [{appEnv: 'staging'}, {}, 'staging', 'common', 'staging', undefined],
        [{appInstallation: 'team'}, {}, 'common', 'team', undefined, 'team'],
        [
            {appEnv: 'staging', appInstallation: 'team'},
            {},
            'team-staging',
            'team',
            'staging',
            'team',
        ],
        [
            {appEnv: 'staging'},
            {APP_ENV: 'production'},
            'production',
            'common',
            'production',
            undefined,
        ],
        [
            {appEnv: 'staging', appInstallation: 'missing'},
            {APP_INSTALLATION: 'team'},
            'team-staging',
            'team',
            'staging',
            'team',
        ],
        [{appEnv: 'staging', appInstallation: 'team'}, {APP_ENV: ''}, 'common', 'team', '', 'team'],
        [
            {appEnv: 'staging', appInstallation: 'team'},
            {APP_INSTALLATION: ''},
            'staging',
            'common',
            'staging',
            '',
        ],
        [{appEnv: '', appInstallation: ''}, {}, 'common', 'common', '', ''],
    ] as const)(
        'resolves options %j and environment %j',
        (config, env, appName, appVersion, appEnv, appInstallation) => {
            const result = loadConfig(config, env);

            expect(result.config).toEqual({appName, appVersion, appEnv, appInstallation});
            expect(result.env).toEqual(env);
        },
    );
});
