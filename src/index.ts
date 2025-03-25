import express from 'express';
import cors from 'cors';
import bodyParser from "body-parser";
import v0Routes from './api/v0/index.js'
import {tgModulesHandler} from "./lib/tg_modules.js";
import {connectToDb} from "./db/db.js";

async function main() {
    await connectToDb();

    const app = express();
    const port = 3000;

    app.use(cors());
    app.use(bodyParser.json());

    app.get('/', (req, res) => {
        res.send('Hello World!')
    });
    app.use('/api/v0', v0Routes);

    await tgModulesHandler.start();

    app.listen(port, () => {
        console.log(`Example app listening on port ${port}`)
    });
}

main();

