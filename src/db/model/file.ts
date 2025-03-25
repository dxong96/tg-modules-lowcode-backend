import {ObjectId} from "mongodb";

export interface UploadedFile {
  _id?: ObjectId;
  name: string;
  fileLocation: string;
  nodeId: string;
  isText: boolean;
  createdAt: number;
}