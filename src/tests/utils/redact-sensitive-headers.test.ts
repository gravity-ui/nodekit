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
        Location: 'https://example.com/callback?token=secretValue',
    };

    const nk = new NodeKit({config: {appSensitiveQueryParams: ['token']}});

    const redactedHeaders = nk.utils.redactSensitiveHeaders(inputHeaders);

    expect(redactedHeaders['Cookie']).toEqual(REDACTED_STRING);

    const redactedRefererParams = new URL(redactedHeaders['Referer'] as string).searchParams;
    expect(redactedRefererParams.get('token')).toEqual(REDACTED_STRING);

    const redactedLocationParams = new URL(redactedHeaders['Location'] as string).searchParams;
    expect(redactedLocationParams.get('token')).toEqual(REDACTED_STRING);
});

it('correctly removes sensitive data from relative and multi-value header urls', () => {
    const queryParamsRedacter = prepareSensitiveQueryParamsRedacter(['token']);
    const headersRedacter = prepareSensitiveHeadersRedacter(
        [],
        ['location', 'link'],
        queryParamsRedacter,
    );

    const redactedHeaders = headersRedacter({
        location: '/callback?token=secretValue&a=1',
        link: ['/first?token=secretValue', '/second?token=secretValue'],
    });

    expect(redactedHeaders['location']).toEqual(
        `/callback?token=${encodeURIComponent(REDACTED_STRING)}&a=1`,
    );
    expect(redactedHeaders['link']).toEqual([
        `/first?token=${encodeURIComponent(REDACTED_STRING)}`,
        `/second?token=${encodeURIComponent(REDACTED_STRING)}`,
    ]);
});

it('keeps non-string header values as is', () => {
    const queryParamsRedacter = prepareSensitiveQueryParamsRedacter(['token']);
    const headersRedacter = prepareSensitiveHeadersRedacter(
        [],
        ['location', 'x-cache-ttl'],
        queryParamsRedacter,
    );

    const redactedHeaders = headersRedacter({location: undefined, 'x-cache-ttl': 42});

    expect(redactedHeaders).toEqual({location: undefined, 'x-cache-ttl': 42});
});
