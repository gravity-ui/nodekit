import prepareSensitiveHeadersRedacter from '../lib/utils/redact-sensitive-headers';
import {prepareSensitiveKeysRedacter} from '../lib/utils/redact-sensitive-keys';
import prepareSensitiveQueryParamsRedacter from '../lib/utils/redact-sensitive-query-params';

// prepareSensitiveHeadersRedacter
// prepareSensitiveKeysRedacter
// prepareSensitiveQueryParamsRedacter

const redactSensitiveKeys = prepareSensitiveKeysRedacter();
const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter();
const redactSensitiveHeaders = prepareSensitiveHeadersRedacter();

// should we test logging here?
