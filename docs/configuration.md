# NodeKit: Configuration

Configuration defines how both NodeKit and your application should work. There are a few ways to define configuration and a few ways to access it.

## Defining configuration

Configuration can be passed to the constructor or can be defined in separate directory as a set of files.

Basic example with a constructor:

```typescript
const nodeKit = new NodeKit({config: {apiEndpoint: 'localhost:4242'}});
nodekit.ctx.log('My api endpoint', {endpoint: nodekit.ctx.config.myApiEndpoint}); // localhost:4242
```

### File-based configuration

You can place all your configuration in a file stored in separate directory and then pass path of that directory in the constructor:

```typescript
// configs/common.ts
export default {apiEndpoint: 'localhost:4242'};

// app.ts
const nodeKit = new NodeKit({configsPath: path.resolve(__dirname, 'configs')});
nodekit.ctx.log('My api endpoint', {endpoint: nodekit.ctx.config.apiEndpoint}); // localhost:4242
```

NodeKit will read that directory and load configuration from the files in it.

Often apps have a number of diferent environments (like staging and production). NodeKit supports them too. In example below, NodeKit will determine current environment using `APP_ENV` env variable and then merge resulting configuration using common and env-specific configuration files:

```typescript
// configs/common.ts
export default {apiEndpoint: 'localhost:4242', someCommonValue: 322};

// configs/staging.ts
export default {apiEndpoint: 'staging.example.com'};

// configs/production.ts
export default {apiEndpoint: 'production.example.com'};

// process.env.APP_ENV is set to "staging"

// app.ts
const nodeKit = new NodeKit({configsPath: path.resolve(__dirname, 'configs')});

nodekit.ctx.log('Configuration', nodekit.config);
// {
//     apiEndpoint: 'staging.example.com',
//     someCommonValue: 322
// }
```

During configuration merge, Nodekit does not apply any kind of deep merge, just simple `Object.assign`. Try to keep your configuration files flat and simple.

In some advanced cases your application can have not only environments but also different **installations**. For example, you can have one app separately deployed in two different departments, using different sets of configuration, each with it's own staging and production environments. Installations in NodeKit are used as another layer above environments and determined in runtime using `APP_INSTALLATION` env varaible.

```typescript
// configs/common.ts
export default {someCommonValue: 322};

// configs/department-one/staging.ts
export default {someCommonValue: 322};
// configs/department-one/production.ts
// ...

// configs/department-two/staging.ts
// ...
// configs/department-two/production.ts
// ...
```

Resulting configuration is merged in the following order (each line overriding previous):

- Default NodeKit config
- File configs (if `configsPath` is passed to the constructor)
  - `configs/common.ts`
  - `configs/<installation>/common.ts` - if an installation is selected
  - `configs/<env>.ts` - if an environment is selected
  - `configs/<installation>/<env>.ts` - if both are selected
- Configuration object (if `config` is passed to the constructor)

The environment and installation can also be selected through the constructor:

```typescript
const nodeKit = new NodeKit({
    configsPath: path.resolve(__dirname, 'configs'),
    config: {appEnv: 'staging', appInstallation: 'department-one'},
});
```

`APP_ENV` and `APP_INSTALLATION` take precedence over their corresponding constructor values. An unset variable falls back to `config.appEnv` or `config.appInstallation`; an explicitly empty variable disables that selection. The resolved selectors are available as `nodekit.config.appEnv` and `nodekit.config.appInstallation` without changing `process.env`. Selectors in configuration files do not select other files or override the resolved values.

### Development mode

`nodekit.config.appDevMode` enables development features such as pretty logs and is available to application code.

The first defined value wins: non-empty `APP_DEV_MODE` → constructor `config.appDevMode` → file configs → `false`. Explicit `false` values, including `APP_DEV_MODE=0`, override lower-priority sources.

We recommend to use `appDevMode` instead of specific development "environment" or "installation" since logically it often carries purposes that can be applied to any environment.

### App name and version

`appName` and `appVersion` fields are used in places like logs to display what application they relate to.

They can be set in configuration and can be overrided with `APP_NAME` and `APP_VERSION` environment variables.

## ENV variables

NodeKit automatically loads `.env` from the current working directory in its constructor using Node.js's built-in [`process.loadEnvFile()`](https://nodejs.org/api/process.html#processloadenvfilepath). Existing environment variables take precedence, including variables set to an empty string. Loading happens before NodeKit resolves configuration.

Missing or unreadable files are ignored, including custom paths. Keep secrets and development overrides in a `.env` file excluded from repository history. Example:

```typescript
// .env
API_TOKEN=123abc
API_ENDPOINT=localhost:3030/v1/
APP_DEV_MODE=1

// app.ts
const nodeKit = new NodeKit();
nodekit.ctx.log(process.env.API_TOKEN); // 123abc
```

To disable automatic loading, pass an option to the constructor:

```typescript
const nodeKit = new NodeKit({disableDotEnv: true});
```

You can also specify a custom path to the `.env` file:

```typescript
const nodeKit = new NodeKit({
    envFilePath: '/custom/path/.env',
});
```

Relative paths resolve from the working directory; a leading `~` expands to the home directory. An empty path uses the default `.env` file.

Values follow [Node.js environment-file syntax](https://nodejs.org/api/environment_variables.html#dotenv). Dotenv-specific settings and encrypted `.env.vault` files are not supported; see the [v3 migration guide](migration-v3.md).

## Accessing configuration

You can access resulting configuration via NodeKit class instance or using any context:

```typescript
// They are the same
ctx.log('My api endpoint', {endpoint: nodekit.config.apiEndpoint});
ctx.log('My api endpoint', {endpoint: ctx.config.apiEndpoint});
```

## Extending interface

To use additional fields in configuration you should extend AppConfig interface:

```typescript
declare module '@gravity-ui/nodekit' {
  interface AppConfig {
    myApiEndpoint: string;
  }
}
```
