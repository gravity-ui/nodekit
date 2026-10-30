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

it('keeps the origin of a redacted url intact', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);
    const redactedToken = encodeURIComponent(REDACTED_STRING);

    // Local addresses are the ones a redirect points to on a dev installation
    expect(redactSensitiveQueryParams('http://127.0.0.1:8080/cb?token=sensitiveData')).toEqual(
        `http://127.0.0.1:8080/cb?token=${redactedToken}`,
    );
    expect(redactSensitiveQueryParams('http://127.0.0.1/cb?token=sensitiveData')).toEqual(
        `http://127.0.0.1/cb?token=${redactedToken}`,
    );
    expect(
        redactSensitiveQueryParams('http://127.0.0.1.example.com/cb?token=sensitiveData'),
    ).toEqual(`http://127.0.0.1.example.com/cb?token=${redactedToken}`);

    expect(redactSensitiveQueryParams('https://example.com/cb?token=sensitiveData')).toEqual(
        `https://example.com/cb?token=${redactedToken}`,
    );
    expect(redactSensitiveQueryParams('//example.com/cb?token=sensitiveData')).toEqual(
        `//example.com/cb?token=${redactedToken}`,
    );
    expect(redactSensitiveQueryParams('/cb?token=sensitiveData')).toEqual(
        `/cb?token=${redactedToken}`,
    );
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

it('redacts params of values that are not parsable urls', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);

    expect(redactSensitiveQueryParams('http://[notAnUrl')).toEqual('http://[notAnUrl');
    expect(redactSensitiveQueryParams('http://[notAnUrl?token=sensitiveData')).toEqual(
        `http://[notAnUrl?token=${encodeURIComponent(REDACTED_STRING)}`,
    );
});

it('removes value of sensitive params carried outside of the query', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);
    const redactedToken = encodeURIComponent(REDACTED_STRING);

    expect(redactSensitiveQueryParams('/callback;token=sensitiveData')).toEqual(
        `/callback;token=${redactedToken}`,
    );
    expect(redactSensitiveQueryParams('token=sensitiveData')).toEqual(`token=${redactedToken}`);
    // A param nested into the value of another one is still a param
    expect(redactSensitiveQueryParams('/redirect?next=/cb?token=sensitiveData')).toEqual(
        `/redirect?next=/cb?token=${redactedToken}`,
    );
    // Legacy `;` separated params
    expect(redactSensitiveQueryParams('/cb?a=1;token=sensitiveData')).toEqual(
        `/cb?a=1;token=${redactedToken}`,
    );
});

it('removes value of sensitive params of a fragment whose path holds an equals sign', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);
    const redactedToken = encodeURIComponent(REDACTED_STRING);

    // Hash routers put `=` into the path, which must not be taken for the start of the params
    expect(
        redactSensitiveQueryParams('https://example.com/#/folder/id=5?token=sensitiveData'),
    ).toEqual(`https://example.com/#/folder/id=5?token=${redactedToken}`);
    expect(redactSensitiveQueryParams('/cb?a=1&token=first#/x/y=z?token=second')).toEqual(
        `/cb?a=1&token=${redactedToken}#/x/y=z?token=${redactedToken}`,
    );
});

it('keeps params whose name only ends with a sensitive one', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);

    expect(redactSensitiveQueryParams('/cb?csrf_token=notSensitive&a=1')).toEqual(
        '/cb?csrf_token=notSensitive&a=1',
    );
    expect(redactSensitiveQueryParams('/p/csrf_token=notSensitive/view')).toEqual(
        '/p/csrf_token=notSensitive/view',
    );
});

it('redacts a path segment that looks like a sensitive param', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);

    // The rest of the path may belong to the value, so it is dropped rather than leaked
    expect(redactSensitiveQueryParams('/dashboards/token=1/view?a=2')).toEqual(
        `/dashboards/token=${encodeURIComponent(REDACTED_STRING)}`,
    );
});

it('redacts params of a fragment that carries an unencoded question mark', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['access_token']);

    // The `?` belongs to a param value here, so it must not be taken for a params separator
    expect(
        redactSensitiveQueryParams('https://example.com/cb#access_token=sensitiveData&next=/a?b=1'),
    ).toEqual(
        `https://example.com/cb#access_token=${encodeURIComponent(REDACTED_STRING)}&next=/a?b=1`,
    );
    // Here the `?` is part of the sensitive value itself, so it is redacted along with it
    expect(
        redactSensitiveQueryParams('https://example.com/cb#access_token=sensitiveData?x'),
    ).toEqual(`https://example.com/cb#access_token=${encodeURIComponent(REDACTED_STRING)}`);
});

it('matches param names case-insensitively', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);
    const redactedToken = encodeURIComponent(REDACTED_STRING);

    expect(redactSensitiveQueryParams('/cb?TOKEN=sensitiveData')).toEqual(
        `/cb?TOKEN=${redactedToken}`,
    );
    expect(redactSensitiveQueryParams('/cb?Token=sensitiveData')).toEqual(
        `/cb?Token=${redactedToken}`,
    );
});

it('matches percent-encoded param names', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);

    expect(redactSensitiveQueryParams('/cb?to%6Ben=sensitiveData')).toEqual(
        `/cb?to%6Ben=${encodeURIComponent(REDACTED_STRING)}`,
    );
});

it('matches bracketed param names', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);
    const redactedToken = encodeURIComponent(REDACTED_STRING);

    // `qs` style arrays and nested objects carry the name in brackets
    expect(redactSensitiveQueryParams('/cb?token[]=sensitiveData')).toEqual(
        `/cb?token[]=${redactedToken}`,
    );
    expect(redactSensitiveQueryParams('/cb?token[0]=sensitiveData')).toEqual(
        `/cb?token[0]=${redactedToken}`,
    );
    expect(redactSensitiveQueryParams('/cb?auth[token]=sensitiveData')).toEqual(
        `/cb?auth[token]=${redactedToken}`,
    );
    // A merely similar bracketed name is still left alone
    expect(redactSensitiveQueryParams('/cb?auth[csrf_token]=notSensitive')).toEqual(
        '/cb?auth[csrf_token]=notSensitive',
    );
});

it('matches a bracketed param name configured in full', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['auth[token]']);
    const redactedToken = encodeURIComponent(REDACTED_STRING);

    // Standard serialization percent-encodes the brackets
    const query = new URLSearchParams({'auth[token]': 'sensitiveData'}).toString();

    expect(redactSensitiveQueryParams(`/cb?${query}`)).toEqual(
        `/cb?auth%5Btoken%5D=${redactedToken}`,
    );
    expect(redactSensitiveQueryParams('/cb?auth[token]=sensitiveData')).toEqual(
        `/cb?auth[token]=${redactedToken}`,
    );
    // An array or a deeper nesting appends to the name of the configured param
    expect(redactSensitiveQueryParams('/cb?auth[token][]=sensitiveData')).toEqual(
        `/cb?auth[token][]=${redactedToken}`,
    );
    expect(redactSensitiveQueryParams('/cb?auth[token][0]=sensitiveData')).toEqual(
        `/cb?auth[token][0]=${redactedToken}`,
    );
    // A name the config does not ask for is left alone, even when a part of it matches
    expect(redactSensitiveQueryParams('/cb?token=notAsked&auth[id]=notAsked')).toEqual(
        '/cb?token=notAsked&auth[id]=notAsked',
    );
});

it('redacts an input carrying thousands of fragments', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['t']);
    const redactedToken = encodeURIComponent(REDACTED_STRING);

    // Such an input fits into the default http.maxHeaderSize, so it must not exhaust the stack
    const fragmentsCount = 4000;
    const redactedUrl = redactSensitiveQueryParams(
        `https://example.com/#${'t=#'.repeat(fragmentsCount)}`,
    );

    expect(redactedUrl.split(redactedToken)).toHaveLength(fragmentsCount + 1);
});

it('keeps every occurrence of a repeated param', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);
    const redactedToken = encodeURIComponent(REDACTED_STRING);

    expect(redactSensitiveQueryParams('/cb?token=first&a=1&token=second')).toEqual(
        `/cb?token=${redactedToken}&a=1&token=${redactedToken}`,
    );
});

it('keeps unusual url forms and the encoding of untouched parts intact', () => {
    const redactSensitiveQueryParams = prepareSensitiveQueryParamsRedacter(['token']);
    const redactedToken = encodeURIComponent(REDACTED_STRING);

    // No origin may be invented for a scheme-relative url
    expect(redactSensitiveQueryParams('http:/cb?token=sensitiveData')).toEqual(
        `http:/cb?token=${redactedToken}`,
    );
    // Browsers treat backslashes as host separators, so the host must survive in the log
    expect(redactSensitiveQueryParams('\\\\example.com/cb?token=sensitiveData')).toEqual(
        `\\\\example.com/cb?token=${redactedToken}`,
    );
    // Relative inputs keep their form, no leading slash is invented
    expect(redactSensitiveQueryParams('cb?token=sensitiveData')).toEqual(
        `cb?token=${redactedToken}`,
    );
    expect(redactSensitiveQueryParams('../cb?token=sensitiveData')).toEqual(
        `../cb?token=${redactedToken}`,
    );
    // Untouched params are not re-encoded
    expect(redactSensitiveQueryParams('/cb?token=sensitiveData&a=b%20c&d=1+2')).toEqual(
        `/cb?token=${redactedToken}&a=b%20c&d=1+2`,
    );
});
