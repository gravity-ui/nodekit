import {DEFAULT_TICK_INTERVAL, prepareBatchedQueue} from '../../lib/utils/batch';

jest.useFakeTimers({legacyFakeTimers: true});

const getSendHelpers = () => {
    let sendShouldFail = false;
    let sent: Array<number> = [];

    return {
        send: (messages: typeof sent) => {
            return new Promise<void>((resolve, reject) => {
                if (sendShouldFail) {
                    reject('sending failed');
                } else {
                    sent = sent.concat(messages);
                    resolve();
                }
            });
        },
        getSent: () => sent,
        setSendToFail: () => {
            sendShouldFail = true;
        },
        setSendToSucceed: () => {
            sendShouldFail = false;
        },
    };
};

const getRandomArray = (n = 10, getValue = () => Math.random()) =>
    Array(n).fill(undefined).map(getValue);
const sum = (arr: Array<number>) => arr.reduce((acc, current) => acc + current, 0);
const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

it('successfully sends payloads', async () => {
    const messages = getRandomArray();
    const correctSum = sum(messages);

    const {send, getSent} = getSendHelpers();
    const {push} = prepareBatchedQueue({fn: send});

    messages.forEach(push);

    jest.advanceTimersByTime(DEFAULT_TICK_INTERVAL);

    expect(sum(getSent())).toEqual(correctSum);
});

it('correctly manages backlog of messages', async () => {
    const messages = getRandomArray(150, () => 1);

    const {send, getSent} = getSendHelpers();
    const {push, getBacklogSize} = prepareBatchedQueue({
        fn: send,
        backlogSize: 150,
        batchSize: 50,
    });

    messages.forEach(push);
    expect(getBacklogSize()).toEqual(150);

    jest.advanceTimersByTime(DEFAULT_TICK_INTERVAL);
    expect(getBacklogSize()).toEqual(100);
    expect(sum(getSent())).toEqual(50);

    jest.advanceTimersByTime(DEFAULT_TICK_INTERVAL);
    expect(getBacklogSize()).toEqual(50);
    expect(sum(getSent())).toEqual(100);

    jest.advanceTimersByTime(DEFAULT_TICK_INTERVAL);
    expect(getBacklogSize()).toEqual(0);
    expect(sum(getSent())).toEqual(150);
});

it('retries to send failed payloads', async () => {
    const messages = getRandomArray();
    const correctSum = sum(messages);

    const {send, getSent, setSendToFail, setSendToSucceed} = getSendHelpers();
    const {push} = prepareBatchedQueue({fn: send, logError: () => {}});

    setSendToFail();
    messages.forEach(push);

    jest.advanceTimersByTime(DEFAULT_TICK_INTERVAL);
    expect(getSent().length).toEqual(0);

    // advanceTimersByTime не работает с промисами
    await flushPromises();

    setSendToSucceed();
    jest.advanceTimersByTime(DEFAULT_TICK_INTERVAL);
    expect(sum(getSent())).toEqual(correctSum);
});

it('does not retry more than three times', async () => {
    const messages = getRandomArray();

    const {send, getSent, setSendToFail} = getSendHelpers();
    const {push, getBacklogSize} = prepareBatchedQueue({fn: send, logError: () => {}});

    setSendToFail();
    messages.forEach(push);

    jest.advanceTimersByTime(DEFAULT_TICK_INTERVAL * 5);
    expect(getSent().length).toEqual(0);
    expect(getBacklogSize()).toEqual(0);
});

it('does not overflow backlog', async () => {
    const messages = getRandomArray(200, () => 1);
    const LIMITED_BACKLOG_SIZE = 50;

    const {send, getSent} = getSendHelpers();
    const {push} = prepareBatchedQueue({
        fn: send,
        backlogSize: LIMITED_BACKLOG_SIZE,
        logError: () => {},
    });

    messages.forEach(push);

    // Ждем подольше, чтобы успели отработать все батчи
    jest.advanceTimersByTime(DEFAULT_TICK_INTERVAL * 5);
    expect(sum(getSent())).toEqual(LIMITED_BACKLOG_SIZE);
});
