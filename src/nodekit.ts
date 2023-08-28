import {initTracer, JaegerTracer} from 'jaeger-client';
import * as dotenv from 'dotenv';
import {loadFileConfigs} from './lib/file-configs';
import {AppConfig, ShutdownHandler} from './types';
import {isTrueEnvValue} from './lib/utils/is-true-env';
import {initLogger} from './lib/logging';
import pino from 'pino';
import {AppContext} from './lib/context';
import {NODEKIT_BASE_CONFIG} from './lib/base-config';
import {
    prepareSensitiveKeysRedacter,
    SensitiveKeysRedacter,
} from './lib/utils/redact-sensitive-keys';
import {prepareClickhouseClient} from './lib/telemetry/clickhouse';
import {DynamicConfigSetup, DynamicConfigPoller} from './lib/dynamic-config-poller';
import prepareSensitiveHeadersRedacter, {
    SensitiveHeadersRedacter,
} from './lib/utils/redact-sensitive-headers';
import prepareSensitiveQueryParamsRedacter, {
    SensitiveQueryParamsRedacter,
} from './lib/utils/redact-sensitive-query-params';

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
        isTrueEnvValue: (arg: string) => boolean;
    };

    private logger: pino.Logger;
    private tracer: JaegerTracer;

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

        this.logger = initLogger({
            appName: this.config.appName as string,
            devMode: appDevMode,
            destination: this.config.appLoggingDestination,
            level: this.config.appLoggingLevel,
        });

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

        this.tracer = initTracer(
            {
                disable: !(this.config.appTracingEnabled === true),
                serviceName: this.config.appTracingServiceName || this.config.appName,
                sampler: this.config.appTracingSampler || {type: 'probabilistic', param: 1},
                reporter: {
                    logSpans: this.config.appTracingDebugLogging,
                    agentHost: this.config.appTracingAgentHost,
                    agentPort: this.config.appTracingAgentPort,
                },
            },
            {
                logger: {
                    info: (msg: string) => this.logger.info(msg),
                    error: (msg: string) => this.logger.error(msg),
                },
            },
        );

        this.ctx = new AppContext('app', {
            config: this.config,
            logger: this.logger,
            tracer: this.tracer,
            utils: this.utils,
            stats: () => {},
        });

        this.ctx.stats = prepareClickhouseClient(this.ctx);

        this.addShutdownHandler(() => new Promise<void>((resolve) => this.tracer.close(resolve)));

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

            Promise.allSettled(promises).then(() => process.exit(code));
        };

        signals.forEach((signal) => process.on(signal, handleSignal));
    }
}
