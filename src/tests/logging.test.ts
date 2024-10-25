import {NodeKit} from '..';

const setupNodeKit = () => {
    const logger = {
        write: jest.fn(),
    };

    const nodekit = new NodeKit({config: {appLoggingDestination: logger}});

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
    const traceId = Math.random().toString();
    nodekit.ctx.addLoggerExtra('traceId', traceId);

    // log function with extra ctx data
    nodekit.ctx.log('log info');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({traceId});

    // log function with extra param and extra ctx data
    nodekit.ctx.log('log info', {extra});
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({traceId, extra});

    // logError function with extra param and extra ctx data
    nodekit.ctx.logError('log error', new Error('err'), {extra});
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({
        extra,
        traceId,
        level: 50,
    });
});

test('check logging from nested ctx', () => {
    const {nodekit, logger} = setupNodeKit();

    const traceId = Math.random().toString();
    nodekit.ctx.addLoggerExtra('traceId', traceId);

    // log function from parent ctx
    nodekit.ctx.log('log info');
    let log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({traceId});

    const ctxName = Math.random().toString();
    const logPostfix = Math.random().toString();
    const newCtx = nodekit.ctx.create(ctxName, {loggerPostfix: logPostfix});

    // log function from nested ctx
    newCtx.log('log info');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({traceId, msg: `[${ctxName}] log info ${logPostfix}`});

    // log function from nested ctx with override data
    const anotherTraceId = Math.random().toString();
    newCtx.addLoggerExtra('traceId', anotherTraceId);

    newCtx.log('log info');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({traceId: anotherTraceId});

    // log function from nested ctx with new data
    newCtx.clearLoggerExtra();
    newCtx.addLoggerExtra('anotherTraceId', anotherTraceId);

    newCtx.log('log info');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({traceId, anotherTraceId});

    // logError function from nested ctx with new data
    newCtx.logError('log error');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({
        traceId,
        anotherTraceId,
        msg: `[${ctxName}] log error ${logPostfix}`,
    });
});
