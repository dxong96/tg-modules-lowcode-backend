import {FileService, LOCAL_UPLOAD_PATH} from "./base.js";
import {UploadedFile} from "../../db/model/file.js";
import {dbCollection} from "../../db/db.js";
import {isText} from "istextorbinary";
import {ObjectId, WithId} from "mongodb";
import fsPromises from 'node:fs/promises';
import fs from 'node:fs';
import * as path from "node:path";
import * as stream from "node:stream";
import {basename, join} from "node:path";

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
        let isTextFile = false;
        const stats = await fsPromises.stat(uploadFile.fileLocation);
        const fileSizeInBytes = stats.size;
        const oneMb = 1024 * 1024;
        if (fileSizeInBytes < oneMb) {
            const buffer = await fsPromises.readFile(uploadFile.fileLocation);
            isTextFile = !!isText(null, buffer);
        }

        const newFileLocation = join(LOCAL_UPLOAD_PATH, basename(uploadFile.fileLocation));
        await fsPromises.rename(uploadFile.fileLocation, newFileLocation);
        const newUploadFile: UploadedFile = {
            ...uploadFile,
            fileLocation: newFileLocation,
            isText: isTextFile,
            createdAt: Date.now()
        };
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