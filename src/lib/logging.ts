import pino from 'pino';

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

    if (destination && !devMode) {
        return pino(options, destination);
    } else {
        return pino(options);
    }
}
