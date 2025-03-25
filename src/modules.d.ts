declare module "@evops/hcl-terraform-parser" {
    export interface Variable {
        name: string;
        type: string;
        default: any;
        required: boolean;
        description?: string;
    }
    interface Result {
        variables: Record<string, Variable>;
    }
    function parse(content: string): Result;

    export = {
        parse
    };
}