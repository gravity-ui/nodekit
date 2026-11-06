import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import type {NodeKit} from '..';

let directory: string;

beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'nodekit-env-'));
});

afterEach(() => {
    rmSync(directory, {recursive: true, force: true});
});

function loadEnvironment(
    options: ConstructorParameters<typeof NodeKit>[0] = {},
    env: NodeJS.ProcessEnv = {},
) {
    const output = execFileSync(
        process.execPath,
        [
            '-e',
            `const {NodeKit} = require(process.argv[1]);
            const nodekit = new NodeKit({
                ...JSON.parse(process.argv[2]),
                config: {appTracingEnabled: false},
            });
            process.stdout.write(JSON.stringify({
                env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('NK_TEST_'))),
                appName: nodekit.config.appName,
            }));`,
            require.resolve('..'),
            JSON.stringify(options),
        ],
        {cwd: directory, env: {HOME: directory, ...env}, encoding: 'utf8', timeout: 10_000},
    );

    return JSON.parse(output);
}

describe('environment file loading', () => {
    test('loads .env from the working directory before resolving configuration', () => {
        writeFileSync(join(directory, '.env'), 'APP_NAME=from-file\nNK_TEST_VALUE=loaded');

        expect(loadEnvironment()).toEqual({
            env: {NK_TEST_VALUE: 'loaded'},
            appName: 'from-file',
        });
    });

    test('keeps existing environment values, including empty strings', () => {
        writeFileSync(
            join(directory, '.env'),
            'APP_NAME=from-file\nNK_TEST_VALUE=from-file\nNK_TEST_EMPTY=from-file',
        );

        expect(
            loadEnvironment(
                {},
                {APP_NAME: 'existing', NK_TEST_VALUE: 'existing', NK_TEST_EMPTY: ''},
            ),
        ).toEqual({
            env: {NK_TEST_VALUE: 'existing', NK_TEST_EMPTY: ''},
            appName: 'existing',
        });
    });

    test.each(['custom.env', './custom.env'])(
        'loads the relative path %s without loading .env',
        (envFilePath) => {
            writeFileSync(join(directory, '.env'), 'NK_TEST_DEFAULT=unexpected');
            writeFileSync(join(directory, 'custom.env'), 'NK_TEST_CUSTOM=loaded');

            expect(loadEnvironment({envFilePath}).env).toEqual({NK_TEST_CUSTOM: 'loaded'});
        },
    );

    test('loads an absolute custom path', () => {
        const envFilePath = join(directory, 'custom.env');
        writeFileSync(envFilePath, 'NK_TEST_CUSTOM=loaded');

        expect(loadEnvironment({envFilePath}).env).toEqual({NK_TEST_CUSTOM: 'loaded'});
    });

    test('expands a leading tilde in a custom path', () => {
        writeFileSync(join(directory, 'custom.env'), 'NK_TEST_CUSTOM=loaded');

        expect(loadEnvironment({envFilePath: '~/custom.env'}).env).toEqual({
            NK_TEST_CUSTOM: 'loaded',
        });
    });

    test('an empty custom path uses .env', () => {
        writeFileSync(join(directory, '.env'), 'NK_TEST_VALUE=loaded');

        expect(loadEnvironment({envFilePath: ''}).env).toEqual({NK_TEST_VALUE: 'loaded'});
    });

    test.each([undefined, 'custom.env'])('disableDotEnv skips loading %s', (envFilePath) => {
        writeFileSync(join(directory, '.env'), 'NK_TEST_DEFAULT=unexpected');
        writeFileSync(join(directory, 'custom.env'), 'NK_TEST_CUSTOM=unexpected');

        expect(loadEnvironment({disableDotEnv: true, envFilePath}).env).toEqual({});
    });

    test.each([undefined, 'missing.env'])(
        'missing file %s does not prevent startup',
        (envFilePath) => {
            expect(loadEnvironment({envFilePath}).env).toEqual({});
        },
    );

    test('a path that cannot be read as a file does not prevent startup', () => {
        mkdirSync(join(directory, 'not-a-file'));

        expect(loadEnvironment({envFilePath: 'not-a-file'}).env).toEqual({});
    });

    test('loads quoted values, multiline values, comments, and export prefixes', () => {
        writeFileSync(
            join(directory, '.env'),
            [
                "NK_TEST_SINGLE='  single # value  '",
                'NK_TEST_DOUBLE="double # value"',
                'NK_TEST_MULTILINE="first',
                'second"',
                'NK_TEST_ESCAPED="first\\nsecond\\rthird"',
                'NK_TEST_COMMENT=value # ignored',
                'export NK_TEST_EXPORT=exported',
            ].join('\n'),
        );

        expect(loadEnvironment().env).toEqual({
            NK_TEST_SINGLE: '  single # value  ',
            NK_TEST_DOUBLE: 'double # value',
            NK_TEST_MULTILINE: 'first\nsecond',
            NK_TEST_ESCAPED: 'first\nsecond\\rthird',
            NK_TEST_COMMENT: 'value',
            NK_TEST_EXPORT: 'exported',
        });
    });

    test('does not interpret dotenv colon assignments', () => {
        writeFileSync(join(directory, '.env'), 'NK_TEST_VALUE: value');

        expect(loadEnvironment().env).toEqual({});
    });

    test('a backslash does not escape a closing quote', () => {
        writeFileSync(join(directory, '.env'), 'NK_TEST_VALUE="before \\" after"');

        expect(loadEnvironment().env).toEqual({NK_TEST_VALUE: 'before \\'});
    });

    test('loads .env even when DOTENV_KEY and .env.vault are present', () => {
        writeFileSync(join(directory, '.env'), 'NK_TEST_PLAIN=loaded');
        writeFileSync(join(directory, '.env.vault'), 'NK_TEST_VAULT=unexpected');

        expect(loadEnvironment({}, {DOTENV_KEY: 'unused-test-key'}).env).toEqual({
            NK_TEST_PLAIN: 'loaded',
        });
    });
});
