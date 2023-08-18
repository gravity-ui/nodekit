import {isTrueEnvValue} from '../lib/utils/is-true-env';

it('correctly works for true values', () => {
    expect(isTrueEnvValue('1')).toBe(true);
    expect(isTrueEnvValue('true')).toBe(true);
});

it('correctly works for false values', () => {
    expect(isTrueEnvValue('')).toBe(false);
    expect(isTrueEnvValue('0')).toBe(false);
    expect(isTrueEnvValue('123123')).toBe(false);
});
