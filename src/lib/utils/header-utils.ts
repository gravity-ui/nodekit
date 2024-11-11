export const headerGetter = {
    keys(carrier: Object): string[] {
        return Object.keys(carrier);
    },
    get(carrier: Record<string, string>, key: string): string | undefined {
        return carrier[key];
    },
};
export const headerSetter = {
    set(carrier: Record<string, string>, key: string, value: string) {
        carrier[key] = value;
    },
};
