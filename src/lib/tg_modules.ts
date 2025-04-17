import parser, {type Variable} from "@evops/hcl-terraform-parser";
import {mkdtemp, readdir, readFile, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import extract from "extract-zip";
import {flatten, pick} from "lodash-es";
import {GitlabClient} from "./gitlab.js";
import {tgModuleGitlabPath} from "../config/index.js";
import { Duration } from "luxon";

interface ModuleInputVar extends Pick<Variable, 'name' | 'default' | 'type' | 'required'> {

}

interface TgModule {
    tgModuleName: string;
    possibleInputs: ModuleInputVar[];
}

// Gitlab client START
const gitlabClient = new GitlabClient({
    tgModulesProjectPath: tgModuleGitlabPath,
    token: process.env.GITLAB_TOKEN!,
});
// Gitlab client END

async function findTgModulesInPath(tgModulesPath: string): Promise<TgModule[]> {
    const tgModulesChildren = await readdir(tgModulesPath, { withFileTypes: true });
    const tgModuleFolderNames = tgModulesChildren
        .filter(f => f.isDirectory())
        .map(f => f.name);
    const tgModulePromises = tgModuleFolderNames.map(name => {
        return (async () => {
            const tgModulePath = join(tgModulesPath, name);
            const tgModuleChildren = await readdir(tgModulePath, { withFileTypes: true });
            const tgVariableFile = tgModuleChildren.find(({name}) => name.startsWith('variable'));

            console.log('current module name', name);
            const childrenTgModulesFlat = await findTgModulesInPath(tgModulePath);
            // console.log('childrenTgModulesFlat', JSON.stringify(childrenTgModulesFlat));
            childrenTgModulesFlat
                .forEach(tgModule => {
                    tgModule.tgModuleName = `${name}/${tgModule.tgModuleName}`;
                });

            if (!tgVariableFile) {
                console.log(`tgModuleName ${name} variables not found`);
                return childrenTgModulesFlat;
            }

            const varPath = join(tgModulePath, tgVariableFile.name);
            const varContent = await readFile(varPath, 'utf8');
            const tf = parser.parse(varContent);
            const possibleInputs: ModuleInputVar[] = [];
            for (const variable of Object.values(tf.variables)) {
                possibleInputs.push(pick(variable, 'name', 'default', 'type', 'required'));
            }

            const ret: TgModule = {
                tgModuleName: name,
                possibleInputs
            };
            return [ret].concat(childrenTgModulesFlat);
        })();
    });
    const currentTgModulesNested = await Promise.all(tgModulePromises);
    return flatten(currentTgModulesNested);
}

async function downloadAndExtractTgModules(): Promise<TgModule[]> {
    const downloadedDirPath = await mkdtemp(join(tmpdir(), 'tg-modules-archive-'));
    try {
        const zipPath = join(downloadedDirPath, 'archive.zip');
        await gitlabClient.downloadTgModulesAsZip(zipPath);
        await extract(zipPath, {
            dir: downloadedDirPath
        });
        const downloadedChildren = await readdir(downloadedDirPath, { withFileTypes: true });
        const downloadedFolders = downloadedChildren.filter(f => f.isDirectory());
        if (downloadedFolders.length === 0) {
            console.log("No downloaded folders found.");
            return [];
        }

        return findTgModulesInPath(join(downloadedDirPath, downloadedFolders[0].name, 'tg-modules'));
    } finally {
        await rm(downloadedDirPath, {
            recursive: true,
        });
    }
}

class RepeatHandler {
    private readonly interval = Duration.fromObject({
        hour: 12
    }).as('milliseconds');
    private timeoutId: NodeJS.Timeout | null = null;
    private started = false;
    private _tgModulesCache: TgModule[] | null = null;

    public get tgModulesCache() : TgModule[] | null
    {
        return this._tgModulesCache;
    }

    async start() {
        if (!this._tgModulesCache) {
            console.log('tgModulesCache not found, downloading for the first time')
            this._tgModulesCache = await downloadAndExtractTgModules();
        }

        this.started = true;
        this.timeoutId = setTimeout(() => {
            if (!this.started) return;

            downloadAndExtractTgModules()
                .then(() => {
                    if (!this.started) return;

                    this.start();
                })
              .catch(e => {
                  console.error('failed to download tg modules', e);
              });
        }, this.interval);
    }

    stop() {
        this.started = false;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
    }
}

export const tgModulesHandler = new RepeatHandler();
