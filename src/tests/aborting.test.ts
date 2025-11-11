import {NodeKit} from '..';

test('creates signal by default', () => {
    const nodekit = new NodeKit();
    expect(nodekit.ctx.isEnded()).toBe(false);
});

describe('aborts when ctx.end was called', () => {
    it('parent', () => {
        const nodekit = new NodeKit();

        expect(nodekit.ctx.isEnded()).toBe(false);

        nodekit.ctx.end();

        expect(nodekit.ctx.isEnded()).toBe(true);
    });

    it('nested', () => {
        const nodekit = new NodeKit();
        const parent = nodekit.ctx.create('parent');
        const ctx = parent.create('ctx');

        expect(nodekit.ctx.isEnded()).toBe(false);
        expect(parent.isEnded()).toBe(false);
        expect(ctx.isEnded()).toBe(false);

        nodekit.ctx.end();

        expect(nodekit.ctx.isEnded()).toBe(true);
        expect(parent.isEnded()).toBe(true);
        expect(ctx.isEnded()).toBe(true);
    });
});

describe('aborts when ctx.fail was called', () => {
    it('parent', () => {
        const nodekit = new NodeKit({config: {appLoggingDestination: {write: jest.fn()}}});

        expect(nodekit.ctx.isEnded()).toBe(false);

        nodekit.ctx.fail();

        expect(nodekit.ctx.isEnded()).toBe(true);
    });

    it('nested', () => {
        const nodekit = new NodeKit({config: {appLoggingDestination: {write: jest.fn()}}});
        const parent = nodekit.ctx.create('parent');
        const ctx = parent.create('ctx');

        expect(nodekit.ctx.isEnded()).toBe(false);
        expect(parent.isEnded()).toBe(false);
        expect(ctx.isEnded()).toBe(false);

        nodekit.ctx.fail();

        expect(nodekit.ctx.isEnded()).toBe(true);
        expect(parent.isEnded()).toBe(true);
        expect(ctx.isEnded()).toBe(true);
    });
});

describe('parent abort listener cleanup', () => {
    function spyOnSignal(signal: AbortSignal) {
        const s = signal as unknown as {
            addEventListener: (
                type: string,
                listener: EventListenerOrEventListenerObject,
                options?: boolean | AddEventListenerOptions,
            ) => void;
            removeEventListener: (
                type: string,
                listener: EventListenerOrEventListenerObject,
                options?: boolean | EventListenerOptions,
            ) => void;
        };
        const addCalls: Array<
            [
                string,
                EventListenerOrEventListenerObject,
                boolean | AddEventListenerOptions | undefined,
            ]
        > = [];
        const removeCalls: Array<
            [string, EventListenerOrEventListenerObject, boolean | EventListenerOptions | undefined]
        > = [];

        const originalAdd = s.addEventListener.bind(s);
        const originalRemove = s.removeEventListener.bind(s);

        s.addEventListener = (
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | AddEventListenerOptions,
        ) => {
            addCalls.push([type, listener, options]);
            return originalAdd(type, listener, options);
        };
        s.removeEventListener = (
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | EventListenerOptions,
        ) => {
            removeCalls.push([type, listener, options]);
            return originalRemove(type, listener, options);
        };

        return {
            addCalls,
            removeCalls,
            restore() {
                s.addEventListener = originalAdd;
                s.removeEventListener = originalRemove;
            },
        };
    }

    it('removes abort listener on child end()', () => {
        const nodekit = new NodeKit();
        const parent = nodekit.ctx.create('parent');

        const spy = spyOnSignal(parent.abortSignal);

        const child = parent.create('child');

        expect(spy.addCalls.length).toBe(1);
        expect(spy.addCalls[0][0]).toBe('abort');
        const listenerRef = spy.addCalls[0][1];

        child.end();

        expect(spy.removeCalls.length).toBe(1);
        expect(spy.removeCalls[0][0]).toBe('abort');
        expect(spy.removeCalls[0][1]).toBe(listenerRef);

        spy.restore();
    });

    it('removes abort listener on child fail()', () => {
        const nodekit = new NodeKit({config: {appLoggingDestination: {write: jest.fn()}}});
        const parent = nodekit.ctx.create('parent');

        const spy = spyOnSignal(parent.abortSignal);

        const child = parent.create('child');

        expect(spy.addCalls.length).toBe(1);
        expect(spy.addCalls[0][0]).toBe('abort');
        const listenerRef = spy.addCalls[0][1];

        child.fail(new Error('boom'));

        expect(spy.removeCalls.length).toBe(1);
        expect(spy.removeCalls[0][0]).toBe('abort');
        expect(spy.removeCalls[0][1]).toBe(listenerRef);

        spy.restore();
    });
});
