import {NodeKit} from '..';
import {AppContextParams} from '../types';
import {
    REQUEST_ID_PARAM_NAME,
    USER_ID_PARAM_NAME,
    USER_LANGUAGE_PARAM_NAME,
} from '../lib/public-consts';

const setupNodeKit = () => {
    const nodekit = new NodeKit({
        config: {
            appName: 'test-app',
            appVersion: '1.0.0',
            appTracingEnabled: false,
        },
    });

    return {nodekit};
};

describe('AppContext Params', () => {
    describe('basic functionality', () => {
        test('should create context with initial parameters', () => {
            const {nodekit} = setupNodeKit();
            const context = nodekit.ctx;

            context.set(REQUEST_ID_PARAM_NAME, 'req-123');
            context.set(USER_ID_PARAM_NAME, 'user-456');

            expect(context.get(REQUEST_ID_PARAM_NAME)).toBe('req-123');
            expect(context.get(USER_ID_PARAM_NAME)).toBe('user-456');
        });

        test('should set and get parameters', () => {
            const {nodekit} = setupNodeKit();
            const context = nodekit.ctx;

            context.set(REQUEST_ID_PARAM_NAME, 'new-request-id');
            expect(context.get(REQUEST_ID_PARAM_NAME)).toBe('new-request-id');
        });

        test('should create child context', () => {
            const {nodekit} = setupNodeKit();
            const parentContext = nodekit.ctx;

            parentContext.set(REQUEST_ID_PARAM_NAME, 'parent-req-id');

            const childContext = parentContext.create('child');
            expect(childContext.get(REQUEST_ID_PARAM_NAME)).toBe('parent-req-id');
        });
    });

    describe('non-inheritable parameters', () => {
        test('should not inherit non-inheritable parameters in child context', () => {
            const {nodekit} = setupNodeKit();
            const parentContext = nodekit.ctx;

            // Set both inheritable and non-inheritable parameters
            parentContext.set(REQUEST_ID_PARAM_NAME, 'inheritable-id', {inheritable: true});
            parentContext.set(USER_ID_PARAM_NAME, 'non-inheritable-id', {inheritable: false});

            const childContext = parentContext.create('child');

            // Should inherit inheritable parameter
            expect(childContext.get(REQUEST_ID_PARAM_NAME)).toBe('inheritable-id');
            // Should NOT inherit non-inheritable parameter
            expect(childContext.get(USER_ID_PARAM_NAME)).toBeUndefined();
        });

        test('should inherit inheritable parameters by default', () => {
            const {nodekit} = setupNodeKit();
            const parentContext = nodekit.ctx;

            // Set parameter without specifying inheritable (should default to true)
            parentContext.set(REQUEST_ID_PARAM_NAME, 'default-inheritable-id');

            const childContext = parentContext.create('child');
            expect(childContext.get(REQUEST_ID_PARAM_NAME)).toBe('default-inheritable-id');
        });

        test('should handle multiple non-inheritable parameters', () => {
            const {nodekit} = setupNodeKit();
            const parentContext = nodekit.ctx;

            // Set multiple non-inheritable parameters
            parentContext.set(REQUEST_ID_PARAM_NAME, 'req-1', {inheritable: false});
            parentContext.set(USER_ID_PARAM_NAME, 'user-1', {inheritable: false});
            parentContext.set(USER_LANGUAGE_PARAM_NAME, 'en', {inheritable: false});

            // Set one inheritable parameter
            parentContext.set('customParam' as keyof AppContextParams, 'inheritable-value');

            const childContext = parentContext.create('child');

            // Non-inheritable parameters should not be present
            expect(childContext.get(REQUEST_ID_PARAM_NAME)).toBeUndefined();
            expect(childContext.get(USER_ID_PARAM_NAME)).toBeUndefined();
            expect(childContext.get(USER_LANGUAGE_PARAM_NAME)).toBeUndefined();

            // Inheritable parameter should be present
            expect(childContext.get('customParam' as keyof AppContextParams)).toBe(
                'inheritable-value',
            );
        });

        test('should preserve non-inheritable parameters in parent context', () => {
            const {nodekit} = setupNodeKit();
            const parentContext = nodekit.ctx;

            parentContext.set(REQUEST_ID_PARAM_NAME, 'parent-only-id', {inheritable: false});

            const childContext = parentContext.create('child');

            // Parent should still have the parameter
            expect(parentContext.get(REQUEST_ID_PARAM_NAME)).toBe('parent-only-id');
            // Child should not have it
            expect(childContext.get(REQUEST_ID_PARAM_NAME)).toBeUndefined();
        });

        test('should allow child context to set its own non-inheritable parameters', () => {
            const {nodekit} = setupNodeKit();
            const parentContext = nodekit.ctx;

            const childContext = parentContext.create('child');

            // Child sets its own non-inheritable parameter
            childContext.set(USER_ID_PARAM_NAME, 'child-user-id', {inheritable: false});

            // Parent should not have this parameter
            expect(parentContext.get(USER_ID_PARAM_NAME)).toBeUndefined();
            // Child should have it
            expect(childContext.get(USER_ID_PARAM_NAME)).toBe('child-user-id');
        });

        test('should handle nested inheritance correctly', () => {
            const {nodekit} = setupNodeKit();
            const parentContext = nodekit.ctx;

            // Parent sets inheritable and non-inheritable parameters
            parentContext.set(REQUEST_ID_PARAM_NAME, 'parent-req', {inheritable: true});
            parentContext.set(USER_ID_PARAM_NAME, 'parent-user', {inheritable: false});

            const childContext = parentContext.create('child');

            // Child sets its own non-inheritable parameter
            childContext.set(USER_LANGUAGE_PARAM_NAME, 'child-lang', {inheritable: false});

            const grandchildContext = childContext.create('grandchild');

            // Grandchild should inherit from parent (inheritable only)
            expect(grandchildContext.get(REQUEST_ID_PARAM_NAME)).toBe('parent-req');
            expect(grandchildContext.get(USER_ID_PARAM_NAME)).toBeUndefined();
            expect(grandchildContext.get(USER_LANGUAGE_PARAM_NAME)).toBeUndefined();
        });

        test('should override inheritable parameters in child context', () => {
            const {nodekit} = setupNodeKit();
            const parentContext = nodekit.ctx;

            parentContext.set(REQUEST_ID_PARAM_NAME, 'parent-req-id');

            const childContext = parentContext.create('child');
            childContext.set(REQUEST_ID_PARAM_NAME, 'child-req-id');

            // Child should have its own value
            expect(childContext.get(REQUEST_ID_PARAM_NAME)).toBe('child-req-id');

            // Parent should still have its original value
            expect(parentContext.get(REQUEST_ID_PARAM_NAME)).toBe('parent-req-id');
        });

        test('should handle parameter updates correctly', () => {
            const {nodekit} = setupNodeKit();
            const parentContext = nodekit.ctx;

            // Initially set as inheritable
            parentContext.set(REQUEST_ID_PARAM_NAME, 'initial-value');

            const childContext = parentContext.create('child');
            expect(childContext.get(REQUEST_ID_PARAM_NAME)).toBe('initial-value');

            // Update parent parameter
            parentContext.set(REQUEST_ID_PARAM_NAME, 'updated-value');
            expect(parentContext.get(REQUEST_ID_PARAM_NAME)).toBe('updated-value');

            // Child should still have the old value (parameters are copied at creation time)
            expect(childContext.get(REQUEST_ID_PARAM_NAME)).toBe('initial-value');
        });
    });
});
