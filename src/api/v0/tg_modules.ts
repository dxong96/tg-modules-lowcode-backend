import express from "express";
import {tgModulesHandler} from "../../lib/tg_modules.js";
import {ListTgModulesResBody} from "./types.js";



const router = express.Router();

router.get('/', (req, res: express.Response<ListTgModulesResBody>) => {
    if (!tgModulesHandler.tgModulesCache) {
        res.json([]);
        return;
    }

    res.json(tgModulesHandler.tgModulesCache);
});

export default router;