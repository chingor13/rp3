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

import {ReleasePullRequest} from './release-pull-request';
import {Release} from './release';
import {GitHub} from './github';
import {Version, VersionsMap} from './version';
import {parseConventionalCommits, Commit, ConventionalCommit} from './commit';
import {VersioningStrategy} from './versioning-strategy';
import {DefaultVersioningStrategy} from './versioning-strategies/default';
import {PullRequestTitle} from './util/pull-request-title';
import {ReleaseNotes, ChangelogSection} from './release-notes';
import {Update} from './update';
import {Repository} from './repository';
import {PullRequest} from './pull-request';
import {BranchName} from './util/branch-name';
import {TagName} from './util/tag-name';
import {logger} from './util/logger';
import {MANIFEST_PULL_REQUEST_TITLE_PATTERN} from './manifest';
import {PullRequestBody} from './util/pull-request-body';

const DEFAULT_LABELS = ['autorelease: pending', 'type: release'];
const DEFAULT_CHANGELOG_PATH = 'CHANGELOG.md';

export interface BuildUpdatesOptions {
  changelogEntry: string;
  newVersion: Version;
  versionsMap: VersionsMap;
  latestVersion?: Version;
}
export interface StrategyOptions {
  path?: string;
  labels?: string[];
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
  github: GitHub;
  component?: string;
  versioningStrategy?: VersioningStrategy;
  targetBranch: string;
  changelogPath?: string;
  changelogSections?: ChangelogSection[];
  commitPartial?: string;
  headerPartial?: string;
  mainTemplate?: string;
}
export abstract class Strategy {
  path: string | undefined;
  labels: string[];
  github: GitHub;
  component: string | undefined;
  versioningStrategy: VersioningStrategy;
  targetBranch: string;
  repository: Repository;
  changelogPath: string;

  // CHANGELOG configuration
  changelogSections?: ChangelogSection[];
  commitPartial?: string;
  headerPartial?: string;
  mainTemplate?: string;

  constructor(options: StrategyOptions) {
    this.path = options.path;
    this.labels = options.labels || DEFAULT_LABELS;
    this.github = options.github;
    this.component = options.component;
    this.versioningStrategy =
      options.versioningStrategy || new DefaultVersioningStrategy({});
    this.targetBranch = options.targetBranch;
    this.repository = options.github.repository;
    this.changelogPath = options.changelogPath || DEFAULT_CHANGELOG_PATH;
    this.changelogSections = options.changelogSections;
    this.commitPartial = options.commitPartial;
    this.headerPartial = options.headerPartial;
    this.mainTemplate = options.mainTemplate;
  }

  protected abstract async buildUpdates(
    options: BuildUpdatesOptions
  ): Promise<Update[]>;

  async getDefaultComponent(): Promise<string | undefined> {
    return '';
  }

  protected normalizeComponent(
    component: string | undefined
  ): string | undefined {
    if (!component) {
      return undefined;
    }
    return component;
  }

  protected postProcessCommits(
    commits: ConventionalCommit[]
  ): ConventionalCommit[] {
    return commits;
  }

  protected async buildReleaseNotes(
    conventionalCommits: ConventionalCommit[],
    newVersion: Version,
    newVersionTag: TagName,
    latestRelease?: Release
  ): Promise<string> {
    const releaseNotes = new ReleaseNotes({
      changelogSections: this.changelogSections,
      commitPartial: this.commitPartial,
      headerPartial: this.headerPartial,
      mainTemplate: this.mainTemplate,
    });
    return await releaseNotes.buildNotes(conventionalCommits, {
      owner: this.repository.owner,
      repository: this.repository.repo,
      version: newVersion.toString(),
      previousTag: latestRelease?.tag?.toString(),
      currentTag: newVersionTag.toString(),
    });
  }

  async buildReleasePullRequest(
    commits: Commit[],
    latestRelease?: Release
  ): Promise<ReleasePullRequest | undefined> {
    const conventionalCommits = this.postProcessCommits(
      parseConventionalCommits(commits)
    );

    const newVersion = latestRelease
      ? await this.versioningStrategy.bump(
          latestRelease.tag.version,
          conventionalCommits
        )
      : this.initialReleaseVersion();
    const versionsMap = await this.buildVersionsMap(conventionalCommits);
    for (const versionKey of versionsMap.keys()) {
      const version = versionsMap.get(versionKey);
      if (!version) {
        logger.warn(`didn't find version for ${versionKey}`);
        continue;
      }
      const newVersion = await this.versioningStrategy.bump(
        version,
        conventionalCommits
      );
      versionsMap.set(versionKey, newVersion);
    }
    const component = this.component || (await this.getDefaultComponent());
    logger.debug(`component: ${component}`);

    const newVersionTag = new TagName(newVersion, component);
    const pullRequestTitle = PullRequestTitle.ofComponentTargetBranchVersion(
      component || '',
      this.targetBranch,
      newVersion
    );
    const branchName = component
      ? BranchName.ofComponentTargetBranch(component, this.targetBranch)
      : BranchName.ofTargetBranch(this.targetBranch);
    const releaseNotesBody = await this.buildReleaseNotes(
      conventionalCommits,
      newVersion,
      newVersionTag,
      latestRelease
    );
    const updates = await this.buildUpdates({
      changelogEntry: releaseNotesBody,
      newVersion,
      versionsMap,
      latestVersion: latestRelease?.tag.version,
    });
    const pullRequestBody = new PullRequestBody([
      {
        component,
        version: newVersion,
        notes: releaseNotesBody,
      },
    ]);

    return {
      title: pullRequestTitle,
      body: pullRequestBody,
      updates,
      labels: this.labels,
      headRefName: branchName.toString(),
      version: newVersion,
    };
  }

  protected async buildVersionsMap(
    _conventionalCommits: ConventionalCommit[]
  ): Promise<VersionsMap> {
    return new Map();
  }

  async buildRelease(mergedPullRequest: PullRequest): Promise<Release> {
    const pullRequestTitle =
      PullRequestTitle.parse(mergedPullRequest.title) ||
      PullRequestTitle.parse(
        mergedPullRequest.title,
        MANIFEST_PULL_REQUEST_TITLE_PATTERN
      );
    if (!pullRequestTitle) {
      throw new Error(`Bad pull request title: '${mergedPullRequest.title}'`);
    }
    const branchName = BranchName.parse(mergedPullRequest.headBranchName);
    if (!branchName) {
      throw new Error(`Bad branch name: ${mergedPullRequest.headBranchName}`);
    }
    if (!mergedPullRequest.sha) {
      throw new Error('Pull request should have been merged');
    }
    const pullRequestBody = PullRequestBody.parse(mergedPullRequest.body);
    if (!pullRequestBody) {
      throw new Error('could not parse pull request body as a release PR');
    }
    const component = this.component || (await this.getDefaultComponent());
    logger.debug('component:', component);
    const releaseData = pullRequestBody.releaseData.find(releaseData => {
      return (
        this.normalizeComponent(releaseData.component) ===
        this.normalizeComponent(component)
      );
    });
    const notes = releaseData?.notes;
    if (notes === undefined) {
      logger.warn('Failed to find release notes');
    }
    const version = pullRequestTitle.getVersion() || releaseData?.version;
    if (!version) {
      throw new Error('Pull request should have included version');
    }

    return {
      tag: new TagName(version, component),
      notes: notes || '',
      sha: mergedPullRequest.sha,
    };
  }

  protected initialReleaseVersion(): Version {
    return Version.parse('1.0.0');
  }

  protected addPath(file: string) {
    if (this.path === '.') {
      return file;
    }
    file = file.replace(/^[/\\]/, '');
    if (this.path === undefined) {
      return file;
    } else {
      const path = this.path.replace(/[/\\]$/, '');
      return `${path}/${file}`;
    }
  }
}
