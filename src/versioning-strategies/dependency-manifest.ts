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

const DEPENDENCY_UPDATE_REGEX =
  /^deps: update dependency (.*) to (v.*)(\s\(#\d+\))?$/m;

// FIXME: implement this versioning strategy
export class DependencyManifest extends DefaultVersioningStrategy {
  determineReleaseType(
    version: Version,
    commits: ConventionalCommit[]
  ): ReleaseType {
    const dependencyUpdates = buildDependencyUpdates(commits);
    const releaseTypes: ReleaseType[] = Object.values(dependencyUpdates).map(
      version => {
        if (version.patch === 0) {
          if (version.minor === 0) {
            return 'major';
          }
          return 'minor';
        }
        return 'patch';
      }
    );
    releaseTypes.push(super.determineReleaseType(version, commits));
    let releaseType = maxBumpType(releaseTypes);
    if (version.major < 1) {
      if (this.bumpMinorPreMajor && releaseType === 'major') {
        releaseType = 'minor';
      } else if (this.bumpPatchForMinorPreMajor && releaseType === 'minor') {
        releaseType = 'patch';
      }
    }
    return releaseType;
  }
}

function buildDependencyUpdates(
  commits: ConventionalCommit[]
): Record<string, Version> {
  const versionsMap: Record<string, Version> = {};
  for (const commit of commits) {
    const match = commit.message.match(DEPENDENCY_UPDATE_REGEX);
    if (!match) continue;

    const versionString = match[2];
    let version: Version;
    try {
      version = Version.parse(versionString);
    } catch {
      version = Version.parse(`${versionString}.0.0`);
    }

    // commits are sorted by latest first, so if there is a collision,
    // then we've already recorded the latest version
    if (versionsMap[match[1]]) continue;

    versionsMap[match[1]] = version;
  }
  return versionsMap;
}

function maxBumpType(bumpTypes: ReleaseType[]): ReleaseType {
  if (bumpTypes.some(bumpType => bumpType === 'major')) {
    return 'major';
  }
  if (bumpTypes.some(bumpType => bumpType === 'minor')) {
    return 'minor';
  }
  return 'patch';
}
