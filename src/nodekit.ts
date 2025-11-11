import * as dotenv from 'dotenv';

import {NODEKIT_BASE_CONFIG} from './lib/base-config';
import {AppContext} from './lib/context';
import {DynamicConfigPoller, DynamicConfigSetup} from './lib/dynamic-config-poller';
import {loadFileConfigs} from './lib/file-configs';
import {NodeKitLogger, initLogger} from './lib/logging';
import {prepareClickhouseClient} from './lib/telemetry/clickhouse';
import {initTracing} from './lib/tracing/init-tracing';
import {isTrueEnvValue} from './lib/utils/is-true-env';
import prepareSensitiveHeadersRedacter, {
    SensitiveHeadersRedacter,
} from './lib/utils/redact-sensitive-headers';
import {
    SensitiveKeysRedacter,
    prepareSensitiveKeysRedacter,
} from './lib/utils/redact-sensitive-keys';
import prepareSensitiveQueryParamsRedacter, {
    SensitiveQueryParamsRedacter,
} from './lib/utils/redact-sensitive-query-params';
import {AppConfig, ShutdownHandler} from './types';

interface InitOptions {
    disableDotEnv?: boolean;
    configsPath?: string;
    config?: AppConfig;
}

export class NodeKit {
    config: AppConfig;
    ctx: AppContext;

    utils: {
        redactSensitiveKeys: SensitiveKeysRedacter;
        redactSensitiveQueryParams: SensitiveQueryParamsRedacter;
        redactSensitiveHeaders: SensitiveHeadersRedacter;
        isTrueEnvValue: typeof isTrueEnvValue;
    };

    private logger: NodeKitLogger;

    private shutdownHandlers: ShutdownHandler[];

    constructor(options: InitOptions = {}) {
        if (!options.disableDotEnv) {
            dotenv.config();
        }

        const appInstallation = process.env.APP_INSTALLATION;
        const appEnv = process.env.APP_ENV;
        const appDevMode = isTrueEnvValue(process.env.APP_DEV_MODE || '') || false;

        this.shutdownHandlers = [];

        const fileConfig: AppConfig = loadFileConfigs(options.configsPath, appInstallation, appEnv);

        this.config = Object.assign({}, NODEKIT_BASE_CONFIG, fileConfig, options.config || {}, {
            appName: process.env.APP_NAME || fileConfig.appName || 'namelessApp',
            appVersion: process.env.APP_VERSION || fileConfig.appVersion || 'versionlessApp',
            appInstallation,
            appEnv,
            appDevMode,
            appLoggingLevel: process.env.APP_LOGGING_LEVEL || fileConfig.appLoggingLevel,
        });

        if (this.config.appLogger) {
            this.logger = this.config.appLogger;
        } else {
            this.logger = initLogger({
                appName: this.config.appName as string,
                devMode: appDevMode,
                destination: this.config.appLoggingDestination,
                level: this.config.appLoggingLevel,
            });
        }

        const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(
            this.config.nkDefaultSensitiveQueryParams?.concat(
                this.config.appSensitiveQueryParams || [],
            ),
            appDevMode,
        );

        const redactSensitiveHeaders = prepareSensitiveHeadersRedacter(
            this.config.nkDefaultSensitiveHeaders?.concat(this.config.appSensitiveHeaders || []),
            this.config.nkDefaultHeadersWithSensitiveUrls?.concat(
                this.config.appHeadersWithSensitiveUrls || [],
            ),
            redactSensitiveQueryParams,
            appDevMode,
        );

        this.utils = {
            redactSensitiveKeys: prepareSensitiveKeysRedacter(
                this.config.nkDefaultSensitiveKeys?.concat(this.config.appSensitiveKeys || []),
            ),
            redactSensitiveHeaders,
            redactSensitiveQueryParams,
            isTrueEnvValue,
        };

        if (this.config.appTracingEnabled === true) {
            const tracingSdk = initTracing(this.config, this.logger);

            this.addShutdownHandler(
                () =>
                    new Promise((resolve) => {
                        tracingSdk.shutdown().then(resolve);
                    }),
            );
        }

        this.ctx = new AppContext('app', {
            config: this.config,
            logger: this.logger,
            utils: this.utils,
            stats: () => {},
        });

        this.ctx.stats = prepareClickhouseClient(this.ctx);

        this.setupShutdownSignals();
    }

    addShutdownHandler(handler: ShutdownHandler) {
        this.shutdownHandlers.push(handler);
    }

    setupDynamicConfig(namespace: string, dynamicConfigSetup: DynamicConfigSetup) {
        new DynamicConfigPoller(this.ctx, namespace, dynamicConfigSetup).startPolling();
    }

    private setupShutdownSignals() {
        const signals = ['SIGTERM', 'SIGINT'] as const;

        const handleSignal: ShutdownHandler = (signal) => {
            signals.forEach((signalName) => process.off(signalName, handleSignal));

            let code = 0;

            const promises = this.shutdownHandlers.map((handler) => {
                const handlePromise = new Promise((resolve) => resolve(handler(signal)));

                return handlePromise.catch((error) => {
                    code = 1;
                    this.ctx.logError('Error executing shutdown handler', error);
                });
            });

            Promise.allSettled(promises).then(() => {
                this.ctx.end();
                process.exit(code);
            });
        };

        signals.forEach((signal) => process.on(signal, handleSignal));
    }
}
