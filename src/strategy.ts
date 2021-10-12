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
import {Version} from './version';
import {parseConventionalCommits, Commit} from './commit';
import {VersioningStrategy} from './versioning-strategy';
import {DefaultVersioningStrategy} from './versioning-strategies/default';
import {PullRequestTitle} from './util/pull-request-title';
import {ReleaseNotes} from './release-notes';
import {Update} from './update';
import {Repository} from './repository';
import {PullRequest} from './pull-request';
import {BranchName} from './util/branch-name';

const DEFAULT_LABELS = ['autorelease: pending', 'type: release'];
export interface StrategyOptions {
  path?: string;
  labels?: string[];
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
  github: GitHub;
  component?: string;
  versioningStrategy?: VersioningStrategy;
  targetBranch: string;
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
  }

  async buildUpdates(): Promise<Update[]> {
    return [];
  }

  async buildReleasePullRequest(
    commits: Commit[],
    latestRelease?: Release
  ): Promise<ReleasePullRequest> {
    const latestReleaseVersion = latestRelease
      ? Version.parse(latestRelease.tag)
      : undefined;
    const conventionalCommits = parseConventionalCommits(commits);

    const newVersion = latestReleaseVersion
      ? (
          await this.versioningStrategy.bump(
            latestReleaseVersion,
            conventionalCommits
          )
        ).toString()
      : '1.0.0';
    const newVersionTag = `v${newVersion}`;
    const pullRequestTitle = PullRequestTitle.ofComponentTargetBranchVersion(
      this.component || '',
      this.targetBranch,
      newVersion
    );
    const releaseNotes = new ReleaseNotes();
    const releaseNotesBody = await releaseNotes.buildNotes(
      conventionalCommits,
      {
        owner: this.repository.owner,
        repository: this.repository.repo,
        version: newVersion,
        previousTag: latestRelease?.tag,
        currentTag: newVersionTag,
      }
    );
    const updates = await this.buildUpdates();

    return {
      title: pullRequestTitle.toString(),
      body: releaseNotesBody,
      updates,
      labels: this.labels,
    };
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
      tag: `v${pullRequestTitle.getVersion()}`,
      component: branchName.getComponent() || '',
      notes: 'FIXME',
      sha: mergedPullRequest.sha,
    };
  }
}
