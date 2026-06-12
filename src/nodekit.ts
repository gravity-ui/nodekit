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
import type {tracing} from '@opentelemetry/sdk-node';

interface InitOptions {
    disableDotEnv?: boolean;
    envFilePath?: string;
    configsPath?: string;
    config?: AppConfig;
}

function prepareRedacters(config: AppConfig, appDevMode: boolean) {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(
        config.nkDefaultSensitiveQueryParams?.concat(config.appSensitiveQueryParams || []),
        appDevMode,
    );

    const redactSensitiveHeaders = prepareSensitiveHeadersRedacter(
        config.nkDefaultSensitiveHeaders?.concat(config.appSensitiveHeaders || []),
        config.nkDefaultHeadersWithSensitiveUrls?.concat(config.appHeadersWithSensitiveUrls || []),
        redactSensitiveQueryParams,
        appDevMode,
    );

    const redactSensitiveKeys = prepareSensitiveKeysRedacter(
        config.nkDefaultSensitiveKeys?.concat(config.appSensitiveKeys || []),
    );

    return {redactSensitiveKeys, redactSensitiveHeaders, redactSensitiveQueryParams};
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
            dotenv.config(options.envFilePath ? {path: options.envFilePath} : undefined);
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

        this.utils = {
            ...prepareRedacters(this.config, appDevMode),
            isTrueEnvValue,
        };

        let spanExporter: tracing.SpanExporter | undefined;
        if (this.config.appTracingEnabled === true) {
            const {sdk, tracingSpanExporter} = initTracing(this.config, this.logger);
            spanExporter = tracingSpanExporter;

            this.addShutdownHandler(
                () =>
                    new Promise((resolve) => {
                        sdk.shutdown().then(resolve);
                    }),
            );
        }

        this.ctx = new AppContext('app', {
            config: this.config,
            logger: this.logger,
            utils: this.utils,
            stats: () => {},
            spanExporter,
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

        const timeout = this.config.appShutdownHandlersTimeout;
        const isTimeoutEnabled =
            typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0;

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

            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            if (isTimeoutEnabled) {
                timeoutId = setTimeout(() => {
                    this.ctx.logError(
                        `Shutdown handlers did not complete within ${timeout}ms, forcing exit`,
                    );
                    this.ctx.end();
                    process.exit(1);
                }, timeout);
            }

            Promise.allSettled(promises).then(() => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                this.ctx.end();
                process.exit(code);
            });
        };

        signals.forEach((signal) => process.on(signal, handleSignal));
    }
}
