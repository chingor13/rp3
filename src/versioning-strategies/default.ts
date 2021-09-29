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

import {VersioningStrategy} from '../versioning-strategy';
import {ConventionalCommit} from '../commit';
import {Version} from '../version';
import {logger} from '../util/logger';
import * as semver from 'semver';
import {ReleaseType} from 'semver';

export interface ChangelogSection {
  type: string;
  section: string;
  hidden?: boolean;
}

interface DefaultVersioningStrategyOptions {
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
  changelogSections?: ChangelogSection[];
}

export class DefaultVersioningStrategy implements VersioningStrategy {
  bumpMinorPreMajor: boolean;
  bumpPatchForMinorPreMajor: boolean;
  changelogSections?: ChangelogSection[];
  constructor(options: DefaultVersioningStrategyOptions = {}) {
    this.bumpMinorPreMajor = options.bumpMinorPreMajor === true;
    this.bumpPatchForMinorPreMajor = options.bumpPatchForMinorPreMajor === true;
    this.changelogSections = options.changelogSections;
  }

  protected guessReleaseType(commits: ConventionalCommit[]): ReleaseType {
    // iterate through list of commits and find biggest commit type
    let breaking = 0;
    let features = 0;
    for (const commit of commits) {
      if (commit.breaking) {
        breaking++;
      } else if (commit.type === 'feat' || commit.type === 'feature') {
        features++;
      }
    }
    if (breaking > 0) {
      return 'major';
    }
    if (features > 0) {
      return 'minor';
    }
    return 'patch';
  }

  doBump(version: Version, bumpType: ReleaseType): Version {
    switch (bumpType) {
      case 'major':
        return new Version(
          version.major + 1,
          0,
          0,
          version.preRelease,
          version.build
        );
      case 'minor':
        return new Version(
          version.major,
          version.minor + 1,
          0,
          version.preRelease,
          version.build
        );
      case 'patch':
        return new Version(
          version.major,
          version.minor,
          version.patch + 1,
          version.preRelease,
          version.build
        );
      default:
        logger.warn(`Unhandled bump type: ${bumpType}`);
    }
    return version;
  }

  bump(version: Version, commits: ConventionalCommit[]): Version {
    let bumpType = this.guessReleaseType(commits);
    if (semver.lt(version.toString(), 'v1.0.0')) {
      if (this.bumpMinorPreMajor && bumpType === 'major') {
        bumpType = 'minor';
      } else if (this.bumpPatchForMinorPreMajor && bumpType === 'minor') {
        bumpType = 'patch';
      }
    }

    return this.doBump(version, bumpType);
  }
}
