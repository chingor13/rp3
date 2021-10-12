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
import {
  parseConfig,
  parseManifest,
  Manifest,
  RepositoryPackage,
  ReleaserConfig,
} from './manifest';

const RELEASE_PLEASE_CONFIG = 'release-please-config.json';
const RELEASE_PLEASE_MANIFEST = '.release-please-manifest.json';

export class ReleasePlease {
  repository: Repository;
  github: GitHub;
  repositoryPackages: RepositoryPackage[];
  manifest: Manifest;
  targetBranch: string;

  constructor(
    github: GitHub,
    targetBranch: string,
    repositoryPackages: RepositoryPackage[],
    manifest: Manifest
  ) {
    this.repository = github.repository;
    this.github = github;
    this.targetBranch = targetBranch;
    this.repositoryPackages = repositoryPackages;
    this.manifest = manifest;
  }

  static async fromManifest(
    github: GitHub,
    targetBranch: string,
    configFile: string = RELEASE_PLEASE_CONFIG,
    manifestFile: string = RELEASE_PLEASE_MANIFEST
  ): Promise<ReleasePlease> {
    const [repositoryPackages, manifest] = await Promise.all([
      parseConfig(github, configFile, targetBranch),
      parseManifest(github, manifestFile, targetBranch),
    ]);
    return new ReleasePlease(
      github,
      targetBranch,
      repositoryPackages,
      manifest
    );
  }

  static async fromConfig(
    github: GitHub,
    targetBranch: string,
    config: ReleaserConfig
  ): Promise<ReleasePlease> {
    const repositoryPackages: RepositoryPackage[] = [{path: '.', config}];
    const manifest: Manifest = {};
    return new ReleasePlease(
      github,
      targetBranch,
      repositoryPackages,
      manifest
    );
  }

  async createPullRequests(): Promise<number[]> {
    const promises: Promise<number>[] = [];
    for (const repositoryPackage of this.repositoryPackages) {
      const strategy = new JavaYoshi({
        targetBranch: this.targetBranch,
        github: this.github,
        path: repositoryPackage.path,
      });
      promises.push(
        this.createPullRequest(
          strategy,
          this.targetBranch,
          repositoryPackage.config.packageName
        )
      );
    }
    return await Promise.all(promises);
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
