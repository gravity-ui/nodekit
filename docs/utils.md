# NodeKit: utils

NodeKit is bundled with a few utility helpers that can be helpful.

## isTrueEnvValue

Returns truy only if input string is equal to "1" or "true". Useful when dealing with values from ENV since they're always strings.

```typescript
nodekit.utils.isTrueEnvValue(process.env.SOMETHING);
```

## redactSensitiveKeys

Replaces content of some keys with a string `[REDACTED]`. By default works on keys `authorization`, `cookie`, `set-cookie`, `password`.

This list can be extended by application using `appSensitiveKeys` option. This function is pretty simple: it does not recursively walk object nor doing some advanced matching. It's a way to manually redact some exact sensitive data when you know that it's there. Internally it's used on all "extra" fields in logs and traces so objects like `headers` won't leak.

```typescript
const inputDict = {cookie: 'abcdef123', anotherKey: 42};
const outputDict = nodekit.utils.redactSensitiveKeys(inputDict);
console.log(outputDict); // {cookie: '[REDACTED]', anotherKey: 42}
```

When development mode is active, this function does not redact anything and just passes the input to the ouput.
