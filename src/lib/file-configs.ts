import fs from 'fs';
import path from 'path';

function interopRequire(filePath: string) {
    const obj = require(filePath); // eslint-disable-line
    return obj && obj.__esModule ? obj.default : obj;
}

function getConfigByPath(configPath: string, configName: string) {
    const folderFilePath = path.resolve(configPath, configName, 'index.js');
    const filePath = path.resolve(configPath, `${configName}.js`);

    if (fs.existsSync(folderFilePath)) {
        return interopRequire(folderFilePath);
    }

    if (fs.existsSync(filePath)) {
        return interopRequire(filePath);
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

    const commonConfigPath = path.resolve(configsRootPath, 'common.js');

    const commonConfig = fs.existsSync(commonConfigPath) ? interopRequire(commonConfigPath) : {};

    let envConfig = {};

    if (appEnv) {
        envConfig = getConfigByPath(configsRootPath, appEnv);
    }

    const installationConfigs: {common?: object; env?: object} = {common: {}, env: {}};
    if (appInstallation) {
        const instCommonConfigPath = path.resolve(configsRootPath, appInstallation, 'common.js');
        installationConfigs.common = fs.existsSync(instCommonConfigPath)
            ? interopRequire(instCommonConfigPath)
            : {};
        if (appEnv) {
            installationConfigs.env = getConfigByPath(
                path.resolve(configsRootPath, appInstallation),
                appEnv,
            );
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
