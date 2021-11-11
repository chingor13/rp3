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
import {GitHub, GitHubRelease} from './github';
import {Version, VersionsMap} from './version';
import {Commit} from './commit';
import {PullRequest} from './pull-request';
import {logger} from './util/logger';
import {CommitSplit} from './util/commit-split';
import {TagName} from './util/tag-name';
import {Repository} from './repository';
import {BranchName} from './util/branch-name';
import {PullRequestTitle} from './util/pull-request-title';
import {ReleasePullRequest} from './release-pull-request';
import {
  buildStrategy,
  ReleaseType,
  VersioningStrategyType,
  buildPlugin,
} from './factory';
import {Release} from './release';
import {Strategy} from './strategy';
import {PullRequestBody} from './util/pull-request-body';
import {Merge} from './plugins/merge';
import {ReleasePleaseManifest} from './updaters/release-please-manifest';

export interface ReleaserConfig {
  releaseType: ReleaseType;
  versioning?: VersioningStrategyType;
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
  changelogSections?: ChangelogSection[];
  changelogPath?: string;
  releaseAs?: string;
  skipGithubRelease?: boolean;
  draft?: boolean;
  component?: string;
  packageName?: string;

  // Ruby-only
  versionFile?: string;
  // Java-only
  extraFiles?: string[];
}

export interface CandidateReleasePullRequest {
  path: string;
  pullRequest: ReleasePullRequest;
  config: ReleaserConfig;
}

export interface CandidateRelease extends Release {
  pullRequest: PullRequest;
}

interface ReleaserConfigJson {
  'release-type'?: ReleaseType;
  'bump-minor-pre-major'?: boolean;
  'bump-patch-for-minor-pre-major'?: boolean;
  'changelog-sections'?: ChangelogSection[];
  'release-as'?: string;
  'skip-github-release'?: boolean;
  draft?: boolean;
  label?: string;
  'release-label'?: string;

  // Ruby-only
  'version-file'?: string;
  // Java-only
  'extra-files'?: string[];
}

interface ManifestOptions {
  bootstrapSha?: string;
  lastReleaseSha?: string;
  alwaysLinkLocal?: boolean;
  separatePullRequests?: boolean;
  plugins?: PluginType[];
  fork?: boolean;
  signoff?: string;
  manifestPath?: string;
  labels?: string[];
  releaseLabels?: string[];
}

interface ReleaserPackageConfig extends ReleaserConfigJson {
  'package-name'?: string;
  component?: string;
  'changelog-path'?: string;
}

export type PluginType = 'node-workspace' | 'cargo-workspace';
export interface Config extends ReleaserConfigJson {
  packages: Record<string, ReleaserPackageConfig>;
  'bootstrap-sha'?: string;
  'last-release-sha'?: string;
  'always-link-local'?: boolean;
  plugins?: PluginType[];
  'separate-pull-requests'?: boolean;
}
// path => version
export type ReleasedVersions = Record<string, Version>;
// path => config
export type RepositoryConfig = Record<string, ReleaserConfig>;

const RELEASE_PLEASE_CONFIG = 'release-please-config.json';
const RELEASE_PLEASE_MANIFEST = '.release-please-manifest.json';
export const ROOT_PROJECT_PATH = '.';
const DEFAULT_COMPONENT_NAME = '';
const DEFAULT_LABELS = ['autorelease: pending'];
const DEFAULT_RELEASE_LABELS = ['autorelease: tagged'];

export const MANIFEST_PULL_REQUEST_TITLE_PATTERN = 'chore: release ${branch}';

export class Manifest {
  repository: Repository;
  github: GitHub;
  repositoryConfig: RepositoryConfig;
  releasedVersions: ReleasedVersions;
  targetBranch: string;
  separatePullRequests: boolean;
  fork: boolean;
  signoffUser?: string;
  private labels: string[];
  private releaseLabels: string[];
  private plugins: PluginType[];
  private _strategiesByPath?: Record<string, Strategy>;
  private _pathsByComponent?: Record<string, string>;
  private manifestPath: string;

  constructor(
    github: GitHub,
    targetBranch: string,
    repositoryConfig: RepositoryConfig,
    releasedVersions: ReleasedVersions,
    manifestOptions?: ManifestOptions
  ) {
    this.repository = github.repository;
    this.github = github;
    this.targetBranch = targetBranch;
    this.repositoryConfig = repositoryConfig;
    this.releasedVersions = releasedVersions;
    this.manifestPath =
      manifestOptions?.manifestPath || RELEASE_PLEASE_MANIFEST;
    this.separatePullRequests = manifestOptions?.separatePullRequests || false;
    this.plugins = manifestOptions?.plugins || [];
    this.fork = manifestOptions?.fork || false;
    this.signoffUser = manifestOptions?.signoff;
    this.releaseLabels =
      manifestOptions?.releaseLabels || DEFAULT_RELEASE_LABELS;
    this.labels = manifestOptions?.labels || DEFAULT_LABELS;
  }

  static async fromManifest(
    github: GitHub,
    targetBranch: string,
    configFile: string = RELEASE_PLEASE_CONFIG,
    manifestFile: string = RELEASE_PLEASE_MANIFEST
  ): Promise<Manifest> {
    const [
      {config: repositoryConfig, options: manifestOptions},
      releasedVersions,
    ] = await Promise.all([
      parseConfig(github, configFile, targetBranch),
      parseReleasedVersions(github, manifestFile, targetBranch),
    ]);
    return new Manifest(
      github,
      targetBranch,
      repositoryConfig,
      releasedVersions,
      manifestOptions
    );
  }

  static async fromConfig(
    github: GitHub,
    targetBranch: string,
    config: ReleaserConfig,
    manifestOptions?: ManifestOptions
  ): Promise<Manifest> {
    const repositoryConfig: RepositoryConfig = {};
    repositoryConfig[ROOT_PROJECT_PATH] = config;
    const releasedVersions: ReleasedVersions = {};
    const latestVersion = await latestReleaseVersion(github, targetBranch);
    if (latestVersion) {
      releasedVersions[ROOT_PROJECT_PATH] = latestVersion;
    }
    return new Manifest(
      github,
      targetBranch,
      repositoryConfig,
      releasedVersions,
      manifestOptions
    );
  }

  async buildPullRequests(): Promise<ReleasePullRequest[]> {
    logger.info('Building pull requests');
    const pathsByComponent = await this.getPathsByComponent();
    const strategiesByPath = await this.getStrategiesByPath();

    // Collect all the SHAs of the latest release packages
    logger.info('Collecting release commit SHAs');
    let releasesFound = 0;
    const expectedReleases = Object.keys(this.releasedVersions).length;

    // SHAs by path
    const releaseShasByPath: Record<string, string> = {};

    // Releases by path
    const releasesByPath: Record<string, Release> = {};
    for await (const release of this.github.releaseIterator(100)) {
      const tagName = TagName.parse(release.tagName);
      if (!tagName) {
        logger.warn(`Unable to parse release name: ${release.name}`);
        continue;
      }
      const component = tagName.component || DEFAULT_COMPONENT_NAME;
      const path = pathsByComponent[component];
      const expectedVersion = this.releasedVersions[path];
      if (!expectedVersion) {
        logger.warn(`Unable to find component '${component}' in manifest`);
        continue;
      }
      if (expectedVersion.toString() === tagName.version.toString()) {
        releaseShasByPath[path] = release.sha;
        releasesByPath[path] = {
          tag: tagName,
          sha: release.sha,
          notes: release.notes || '',
        };
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
    const releaseShas = new Set(Object.values(releaseShasByPath));
    const expectedShas = releaseShas.size;

    // sha => release pull request
    const releasePullRequestsBySha: Record<string, PullRequest> = {};
    let commitsFound = 0;
    for await (const commit of commitGenerator) {
      if (releaseShas.has(commit.sha)) {
        if (commit.pullRequest) {
          releasePullRequestsBySha[commit.sha] = commit.pullRequest;
        } else {
          logger.warn(
            `Release SHA ${commit.sha} did not have an associated pull request`
          );
        }
        commitsFound += 1;
      }
      if (commitsFound >= expectedShas) {
        break;
      }
      commits.push({
        sha: commit.sha,
        message: commit.message,
        files: commit.files,
      });
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

    let newReleasePullRequests: CandidateReleasePullRequest[] = [];
    for (const path in this.repositoryConfig) {
      const config = this.repositoryConfig[path];
      logger.info(`Building candidate release pull request for path: ${path}`);
      logger.debug(`type: ${config.releaseType}`);
      logger.debug(`targetBranch: ${this.targetBranch}`);
      const pathCommits =
        path === ROOT_PROJECT_PATH ? commits : commitsPerPath[path];
      if (!pathCommits || pathCommits.length === 0) {
        logger.info(`No commits for path: ${path}, skipping`);
        continue;
      }
      const latestReleasePullRequest =
        releasePullRequestsBySha[releaseShasByPath[path]];
      if (!latestReleasePullRequest) {
        logger.warn('No latest release pull request found.');
      }

      const strategy = strategiesByPath[path];
      const latestRelease = releasesByPath[path];
      const releasePullRequest = await strategy.buildReleasePullRequest(
        commits,
        latestRelease,
        config.draft,
        this.labels
      );
      if (releasePullRequest) {
        if (releasePullRequest.version) {
          const versionsMap: VersionsMap = new Map();
          versionsMap.set(path, releasePullRequest.version);
          releasePullRequest.updates.push({
            path: this.manifestPath,
            createIfMissing: false,
            updater: new ReleasePleaseManifest({
              version: releasePullRequest.version,
              versionsMap,
            }),
          });
        }
        newReleasePullRequests.push({
          path,
          config,
          pullRequest: releasePullRequest,
        });
      }
    }

    // Build plugins
    const plugins = this.plugins.map(pluginType =>
      buildPlugin({
        type: pluginType,
        github: this.github,
        targetBranch: this.targetBranch,
        repositoryConfig: this.repositoryConfig,
      })
    );

    // Combine pull requests into 1 unless configured for separate
    // pull requests
    if (!this.separatePullRequests) {
      plugins.push(
        new Merge(this.github, this.targetBranch, this.repositoryConfig)
      );
    }

    for (const plugin of plugins) {
      newReleasePullRequests = await plugin.run(newReleasePullRequests);
    }

    return newReleasePullRequests.map(
      pullRequestWithConfig => pullRequestWithConfig.pullRequest
    );
  }

  async createPullRequests(): Promise<(number | undefined)[]> {
    const candidatePullRequests = await this.buildPullRequests();
    if (candidatePullRequests.length === 0) {
      return [];
    }

    // collect open release pull requests
    const openPullRequests: PullRequest[] = [];
    const generator = this.github.pullRequestIterator(
      this.targetBranch,
      'OPEN'
    );
    for await (const openPullRequest of generator) {
      const pullRequestBody = PullRequestBody.parse(openPullRequest.body);
      const branchName = BranchName.parse(openPullRequest.headBranchName);
      if (pullRequestBody && branchName) {
        openPullRequests.push(openPullRequest);
      }
    }
    logger.info(`found ${openPullRequests.length} open release pull requests.`);

    const promises: Promise<number | undefined>[] = [];
    for (const pullRequest of candidatePullRequests) {
      promises.push(
        this.createOrUpdatePullRequest(pullRequest, openPullRequests)
      );
    }
    return await Promise.all(promises);
  }

  private async createOrUpdatePullRequest(
    pullRequest: ReleasePullRequest,
    openPullRequests: PullRequest[]
  ): Promise<number | undefined> {
    // look for existing, open pull rquest
    const existing = openPullRequests.find(
      openPullRequest =>
        openPullRequest.headBranchName === pullRequest.headRefName
    );
    if (existing) {
      // If unchanged, no need to push updates
      if (existing.body === pullRequest.body.toString()) {
        logger.info(
          `PR https://github.com/${this.repository.owner}/${this.repository.repo}/pull/${existing.number} remained the same`
        );
        return undefined;
      }
      const updatedPullRequest = await this.github.updatePullRequest(
        existing.number,
        pullRequest,
        this.targetBranch,
        {
          fork: this.fork,
          signoffUser: this.signoffUser,
        }
      );
      return updatedPullRequest.number;
    } else {
      const newPullRequest = await this.github.createPullRequest(
        pullRequest,
        this.targetBranch,
        {
          fork: this.fork,
          signoffUser: this.signoffUser,
        }
      );
      return newPullRequest.number;
    }
  }

  async buildReleases(): Promise<CandidateRelease[]> {
    logger.info('Building releases');
    const strategiesByPath = await this.getStrategiesByPath();

    // Find merged release pull requests
    const pullRequestGenerator = this.github.pullRequestIterator(
      this.targetBranch,
      'MERGED',
      500
    );

    const releases: CandidateRelease[] = [];
    for await (const pullRequest of pullRequestGenerator) {
      logger.info(
        `Found pull request #${pullRequest.number}: '${pullRequest.title}'`
      );

      const pullRequestBody = PullRequestBody.parse(pullRequest.body);
      if (!pullRequestBody) {
        logger.info('could not parse pull request body as a release PR');
        continue;
      }

      logger.info('Looking at files touched by path');
      const cs = new CommitSplit({
        includeEmpty: true,
        packagePaths: Object.keys(this.repositoryConfig),
      });
      const commits = [
        {
          sha: pullRequest.sha!,
          message: pullRequest.title,
          files: pullRequest.files,
        },
      ];
      const commitsPerPath = cs.split(commits);
      for (const path in this.repositoryConfig) {
        const config = this.repositoryConfig[path];
        logger.info(`Building release for path: ${path}`);
        logger.info(`type: ${config.releaseType}`);
        logger.info(`targetBranch: ${this.targetBranch}`);
        const pathCommits =
          path === ROOT_PROJECT_PATH ? commits : commitsPerPath[path];
        if (!pathCommits || pathCommits.length === 0) {
          logger.info(`No commits for path: ${path}, skipping`);
          continue;
        }
        const strategy = strategiesByPath[path];
        const release = await strategy.buildRelease(pullRequest);
        if (release) {
          releases.push({
            ...release,
            pullRequest,
          });
        }
      }
    }

    return releases;
  }

  async createReleases(): Promise<(GitHubRelease | undefined)[]> {
    const releasesByPullRequest: Record<number, CandidateRelease[]> = {};
    const pullRequestsByNumber: Record<number, PullRequest> = {};
    for (const release of await this.buildReleases()) {
      pullRequestsByNumber[release.pullRequest.number] = release.pullRequest;
      if (releasesByPullRequest[release.pullRequest.number]) {
        releasesByPullRequest[release.pullRequest.number].push(release);
      } else {
        releasesByPullRequest[release.pullRequest.number] = [release];
      }
    }

    const promises: Promise<GitHubRelease[]>[] = [];
    for (const pullNumber in releasesByPullRequest) {
      promises.push(
        this.createReleasesForPullRequest(
          releasesByPullRequest[pullNumber],
          pullRequestsByNumber[pullNumber]
        )
      );
    }
    const releases = await Promise.all(promises);
    return releases.reduce((collection, r) => collection.concat(r), []);
  }

  private async createReleasesForPullRequest(
    releases: CandidateRelease[],
    pullRequest: PullRequest
  ): Promise<GitHubRelease[]> {
    // create the release
    const promises: Promise<GitHubRelease>[] = [];
    for (const release of releases) {
      promises.push(this.createRelease(release));
    }
    const githubReleases = await Promise.all(promises);

    // adjust tags on pullRequest
    await Promise.all([
      this.github.removeIssueLabels(this.labels, pullRequest.number),
      this.github.addIssueLabels(this.releaseLabels, pullRequest.number),
    ]);

    return githubReleases;
  }

  private async createRelease(
    release: CandidateRelease
  ): Promise<GitHubRelease> {
    const githubRelease = await this.github.createRelease(release);

    // comment on pull request
    const comment = `:robot: Release is at ${githubRelease.url} :sunflower:`;
    await this.github.commentOnIssue(comment, release.pullRequest.number);

    return githubRelease;
  }

  private async getStrategiesByPath(): Promise<Record<string, Strategy>> {
    if (!this._strategiesByPath) {
      this._strategiesByPath = {};
      for (const path in this.repositoryConfig) {
        const config = this.repositoryConfig[path];
        const strategy = await buildStrategy({
          ...config,
          github: this.github,
          path,
          targetBranch: this.targetBranch,
        });
        this._strategiesByPath[path] = strategy;
      }
    }
    return this._strategiesByPath;
  }

  private async getPathsByComponent(): Promise<Record<string, string>> {
    if (!this._pathsByComponent) {
      this._pathsByComponent = {};
      const strategiesByPath = await this.getStrategiesByPath();
      for (const path in this.repositoryConfig) {
        const config = this.repositoryConfig[path];
        const strategy = strategiesByPath[path];
        if (!config.component) {
          logger.warn(`No configured component for path: ${path}`);
          config.component = await strategy.getDefaultComponent();
          if (config.component === undefined) {
            logger.error(`No default component for path: ${path}`);
            continue;
          }
        }
        if (this._pathsByComponent[config.component]) {
          logger.warn(
            `Multiple paths for ${config.component}: ${
              this._pathsByComponent[config.component]
            }, ${path}`
          );
        }
        this._pathsByComponent[config.component] = path;
      }
    }
    return this._pathsByComponent;
  }
}

function extractReleaserConfig(config: ReleaserPackageConfig): ReleaserConfig {
  return {
    releaseType: config['release-type'] || 'node', // FIXME
    bumpMinorPreMajor: config['bump-minor-pre-major'],
    bumpPatchForMinorPreMajor: config['bump-patch-for-minor-pre-major'],
    changelogSections: config['changelog-sections'],
    changelogPath: config['changelog-path'],
    releaseAs: config['release-as'],
    skipGithubRelease: config['skip-github-release'],
    draft: config.draft,
    component: config['component'],
    packageName: config['package-name'],
    versionFile: config['version-file'],
    extraFiles: config['extra-files'],
  };
}

async function parseConfig(
  github: GitHub,
  configFile: string,
  branch: string
): Promise<{config: RepositoryConfig; options: ManifestOptions}> {
  const config = await github.getFileJson<Config>(configFile, branch);
  const defaultConfig = extractReleaserConfig(config);
  const repositoryConfig: RepositoryConfig = {};
  for (const path in config.packages) {
    const packageConfig: ReleaserConfig = {
      ...defaultConfig,
      ...extractReleaserConfig(config.packages[path]),
    };
    repositoryConfig[path] = packageConfig;
  }
  const manifestOptions = {
    bootstrapSha: config['bootstrap-sha'],
    lastReleaseSha: config['last-release-sha'],
    alwaysLinkLocal: config['always-link-local'],
    separatePullRequests: config['separate-pull-requests'],
    plugins: config['plugins'],
  };
  return {config: repositoryConfig, options: manifestOptions};
}

async function parseReleasedVersions(
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

/**
 * Find the most recent matching release tag on the branch we're
 * configured for.
 *
 * @param {string} prefix - Limit the release to a specific component.
 * @param {boolean} preRelease - Whether or not to return pre-release
 *   versions. Defaults to false.
 */
async function latestReleaseVersion(
  github: GitHub,
  targetBranch: string,
  prefix?: string
): Promise<Version | undefined> {
  const branchPrefix = prefix?.endsWith('-')
    ? prefix.replace(/-$/, '')
    : prefix;

  logger.info(`Looking for latest release on branch: ${targetBranch}`);

  // only look at the last 250 or so commits to find the latest tag - we
  // don't want to scan the entire repository history if this repo has never
  // been released
  const generator = github.mergeCommitIterator(targetBranch, 250);
  for await (const commitWithPullRequest of generator) {
    const mergedPullRequest = commitWithPullRequest.pullRequest;
    if (!mergedPullRequest) {
      continue;
    }

    const branchName = BranchName.parse(mergedPullRequest.headBranchName);
    if (!branchName) {
      continue;
    }

    // If branchPrefix is specified, ensure it is found in the branch name.
    // If branchPrefix is not specified, component should also be undefined.
    if (branchName.getComponent() !== branchPrefix) {
      continue;
    }

    const pullRequestTitle = PullRequestTitle.parse(mergedPullRequest.title);
    if (!pullRequestTitle) {
      continue;
    }

    const version = pullRequestTitle.getVersion();
    if (version?.preRelease?.includes('SNAPSHOT')) {
      // FIXME, don't hardcode this
      continue;
    }

    return version;
  }
  return;
}
