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
import {Version} from '../version';
import {ConventionalCommit} from '../commit';
import {ReleaseType} from 'semver';

function isSnapshot(version: Version): boolean {
  return !!version.preRelease?.includes('SNAPSHOT');
}

function removeSnapshot(version: Version): Version {
  return new Version(
    version.major,
    version.minor,
    version.patch,
    version.preRelease
      ? version.preRelease.replace(/-?SNAPSHOT/, '')
      : undefined,
    version.build
  );
}

export class JavaSnapshot implements VersioningStrategy {
  strategy: VersioningStrategy;
  constructor(strategy: VersioningStrategy) {
    this.strategy = strategy;
  }

  determineReleaseType(
    version: Version,
    commits: ConventionalCommit[]
  ): ReleaseType {
    return this.strategy.determineReleaseType(version, commits);
  }

  bump(version: Version, commits: ConventionalCommit[]): Version {
    // If the previous version was not a snapshot, bump with a snapshot
    if (!isSnapshot(version)) {
      const nextPatch = this.strategy.doBump(version, 'patch');
      nextPatch.preRelease = nextPatch.preRelease
        ? `${nextPatch.preRelease}-SNAPSHOT`
        : 'SNAPSHOT';
      return nextPatch;
    }

    const releaseType = this.determineReleaseType(version, commits);
    if (releaseType !== 'patch') {
      version = this.doBump(version, releaseType);
    }

    return removeSnapshot(version);
  }

  doBump(version: Version, releaseType: ReleaseType): Version {
    return this.strategy.doBump(version, releaseType);
  }
}
