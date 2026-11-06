import {createRequire} from 'node:module';

import {fixupConfigRules} from '@eslint/compat';
import mainConfig from '@gravity-ui/eslint-config';
import serverConfig from '@gravity-ui/eslint-config/server';
import prettierConfig from '@gravity-ui/eslint-config/prettier';
import * as espree from 'espree';

const requireFromSharedConfig = createRequire(import.meta.resolve('@gravity-ui/eslint-config'));

export default [
    {
        ignores: ['dist/**', 'storybook-static/**'],
    },
    // Adapt shared plugins that still use rule APIs removed in ESLint 10.
    ...fixupConfigRules([...mainConfig, ...serverConfig, ...prettierConfig]),
    {
        files: ['**/*.{js,mjs,cjs}'],
        languageOptions: {
            // The shared config's Babel parser does not support ESLint 10's ScopeManager API.
            parser: espree,
        },
    },
    {
        settings: {
            // Resolve from the shared config even when npm installs its dependencies nested.
            'import/resolver': [
                requireFromSharedConfig.resolve('eslint-import-resolver-typescript'),
                'node',
            ],
        },
        rules: {
            'no-param-reassign': [1, {props: false}],
        },
    },
];
