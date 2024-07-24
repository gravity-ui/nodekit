import {isTrueEnvValue} from '../../lib/utils/is-true-env';

it('successfully checks value for truthfulness', () => {
    expect(isTrueEnvValue('true')).toEqual(true);
    expect(isTrueEnvValue('1')).toEqual(true);
});

it('successfully checks value for untruthfulness', () => {
    expect(isTrueEnvValue('false')).toEqual(false);
    expect(isTrueEnvValue('0')).toEqual(false);
    expect(isTrueEnvValue('')).toEqual(false);
    expect(isTrueEnvValue(undefined)).toEqual(false);
});
