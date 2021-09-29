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

export class JavaSnapshot implements VersioningStrategy {
  strategy: VersioningStrategy;
  constructor(strategy: VersioningStrategy) {
    this.strategy = strategy;
  }

  bump(version: Version, commits: ConventionalCommit[]): Version {
    // If the previous version was not a snapshot, bump with a snapshot
    if (!version.preRelease?.includes('SNAPSHOT')) {
      const nextPatch = this.strategy.doBump(version, 'patch');
      nextPatch.preRelease = nextPatch.preRelease
        ? `${nextPatch.preRelease}-SNAPSHOT`
        : 'SNAPSHOT';
      return nextPatch;
    }

    const newVersion = this.strategy.bump(version, commits);
    if (newVersion.preRelease) {
      newVersion.preRelease = newVersion.preRelease.replace(/-?SNAPSHOT/, '');
    }
    return newVersion;
  }

  doBump(version: Version, bumpType: ReleaseType): Version {
    return this.strategy.doBump(version, bumpType);
  }
}
