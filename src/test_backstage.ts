import {join, relative} from "node:path";
import {access, readdir, readFile} from "node:fs/promises";
import {HclObject} from "./types/hcl2-parser.js";
import hcl from "hcl2-parser"
import fs from "node:fs";
import crypto, {randomUUID} from "node:crypto";
import YAML from "yaml";

interface ResourceNodeBase {
    path: string;
    children: ResourceNode[];
}

type ResourceNode = ResourceNodeBase & (
    | {
        error: string;
    }
    | {
        parsedHcl: HclObject;
    }
)

async function main() {
    // 4. find the root terragrunt file
    const projectRoot = "C:\\Users\\Admin\\Code\\aws_interpro-main";
    try {
        await access(join(projectRoot, "terragrunt.hcl"));
    } catch (e) {
        console.log('Unable to find root terragrunt.hcl');
        return;
    }

    // // 5. find the accounts
    // const projectRootFolders = await readdir(projectRoot, {withFileTypes: true});
    // const output: GetProjectStateResBody = {
    //     nodes: [],
    //     edges: []
    // };
    // for (const folder of projectRootFolders) {
    //     if (!folder.isDirectory()) {
    //         continue;
    //     }
    //
    //     const resourceOutput = await extractData(projectRoot, join(projectRoot, folder.name));
    //     output.nodes = output.nodes.concat(resourceOutput.nodes);
    //     // do a sanity check on the folder paths
    //     const nodeIds = Object.keys(resourceOutput.nodeIdToPath);
    //     const paths = new Set(Object.values(resourceOutput.nodeIdToPath));
    //     // nodeIds is guaranteed to be unique here
    //     console.log('node paths sizes', nodeIds.length, paths.size);
    //     if (nodeIds.length !== paths.size) {
    //         throw new Error(`paths are not unique, ${nodeIds.length} != ${paths.size}`);
    //     }
    //     // console.log('resourceOutput', resourceOutput);
    //     // reconcile edges
    //     const edges = reconcileEdges(resourceOutput);
    //     output.edges = output.edges.concat(edges);
    // }

    const resourceNodes = await extractResourceNodes(projectRoot);
    // console.log(JSON.stringify(resourceNodes, null, 2));
    const {
        yaml: systemEntity,
        systemEntityRef
    } = makeSystemBackstageEntity("aws_interpro");
    const resourceEntities = convertResourceNodeToBackstageEntity("aws_interpro", systemEntityRef, resourceNodes);
    console.log('---');
    console.log(systemEntity);
    for (const entity of resourceEntities) {
        console.log('---');
        console.log(entity);
    }
}

async function extractResourceNodes(folderPath: string, rootPath = folderPath) {
    const result: ResourceNode[] = [];
    // look for hcl file in the folder
    const filesInFolder = await readdir(folderPath, {withFileTypes: true});
    const hclFiles = filesInFolder
        .filter(file => file.isFile() && file.name.endsWith(".hcl"));
    const otherFolders = filesInFolder.filter(file => file.isDirectory());
    for (const hclFile of hclFiles) {
        let resourceNode: ResourceNode;
        let hclParseError: string | undefined;
        let hclObject: HclObject | undefined;

        const hclFilePath = join(folderPath, hclFile.name);
        try {
            await access(hclFilePath, fs.constants.R_OK);
        } catch (e) {
            hclParseError = 'Hcl file cannot be accessed.';
        }

        if (!hclParseError) {
            const hclFileContent = await readFile(hclFilePath, "utf8");
            const parseResult = hcl.parseToObject(hclFileContent);
            if (parseResult?.[0]) {
                hclObject = parseResult[0];
            } else {
                hclParseError = "Hcl file invalid";
            }
        }


        const childrenPromises = await Promise.all(
            otherFolders
                .map(folder => extractResourceNodes(join(folderPath, folder.name), rootPath))
        );
        const children = childrenPromises.reduce((acc, curr) => acc.concat(curr), []);
        if (hclParseError) {
            resourceNode = {
                path: relative(rootPath, hclFilePath),
                children: children,
                error: hclParseError
            };
        } else {
            resourceNode = {
                path: relative(rootPath, hclFilePath),
                children: children,
                parsedHcl: hclObject!
            };
        }
        result.push(resourceNode);
    }
    return result;
}

function makeSystemBackstageEntity(projectName: string) {
    const namespace = normalizeEntityText(projectName);
    const backstageEntity = {
        "apiVersion": "backstage.io/v1alpha1",
        "kind": "System",
        "metadata": {
            "name": "root-project",
            title: projectName,
            namespace
        },
        "spec": {
            "type": "iac",
            "owner": "user:guest",
            "lifecycle": "experimental"
        }
    };
    return {
        systemEntityRef: `system:${namespace}/root-project`,
        yaml: YAML.stringify(backstageEntity)
    };
}

const usedIds = new Set<string>();
function convertResourceNodeToBackstageEntity(projectName: string, systemEntityRef: string, resourceNodes: ResourceNode[], parentName?: string): string[] {
    const result: string[] = [];
    for (const resourceNode of resourceNodes) {
        let id: string = crypto.createHash("md5")
            .update(resourceNode.path, "utf8")
            .digest("hex");

        while (usedIds.has(id)) {
            id = randomUUID();
        }
        usedIds.add(id);
        const namespace = normalizeEntityText(projectName);
        const backstageEntity = {
            "apiVersion": "backstage.io/v1alpha1",
            "kind": "Component",
            "metadata": {
                "name": id,
                "title": resourceNode.path,
                namespace
            },
            "spec": {
                "type": "tg-module",
                "owner": "user:guest",
                "lifecycle": "experimental",
                "system": systemEntityRef,
                ...(parentName && {
                    "subcomponentOf": `component:${namespace}/${parentName}`
                })
            }
        };

        result.push(YAML.stringify(backstageEntity));
        result.push(...convertResourceNodeToBackstageEntity(projectName, systemEntityRef, resourceNode.children, id));
    }

    return result;
}

function normalizeEntityText(text: string) {
    return text.replace(/[^a-z0-9-]/g, '-');
}

main();