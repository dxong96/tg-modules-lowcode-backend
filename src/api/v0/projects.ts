import express from "express";
import {dbCollection} from "../../db/db.js";
import {ErrorResponse, GetProjectStateResBody, SaveProjectStateReqBody, SaveProjectStateResBody} from "./types.js";
import {saveStateSchema} from "../../db/model/project.js";
import {generateZip} from "../../lib/terragrunt/terragrunt.js";

const router = express.Router();

type IdParams = Record<'id', string>;

type SaveStateResBody = ErrorResponse | SaveProjectStateResBody;
router.put("/:id/saveState", async (req: express.Request<{id: string}, SaveStateResBody, SaveProjectStateReqBody>, res: express.Response<SaveStateResBody>) => {
  const id = req.params.id;
  if (id.trim().length === 0) {
    res.status(400).json({
      error: 'id is empty'
    });
    return;
  }

  const parseResult = saveStateSchema.safeParse(req.body);
  if (!parseResult.success) {
    console.log(parseResult.error.message)
    res.status(400).json({
      error: parseResult.error.message
    });
    return;
  }

  const newState = parseResult.data;

  await dbCollection('projects').updateOne({
    projectId: id
  }, {
    $set: {
      state: newState
    }
  }, {
    upsert: true,
  });

  res.json(newState);
});

type GetStateResBody = ErrorResponse | GetProjectStateResBody;
router.get('/:id/getState', async (req: express.Request<IdParams, GetStateResBody>, res) => {
  const project = await dbCollection('projects').findOne({
    projectId: req.params.id
  });
  if (!project) {
    res.status(404).json({
      error: 'Not found'
    });
    return;
  }

  res.json(project.state);
});

type GenerateAndDownloadResBody = ErrorResponse;
router.get('/:id/generateAndDownload', async (req: express.Request<{id: string}, GenerateAndDownloadResBody>, res) => {
  const project = await dbCollection('projects').findOne({
    projectId: req.params.id
  });
  if (!project) {
    res.status(404).json({
      error: 'Not found'
    });
    return;
  }

  try {
    const readable = await generateZip(project.state.nodes, project.state.edges);
    readable.pipe(res);
  } catch (e: any) {
    if (e instanceof Error) {
      res.status(422).json({
        error: e.message
      });
    } else {
      res.status(500).json({
        error: 'unknown error'
      });
    }
  }
});

export default router;