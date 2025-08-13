import {NodeKit} from '..';

test('creates signal by default', () => {
    const nodekit = new NodeKit();
    expect(nodekit.ctx.abortSignal.aborted).toBe(false);
});

describe('aborts when ctx.end was called', () => {
    it('parent', () => {
        const nodekit = new NodeKit();

        expect(nodekit.ctx.abortSignal.aborted).toBe(false);

        nodekit.ctx.end();

        expect(nodekit.ctx.abortSignal.aborted).toBe(true);
    });

    it('nested', () => {
        const nodekit = new NodeKit();
        const parent = nodekit.ctx.create('parent');
        const ctx = parent.create('ctx');

        expect(nodekit.ctx.abortSignal.aborted).toBe(false);
        expect(parent.abortSignal.aborted).toBe(false);
        expect(ctx.abortSignal.aborted).toBe(false);

        nodekit.ctx.end();

        expect(nodekit.ctx.abortSignal.aborted).toBe(true);
        expect(parent.abortSignal.aborted).toBe(true);
        expect(ctx.abortSignal.aborted).toBe(true);
    });
});

describe('aborts when ctx.fail was called', () => {
    it('parent', () => {
        const nodekit = new NodeKit({config: {appLoggingDestination: {write: jest.fn()}}});

        expect(nodekit.ctx.abortSignal.aborted).toBe(false);

        nodekit.ctx.fail();

        expect(nodekit.ctx.abortSignal.aborted).toBe(true);
    });

    it('nested', () => {
        const nodekit = new NodeKit({config: {appLoggingDestination: {write: jest.fn()}}});
        const parent = nodekit.ctx.create('parent');
        const ctx = parent.create('ctx');

        expect(nodekit.ctx.abortSignal.aborted).toBe(false);
        expect(parent.abortSignal.aborted).toBe(false);
        expect(ctx.abortSignal.aborted).toBe(false);

        nodekit.ctx.fail();

        expect(nodekit.ctx.abortSignal.aborted).toBe(true);
        expect(parent.abortSignal.aborted).toBe(true);
        expect(ctx.abortSignal.aborted).toBe(true);
    });
});
