import {NodeKit, NodeKitLogger} from '..';
import {Dict} from '../types';

const genRandomId = (length: number) => {
    const characters = '0123456789abcde';
    let result = '';

    for (let i = 0; i < length; i += 1) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters.charAt(randomIndex);
    }

    return result;
};

const setupNodeKit = () => {
    const logger = {
        write: jest.fn(),
    };

    const nodekit = new NodeKit({config: {appLoggingDestination: logger, appTracingEnabled: true}});

    return {nodekit, logger};
};

test('check base logging system', () => {
    const {nodekit, logger} = setupNodeKit();

    // log function
    nodekit.ctx.log('log info');
    let log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({
        msg: 'log info',
        level: 30,
    });

    // logError function
    nodekit.ctx.logError('log error');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({
        msg: 'log error',
        level: 50,
    });

    // logError function with error object
    const err = new Error('error object');

    nodekit.ctx.logError('log error with error object', err);
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({
        msg: 'log error with error object',
        level: 50,
        err: {
            message: 'error object',
            type: 'Object',
            stack: expect.stringContaining('Error: error object'),
        },
    });
});

test('check logging with extra data', () => {
    const {nodekit, logger} = setupNodeKit();

    const extra = Math.random().toString();

    // log function with extra param
    nodekit.ctx.log('log info', {extra});
    let log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({extra});

    // add extra data to ctx
    const extraId = Math.random().toString();
    nodekit.ctx.addLoggerExtra('extraId', extraId);

    // log function with extra ctx data
    nodekit.ctx.log('log info');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({extraId});

    // log function with extra param and extra ctx data
    nodekit.ctx.log('log info', {extra});
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({extraId, extra});

    // logError function with extra param and extra ctx data
    nodekit.ctx.logError('log error', new Error('err'), {extra});
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({
        extra,
        extraId,
        level: 50,
    });
});

test('check logging from nested ctx', () => {
    const {nodekit, logger} = setupNodeKit();

    const extraId = Math.random().toString();
    nodekit.ctx.addLoggerExtra('extraId', extraId);

    // log function from parent ctx
    nodekit.ctx.log('log info');
    let log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({extraId});

    const ctxName = Math.random().toString();
    const logPostfix = Math.random().toString();
    const newCtx = nodekit.ctx.create(ctxName, {loggerPostfix: logPostfix});

    // log function from nested ctx
    newCtx.log('log info');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({extraId, msg: `[${ctxName}] log info ${logPostfix}`});

    // log function from nested ctx with override data
    const anotherExtraId = Math.random().toString();
    newCtx.addLoggerExtra('extraId', anotherExtraId);

    newCtx.log('log info');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({extraId: anotherExtraId});

    // log function from nested ctx with new data
    newCtx.clearLoggerExtra();
    newCtx.addLoggerExtra('anotherExtraId', anotherExtraId);

    newCtx.log('log info');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({extraId, anotherExtraId});

    // logError function from nested ctx with new data
    newCtx.logError('log error');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({
        extraId,
        anotherExtraId,
        msg: `[${ctxName}] log error ${logPostfix}`,
    });
});

test('check logging spanId and traceId', () => {
    const {nodekit, logger} = setupNodeKit();

    const UBER_TRACE_ID_KEY = 'uber-trace-id';

    const traceId = genRandomId(32);
    const spanId = genRandomId(16);
    const traceFlags = '01';
    const uberTraceId = `${traceId}:${spanId}:0:${traceFlags}`;

    const headersMock = {[UBER_TRACE_ID_KEY]: uberTraceId};

    const parentSpanContext = nodekit.ctx.extractSpanContext(headersMock);

    const ctxName = Math.random().toString();
    const logPostfix = Math.random().toString();

    const newCtx = nodekit.ctx.create(ctxName, {parentSpanContext, loggerPostfix: logPostfix});

    const newSpanId = newCtx.getSpanId();

    // log function from nested ctx
    newCtx.log('log info');
    const log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({
        traceId,
        spanId: newSpanId,
        msg: `[${ctxName}] log info ${logPostfix}`,
    });
});

test('logging with a custom logger', () => {
    const warnLog = jest.fn();
    const debugLog = jest.fn();
    const infoLog = jest.fn();
    const errorLog = jest.fn();
    const traceLog = jest.fn();
    class CustomLogger implements NodeKitLogger {
        warn(msgOrObject: string | Dict | undefined, message?: string) {
            warnLog(msgOrObject, message);
        }
        debug(msgOrObject: string | Dict | undefined, message?: string) {
            debugLog(msgOrObject, message);
        }
        info(msgOrObject: string | Dict | undefined, message?: string) {
            infoLog(msgOrObject, message);
        }
        error(msgOrObject: string | Dict | undefined, message?: string) {
            errorLog(msgOrObject, message);
        }
        trace(msgOrObject: string | Dict | undefined, message?: string) {
            traceLog(msgOrObject, message);
        }
    }

    const customLogger = new CustomLogger();
    const nodekit = new NodeKit({
        config: {
            appLogger: customLogger,
        },
    });

    const ctx = nodekit.ctx.create('test_ctx');

    ctx.log('test');

    expect(infoLog).toHaveBeenCalledWith(undefined, '[test_ctx] test');

    const err = new Error('test errorLog');
    ctx.logError('errorLog message', err);
    expect(errorLog).toHaveBeenCalledWith(
        {
            err: {
                message: 'test errorLog',
                stack: err.stack,
            },
        },
        '[test_ctx] errorLog message',
    );

    const warnErr = new Error('test warnLog');
    ctx.logWarn('warnLog message', warnErr);
    expect(warnLog).toHaveBeenCalledWith(
        {
            err: {
                message: 'test warnLog',
                stack: warnErr.stack,
            },
        },
        '[test_ctx] warnLog message',
    );
});
