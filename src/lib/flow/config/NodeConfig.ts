import {generateHclFile, GenerateHclFileOptions} from "../../terragrunt/terragrunt.js";
import {ITgNodeTypesConfigMap, TgNodeTypes} from "../types/TgNodeTypes.js";
import {ListTgModulesResBody, MyNode} from "../../../api/v0/types.js";

interface NodeConfigProps<T extends TgNodeTypes> {
    tgType: T;
    allowedChildrenTgTypes: ChildConfig[];

    outputFileName?: string;
    tgModuleName?: string;
    nodeType?: string;
    requiredLocals?: string[];
    requiredInputs?: string[];
    hasNoOutput?: boolean;

    // filter remote tgTypes
    canRemoteTgTypeBeChild(remoteTgType: string): boolean;
}

interface ChildConfig {
    limit?: number;
    tgType: TgNodeTypes;
}

export class NodeConfig<T extends TgNodeTypes> {
    tgType!: T;
    allowedChildrenTgTypes!: ChildConfig[];
    outputFileName: string;
    canRemoteTgTypeBeChild!: (remoteTgType: string) => boolean;
    nodeType?: string | undefined;
    requiredLocals?: string[] | undefined;
    tgModuleName?: string | undefined;
    hasNoOutput?: boolean;

    constructor(config: NodeConfigProps<T>) {
        Object.assign(this, config);
        this.outputFileName = config.outputFileName || 'terragrunt.hcl';
    }

    getLocalChildren(
      selectedNodeId: string | undefined,
      allNodes: MyNode[]
    ): string[] {
        return this.allowedChildrenTgTypes
          .filter(child => {
              if (!child.limit) {
                  return true;
              }
              const matchedNodes =
                allNodes.filter(node => selectedNodeId === node.parentId && node.data.tgNodeType === child.tgType);
              return matchedNodes.length < child.limit;
          })
          .map(child => child.tgType);
    }

    getRemoteChildren(
      remoteTgModules: ListTgModulesResBody,
  ) {
        return remoteTgModules
          .map((module) => {
              return module.tgModuleName;
          })
          .filter(this.canRemoteTgTypeBeChild);
    }

    toFileString(opts: Pick<GenerateHclFileOptions, 'locals' | 'inputs'>): string | null {
        if (this.hasNoOutput) {
            return null;
        }
        return generateHclFile({
            tgModuleName: this.tgModuleName,
            fileName: this.outputFileName,
            ...opts
        });
    }
}

const noRemoteChildAllowed = () => false;
const allRemoteChildAllowed = () => true;
export const TgNodeTypesConfigMap: ITgNodeTypesConfigMap = {
    Root: new NodeConfig({
        tgType: 'Root',
        allowedChildrenTgTypes: [{
            tgType: 'AccountSettings',
            limit: 1
        }],
        nodeType: 'ResizableNodeGroupSelected',
        canRemoteTgTypeBeChild: noRemoteChildAllowed
    }),
    AccountSettings: new NodeConfig({
        tgType: 'AccountSettings',
        allowedChildrenTgTypes: [{
            tgType: 'EnvironmentSettings',
            limit: 1
        }],
        nodeType: 'ResizableNodeGroupSelected',
        requiredLocals: [
            'agency_name',
            'account_ref',
            'proj_code',
            'name_format'
        ],
        outputFileName: "account.hcl",
        canRemoteTgTypeBeChild: noRemoteChildAllowed
    }),
    EnvironmentSettings: new NodeConfig({
        tgType: 'EnvironmentSettings',
        allowedChildrenTgTypes: [{
            tgType: 'RegionSettings',
            limit: 1
        }],
        nodeType: 'ResizableNodeGroupSelected',
        requiredLocals: [
            'env_name'
        ],
        outputFileName: 'env.hcl',
        canRemoteTgTypeBeChild: noRemoteChildAllowed
    }),
    RegionSettings: new NodeConfig({
        tgType: 'RegionSettings',
        allowedChildrenTgTypes: [{
            tgType: 'ZoneSettings',
            limit: 2
        }],
        nodeType: 'ResizableNodeGroupSelected',
        requiredLocals: [
            'region'
        ],
        outputFileName: 'region.hcl',
        canRemoteTgTypeBeChild: noRemoteChildAllowed
    }),
    ZoneSettings: new NodeConfig({
        tgType: 'ZoneSettings',
        allowedChildrenTgTypes: [{
            tgType: 'TierSettings',
        }],
        nodeType: 'ResizableNodeGroupSelected',
        requiredLocals: [
            'zone_name',
            'zone_desc'
        ],
        outputFileName: 'zone.hcl',
        canRemoteTgTypeBeChild: noRemoteChildAllowed
    }),
    TierSettings: new NodeConfig({
        tgType: 'TierSettings',
        allowedChildrenTgTypes: [
            {
                tgType: 'Folder'
            },
            {
                tgType: 'File'
            }
        ],
        nodeType: 'ResizableNodeGroupSelected',
        requiredLocals: [
            'tier_name',
            'tier_desc'
        ],
        outputFileName: 'tier.hcl',
        canRemoteTgTypeBeChild: allRemoteChildAllowed
    }),
    Folder: new NodeConfig({
        tgType: 'Folder',
        allowedChildrenTgTypes: [
            {
                tgType: 'Folder'
            },
            {
                tgType: 'File'
            }
        ],
        nodeType: 'ResizableNodeGroupSelected',
        hasNoOutput: true,
        canRemoteTgTypeBeChild: allRemoteChildAllowed
    }),
    File: new NodeConfig({
        tgType: 'File',
        allowedChildrenTgTypes: [],
        nodeType: 'EditableLabelNode',
        hasNoOutput: true,
        canRemoteTgTypeBeChild: noRemoteChildAllowed
    })
};