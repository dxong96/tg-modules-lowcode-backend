import {groupBy, keyBy} from "lodash-es";
import path from "path";
import JSZip from "jszip";
import * as TgModuleTypes from "../flow/types/TgModuleTypes.js"
import {rootTerragruntHcl} from "./templates/root/terragrunt.hcl.js";
import {TgNodeTypesConfigMap} from "../flow/config/NodeConfig.js";
import {isTgNodeTypes, TgNodeTypes} from "../flow/types/TgNodeTypes.js";
import {MyEdge, MyNode} from "../../api/v0/types.js";
import {fileUploadService} from "../files/base.js";

const terraformSourceBasePath = 'git::git@sgts.gitlab-dedicated.com:wog/mha/ica-e-services/ica_common_services/app/aws_tg.git//tg-modules//';

const template = `
terraform {
    source = "{{source}}"
}

include "root" {
    path = find_in_parent_folders()
}
`;

export interface Dependency {
  name: string;
  configPath: string;
}

export interface GenerateHclFileOptions {
    tgModuleName?: string;
    folderName?: string;
    fileName?: string;
    locals?: Record<string, string>;
    inputs?: Record<string, string>;
    // purposefully as there is a dependencies block in terragrunt
    namedDependencies?: Record<string, Dependency>;
}

export function generateHclFile({
                                    tgModuleName,
                                    fileName = "terragrunt.hcl",
                                    locals = {},
                                    inputs = {},
                                  namedDependencies = {}
                                }: GenerateHclFileOptions) {
    let outputTemplate: string;
    if (tgModuleName) {
        outputTemplate = template.replace("{{source}}", terraformSourceBasePath + tgModuleName);
    } else {
        outputTemplate = "";
    }
    outputTemplate = `# ${fileName}\n\n${outputTemplate}`;
    const localEntries = Object.entries(locals);
    const inputEntries = Object.entries(inputs);

    outputTemplate += `
locals {
`;
    localEntries.forEach(([key, value]) => {
       outputTemplate += `  ${key} = ${value}\n`;
    });
    outputTemplate += `
}
`;

    if (inputEntries.length > 0) {
      outputTemplate += `
inputs = {
`;
      inputEntries.forEach(([key, value]) => {
        outputTemplate += `  ${key} = ${value}\n`;
      });
      outputTemplate += `
}
`;
    }

    for (const dep of Object.values(namedDependencies)) {
      outputTemplate += `
dependency "${dep.name}" {
  config_path = "${dep.configPath}";
}
`;
    }

    return outputTemplate;
}

export function generateFilePaths(
  flowNodes: MyNode[],
  childNodesByParentId = groupBy(flowNodes, 'parentId'),
  filePaths: Record<string, string> = {},
  currentNodeId = "undefined",
  currentPath = ""
) {
  // account nodes
  const nodes = childNodesByParentId[currentNodeId];
  if (!nodes) {
    return filePaths;
  }

  for (const node of nodes) {
    const folderName = node.data.label;

    if (!folderName) {
      throw new Error(`Node ${node.data.label} does not have a valid path.`);
    }

    const absPath = filePaths[node.id] = path.join(currentPath,
      removeSymbolsFromFolderName(folderName));
    generateFilePaths(
      flowNodes,
      childNodesByParentId,
      filePaths,
      node.id,
      absPath,
    );
  }
  return filePaths;
}

export async function generateZip(flowNodes: MyNode[], flowEdges: MyEdge[]) {
  /**
   * I need to nodes - ok
   * Make sure at least the account,env,region,zone and 1 tier is present
   * Create the root file
   * Create the subfolders based on the nodes
   *  - Create terragrunt file in the subfolder
   *  - populate the locals and inputs correctly
   * Generate the zip file
   * Download in the browser
   */
  const filePaths: Record<string, string> = generateFilePaths(flowNodes);
  // validate if nodes have the minimum flow nodes 1 of each account,env,region,zone and tier
  const tgTypes = new Set<string>();
  for (const flowNode of flowNodes) {
    tgTypes.add(flowNode.data.tgNodeType);
  }
  const requiredTgTypes = new Set<TgNodeTypes>([
    "AccountSettings",
    "EnvironmentSettings",
    "RegionSettings",
    "ZoneSettings",
    "TierSettings"
  ]);
  const minimumPresentTgTypes = Object.values(TgModuleTypes)
    .filter(tgType => requiredTgTypes.has(tgType));
  for (const tgType of minimumPresentTgTypes) {
    if (!tgTypes.has(tgType)) {
      // todo throw for now may need to change depending on return type
      throw new Error('Nodes are not fully plotted');
    }
  }


  const filePathEntries = Object.entries(filePaths);
  // convert nodes to map by id
  const flowNodeById = keyBy(flowNodes, 'id');
  // convert edges to map
  const flowEdgesBySource = groupBy(flowEdges, 'source');

  const zip = new JSZip();
  zip.file('terragrunt.hcl', rootTerragruntHcl);

  const fileFetchPromises: Promise<void>[] = [];
  for (const [nodeId, folderPath] of filePathEntries) {
    const currentNode = flowNodeById[nodeId];

    const nodeLocals = (currentNode.data.locals ?? {});
    const nodeInputs = (currentNode.data.inputs ?? {});
    const folderZip = zip.folder(folderPath);
    if (!folderZip) {
      throw new Error('somehow folder zip is null');
    }

    // add dependency based on edges
    const currentNodeSourceEdges = flowEdgesBySource[currentNode.id] ?? [];
    const namedDependencies: Record<string, Dependency> = {};
    const currentNodeFolderPath = filePaths[currentNode.id];
    for (const edge of currentNodeSourceEdges) {
      const dependencyName = edge.data?.dependencyName;
      if (!dependencyName) {
        throw new Error('One of the dependency is not named');
      }

      // todo do not render dependency when not enabled
      if (!edge.data?.enabled) {
        continue;
      }

      const targetNodeId = edge.target;
      const targetNodeFolderPath = filePaths[targetNodeId];
      // there is a chance that the target node will not be able to found at this point
      // retry rendering node at another time if this happens
      // if (!targetNodeFolderPath) {
      //   generateNodeIdsAfterAll.add(currentNode.id);
      //   // continue here instead of break because we dunno this is the which attempt
      //   continue;
      // }

      const configPath = path.relative(currentNodeFolderPath, targetNodeFolderPath);
      namedDependencies[dependencyName] = {
        name: dependencyName,
        configPath
      };
    }

    let outputFileName = "terragrunt.hcl";
    let hasNoOutput = false;
    if (isTgNodeTypes(currentNode.data.tgNodeType)) {
      const nodeConfig = TgNodeTypesConfigMap[currentNode.data.tgNodeType];
      outputFileName = nodeConfig.outputFileName;
      hasNoOutput = !!nodeConfig.hasNoOutput;
    }

    if (hasNoOutput) {
      continue;
    }

    const content = generateHclFile({
      locals: nodeLocals,
      inputs: nodeInputs,
      namedDependencies,
      tgModuleName: currentNode.data.tgNodeType
    });

    folderZip.file(outputFileName, content);

    // fetch files into zip
    const files = currentNode.data.files || [];
    const pushFn = Array.prototype.push.bind(fileFetchPromises);
    files
      .map(async (file) => {
        folderZip.file(file.fileName,
          await fileUploadService.downloadFile(file.fileId));
      })
      .forEach(pushFn);
  }

  await Promise.all(fileFetchPromises);
  return zip.generateNodeStream({ streamFiles: true });
}

export function removeSymbolsFromFolderName(folderName: string) {
  return folderName.replace(/"/g, '').replace(/\//g, '_');
}