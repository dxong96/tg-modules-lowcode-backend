export interface HclObject {
    include?: Record<string, {path: string}[]>,
    locals?: Record<string, string | number | null>[],
    inputs?: Record<string, string | number | null>,
    dependency?: Record<string, {config_path: string}[]>,
    terraform?: {
        source: string;
    }[];
}

export type HclParseResult = [
        null | HclObject,
        null | Record<string, unknown>,
];

declare module 'hcl2-parser' {
    export default {
        parseToString: (content: string) => string,
        parseToObject: (content: string) => HclParseResult
    };
}