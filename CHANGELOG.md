# Changelog

## [1.0.0](https://github.com/gravity-ui/nodekit/compare/v0.7.0...v1.0.0) (2023-08-31)


### ⚠ BREAKING CHANGES

* **package:** update axios peer dependency
* **loadFileConfigs:** use standard node js algorithm to resolve configs ([#23](https://github.com/gravity-ui/nodekit/issues/23))

### chore

* **package:** update axios peer dependency ([1a5b307](https://github.com/gravity-ui/nodekit/commit/1a5b307bb70511dae9eab2b064ba7af839db7e52))


### Features

* **loadFileConfigs:** use standard node js algorithm to resolve configs ([#23](https://github.com/gravity-ui/nodekit/issues/23)) ([75ab0a7](https://github.com/gravity-ui/nodekit/commit/75ab0a7ef3858ef5a27315fdec02779660a69aaa))

## [0.7.0](https://github.com/gravity-ui/nodekit/compare/v0.6.0...v0.7.0) (2023-08-31)

### Features

- **logging:** add option to control logging level ([#25](https://github.com/gravity-ui/nodekit/issues/25)) ([ab52cb0](https://github.com/gravity-ui/nodekit/commit/ab52cb06fc8cc3b4a767a43bfd2333be35df93ea))
- **tracing:** allow to pass collector endpoint option to tracing reporter ([#26](https://github.com/gravity-ui/nodekit/issues/26)) ([6798b40](https://github.com/gravity-ui/nodekit/commit/6798b4049e1b8527b3d91f4e9768e9bba303b631))

### Bug Fixes

- **tracer:** tracer does not have close method if it is not enabled ([#24](https://github.com/gravity-ui/nodekit/issues/24)) ([98c4a96](https://github.com/gravity-ui/nodekit/commit/98c4a9660279c43e7baf6c18c4998ba417bcf5d0))

## [0.6.0](https://github.com/gravity-ui/nodekit/compare/v0.5.0...v0.6.0)

### Features

- **logging:** add logging destination option ([#22](https://github.com/gravity-ui/nodekit/issues/22)) ([833b5b6](https://github.com/gravity-ui/nodekit/commit/833b5b63794d7aaab77a7ce1c4ce6c7d8dc184d9))

## [0.5.0](https://github.com/gravity-ui/nodekit/compare/v0.4.0...v0.5.0)

### Features

- **package:** update axios ([30e5a6a](https://github.com/gravity-ui/nodekit/commit/30e5a6a16516839fde8e2adc7d8665599e625ee0))

## [0.4.0](https://github.com/gravity-ui/nodekit/compare/v0.3.0...v0.4.0)

### Features

- **utils:** add headers redacter ([#18](https://github.com/gravity-ui/nodekit/issues/18)) ([60318bd](https://github.com/gravity-ui/nodekit/commit/60318bdf501441390c7a594ce6f6000955581d6c))

## [0.3.0](https://github.com/gravity-ui/nodekit/compare/v0.2.0...v0.3.0)

### Features

- add dynamic config poller ([b3fab1f](https://github.com/gravity-ui/nodekit/commit/b3fab1fb0dfa441c99a98aaca996bb368d279fe5))

### Bug Fixes

- improve shutdown handlers ([#13](https://github.com/gravity-ui/nodekit/issues/13)) ([68a9120](https://github.com/gravity-ui/nodekit/commit/68a9120daf7dab90b07a54e28c646a9fb25b9f53))

## [0.2.0](https://github.com/gravity-ui/nodekit/compare/v0.1.0...v0.2.0)

### Features

- add clickhouse telemetry ([#14](https://github.com/gravity-ui/nodekit/pull/14)) ([1913e8c](https://github.com/gravity-ui/nodekit/commit/1913e8c2a7f704d85a7b1fa58ef401d9b6e87ab3))

## 0.1.0

Initial release.
