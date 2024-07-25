import {Dict} from '../../types';
import {REDACTED_STRING} from '../consts';

export type SensitiveKeysRedacter = (inputObject: Dict) => Dict;

export function prepareSensitiveKeysRedacter(keysToRemove: string[] = []) {
    const loweredKeysToRemove = keysToRemove.map((key) => key.toLowerCase());
    const redactSensitiveKeys: SensitiveKeysRedacter = (inputObject: Dict) => {
        return Object.keys(inputObject).reduce((result, key) => {
            if (loweredKeysToRemove.includes(key.toLowerCase())) {
                result[key] = REDACTED_STRING;
            } else {
                result[key] = inputObject[key];
            }
            return result;
        }, {} as Dict);
    };

    return redactSensitiveKeys;
}
