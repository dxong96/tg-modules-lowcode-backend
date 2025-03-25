import express from "express";
import {z} from "zod";
import {fileUploadService, upload} from "../../lib/files/base.js";
import {ErrorResponse, ListUploadedFilesResBody, UploadResBody} from "./types.js";
import {dbCollection} from "../../db/db.js";

const router = express.Router();

interface UploadReqBody {
  nodeId: string;
}

type IdParams = Record<'id', string>;

const uploadReqBodySchema = z.object({
  nodeId: z.string().trim().nonempty(),
});

/**
 * GET /api/v0/files
 */
router.get('/', async (req: express.Request, res: express.Response<ListUploadedFilesResBody>) => {
  const uploadedFiles = await dbCollection('files').find().toArray();
  const result = uploadedFiles.map(uploadedFileWithId => ({
    id: uploadedFileWithId._id.toString(),
    name: uploadedFileWithId.name,
    isText: uploadedFileWithId.isText,
    nodeId: uploadedFileWithId.nodeId
  }));
  res.json(result);
});

/**
 * POST /api/v0/files
 */
router.post("/", upload.single('uploadedFile'), async (
  req: express.Request<never, UploadResBody | ErrorResponse, UploadReqBody>,
  res: express.Response<UploadResBody | ErrorResponse>
) => {
  const {file} = req;
  if (!file) {
    res.status(400).json({
      error: "File not found",
    });
    return;
  }

  const parseResult = uploadReqBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: parseResult.error.issues
        .map(issue => `${issue.path}: ${issue.message}`).join(". ")
    });
    return;
  }

  const uploadedFileWithId = await fileUploadService.upload({
    name: file.originalname,
    fileLocation: file.path,
    nodeId: req.body.nodeId
  });

  res.json({
    id: uploadedFileWithId._id.toString(),
    name: uploadedFileWithId.name,
    isText: uploadedFileWithId.isText,
    nodeId: uploadedFileWithId.nodeId
  });
});

/**
 * DELETE /api/v0/files
 */
router.delete("/", async (req, res) => {
  await fileUploadService.deleteAll();
  res.status(204).send();
});

/**
 * GET /api/v0/files/{id}
 */
router.get("/:id", async (req: express.Request<IdParams>, res) => {
  const readable = await fileUploadService.downloadFile(req.params.id);
  readable.pipe(res);
});

/**
 * DELETE /api/v0/files/{id}
 */
router.delete("/:id", async (req: express.Request<IdParams>, res) => {
  await fileUploadService.deleteOne(req.params.id);
  res.status(204).end();
});

/**
 * DELETE /api/v0/files/deleteByNodeId/{nodeId}
 */
router.delete("/deleteByNodeId/:nodeId", async (req: express.Request<{nodeId: string}>, res) => {
  await fileUploadService.deleteByNodeId(req.params.nodeId);
  res.status(204).end();
});

export default router;