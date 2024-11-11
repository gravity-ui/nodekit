import {NodeKit} from '..';
import {TRACE_KEY} from '../lib/consts';

describe('Test NodeKit Tracing', () => {
    let nodekit: NodeKit;
    let traceIdMock = '';
    let spanIdMock = '';
    let traceFlagsMock = '';
    let uberTraceIdMock = ``;
    let headersMock = {};

    beforeAll(() => {
        nodekit = new NodeKit({
            config: {
                appTracingEnabled: true,
                appTracingServiceName: 'app',
            },
        });
    });

    test('tracing w3c  propagation', () => {
        traceIdMock = '4d657700cab8a12bf93b1baea8cf69e3';
        spanIdMock = '4baf8738e7a1c860';
        traceFlagsMock = '01';
        uberTraceIdMock = `00-${traceIdMock}-${spanIdMock}-${traceFlagsMock}`;
        headersMock = {[TRACE_KEY]: uberTraceIdMock};

        const parentSpanContext = nodekit.ctx.extractSpanContext(headersMock);

        const ctx = nodekit.ctx.create('app', {parentSpanContext});

        expect(ctx.getTraceId()).toBe(traceIdMock);

        const currentSpanId = ctx.getSpanId();

        const metadata = ctx.getMetadata();

        expect(metadata[TRACE_KEY]).toBe(`00-${traceIdMock}-${currentSpanId}-${traceFlagsMock}`);
    });

    test('tracing jaeger  propagation', () => {
        const UBER_TRACE_ID_KEY = 'uber-trace-id';
        traceIdMock = '4bf92f3577b34da6a3ce929d0e0e4736';
        spanIdMock = '00f067aa0ba902b7';
        traceFlagsMock = '01';
        uberTraceIdMock = `${traceIdMock}:${spanIdMock}:0:${traceFlagsMock}`;

        headersMock = {[UBER_TRACE_ID_KEY]: uberTraceIdMock};

        const parentSpanContext = nodekit.ctx.extractSpanContext(headersMock);

        const ctx = nodekit.ctx.create('app', {parentSpanContext});

        expect(ctx.getTraceId()).toBe(traceIdMock);

        const currentSpanId = ctx.getSpanId();

        const metadata = ctx.getMetadata();

        expect(metadata[UBER_TRACE_ID_KEY]).toBe(
            `${traceIdMock}:${currentSpanId}:0:${traceFlagsMock}`,
        );
    });
});
