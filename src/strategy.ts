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
}
export class Strategy {
  bumpMinorPreMajor: boolean;
  bumpPatchForMinorPreMajor: boolean;
  path: string | undefined;
  labels: string[];
  github: GitHub;
  component: string | undefined;
  versioningStrategy: VersioningStrategy;
  targetBranch: string;
  repository: Repository;
  changelogPath: string;
  changelogSections?: ChangelogSection[];

  constructor(options: StrategyOptions) {
    this.bumpMinorPreMajor = options.bumpMinorPreMajor || false;
    this.bumpPatchForMinorPreMajor = options.bumpPatchForMinorPreMajor || false;
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
  }

  async buildUpdates(_options: BuildUpdatesOptions): Promise<Update[]> {
    return [];
  }

  async getDefaultComponent(): Promise<string | undefined> {
    return '';
  }

  protected postProcessCommits(commits: ConventionalCommit[]): ConventionalCommit[] {
    return commits;
  }

  async buildReleasePullRequest(
    commits: Commit[],
    latestRelease?: Release
  ): Promise<ReleasePullRequest> {
    const conventionalCommits = parseConventionalCommits(commits);

    const newVersion = latestRelease
      ? await this.versioningStrategy.bump(
          latestRelease.tag.version,
          conventionalCommits
        )
      : this.initialReleaseVersion();
    const versionsMap = await this.buildVersionsMap();
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

    const newVersionTag = new TagName(newVersion, component);
    const pullRequestTitle = PullRequestTitle.ofComponentTargetBranchVersion(
      component || '',
      this.targetBranch,
      newVersion.toString()
    );
    const branchName = component
      ? BranchName.ofComponentTargetBranch(component, this.targetBranch)
      : BranchName.ofTargetBranch(this.targetBranch);
    const releaseNotes = new ReleaseNotes({
      changelogSections: this.changelogSections,
    });
    const releaseNotesBody = await releaseNotes.buildNotes(
      conventionalCommits,
      {
        owner: this.repository.owner,
        repository: this.repository.repo,
        version: newVersion.toString(),
        previousTag: latestRelease?.tag?.toString(),
        currentTag: newVersionTag.toString(),
      }
    );
    const updates = await this.buildUpdates({
      changelogEntry: releaseNotesBody,
      newVersion,
      versionsMap,
      latestVersion: latestRelease?.tag.version,
    });

    return {
      title: pullRequestTitle.toString(),
      body: releaseNotesBody,
      updates,
      labels: this.labels,
      headRefName: branchName.toString() + '-testing',
      version: newVersion,
    };
  }

  protected async buildVersionsMap(): Promise<VersionsMap> {
    return new Map();
  }

  async buildRelease(mergedPullRequest: PullRequest): Promise<Release> {
    const pullRequestTitle = PullRequestTitle.parse(mergedPullRequest.title);
    if (!pullRequestTitle) {
      throw new Error(`Bad pull request title: ${mergedPullRequest.title}`);
    }
    const branchName = BranchName.parse(mergedPullRequest.headBranchName);
    if (!branchName) {
      throw new Error(`Bad branch name: ${mergedPullRequest.headBranchName}`);
    }
    if (!mergedPullRequest.sha) {
      throw new Error('Pull request should have been merged');
    }

    return {
      tag: new TagName(
        Version.parse(pullRequestTitle.getVersion()),
        branchName.getComponent() || ''
      ),
      notes: 'FIXME',
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
