// Copyright 2021 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { GitHub } from "./github";
import { BranchName } from "./util/branch-name";

const RELEASE_PLEASE_CONFIG = `release-please-config.json`;
const RELEASE_PLEASE_MANIFEST = `.release-please-manifest.json`;
interface RepositoryOptions {
  github: GitHub;
  configFile?: string;
  manifestFile?: string;
}

export class Repository {
  github: GitHub;
  configFile: string;
  manifestFile: string;

  constructor(options: RepositoryOptions) {
    this.github = options.github;
    this.configFile = options.configFile || RELEASE_PLEASE_CONFIG;
    this.manifestFile = options.manifestFile || RELEASE_PLEASE_MANIFEST;
  }

  async createPullRequest(): Promise<number> {
    const targetBranch = await this.github.getDefaultBranch();
    const branchName = BranchName.ofTargetBranch(targetBranch);
    const lastMergedReleasePullRequest = await this.github.lastMergedPRByHeadBranch(branchName.toString());
    const commits = await this.github.commitsSinceSha(lastMergedReleasePullRequest?.sha);
    return 123;
  }

  async createRelease(): Promise<string> {
    return 'FIXME';
  }
}