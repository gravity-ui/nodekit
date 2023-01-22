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
        });

        this.logger = initLogger({
            appName: this.config.appName as string,
            devMode: appDevMode,
        });

        this.utils = {
            redactSensitiveKeys: prepareSensitiveKeysRedacter(
                this.config.nkDefaultSensitiveKeys?.concat(this.config.appSensitiveKeys || []),
            ),
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
        });

        this.addShutdownHandler(() => {
            return new Promise((resolve) => {
                this.tracer.close?.(() => resolve());
            });
        });

        ['SIGTERM', 'SIGINT'].forEach((signal) => {
            process.on(signal, () => {
                Promise.all(this.shutdownHandlers.map((handler) => handler()))
                    .then(() => process.exit(0))
                    .catch((error) => {
                        this.ctx.logError('Error executing shutdown handlers', error);
                        process.exit(1);
                    });
            });
        });
    }

    addShutdownHandler(handler: ShutdownHandler) {
        this.shutdownHandlers.push(handler);
    }
}
