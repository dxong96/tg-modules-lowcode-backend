import {FileService, LOCAL_UPLOAD_PATH} from "./base.js";
import {UploadedFile} from "../../db/model/file.js";
import {dbCollection} from "../../db/db.js";
import {isText} from "istextorbinary";
import {ObjectId, WithId} from "mongodb";
import fsPromises from 'node:fs/promises';
import fs from 'node:fs';
import * as path from "node:path";
import * as stream from "node:stream";
import {join} from "node:path";
import {matches, pick} from "lodash-es";
import crypto from "node:crypto";

export class LocalFileService implements FileService {
    async deleteAll(): Promise<void> {
        const files = await fsPromises.readdir(LOCAL_UPLOAD_PATH);
        const promises = files.map((file) => fsPromises.unlink(path.join(LOCAL_UPLOAD_PATH, file)));
        await Promise.all(promises);
        await dbCollection('files').deleteMany();
    }

    async downloadFile(id: string): Promise<stream.Readable> {
        let uploadedFile: WithId<UploadedFile> | null = null;
        // console.log('downloadFile', id)
        try {
            uploadedFile = await dbCollection("files").findOne({
                _id: new ObjectId(id),
            });
        } catch (e) {}

        if (!uploadedFile) {
            throw new Error("File not found");
        }

        return fs.createReadStream(uploadedFile.fileLocation);
    }

    async deleteOne(id: string) {
        let uploadedFile: WithId<UploadedFile> | null = null;

        try {
            uploadedFile = await dbCollection("files").findOne({
                _id: new ObjectId(id),
            });
        } catch (e) {}

        if (!uploadedFile) {
            throw new Error("File not found");
        }

        await dbCollection("files").deleteOne({
            _id: uploadedFile._id,
        });
        await fsPromises.unlink(uploadedFile.fileLocation);
    }

    async upload(uploadFile: Pick<UploadedFile, 'name' | 'fileLocation' | 'nodeId'>): Promise<WithId<UploadedFile>> {
        const newFileName = await new Promise<string>((resolve) => {
            const readable = fs.createReadStream(uploadFile.fileLocation);
            const md5sum = crypto.createHash("md5");
            readable.on('readable', () => {
                const data = readable.read();
                if (data) {
                    md5sum.update(data);
                } else {
                    resolve(md5sum.digest("hex"));
                }
            });
        });

        const newFileLocation = join(LOCAL_UPLOAD_PATH, newFileName);
        // check for existing record
        const existingFileUploads = await dbCollection('files').find({
            fileLocation: newFileLocation
        }).toArray();
        const existingFileUpload = existingFileUploads.find(matches(pick(uploadFile, ['name', 'fileLocation', 'nodeId'])));
        if (existingFileUpload) {
            return existingFileUpload;
        }

        let newUploadFile: UploadedFile;
        // not existing but there is a similar file
        if (existingFileUploads.length > 0) {
            const existing = existingFileUploads[0];
            newUploadFile = {
                ...uploadFile,
                fileLocation: newFileLocation,
                isText: existing.isText,
                createdAt: Date.now()
            };
        } else {
            // totally new
            let isTextFile = false;
            const stats = await fsPromises.stat(uploadFile.fileLocation);
            const fileSizeInBytes = stats.size;
            const oneMb = 1024 * 1024;
            if (fileSizeInBytes < oneMb) {
                const buffer = await fsPromises.readFile(uploadFile.fileLocation);
                isTextFile = !!isText(null, buffer);
            }
            await fsPromises.rename(uploadFile.fileLocation, newFileLocation);
            newUploadFile = {
                ...uploadFile,
                fileLocation: newFileLocation,
                isText: isTextFile,
                createdAt: Date.now()
            };
        }

        const result = await dbCollection("files").insertOne(newUploadFile);
        return {
            ...newUploadFile,
            _id: result.insertedId
        };
    }

    async deleteByNodeId(nodeId: string): Promise<void> {
        const files = await dbCollection("files").find({
            nodeId
        }).toArray();
        for (const file of files) {
            await fsPromises.unlink(file.fileLocation);
        }
        const _ids = files.map(f => f._id);
        await dbCollection('files').deleteMany({
            _id: {
                $in: _ids
            }
        });
    }
}