import multer from "multer";
import {UploadedFile} from "../../db/model/file.js";
import {WithId} from "mongodb";
import stream from "node:stream";
import {LocalFileService} from "./local.js";


export interface FileService {
  deleteAll: () => Promise<void>;
  downloadFile: (id: string) => Promise<stream.Readable>;
  deleteOne: (id: string) => Promise<void>;
  upload: (uploadFile: Pick<UploadedFile, 'name' | 'fileLocation' | 'nodeId'>) => Promise<WithId<UploadedFile>>;
  deleteByNodeId: (nodeId: string) => Promise<void>;
}

export const LOCAL_UPLOAD_PATH = 'uploads/';
export const upload = multer({ dest: LOCAL_UPLOAD_PATH });

// todo add a env check to toggle between local file service and s3 file service
export const fileUploadService: FileService = new LocalFileService();