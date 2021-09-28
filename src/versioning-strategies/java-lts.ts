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

import {Version} from '../version';
import {ReleaseType} from 'semver';
import {ConventionalCommit} from '../commit';
import {DefaultVersioningStrategy} from './default';

const LTS_PATTERN = /sp\.(\d+)(-SNAPSHOT)?/;

export class JavaLTSVersioningStrategy extends DefaultVersioningStrategy {
  async bump(
    version: Version,
    commits: ConventionalCommit[]
  ): Promise<Version> {
    // If the previous version was not an LTS release, bump with an LTS snapshot
    if (!version.preRelease?.includes('sp.')) {
      return new Version(
        version.major,
        version.minor,
        version.patch,
        'sp.1-SNAPSHOT',
        version.build
      );
    }

    return super.bump(version, commits);
  }

  protected doBump(version: Version, _bumpType: ReleaseType): Version {
    const match = version.preRelease?.match(LTS_PATTERN);
    if (match) {
      const spNumber = Number(match[1]);
      if (match[2]) {
        return new Version(
          version.major,
          version.minor,
          version.patch,
          `sp.${spNumber}`,
          version.build
        );
      } else {
        return new Version(
          version.major,
          version.minor,
          version.patch,
          `sp.${spNumber + 1}-SNAPSHOT`,
          version.build
        );
      }
    }
    return new Version(
      version.major,
      version.minor,
      version.patch,
      'sp.1-SNAPSHOT',
      version.build
    );
  }
}
