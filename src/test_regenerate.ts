// Gitlab client START
import {GitlabClient} from "./lib/gitlab.js";
import extract from "extract-zip";
import {basename, join, relative, resolve} from "node:path";
import {access, mkdir, readdir, rm, readFile} from "node:fs/promises"
import {cwd} from "node:process";
import {GetProjectStateResBody, MyEdge, MyNode} from "./api/v0/types.js";
import {randomUUID} from "node:crypto";
import {TgNodeTypes} from "./lib/flow/types/TgNodeTypes.js";
import hcl from "hcl2-parser";
import {fileUploadService} from "./lib/files/base.js";
import {connectToDb} from "./db/db.js";
import {chunk, invert} from "lodash-es";
import crypto from "node:crypto";

interface HclObject {
  include?: Record<string, {path: string}[]>,
  locals?: Record<string, string | number | null>[],
  inputs?: Record<string, string | number | null>,
  dependency?: Record<string, {config_path: string}[]>,
  terraform?: {
    source: string;
  }[];
}

type HclParseResult = [
  null | HclObject,
  null | Record<string, unknown>,
];

interface ExtractDataOptions {
  depth: number;
  uploadedFileIdsTracker: string[],
  parentId?: string;
}

interface ExtractDataOutput {
  nodes: MyNode[];
  nodeIdToPath: Record<string, string>;
  tempEdges: {
    sourceNodePath: string;
    dependencyRelativePath: string;
    sourceNodeId: string;
    dependencyName: string;
  }[];
}

const gitlabClient = new GitlabClient({
  tgModulesProjectPath: "",
  token: process.env.GITLAB_TOKEN!,
});
// Gitlab client END

const usedIds = new Set<string>();

async function main() {
  // sample project id
  const projectId = "wog/htx/cloud/htx-gcc/ica-e-services/ica_common_services/infra/aws_faregate";
  const ref = "ZJBryan";
  // 1. Download zip file
  const outputDir = join(cwd(), "test_generate_output");
  const outputPath = join(outputDir, "archive.zip");

  // 1.1 Clear existing
  await rm(outputDir, {recursive: true});

  try {
    await access(outputDir);
  } catch (e) {
    await mkdir(outputDir)
  }

  await gitlabClient.downloadRepoAsZip(projectId, outputPath, ref);
  // 2. Extract the zip
  await extract(outputPath, {
    dir: outputDir
  });
  // 3. Find the extracted project folder
  const projectName = basename(projectId);
  const files = await readdir(outputDir, {
    withFileTypes: true
  });
  const extractedFolder = files.find(file => file.isDirectory() && file.name.startsWith(projectName));
  if (!extractedFolder) {
    console.log('Unable to find extracted folder');
    return;
  }

  // 4. find the root terragrunt file
  const projectRoot = join(outputDir, extractedFolder.name);
  try {
    await access(join(projectRoot, "terragrunt.hcl"));
  } catch (e) {
    console.log('Unable to find root terragrunt.hcl');
    return;
  }

  // 5. find the accounts
  const projectRootFolders = await readdir(projectRoot, {withFileTypes: true});
  const output: GetProjectStateResBody = {
    nodes: [],
    edges: []
  };
  for (const folder of projectRootFolders) {
    if (!folder.isDirectory()) {
      continue;
    }

    usedIds.clear();
    const resourceOutput = await extractData(projectRoot, join(projectRoot, folder.name));
    output.nodes = output.nodes.concat(resourceOutput.nodes);
    // do a sanity check on the folder paths
    const nodeIds = Object.keys(resourceOutput.nodeIdToPath);
    const paths = new Set(Object.values(resourceOutput.nodeIdToPath));
    // nodeIds is guaranteed to be unique here
    console.log('node paths sizes', nodeIds.length, paths.size);
    if (nodeIds.length !== paths.size) {
      throw new Error(`paths are not unique, ${nodeIds.length} != ${paths.size}`);
    }
    // console.log('resourceOutput', resourceOutput);
    // reconcile edges
    const edges = reconcileEdges(resourceOutput);
    output.edges = output.edges.concat(edges);
  }

  // console.log("to be continued");
  console.log(JSON.stringify(output));
}

function reconcileEdges(extractedData: ExtractDataOutput): MyEdge[] {
  const nodePathToId = invert(extractedData.nodeIdToPath);
  const edges: MyEdge[] = [];
  for (const {
    sourceNodePath,
    dependencyRelativePath,
    sourceNodeId,
    dependencyName
  } of extractedData.tempEdges) {
    const targetFullPath = resolve(sourceNodePath, dependencyRelativePath);
    const targetNodeId = nodePathToId[targetFullPath];
    if (!targetNodeId) {
      throw new Error(`target node not found for path ${dependencyRelativePath}`);
    }

    const id = `edge-${sourceNodeId}_out-${targetNodeId}_in`;
    const edge: MyEdge = {
      id,
      source: sourceNodeId,
      sourceHandle: 'out',
      target: targetNodeId,
      targetHandle: 'in',
      data: {
        enabled: true,
        dependencyName
      },
      zIndex: 1001
    };
    edges.push(edge);
  }
  return edges;
}

async function extractData(projectRoot: string, folderPath: string, opts: ExtractDataOptions = {depth: 0, uploadedFileIdsTracker: []}): Promise<ExtractDataOutput> {
  const output: ExtractDataOutput = {
    nodes: [],
    tempEdges: [],
    nodeIdToPath: {}
  };
  // 1. look for hcl file
  const fileNameMap: Record<string, TgNodeTypes> = {
    "account.hcl": "AccountSettings",
    "env.hcl": "EnvironmentSettings",
    "region.hcl": "RegionSettings",
    "zone.hcl": "ZoneSettings",
    "tier.hcl": "TierSettings",
  };
  let hclFileName: string = "";
  let isGroupNode = false;
  let isFolder = false;

  // node stuff
  let tgNodeType: string = "";

  for (const knownFileName in fileNameMap) {
    try {
      await access(join(folderPath, knownFileName));
      hclFileName = knownFileName;
      isGroupNode = true;
      break;
    } catch (e) {}
  }
  if (!hclFileName) {
    try {
      await access(join(folderPath, "terragrunt.hcl"));
      hclFileName = "terragrunt.hcl";
    } catch (e) {
      if (opts.depth === 0) {
        // todo replace this with a custom error for handling
        throw Error('no hcl file found.');
      }
      hclFileName = "";
      isFolder = true;
      isGroupNode = true;
    }
  }

  // 2. create the node
  let id: string = crypto.createHash("md5")
    .update(relative(projectRoot, folderPath), "utf8")
    .digest("hex");

  while (usedIds.has(id)) {
    id = randomUUID();
  }
  usedIds.add(id);

  // look for direct files and folders
  const dirents = await readdir(folderPath, {
    withFileTypes: true
  });
  const folders: string[] = [];
  const files = new Set<string>();
  for (const file of dirents) {
    const path = join(folderPath, file.name);
    if (file.isDirectory()) {
      folders.push(path)
    } else {
      files.add(path);
    }
  }

  // some resources might have child do a double check here
  if (!isGroupNode && folders.length > 0) {
    isGroupNode = true;
  }

  let type: string;
  if (isGroupNode) {
    type = "ResizableNodeGroupSelected";
  } else {
    type = "EditableLabelNode";
  }
  // folder name of direct parent of hcl file
  let label = basename(folderPath);

  if (isFolder) {
    // Folder
    tgNodeType = "Folder";
  } else if (fileNameMap[hclFileName]) {
    // Account, Env, Region, Zone, Tier
    tgNodeType = fileNameMap[hclFileName];
  }

  let node: MyNode;
  if (isFolder) {
    node = {
      id,
      type,
      position: {x: 0, y: 0}, // populate later when re-arranging
      measured: {width: 0, height: 0}, // populate later when re-arranging
      data: {
        label,
        depth: opts.depth,
        tgNodeType
      }
    };
  } else {
    // Remote
    // try to parse
    // for gitlab resource tgNodeType we need to parse the hcl below to get it
    const hclFilePath = join(folderPath, hclFileName);
    // remove the files to iterate later
    files.delete(hclFilePath);

    // console.log('hclFilePath', hclFilePath);
    // console.log('isFolder', isFolder);
    const content = await readFile(hclFilePath, "utf8");
    const result: HclParseResult = hcl.parseToObject(content);
    if (!result?.[0]) {
      // todo replace this with a custom error for handling
      throw Error('One of the hcl file is invalid');
    }
    const hclObject = result[0];
    if (!tgNodeType) {
      if (!hclObject?.terraform) {
        // todo replace this with a custom error for handling
        throw Error('Hcl file is expected to be a gitlab resource');
      }

      const searchStr = "tg-modules//";
      const source = hclObject.terraform[0].source;
      const startIndex = source.indexOf(searchStr);
      if (startIndex === -1) {
        throw Error('Invalid terraform source url');
      }
      tgNodeType = source.substring(startIndex + searchStr.length).replace(/\/\//g, "/");
    }


    const locals: Record<string, string> = {};
    const hclLocals = hclObject.locals ?? [];
    for (const hclLocal of hclLocals) {
      const converted: Record<string, string> = {};
      for (const key in hclLocal) {
        converted[key] = JSON.stringify(hclLocal[key]);
      }
      Object.assign(locals, converted);
    }

    const hclInputs = hclObject.inputs ?? {};
    const inputs: Record<string, string> = {};
    for (const key in hclInputs) {
      inputs[key] = JSON.stringify(hclInputs[key]);
    }

    // populate edges if any
    // reconcile this after all the nodes have been generated
    if (hclObject.dependency) {
      for (const key in hclObject.dependency) {
        for (const obj of hclObject.dependency[key]) {
          if (obj.config_path) {
            output.tempEdges.push({
              sourceNodePath: folderPath,
              dependencyRelativePath: obj.config_path,
              sourceNodeId: id,
              dependencyName: key
            });
            break;
          }
        }
      }
    }

    node = {
      id,
      type,
      position: {x: 0, y: 0}, // populate later when re-arranging
      measured: {width: 0, height: 0}, // populate later when re-arranging
      data: {
        label,
        depth: opts.depth,
        tgNodeType,
        locals,
        inputs
      }
    };
  }
  if (opts.parentId) {
    node.extent = "parent";
    node.parentId = opts.parentId;
  }
  output.nodeIdToPath[node.id] = folderPath;
  output.nodes.push(node);

  // populate files if any
  for (const file of files) {
    const uploadedFileWithId = await fileUploadService.upload({
      name: basename(file),
      fileLocation: file,
      nodeId: node.id
    });
    if (!node.data.files) {
      node.data.files = [];
    }
    const fileId = uploadedFileWithId._id.toString();
    node.data.files.push({
      fileName: uploadedFileWithId.name,
      fileId
    });
    opts.uploadedFileIdsTracker.push(fileId);
  }

  for (const folder of folders) {
    const {
      nodes,
      tempEdges,
      nodeIdToPath
    } = await extractData(projectRoot, folder, {
      depth: opts.depth + 1,
      parentId: id,
      uploadedFileIdsTracker: opts.uploadedFileIdsTracker
    });
    for (const node of nodes) {
      output.nodes.push(node);
    }
    for (const edge of tempEdges) {
      output.tempEdges.push(edge);
    }
    output.nodeIdToPath = {
      ...output.nodeIdToPath,
      ...nodeIdToPath
    };
  }
  // resize the nodes
  // position the nodes
  // allow configuring number of columns when outputting
  const maxColumnsPerGroup = 2;
  const padding = 30;
  const firstRowYPadding = 55;

  // set default dimension of node
  node.measured.height = 54;
  node.measured.width = 150;
  Object.assign(node, node.measured);

  if (isGroupNode) {
    // for now, stack the nodes vertically
    let totalWidth = 0;
    let totalHeight = 0;
    const directChildren = output.nodes.filter(outputNode => outputNode.parentId === node.id);

    if (directChildren.length > 0) {
      let currentX = 0;
      let currentY = 0;
      let isFirstRow = true;
      for (const smallChunk of chunk(directChildren, maxColumnsPerGroup)) {
        const currentRowHeight = smallChunk.reduce((maxRowHeight, outputNode) =>
          Math.max(maxRowHeight, outputNode.measured.height), 0);
        const effectiveYPadding = isFirstRow ? firstRowYPadding : padding;
        for (const outputNode of smallChunk) {
          // position the node
          outputNode.position.x = currentX + padding;
          outputNode.position.y = currentY + effectiveYPadding;

          currentX = outputNode.position.x + outputNode.measured.width;
        }
        currentY += effectiveYPadding + currentRowHeight;
        currentX = 0;
        isFirstRow = false;
      }

      // use the max x and max y to determine the total width and height
      for (const outputNode of directChildren) {
        totalWidth = Math.max(totalWidth, outputNode.measured.width + outputNode.position.x);
        totalHeight = Math.max(totalHeight, outputNode.measured.height + outputNode.position.y);
      }

      // determine row and column count
      // const rowCount = Math.ceil(directChildren.length / 2);
      // const colCount = directChildren.length >= maxColumnsPerGroup ? maxColumnsPerGroup : directChildren.length;

      // gap between nodes
      // totalHeight += Math.max(0, (rowCount - 1) * padding);
      // totalWidth += Math.max(0, (colCount - 1) * padding);

      // add bottom paddings
      totalWidth += padding;
      totalHeight += padding;

      node.measured.width = totalWidth;
      node.measured.height = totalHeight;
      Object.assign(node, node.measured);
    }
  }

  return output;
}

(async function() {
  const {closeConn} = await connectToDb();
  await main();
  await closeConn();
})();

