// Copyright 2019 Google LLC
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
import {Update} from '../update';
import {PackageLockJson} from '../updaters/package-lock-json';
import {Version} from '../version';
import {SamplesPackageJson} from '../updaters/samples-package-json';
import {Changelog} from '../updaters/changelog';
import {PackageJson} from '../updaters/package-json';

export class Node extends Strategy {
  async buildUpdates(): Promise<Update[]> {
    const updates: Update[] = [];

    // FIXME
    const version = Version.parse('1.2.3');
    const packageName = 'FIXME';
    const changelogEntry = 'FIXME';

    const lockFiles = ['package-lock.json', 'npm-shrinkwrap.json'];
    lockFiles.forEach(lockFile => {
      updates.push({
        path: this.addPath(lockFile),
        createIfMissing: false,
        updater: new PackageLockJson({
          version,
        }),
      });
    });

    updates.push({
      path: this.addPath('samples/package.json'),
      createIfMissing: false,
      updater: new SamplesPackageJson({
        version,
        packageName,
      }),
    });

    updates.push({
      path: this.addPath(this.changelogPath),
      createIfMissing: true,
      updater: new Changelog({
        version,
        changelogEntry,
      }),
    });

    updates.push({
      path: this.addPath('package.json'),
      createIfMissing: false,
      updater: new PackageJson({
        version,
      }),
    });

    return updates;
  }
}