import * as dotenv from 'dotenv';
import {NodeKit} from '..';

jest.mock('dotenv');

const mockedDotenv = jest.mocked(dotenv);

beforeEach(() => {
    mockedDotenv.config.mockClear();
});

describe('dotenv integration', () => {
    test('should call dotenv.config quietly by default', () => {
        const nodekit = new NodeKit({config: {appTracingEnabled: false}});
        expect(mockedDotenv.config).toHaveBeenCalledTimes(1);
        expect(mockedDotenv.config).toHaveBeenCalledWith({quiet: true});
        expect(nodekit.config).toBeDefined();
    });

    test('should not call dotenv.config when disableDotEnv is true', () => {
        const nodekit = new NodeKit({disableDotEnv: true, config: {appTracingEnabled: false}});
        expect(mockedDotenv.config).not.toHaveBeenCalled();
        expect(nodekit.config).toBeDefined();
    });

    test('should pass envFilePath as path to dotenv.config', () => {
        const nodekit = new NodeKit({
            envFilePath: '/custom/.env',
            config: {appTracingEnabled: false},
        });
        expect(mockedDotenv.config).toHaveBeenCalledWith({quiet: true, path: '/custom/.env'});
        expect(nodekit.config).toBeDefined();
    });
});
