import {NodeKit} from '..';

const logger = {
    write: jest.fn(),
};

test('check base logging system', () => {
    const nodeKit = new NodeKit({config: {appLoggingDestination: logger}});

    // log function
    nodeKit.ctx.log('log info');
    let log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({
        msg: 'log info',
        level: 30,
    });

    // logError function
    nodeKit.ctx.logError('log error');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({
        msg: 'log error',
        level: 50,
    });

    // logError function with error object
    const err = new Error('error object');

    nodeKit.ctx.logError('log error with error object', err);
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
    const nodeKit = new NodeKit({config: {appLoggingDestination: logger}});

    const extra = Math.random().toString();

    // log function with extra param
    nodeKit.ctx.log('log info', {extra});
    let log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({extra});

    // add extra data to ctx
    const traceId = Math.random().toString();
    nodeKit.ctx.addLoggerExtra('traceId', traceId);

    // log function with extra ctx data
    nodeKit.ctx.log('log info');
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({traceId});

    // log function with extra param and extra ctx data
    nodeKit.ctx.log('log info', {extra});
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({traceId, extra});

    // logError function with extra param and extra ctx data
    nodeKit.ctx.logError('log error', new Error('err'), {extra});
    log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({
        extra,
        traceId,
        level: 50,
    });
});

test('check logging from nested ctx', () => {
    const nodeKit = new NodeKit({config: {appLoggingDestination: logger}});

    const traceId = Math.random().toString();
    nodeKit.ctx.addLoggerExtra('traceId', traceId);

    // log function from parent ctx
    nodeKit.ctx.log('log info');
    let log = JSON.parse(logger.write.mock.lastCall?.pop() || '{}');

    expect(log).toMatchObject({traceId});

    const ctxName = Math.random().toString();
    const logPostfix = Math.random().toString();
    const newCtx = nodeKit.ctx.create(ctxName, {loggerPostfix: logPostfix});

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
