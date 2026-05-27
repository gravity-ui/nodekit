import mainConfig from '@gravity-ui/eslint-config';
import serverConfig from '@gravity-ui/eslint-config/server';
import prettierConfig from '@gravity-ui/eslint-config/prettier';

export default [
    {
        ignores: ['dist/**', 'storybook-static/**'],
    },
    ...mainConfig,
    ...serverConfig,
    ...prettierConfig,
    {
        rules: {
            'no-param-reassign': [1, {props: false}],
        },
    },
];
