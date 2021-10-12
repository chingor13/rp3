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

import {DefaultStrategy, StrategyOptions} from './default';
import {Update} from '../update';
import {VersionsManifest} from '../updaters/java/versions-manifest';
import {Version} from '../version';
import {JavaUpdate} from '../updaters/java/java-update';

interface JavaStrategyOptions extends StrategyOptions {
  extraFiles?: string[];
}

export class JavaYoshi extends DefaultStrategy {
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

    updates.push({
      path: 'versions.txt',
      createIfMissing: false,
      updater: new VersionsManifest({
        version,
        versionsMap,
      }),
    });

    const pomFilesSearch = this.github.findFilesByFilename('pom.xml');
    const buildFilesSearch = this.github.findFilesByFilename('build.gradle');
    const dependenciesSearch = this.github.findFilesByFilename(
      'dependencies.properties'
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

    return updates;
  }
}