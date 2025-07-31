import {isDefined} from '../../lib/utils/is-defined';

it('successfully checks value for null and undefined', () => {
    expect([null, undefined].filter(isDefined).length).toEqual(0);
});
