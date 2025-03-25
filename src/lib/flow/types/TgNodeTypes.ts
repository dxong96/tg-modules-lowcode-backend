import * as TgNodeTypesMap from "./TgModuleTypes.js";
import {NodeConfig} from "../config/NodeConfig.js";

type TgNodeTypesMapType = typeof TgNodeTypesMap;
export type TgNodeTypes = TgNodeTypesMapType[keyof TgNodeTypesMapType];
export type ITgNodeTypesConfigMap = {
    [T in TgNodeTypes]: NodeConfig<T>;
};

export function isTgNodeTypes(tgNodeType: string): tgNodeType is TgNodeTypes {
    return Object.values(TgNodeTypesMap as Record<string, string>).includes(tgNodeType);
}