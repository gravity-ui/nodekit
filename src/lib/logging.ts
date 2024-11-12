import pino from 'pino';
import {Dict} from '../types';

export interface NodekitLogger {
    info(message: string): void;
    info(extra: Dict | undefined, message: string): void;

    error(message: string): void;
    error(extra: Dict | undefined, message: string): void;

    warn(message: string): void;
    warn(extra: Dict | undefined, message: string): void;

    trace(message: string): void;
    trace(extra: Dict | undefined, message: string): void;

    debug(message: string): void;
    debug(extra: Dict | undefined, message: string): void;
}

export class PinoLogger implements NodekitLogger {
    private logger: pino.Logger;

    constructor(logger: pino.Logger) {
        this.logger = logger;
    }
    info(message: string): void;
    info(extra: Dict | undefined, message: string): void;
    info(msgOrExtra: string | Dict | undefined, message?: string): void {
        if (typeof msgOrExtra === 'string') {
            this.logger.info(message);
        } else {
            this.logger.info(msgOrExtra, message);
        }
    }

    warn(message: string): void;
    warn(extra: Dict | undefined, message: string): void;
    warn(msgOrExtra: string | Dict | undefined, message?: string): void {
        if (typeof msgOrExtra === 'string') {
            this.logger.info(message);
        } else {
            this.logger.info(msgOrExtra, message);
        }
    }

    error(message: string): void;
    error(extra: Dict | undefined, message: string): void;
    error(msgOrExtra: string | Dict | undefined, message?: string): void {
        if (typeof msgOrExtra === 'string') {
            this.logger.error(message);
        } else {
            this.logger.error(msgOrExtra, message);
        }
    }

    trace(message: string): void;
    trace(extra: Dict | undefined, message: string): void;
    trace(msgOrExtra: string | Dict | undefined, message?: string): void {
        if (typeof msgOrExtra === 'string') {
            this.logger.trace(message);
        } else {
            this.logger.trace(msgOrExtra, message);
        }
    }

    debug(message: string): void;
    debug(extra: Dict | undefined, message: string): void;
    debug(msgOrExtra: string | Dict | undefined, message?: string): void {
        if (typeof msgOrExtra === 'string') {
            this.logger.debug(message);
        } else {
            this.logger.debug(msgOrExtra, message);
        }
    }
}

/**
 * workaround to provide IntelliSense hints https://stackoverflow.com/a/61048124
 */
export type LoggingLevel = pino.LevelWithSilent | (string & {});

interface InitLoggerOptions {
    appName: string;
    devMode: boolean;
    destination?: pino.DestinationStream;
    level?: LoggingLevel;
}

export function initLogger({appName, devMode, destination, level = 'debug'}: InitLoggerOptions) {
    const transportConfig = devMode
        ? {
              target: 'pino-pretty',
              options: {
                  colorize: true,
                  ignore: 'pid,hostname,name',
                  translateTime: 'HH:MM:ss Z',
              },
          }
        : undefined;

    const options: pino.LoggerOptions = {
        name: appName,
        safe: true,
        level,
        serializers: {
            error: pino.stdSerializers.err,
        },
        transport: transportConfig,
    };

    let pinoInstance: pino.Logger;
    if (destination && !devMode) {
        pinoInstance = pino(options, destination);
    } else {
        pinoInstance = pino(options);
    }

    return new PinoLogger(pinoInstance);
}
