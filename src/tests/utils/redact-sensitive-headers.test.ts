import {REDACTED_STRING} from '../../lib/consts';
import prepareSensitiveHeadersRedacter from '../../lib/utils/redact-sensitive-headers';
import prepareSensitiveQueryParamsRedacter from '../../lib/utils/redact-sensitive-query-params';
import {NodeKit} from '../../nodekit';

it('correctly removes sensitive data from headers', () => {
    const inputHeaders = {
        Cookie: 'some-cookie-value',
        SomeHeader: 'non-secret-header',
        Referer: 'https://example.com/?someSecretParameter=secretValue',
    };

    const queryParamsRedacter = prepareSensitiveQueryParamsRedacter(['someSecretParameter']);
    const headersRedacter = prepareSensitiveHeadersRedacter(
        ['cookie'],
        ['referer'],
        queryParamsRedacter,
    );

    const redactedHeaders = headersRedacter(inputHeaders);

    expect(redactedHeaders['Cookie']).toEqual(REDACTED_STRING);

    const redactedRefererParams = new URL(redactedHeaders['Referer'] as string).searchParams;
    expect(redactedRefererParams.get('someSecretParameter')).toEqual(REDACTED_STRING);
});

it('correctly removes sensitive data from headers using default config', () => {
    const inputHeaders = {
        Cookie: 'some-cookie-value',
        SomeHeader: 'non-secret-header',
        Referer: 'https://example.com/?token=secretValue',
    };

    const nk = new NodeKit({config: {appSensitiveQueryParams: ['token']}});

    const redactedHeaders = nk.utils.redactSensitiveHeaders(inputHeaders);

    expect(redactedHeaders['Cookie']).toEqual(REDACTED_STRING);

    const redactedRefererParams = new URL(redactedHeaders['Referer'] as string).searchParams;
    expect(redactedRefererParams.get('token')).toEqual(REDACTED_STRING);
});
