import express from "express";
import tgModuleRoutes from './tg_modules.js';
import fileRoutes from './files.js';
import projectRoutes from './projects.js';
import {ErrorRequestHandler} from "express-serve-static-core";

const router = express.Router();

const errorHandler: ErrorRequestHandler =  (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  console.error(err.stack);
  res.status(500).json({
    error: err.message
  });
};

router.use(errorHandler);

router.use('/tg_modules', tgModuleRoutes);
router.use('/files', fileRoutes);
router.use('/projects', projectRoutes);

export default router;