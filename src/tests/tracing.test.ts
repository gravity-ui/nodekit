import {SpanContext} from 'opentracing';

import {NodeKit} from '..';

const setupNodeKit = () => {
    const nodekit = new NodeKit({
        config: {
            appTracingEnabled: false,
            appTracingServiceName: 'app',
        },
    });

    const traceId = Math.random().toString();
    const spanId = Math.random().toString();

    jest.spyOn(SpanContext.prototype, 'toTraceId').mockImplementation(() => {
        return traceId;
    });

    jest.spyOn(SpanContext.prototype, 'toSpanId').mockImplementation(() => {
        return spanId;
    });

    return {
        nodekit,
        tracing: {
            traceId,
            spanId,
        },
    };
};

test('check traceId and spanId exist at child ctx', () => {
    const {nodekit, tracing} = setupNodeKit();

    const ctx = nodekit.ctx.create('app');

    expect(ctx.getTraceId()).toBe(tracing.traceId);
    expect(ctx.getSpanId()).toBe(tracing.spanId);
});
