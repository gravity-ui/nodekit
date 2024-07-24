import {REDACTED_STRING} from '../../lib/consts';
import {prepareSensitiveKeysRedacter} from '../../lib/utils/redact-sensitive-keys';
import {NodeKit} from '../../nodekit';
import {Dict} from '../../types';

function getTestData() {
    return {
        someString: 'lorem',
        anotherString: 'ipsum',
        someNumber: 100,
        someObject: {
            someValueInObject: 'hello',
        },
        verySensitiveValue: 42,
        verySensitiveObject: {
            someDataInSensitiveObject: 200,
        },
        someNonSensitiveObject: {
            verySensitiveValue: 300,
        },
        VERYSENSITIVEVALUE: 42,
        verysensitivevalue: 42,
    };
}

function getTestConfiguration() {
    return ['verysensitivevalue', 'verysensitiveobject'];
}

it('removes sensitive data from the input object', () => {
    const redactSensitiveKeys = prepareSensitiveKeysRedacter(getTestConfiguration());
    const redactedData = redactSensitiveKeys(getTestData());

    expect(redactedData.verySensitiveValue).toEqual(REDACTED_STRING);
    expect(redactedData.verySensitiveObject).toEqual(REDACTED_STRING);
});

it('removes sensitive keys regardless of their case', () => {
    const redactSensitiveKeys = prepareSensitiveKeysRedacter(getTestConfiguration());
    const redactedData = redactSensitiveKeys(getTestData());

    expect(redactedData.VERYSENSITIVEVALUE).toEqual(REDACTED_STRING);
    expect(redactedData.verysensitivevalue).toEqual(REDACTED_STRING);
});

it('removes sensitive keys regardless of case in configuration', () => {
    const redactSensitiveKeys = prepareSensitiveKeysRedacter(
        getTestConfiguration().map((s) => s.toUpperCase()),
    );
    const redactedData = redactSensitiveKeys(getTestData());

    expect(redactedData.VERYSENSITIVEVALUE).toEqual(REDACTED_STRING);
    expect(redactedData.verysensitivevalue).toEqual(REDACTED_STRING);
});

it('does not affect data inside objects', () => {
    const redactSensitiveKeys = prepareSensitiveKeysRedacter(getTestConfiguration());
    const redactedData = redactSensitiveKeys(getTestData());

    expect((redactedData.someNonSensitiveObject as Dict).verySensitiveValue).toEqual(300);
});

it('contains default sensitive values', () => {
    const nk = new NodeKit();

    const inputData = {
        nonSensitiveData: 42,
        authorization: 'some-auth-token',
        cookie: 'some-cookie',
    };
    const redactedData = nk.utils.redactSensitiveKeys(inputData);

    expect(redactedData.nonSensitiveData).toEqual(42);
    expect(redactedData.authorization).toEqual(REDACTED_STRING);
    expect(redactedData.cookie).toEqual(REDACTED_STRING);
});

it('conbines default sensitive values with additional from configuration', () => {
    const nk = new NodeKit({
        config: {
            appSensitiveKeys: ['appLevelSensitiveKey'],
        },
    });

    const inputData = {
        nonSensitiveData: 42,
        authorization: 'some-auth-token',
        cookie: 'some-cookie',
        appLevelSensitiveKey: 'some-data',
    };
    const redactedData = nk.utils.redactSensitiveKeys(inputData);

    expect(redactedData.nonSensitiveData).toEqual(42);
    expect(redactedData.authorization).toEqual(REDACTED_STRING);
    expect(redactedData.cookie).toEqual(REDACTED_STRING);
    expect(redactedData.appLevelSensitiveKey).toEqual(REDACTED_STRING);
});
