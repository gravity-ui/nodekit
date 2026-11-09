# Migrating to NodeKit 3

## Node.js support

NodeKit 3 requires Node.js 22.21.0 or newer. Update local development, containers, and CI before upgrading. Node.js 20 is no longer supported. CI covers the exact minimum and the latest Node.js 22, 24, and 26 releases.

The minimum uses the Node.js 22 release where [`process.loadEnvFile()` became stable](https://nodejs.org/api/process.html#processloadenvfilepath).

## Environment files

NodeKit no longer depends on dotenv. Its constructor uses `process.loadEnvFile()` instead.

Automatic loading remains enabled. `disableDotEnv: true` still disables it, and `envFilePath` still selects a custom file. Relative paths resolve from the working directory, a leading `~` expands to the home directory, and an empty path selects `.env`. Existing environment values, including empty strings, take precedence over file values. Files are loaded before NodeKit resolves its configuration.

Missing and unreadable files remain non-fatal. Unlike `process.loadEnvFile()` called directly, NodeKit ignores loading errors to preserve its optional-file behavior. Applications that require a file should load it themselves before constructing NodeKit and pass `disableDotEnv: true`.

Review files that depend on dotenv parsing extensions against [Node.js environment-file syntax](https://nodejs.org/api/environment_variables.html#dotenv):

- Use `KEY=value`, not dotenv's `KEY: value` syntax.
- Single- and double-quoted values, literal multiline values, `export` prefixes, and comments are supported.
- In double-quoted values, `\n` becomes a newline, but `\r` stays a literal backslash followed by `r`; dotenv converted both.
- Backslash-escaped quotes do not escape the closing quote in the Node.js parser. Use a different surrounding quote character when a value contains quotes.

`DOTENV_KEY`, encrypted `.env.vault` files, and `DOTENV_CONFIG_*` settings are no longer interpreted. Even when `DOTENV_KEY` is set, NodeKit loads the ordinary environment file. Applications using vaults must decrypt/load their environment before creating NodeKit and set `disableDotEnv: true`.

This change preserves automatic loading rather than implementing the wider configuration redesign proposed in [#12](https://github.com/gravity-ui/nodekit/issues/12).
