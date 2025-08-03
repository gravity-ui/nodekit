export const isDefined = <T>(val: T | undefined | null): val is T =>
    val !== undefined && val !== null;
