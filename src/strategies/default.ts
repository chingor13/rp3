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

import {Strategy} from '../strategy';
import {ReleasePullRequest} from '../release-pull-request';
import {Release} from '../release';
import {GitHub} from '../github';
import {Version} from '../version';
import {parseConventionalCommits} from '../commit';
import {VersioningStrategy} from '../versioning-strategy';
import {DefaultVersioningStrategy} from '../versioning-strategies/default';
import {PullRequestTitle} from '../util/pull-request-title';
import {ReleaseNotes} from '../release-notes';
import {Update} from '../update';

const DEFAULT_LABELS = ['autorelease: pending', 'type: release'];
interface StrategyOptions {
  path?: string;
  labels?: string[];
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
  github: GitHub;
  component?: string;
  versioningStrategy?: VersioningStrategy;
  targetBranch: string;
}

export class DefaultStrategy implements Strategy {
  bumpMinorPreMajor: boolean;
  bumpPatchForMinorPreMajor: boolean;
  path: string | undefined;
  labels: string[];
  github: GitHub;
  component: string | undefined;
  versioningStrategy: VersioningStrategy;
  targetBranch: string;

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
  }

  async buildUpdates(): Promise<Update[]> {
    return [];
  }

  async buildReleasePullRequest(): Promise<ReleasePullRequest> {
    const latestRelease = await this.github.lastRelease(this.component);
    const commits = await this.github.commitsSinceSha(latestRelease?.sha);
    const latestReleaseVersion = Version.parse(latestRelease?.tag || '1.0.0');
    const conventionalCommits = parseConventionalCommits(commits);

    const newVersion = await this.versioningStrategy.bump(
      latestReleaseVersion,
      conventionalCommits
    );
    const pullRequestTitle = PullRequestTitle.ofComponentTargetBranchVersion(
      this.component || '',
      this.targetBranch,
      newVersion.toString()
    );
    const releaseNotes = new ReleaseNotes();
    const releaseNotesBody = await releaseNotes.buildNotes(
      conventionalCommits,
      {
        owner: 'googleapis',
        repository: 'java-asset',
        version: '1.2.3',
        previousTag: 'v1.2.2',
        currentTag: 'v1.2.3',
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

  async buildRelease(): Promise<Release> {
    return {
      tag: 'v1.2.3',
      component: null,
      notes: 'FIXME',
      sha: 'abc123',
    };
  }
}
