import {AppConfig, NodeKit} from '..';

const setupNodeKit = (config: AppConfig = {}) => {
    const logger = {
        write: jest.fn(),
    };

    const nodekit = new NodeKit({config: {appLoggingDestination: logger, ...config}});

    return {nodekit, logger};
};

describe('shutdown timeout configuration', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    afterEach(() => {
        exitSpy.mockClear();
        jest.useRealTimers();
    });

    test('appShutdownTimeout takes priority over nkDefaultShutdownTimeout', () => {
        jest.useFakeTimers();

        const {nodekit} = setupNodeKit({appShutdownTimeout: 100});

        nodekit.addShutdownHandler(() => new Promise(() => {}));
        process.emit('SIGTERM', 'SIGTERM');

        jest.advanceTimersByTime(99);
        expect(exitSpy).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test('falls back to nkDefaultShutdownTimeout when appShutdownTimeout is absent', () => {
        jest.useFakeTimers();

        const {nodekit} = setupNodeKit({nkDefaultShutdownTimeout: 200});

        nodekit.addShutdownHandler(() => new Promise(() => {}));
        process.emit('SIGTERM', 'SIGTERM');

        jest.advanceTimersByTime(199);
        expect(exitSpy).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test('exits with code 0 when handlers complete before timeout', async () => {
        jest.useFakeTimers();

        const {nodekit} = setupNodeKit({appShutdownTimeout: 1000});

        nodekit.addShutdownHandler(() => Promise.resolve());
        process.emit('SIGTERM', 'SIGTERM');

        await jest.advanceTimersByTimeAsync(0);

        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    test('exits with code 1 when handlers throw errors', async () => {
        jest.useFakeTimers();

        const {nodekit} = setupNodeKit({appShutdownTimeout: 1000});

        nodekit.addShutdownHandler(() => Promise.reject(new Error('handler failed')));
        process.emit('SIGTERM', 'SIGTERM');

        await jest.advanceTimersByTimeAsync(0);

        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test('force-exits with code 1 when handlers hang past timeout', () => {
        jest.useFakeTimers();

        const {nodekit} = setupNodeKit({appShutdownTimeout: 500});

        nodekit.addShutdownHandler(() => new Promise(() => {}));
        process.emit('SIGTERM', 'SIGTERM');

        jest.advanceTimersByTime(500);

        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});
