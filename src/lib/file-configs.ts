import path from 'path';

function interopRequire(filePath: string) {
    // eslint-disable-next-line security/detect-non-literal-require, global-require
    const obj = require(filePath);
    return obj && obj.__esModule ? obj.default : obj;
}

function getConfigByPath(configPath: string, configName: string) {
    const filePath = path.resolve(configPath, configName);
    try {
        return interopRequire(filePath);
    } catch (error) {
        if (
            !(
                error &&
                typeof error === 'object' &&
                'code' in error &&
                error.code === 'MODULE_NOT_FOUND'
            )
        ) {
            throw error;
        }
    }

    return {};
}

export function loadFileConfigs(
    configsRootPath?: string,
    appInstallation?: string,
    appEnv?: string,
) {
    if (!configsRootPath) {
        return {};
    }

    const commonConfig = getConfigByPath(configsRootPath, 'common');

    let envConfig = {};

    if (appEnv) {
        envConfig = getConfigByPath(configsRootPath, appEnv);
    }

    const installationConfigs: {common?: object; env?: object} = {common: {}, env: {}};
    if (appInstallation) {
        const installationConfigPath = path.resolve(configsRootPath, appInstallation);
        installationConfigs.common = getConfigByPath(installationConfigPath, 'common');
        if (appEnv) {
            installationConfigs.env = getConfigByPath(installationConfigPath, appEnv);
        }
    }

    return Object.assign(
        {},
        commonConfig,
        installationConfigs.common || {},
        envConfig,
        installationConfigs.env || {},
    );
}
