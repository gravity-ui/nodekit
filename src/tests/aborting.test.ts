import {NodeKit} from '..';

test('is not ended by default', () => {
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

describe('lazy abort signal', () => {
    const nodekit = new NodeKit();

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('does not abort a controller for a context whose signal was never read', () => {
        const parent = nodekit.ctx.create('parent');
        const child = parent.create('child');
        const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

        child.end();

        expect(child.isEnded()).toBe(true);
        expect(abortSpy).not.toHaveBeenCalled();
    });

    it('returns an aborted signal when read after end()', () => {
        const ctx = nodekit.ctx.create('ctx');

        ctx.end();
        const signal = ctx.abortSignal;

        expect(signal.aborted).toBe(true);
        expect((signal.reason as DOMException).name).toBe('AbortError');
        expect(ctx.abortSignal).toBe(signal);
    });

    it('aborts a signal read before end()', () => {
        const ctx = nodekit.ctx.create('ctx');
        const listener = jest.fn();

        ctx.abortSignal.addEventListener('abort', listener);
        ctx.end();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(ctx.abortSignal.aborted).toBe(true);
    });

    it('aborts the signal of a child ended through its parent', () => {
        const parent = nodekit.ctx.create('parent');
        const child = parent.create('child');
        const signal = child.abortSignal;

        parent.end();

        expect(child.isEnded()).toBe(true);
        expect(signal.aborted).toBe(true);
    });
});
