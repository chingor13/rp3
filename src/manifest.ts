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

import {ChangelogSection} from './release-notes';
import {ReleaseType} from './factory';
import {GitHub} from './github';
import {Version} from './version';
import {Strategy} from './strategy';
import {Commit} from './commit';
import {PullRequest} from './pull-request';
import {logger} from './util/logger';
import {JavaYoshi} from './strategies/java-yoshi';
import {CommitSplit} from './util/commit-split';
import {TagName} from './util/tag-name';
import {Repository} from './repository';

export interface ReleaserConfig {
  releaseType?: ReleaseType;
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
  changelogSections?: ChangelogSection[];
  changelogPath?: string;
  releaseAs?: string;
  skipGithubRelease?: boolean;
  draft?: boolean;
  packageName?: string;
}

interface ReleaserConfigJson {
  'release-type'?: ReleaseType;
  'bump-minor-pre-major'?: boolean;
  'bump-patch-for-minor-pre-major'?: boolean;
  'changelog-sections'?: ChangelogSection[];
  'release-as'?: string;
  'skip-github-release'?: boolean;
  draft?: boolean;
}

interface ReleaserPackageConfig extends ReleaserConfigJson {
  'package-name'?: string;
  'changelog-path'?: string;
}

export type PluginType = 'node-workspace' | 'cargo-workspace';
export interface Config extends ReleaserConfigJson {
  packages: Record<string, ReleaserPackageConfig>;
  'bootstrap-sha'?: string;
  'last-release-sha'?: string;
  'always-link-local'?: boolean;
  plugins?: PluginType[];
}
// path => version
export type ReleasedVersions = Record<string, Version>;
// path => config
export type RepositoryConfig = Record<string, ReleaserConfig>;

const RELEASE_PLEASE_CONFIG = 'release-please-config.json';
const RELEASE_PLEASE_MANIFEST = '.release-please-manifest.json';

export class Manifest {
  repository: Repository;
  github: GitHub;
  repositoryConfig: RepositoryConfig;
  releasedVersions: ReleasedVersions;
  targetBranch: string;

  constructor(
    github: GitHub,
    targetBranch: string,
    repositoryConfig: RepositoryConfig,
    releasedVersions: ReleasedVersions
  ) {
    this.repository = github.repository;
    this.github = github;
    this.targetBranch = targetBranch;
    this.repositoryConfig = repositoryConfig;
    this.releasedVersions = releasedVersions;
  }

  static async fromManifest(
    github: GitHub,
    targetBranch: string,
    configFile: string = RELEASE_PLEASE_CONFIG,
    manifestFile: string = RELEASE_PLEASE_MANIFEST
  ): Promise<Manifest> {
    const [repositoryConfig, releasedVersions] = await Promise.all([
      parseConfig(github, configFile, targetBranch),
      parseReleasedVersions(github, manifestFile, targetBranch),
    ]);
    return new Manifest(
      github,
      targetBranch,
      repositoryConfig,
      releasedVersions
    );
  }

  static async fromConfig(
    github: GitHub,
    targetBranch: string,
    config: ReleaserConfig
  ): Promise<Manifest> {
    const repositoryConfig = {'.': config};
    const releasedVersions: ReleasedVersions = {};
    return new Manifest(
      github,
      targetBranch,
      repositoryConfig,
      releasedVersions
    );
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
      packageVersions[config.packageName] = this.releasedVersions[path];
    }
    logger.debug(packageVersions);

    // Collect all the SHAs of the latest release packages
    logger.info('Collecting release commit SHAs');
    let releasesFound = 0;
    const expectedReleases = Object.keys(this.releasedVersions).length;
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

    // split commits by path
    logger.info('Splitting commits by path');
    const cs = new CommitSplit({
      includeEmpty: true,
      packagePaths: Object.keys(this.repositoryConfig),
    });
    const commitsPerPath = cs.split(commits);

    const promises: Promise<number>[] = [];
    for (const path in this.repositoryConfig) {
      logger.info(`Building candidate release pull request for path: ${path}`);
      const pathCommits = path === '.' ? commits : commitsPerPath[path];
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
          pathCommits,
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

function extractReleaserConfig(config: ReleaserPackageConfig): ReleaserConfig {
  return {
    releaseType: config['release-type'],
    bumpMinorPreMajor: config['bump-minor-pre-major'],
    bumpPatchForMinorPreMajor: config['bump-patch-for-minor-pre-major'],
    changelogSections: config['changelog-sections'],
    changelogPath: config['changelog-path'],
    releaseAs: config['release-as'],
    skipGithubRelease: config['skip-github-release'],
    draft: config.draft,
    packageName: config['package-name'],
  };
}

export async function parseConfig(
  github: GitHub,
  configFile: string,
  branch: string
): Promise<RepositoryConfig> {
  const config = await github.getFileJson<Config>(configFile, branch);
  const defaultConfig = extractReleaserConfig(config);
  const repositoryConfig: RepositoryConfig = {};
  for (const path in config.packages) {
    const packageConfig: ReleaserConfig = {
      ...defaultConfig,
      ...extractReleaserConfig(config.packages[path]),
    };
    if (!packageConfig.packageName) {
      const packageNameFromPath = path.split(/[\\/]/).pop();
      if (packageNameFromPath !== '.') {
        packageConfig.packageName = packageNameFromPath;
      }
    }
    repositoryConfig[path] = packageConfig;
  }
  return repositoryConfig;
}

export async function parseReleasedVersions(
  github: GitHub,
  manifestFile: string,
  branch: string
): Promise<ReleasedVersions> {
  const manifestJson = await github.getFileJson<Record<string, string>>(
    manifestFile,
    branch
  );
  const releasedVersions: ReleasedVersions = {};
  for (const path in manifestJson) {
    releasedVersions[path] = Version.parse(manifestJson[path]);
  }
  return releasedVersions;
}
