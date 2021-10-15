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

import {Update} from '../update';
import {VersionsManifest} from '../updaters/java/versions-manifest';
import {Version} from '../version';
import {JavaUpdate} from '../updaters/java/java-update';
import {Strategy, StrategyOptions} from '../strategy';
import {Changelog} from '../updaters/changelog';

interface JavaStrategyOptions extends StrategyOptions {
  extraFiles?: string[];
}

export class JavaYoshi extends Strategy {
  extraFiles: string[];

  constructor(options: JavaStrategyOptions) {
    super(options);
    this.extraFiles = options.extraFiles || [];
  }

  async buildUpdates(): Promise<Update[]> {
    const updates: Update[] = [];

    // FIXME
    const version = Version.parse('1.2.3');
    const versionsMap = new Map<string, Version>();
    versionsMap.set('foo', Version.parse('1.2.3'));
    const changelogEntry = 'FIXME';

    updates.push({
      path: this.addPath('versions.txt'),
      createIfMissing: false,
      updater: new VersionsManifest({
        version,
        versionsMap,
      }),
    });

    const pomFilesSearch = this.github.findFilesByFilename(
      'pom.xml',
      this.path
    );
    const buildFilesSearch = this.github.findFilesByFilename(
      'build.gradle',
      this.path
    );
    const dependenciesSearch = this.github.findFilesByFilename(
      'dependencies.properties',
      this.path
    );

    const pomFiles = await pomFilesSearch;
    pomFiles.forEach(path => {
      updates.push({
        path,
        createIfMissing: false,
        updater: new JavaUpdate({
          version,
          versionsMap,
        }),
      });
    });

    const buildFiles = await buildFilesSearch;
    buildFiles.forEach(path => {
      updates.push({
        path,
        createIfMissing: false,
        updater: new JavaUpdate({
          version,
          versionsMap,
        }),
      });
    });

    const dependenciesFiles = await dependenciesSearch;
    dependenciesFiles.forEach(path => {
      updates.push({
        path,
        createIfMissing: false,
        updater: new JavaUpdate({
          version,
          versionsMap,
        }),
      });
    });

    this.extraFiles.forEach(path => {
      updates.push({
        path,
        createIfMissing: false,
        updater: new JavaUpdate({
          version,
          versionsMap,
        }),
      });
    });

    updates.push({
      path: this.addPath(this.changelogPath),
      createIfMissing: true,
      updater: new Changelog({
        version,
        changelogEntry,
      }),
    });

    return updates;
  }

  protected initialReleaseVersion(): Version {
    return Version.parse('0.1.0');
  }
}
