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

import {GitHub} from './github';
import {JavaYoshi} from './strategies/java-yoshi';
import {Repository} from './repository';
import {Strategy} from './strategy';

const RELEASE_PLEASE_CONFIG = 'release-please-config.json';
const RELEASE_PLEASE_MANIFEST = '.release-please-manifest.json';

interface ReleasePleaseOptions {
  repository: Repository;
  github: GitHub;
  configFile?: string;
  manifestFile?: string;
}

export class ReleasePlease {
  repository: Repository;
  github: GitHub;
  configFile: string;
  manifestFile: string;

  constructor(options: ReleasePleaseOptions) {
    this.repository = options.repository;
    this.github = options.github;
    this.configFile = options.configFile || RELEASE_PLEASE_CONFIG;
    this.manifestFile = options.manifestFile || RELEASE_PLEASE_MANIFEST;
  }

  async createPullRequests(): Promise<number[]> {
    const strategy = new JavaYoshi({
      repository: this.repository,
      targetBranch: 'main',
      github: this.github,
    });
    return await Promise.all([
      this.createPullRequest(strategy, 'main', undefined),
    ]);
  }

  async createPullRequest(
    strategy: Strategy,
    targetBranch: string,
    component?: string
  ): Promise<number> {
    const lastMergedReleasePullRequest =
      await this.github.findMergedPullRequest(
        targetBranch,
        mergedPullRequest => {
          if (component) {
            // TODO: make sure component matches the pull request
          }
          // make sure pull request looks like a release
          return mergedPullRequest.labels.includes('type: release');
        }
      );
    const latestRelease = lastMergedReleasePullRequest
      ? await strategy.buildRelease(lastMergedReleasePullRequest)
      : undefined;

    const commits = await this.github.commitsSince(
      targetBranch,
      (commit, _pullRequest) => {
        return commit.sha === lastMergedReleasePullRequest?.sha;
      }
    );
    const releasePullRequest = await strategy.buildReleasePullRequest(
      commits,
      latestRelease
    );
    console.log(releasePullRequest);
    return 123;
  }

  async createRelease(): Promise<string> {
    return 'FIXME';
  }
}
