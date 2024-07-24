import {REDACTED_STRING} from '../../lib/consts';
import prepareSensitiveQueryParamsRedacter from '../../lib/utils/redact-sensitive-query-params';

it('removes value of sensitive query parameters', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['someSensitiveKey']);
    const inputUrl =
        'https://example.com/some/path?foo=42&someSensitiveKey=sensitiveData&someOtherData=hello';

    const redactedUrl = redactSensitiveQueryParams(inputUrl);
    expect(redactedUrl.includes('sensitiveData')).toBe(false);

    const redactedParams = new URL(redactedUrl).searchParams;
    expect(redactedParams.get('foo')).toEqual('42');
    expect(redactedParams.get('someOtherData')).toEqual('hello');
    expect(redactedParams.get('someSensitiveKey')).toEqual(REDACTED_STRING);
});
