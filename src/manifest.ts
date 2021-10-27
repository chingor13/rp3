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
import {Version} from './version';
import {Commit} from './commit';
import {PullRequest} from './pull-request';
import {logger} from './util/logger';
import {CommitSplit} from './util/commit-split';
import {TagName} from './util/tag-name';
import {Repository} from './repository';
import {BranchName} from './util/branch-name';
import {PullRequestTitle} from './util/pull-request-title';
import {ReleasePullRequest} from './release-pull-request';
import {buildStrategy, ReleaseType} from './factory';
import {Release} from './release';
import {Strategy} from './strategy';
import {Update} from './update';
import {CompositeUpdater} from './updaters/composite';

export interface ReleaserConfig {
  releaseType: ReleaseType;
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
  changelogSections?: ChangelogSection[];
  changelogPath?: string;
  releaseAs?: string;
  skipGithubRelease?: boolean;
  draft?: boolean;
  component?: string;
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

interface ManifestOptions {
  bootstrapSha?: string;
  lastReleaseSha?: string;
  alwaysLinkLocal?: boolean;
  separatePullRequests?: boolean;
  plugins?: PluginType[];
}

interface ReleaserPackageConfig extends ReleaserConfigJson {
  // deprecated in favor of component
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
const ROOT_PROJECT_PATH = '.';
const DEFAULT_COMPONENT_NAME = '';

export const MANIFEST_PULL_REQUEST_TITLE_PATTERN = 'chore: release ${scope}';

export class Manifest {
  repository: Repository;
  github: GitHub;
  repositoryConfig: RepositoryConfig;
  releasedVersions: ReleasedVersions;
  targetBranch: string;
  separatePullRequests: boolean;

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
    this.separatePullRequests = manifestOptions?.separatePullRequests || false;
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

  async createPullRequests(): Promise<(number | undefined)[]> {
    const promises: Promise<number | undefined>[] = [];
    for (const pullRequest of await this.buildPullRequests()) {
      promises.push(this.github.openPR(pullRequest, this.targetBranch));
    }
    return await Promise.all(promises);
  }

  async buildPullRequests(): Promise<ReleasePullRequest[]> {
    logger.info('Building pull requests');
    const pathsByComponent: Record<string, string> = {};
    const strategiesByPath: Record<string, Strategy> = {};
    for (const path in this.repositoryConfig) {
      const config = this.repositoryConfig[path];
      const strategy = await buildStrategy({
        ...config,
        github: this.github,
        path,
        targetBranch: this.targetBranch,
      });
      strategiesByPath[path] = strategy;
      if (!config.component) {
        logger.warn(`No configured component for path: ${path}`);
        config.component = await strategy.getDefaultComponent();
        if (config.component === undefined) {
          logger.error(`No default component for path: ${path}`);
          continue;
        }
      }
      if (pathsByComponent[config.component]) {
        logger.warn(
          `Multiple paths for ${config.component}: ${
            pathsByComponent[config.component]
          }, ${path}`
        );
      }
      pathsByComponent[config.component] = path;
    }

    // Collect all the SHAs of the latest release packages
    logger.info('Collecting release commit SHAs');
    let releasesFound = 0;
    const expectedReleases = Object.keys(this.releasedVersions).length;

    // SHAs by path
    const shasByPath: Record<string, string> = {};

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
        logger.warn(
          `Unable to find package '${tagName.component}' in manifest`
        );
        continue;
      }
      if (expectedVersion.toString() === tagName.version.toString()) {
        shasByPath[path] = release.sha;
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
    const shas = new Set(Object.values(shasByPath));
    const expectedShas = shas.size;

    // sha => release pull request
    const releasePullRequestsBySha: Record<string, PullRequest> = {};
    let commitsFound = 0;
    for await (const commit of commitGenerator) {
      commits.push({
        sha: commit.sha,
        message: commit.message,
        files: commit.files,
      });
      if (shas.has(commit.sha)) {
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

    const newReleasePullRequests: ReleasePullRequest[] = [];
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
        releasePullRequestsBySha[shasByPath[path]];
      if (!latestReleasePullRequest) {
        logger.warn('No latest release pull request found.');
      }

      const strategy = strategiesByPath[path];
      const latestRelease = releasesByPath[path];
      newReleasePullRequests.push(
        await strategy.buildReleasePullRequest(commits, latestRelease)
      );
    }

    // TODO: apply plugins
    if (this.separatePullRequests || newReleasePullRequests.length === 1) {
      return newReleasePullRequests;
    }

    return [mergePullRequests(newReleasePullRequests, this.targetBranch)];
  }

  async buildReleases(): Promise<Release[]> {
    // Find merged release pull requests
    const pullRequestGenerator = this.github.mergedPullRequestIterator(
      this.targetBranch,
      500
    );

    for await (const pullRequest of pullRequestGenerator) {
      if (
        !pullRequest.labels.find(label => {
          return label === 'autorelease: pending';
        })
      ) {
        continue;
      }

      return extractReleases(pullRequest);
    }

    // Prepare release info
    return [];
  }

  async createReleases(): Promise<(GitHubRelease | undefined)[]> {
    const promises: Promise<GitHubRelease | undefined>[] = [];
    for (const release of await this.buildReleases()) {
      promises.push(this.github.createRelease(release));
    }
    return await Promise.all(promises);
  }
}

function extractReleases(pullRequest: PullRequest): Release[] {
  pullRequest.body;
  return [];
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
    component: config['component'] || config['package-name'],
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

    const version = Version.parse(pullRequestTitle.getVersion() || '');
    if (version.preRelease?.includes('SNAPSHOT')) {
      // FIXME, don't hardcode this
      continue;
    }

    return version;
  }
  return;
}

function mergePullRequests(
  pullRequests: ReleasePullRequest[],
  targetBranch: string
): ReleasePullRequest {
  const updatesByPath: Record<string, Update[]> = {};
  const bodyParts: string[] = [];
  const labels = new Set<string>();
  for (const pullRequest of pullRequests) {
    for (const update of pullRequest.updates) {
      if (updatesByPath[update.path]) {
        updatesByPath[update.path].push(update);
      } else {
        updatesByPath[update.path] = [update];
      }
    }
    bodyParts.push(pullRequest.body);
  }

  const updates: Update[] = [];
  for (const path in updatesByPath) {
    const update = updatesByPath[path];
    const updaters = update.map(u => u.updater);
    updates.push({
      path,
      createIfMissing: update[0].createIfMissing,
      updater: new CompositeUpdater(...updaters),
    });
  }

  return {
    title: PullRequestTitle.ofTargetBranch(
      targetBranch,
      MANIFEST_PULL_REQUEST_TITLE_PATTERN
    ).toString(),
    body: bodyParts.join('\n\n'),
    updates,
    labels: Array.from(labels),
    headRefName: BranchName.ofTargetBranch(targetBranch).toString(),
  };
}
