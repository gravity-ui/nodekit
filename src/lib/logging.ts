import pino from 'pino';

interface InitLoggerOptions {
    appName: string;
    devMode: boolean;
    destination?: pino.DestinationStream;
}

export function initLogger({appName, devMode, destination}: InitLoggerOptions) {
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

    const options = {
        name: appName,
        safe: true,
        leve: 'debug',
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
