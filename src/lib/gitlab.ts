import got, { Got } from "got";
import {pipeline as streamPipeline} from "node:stream/promises";
import fs from "node:fs";

interface GitlabClientProps {
    token: string;
    tgModulesProjectPath: string;
}

export class GitlabClient {
    private gotClient: Got;
    private readonly tgModulesGitlabProjId: string;

    constructor({token, tgModulesProjectPath}: GitlabClientProps) {
        this.gotClient = got.extend({
            prefixUrl: 'https://sgts.gitlab-dedicated.com/api/',
            headers: {
                'PRIVATE-TOKEN': token
            },
        });
        this.tgModulesGitlabProjId = encodeURIComponent(tgModulesProjectPath);
    }

    async downloadTgModulesAsZip(outputPath: string): Promise<void> {
        const url: string = `v4/projects/${this.tgModulesGitlabProjId}/repository/archive.zip?path=tg-modules`;
        await streamPipeline(
            this.gotClient.stream.get(url),
            fs.createWriteStream(outputPath)
        );
    }

    async downloadRepoAsZip(projectId: string, outputPath: string, ref?: string): Promise<void> {
        let url = `v4/projects/${encodeURIComponent(projectId)}/repository/archive.zip`;
        if (ref) {
            url = `${url}?sha=${encodeURIComponent(ref)}`;
        }
        await streamPipeline(
          this.gotClient.stream.get(url),
          fs.createWriteStream(outputPath)
        );
    }
}
