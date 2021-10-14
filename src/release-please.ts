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
  ReleaserConfig,
  RepositoryConfig,
} from './manifest';
import {PullRequest} from './pull-request';
import {Commit} from './commit';
import {TagName} from './util/tag-name';
import {logger} from './util/logger';
import {Version} from './version';

const RELEASE_PLEASE_CONFIG = 'release-please-config.json';
const RELEASE_PLEASE_MANIFEST = '.release-please-manifest.json';

export class ReleasePlease {
  repository: Repository;
  github: GitHub;
  repositoryConfig: RepositoryConfig;
  manifest: Manifest;
  targetBranch: string;

  constructor(
    github: GitHub,
    targetBranch: string,
    repositoryConfig: RepositoryConfig,
    manifest: Manifest
  ) {
    this.repository = github.repository;
    this.github = github;
    this.targetBranch = targetBranch;
    this.repositoryConfig = repositoryConfig;
    this.manifest = manifest;
  }

  static async fromManifest(
    github: GitHub,
    targetBranch: string,
    configFile: string = RELEASE_PLEASE_CONFIG,
    manifestFile: string = RELEASE_PLEASE_MANIFEST
  ): Promise<ReleasePlease> {
    const [repositoryConfig, manifest] = await Promise.all([
      parseConfig(github, configFile, targetBranch),
      parseManifest(github, manifestFile, targetBranch),
    ]);
    logger.info('repositoryConfig', repositoryConfig);
    logger.info('manifest', manifest);

    return new ReleasePlease(github, targetBranch, repositoryConfig, manifest);
  }

  static async fromConfig(
    github: GitHub,
    targetBranch: string,
    config: ReleaserConfig
  ): Promise<ReleasePlease> {
    const repositoryConfig = {'.': config};
    const manifest: Manifest = {};
    return new ReleasePlease(github, targetBranch, repositoryConfig, manifest);
  }

  async createPullRequests(): Promise<number[]> {
    // collect versions by package name
    logger.info('Collecting latest release versions by package');
    const packageVersions: Record<string, Version> = {};
    for (const path in this.repositoryConfig) {
      const config = this.repositoryConfig[path];
      if (!config.packageName) {
        logger.warn(`did not find packageName for path: ${path}`);
        continue;
      }
      packageVersions[config.packageName] = this.manifest[path];
    }
    logger.debug(packageVersions);

    // Collect all the SHAs of the latest release packages
    logger.info('Collecting release commit SHAs');
    let releasesFound = 0;
    const expectedReleases = Object.keys(this.manifest).length;
    const packageShas: Record<string, string> = {};
    const generator = this.github.releaseIterator(100);
    for await (const release of generator) {
      const tagName = TagName.parse(release.tagName);
      if (!tagName) {
        logger.warn(`unable to parse release name: ${release.name}`);
        continue;
      }
      const expectedVersion = packageVersions[tagName.component];
      if (!expectedVersion) {
        logger.warn(`unable to find package ${tagName.component} in manifest`);
        continue;
      }
      if (expectedVersion.toString() === tagName.version.toString()) {
        packageShas[tagName.component] = release.sha;
        releasesFound += 1;
      }

      if (releasesFound >= expectedReleases) {
        break;
      }
    }

    if (releasesFound < expectedReleases) {
      logger.warn(
        `Expected ${expectedReleases} releases, only found ${releasesFound}`
      );
    }

    // iterate through commits and collect commits until we have
    // seen all release commits
    logger.info('Collecting commits since all latest releases');
    const commits: Commit[] = [];
    const commitGenerator = this.github.mergeCommitIterator(
      this.targetBranch,
      500
    );
    const shas = new Set(Object.values(packageShas));
    const expectedShas = shas.size;
    let commitsFound = 0;
    for await (const commit of commitGenerator) {
      if (shas.has(commit.commit.sha)) {
        commits.push({
          sha: commit.commit.sha,
          message: commit.commit.message,
          files: commit.commit.files,
        });
        commitsFound += 1;
      }
      if (commitsFound >= expectedShas) {
        break;
      }
    }

    if (commitsFound < expectedShas) {
      logger.warn(
        `Expected ${expectedShas} commits, only found ${commitsFound}`
      );
    }

    // TODO: split commits by package
    logger.info('Splitting commits by path');

    const promises: Promise<number>[] = [];
    for (const path in this.repositoryConfig) {
      logger.info(`Building candidate release pull request for path: ${path}`);
      const config = this.repositoryConfig[path];
      const strategy = new JavaYoshi({
        targetBranch: this.targetBranch,
        github: this.github,
        path,
      });
      promises.push(
        this.createPullRequest(
          strategy,
          this.targetBranch,
          commits, // FIXME: use split commits
          config.packageName
        )
      );
    }
    return await Promise.all(promises);
  }

  async createPullRequest(
    strategy: Strategy,
    targetBranch: string,
    commits: Commit[],
    component?: string,
    lastMergedReleasePullRequest?: PullRequest
  ): Promise<number> {
    const latestRelease = lastMergedReleasePullRequest
      ? await strategy.buildRelease(lastMergedReleasePullRequest)
      : undefined;

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
