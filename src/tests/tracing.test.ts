import {NodeKit} from '..';
import {TRACE_KEY} from '../lib/consts';

const traceIdMock = '4d657700cab8a12bf93b1baea8cf69e3';
const spanIdMock = '4baf8738e7a1c860';
const traceFlagsMock = '01';
const traceparentMock = `00-${traceIdMock}-${spanIdMock}-${traceFlagsMock}`;
const headersMock = {[TRACE_KEY]: traceparentMock};

describe('Test NodeKit Tracing', () => {
    let nodekit: NodeKit;

    beforeAll(() => {
        nodekit = new NodeKit({
            config: {
                appTracingEnabled: true,
                appTracingServiceName: 'app',
            },
        });
    });

    test('tracing propagation', () => {
        const parentSpanContext = nodekit.ctx.extractSpanContext(headersMock);

        const ctx = nodekit.ctx.create('app', {parentSpanContext});

        expect(ctx.getTraceId()).toBe(traceIdMock);

        const currentSpanId = ctx.getSpanId();

        const metadata = ctx.getMetadata();

        expect(metadata[TRACE_KEY]).toBe(`00-${traceIdMock}-${currentSpanId}-${traceFlagsMock}`);
    });
});
