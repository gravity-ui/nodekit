import { loadFileConfigs } from "../../lib/file-configs";
import path from 'path';

const TEST_MOCK_CONFIG = {
    common: {
        athmosphere: true,
        gravity: 9.81,
    },
    mars: {
        common: {
            gravity: 3.71,
        },
        test: {
            surface: 'marshmallow',
            gravity: 1.23,
        },
        production: {
            surface: 'sand',
        }
    },
    venus: {
        common: {
            gravity: 8.87,
        },
        test: {
            surface: 'nougat',
            gravity: 4.56,
        },
        production: {
            surface: 'stone',
        }
    },
} as Record<string, Record<string, unknown>>;

const MOCK_CONFIG_PATH = './mockConfigs';

jest.doMock(
    path.resolve(MOCK_CONFIG_PATH, `common`),
    () => TEST_MOCK_CONFIG.common,
    {virtual: true},
);

['mars', 'venus'].forEach((installation) => ['common', 'test', 'production'].forEach((environment) => 
    jest.doMock(
        path.resolve(MOCK_CONFIG_PATH, `${installation}/${environment}`),
        () => TEST_MOCK_CONFIG[installation][environment],
        {virtual: true},
)));
  
test('check if we load right common config by default', () => {
    //ARRANGE
    //ACT
    const {gravity} = loadFileConfigs('./mockConfigs');
    //ASSERT
    expect(gravity).toEqual(9.81);
});
  
test('check if we load specific common config without env', () => {
    //ARRANGE
    //ACT
    const {gravity} = loadFileConfigs('./mockConfigs', 'mars');
    //ASSERT
    expect(gravity).toEqual(3.71);
});

test('check if we load default common config if we messed with installation parameter', () => {
    //ARRANGE
    //ACT
    const {gravity} = loadFileConfigs('./mockConfigs', 'phaeton', 'test');
    //ASSERT
    expect(gravity).toEqual(9.81);
});

test('check if we load specific common config if we messed with env parameter', () => {
    //ARRANGE
    //ACT
    const {gravity} = loadFileConfigs('./mockConfigs', 'mars', 'model');
    //ASSERT
    expect(gravity).toEqual(3.71);
});

test('check if we do not overwrite existing parameters with non existing ones', () => {
    //ARRANGE
    //ACT
    const {athmosphere} = loadFileConfigs('./mockConfigs', 'mars', 'test');
    //ASSERT
    expect(athmosphere).toEqual(true);
});

test('check if we correctly overwrite existing parameters', () => {
    //ARRANGE
    //ACT
    const {gravity} = loadFileConfigs('./mockConfigs', 'mars', 'production');
    //ASSERT
    expect(gravity).toEqual(3.71);
});

test('check if we correctly load existing parameters from specific configs', () => {
    //ARRANGE
    //ACT
    const {surface} = loadFileConfigs('./mockConfigs', 'mars', 'test');
    //ASSERT
    expect(surface).toEqual('marshmallow');
});

test('check if we load different configs for different envs', () => {
    //ARRANGE
    //ACT
    const {surface: testSurface} = loadFileConfigs('./mockConfigs', 'mars', 'test');
    const {surface: productionSurface} = loadFileConfigs('./mockConfigs', 'mars', 'production');
    //ASSERT
    expect(testSurface == productionSurface).toEqual(false);
});

test('check if we load different configs for different installations', () => {
    //ARRANGE
    //ACT
    const {gravity: marsSurface} = loadFileConfigs('./mockConfigs', 'mars', 'production');
    const {gravity: venusSurface} = loadFileConfigs('./mockConfigs', 'venus', 'production');
    //ASSERT
    expect(marsSurface == venusSurface).toEqual(false);
});

test('check if we load specific common config if env and installation parameters are OK', () => {
    //ARRANGE
    //ACT
    const {gravity} = loadFileConfigs('./mockConfigs', 'mars', 'test');
    //ASSERT
    expect(gravity).toEqual(1.23);
});

test('check if we load default common config if we messed with env and installation parameters order', () => {
    //ARRANGE
    //ACT
    const {gravity} = loadFileConfigs('./mockConfigs', 'test', 'mars');
    //ASSERT
    expect(gravity).toEqual(9.81);
});

test('check if we load empty config if we messed with configs path', () => {
    //ARRANGE
    //ACT
    const config = loadFileConfigs('./noConfigs', 'mars', 'test');
    //ASSERT
    expect(Object.keys(config).length).toEqual(0);
});

test('check if we load empty config if we skip configs path', () => {
    //ARRANGE
    //ACT
    const config = loadFileConfigs();
    //ASSERT
    expect(Object.keys(config).length).toEqual(0);
});