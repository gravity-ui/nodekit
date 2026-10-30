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

it('removes value of sensitive parameters passed in url fragment', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['access_token']);

    const redactedUrl = redactSensitiveQueryParams(
        'https://example.com/callback#access_token=sensitiveData&state=42',
    );
    expect(redactedUrl.includes('sensitiveData')).toBe(false);

    const redactedParams = new URLSearchParams(new URL(redactedUrl).hash.slice(1));
    expect(redactedParams.get('access_token')).toEqual(REDACTED_STRING);
    expect(redactedParams.get('state')).toEqual('42');
});

it('removes value of sensitive parameters passed after path in url fragment', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);

    const redactedUrl = redactSensitiveQueryParams('/callback#/some/path?token=sensitiveData&a=1');
    expect(redactedUrl.includes('sensitiveData')).toBe(false);
    expect(redactedUrl.startsWith('/callback#/some/path?')).toBe(true);
    expect(redactedUrl.includes('a=1')).toBe(true);
});

it('keeps urls without sensitive parameters as is', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);

    expect(redactSensitiveQueryParams('/some/path?foo=42#section-1')).toEqual(
        '/some/path?foo=42#section-1',
    );
    expect(redactSensitiveQueryParams('https://example.com/?foo=42#a=1')).toEqual(
        'https://example.com/?foo=42#a=1',
    );
});

it('does not throw on values that are not parsable urls', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);

    expect(redactSensitiveQueryParams('http://[notAnUrl')).toEqual('http://[notAnUrl');
    expect(redactSensitiveQueryParams('http://[notAnUrl?token=sensitiveData')).toEqual(
        REDACTED_STRING,
    );
});
