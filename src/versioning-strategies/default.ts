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

interface DefaultVersioningStrategyOptions {
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
}

export class DefaultVersioningStrategy implements VersioningStrategy {
  bumpMinorPreMajor: boolean;
  bumpPatchForMinorPreMajor: boolean;
  constructor(options: DefaultVersioningStrategyOptions = {}) {
    this.bumpMinorPreMajor = options.bumpMinorPreMajor === true;
    this.bumpPatchForMinorPreMajor = options.bumpPatchForMinorPreMajor === true;
  }

  determineReleaseType(
    version: Version,
    commits: ConventionalCommit[]
  ): ReleaseType {
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
    let releaseType: ReleaseType = 'patch';
    if (breaking > 0) {
      releaseType = 'major';
    } else if (features > 0) {
      releaseType = 'minor';
    }

    if (semver.lt(version.toString(), 'v1.0.0')) {
      if (this.bumpMinorPreMajor && releaseType === 'major') {
        releaseType = 'minor';
      } else if (this.bumpPatchForMinorPreMajor && releaseType === 'minor') {
        releaseType = 'patch';
      }
    }
    return releaseType;
  }

  doBump(version: Version, releaseType: ReleaseType): Version {
    switch (releaseType) {
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
        logger.warn(`Unhandled bump type: ${releaseType}`);
    }
    return version;
  }

  bump(version: Version, commits: ConventionalCommit[]): Version {
    return this.doBump(version, this.determineReleaseType(version, commits));
  }
}
