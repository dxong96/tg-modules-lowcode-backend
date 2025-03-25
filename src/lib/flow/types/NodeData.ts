export interface TgNodeFile {
    fileName: string;
    fileId: string;
}

export interface NodeData extends Record<string, unknown> {
    depth: number;
    label: string;
    tgNodeType: string;
    locals?: Record<string, string>;
    inputs?: Record<string, string>;
    files?: TgNodeFile[];
}