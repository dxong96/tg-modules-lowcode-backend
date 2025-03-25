import {components, paths} from "../../openapi/schema.js";

export type ErrorResponse = components["schemas"]["ErrorResponse"];
export type MyNode = components["schemas"]["MyNode"];
export type MyEdge = components["schemas"]["MyEdge"];

// tgModules
export type ListTgModulesResBody = paths['/tg_modules']['get']['responses']['200']['content']['application/json'];

// files
export type UploadResBody = paths['/files']['post']['responses']['200']['content']['application/json'];
export type ListUploadedFilesResBody = paths['/files']['get']['responses']['200']['content']['application/json'];

// projects
export type SaveProjectStateReqBody = paths['/projects/{id}/saveState']['put']['responses']['200']['content']['application/json'];
export type SaveProjectStateResBody = paths['/projects/{id}/saveState']['put']['responses']['200']['content']['application/json'];
export type GetProjectStateResBody = SaveProjectStateResBody;