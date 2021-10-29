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
import {Version, VersionsMap} from '../version';
import {JavaUpdate} from '../updaters/java/java-update';
import {Strategy, StrategyOptions, BuildUpdatesOptions} from '../strategy';
import {Changelog} from '../updaters/changelog';
import {GitHubFileContents} from '../github';
import {logger} from '../util/logger';
import {JavaSnapshot} from '../versioning-strategies/java-snapshot';

const CHANGELOG_SECTIONS = [
  {type: 'feat', section: 'Features'},
  {type: 'fix', section: 'Bug Fixes'},
  {type: 'perf', section: 'Performance Improvements'},
  {type: 'deps', section: 'Dependencies'},
  {type: 'revert', section: 'Reverts'},
  {type: 'docs', section: 'Documentation'},
  {type: 'style', section: 'Styles', hidden: true},
  {type: 'chore', section: 'Miscellaneous Chores', hidden: true},
  {type: 'refactor', section: 'Code Refactoring', hidden: true},
  {type: 'test', section: 'Tests', hidden: true},
  {type: 'build', section: 'Build System', hidden: true},
  {type: 'ci', section: 'Continuous Integration', hidden: true},
];

interface JavaStrategyOptions extends StrategyOptions {
  extraFiles?: string[];
}

export class JavaYoshi extends Strategy {
  extraFiles: string[];
  versionsContent?: GitHubFileContents;

  constructor(options: JavaStrategyOptions) {
    super({
      ...options,
      changelogSections: CHANGELOG_SECTIONS,
    });
    // wrap the configured versioning strategy with snapshotting
    this.versioningStrategy = new JavaSnapshot(this.versioningStrategy);
    this.extraFiles = options.extraFiles || [];
  }

  protected async buildVersionsMap(): Promise<VersionsMap> {
    this.versionsContent = await this.github.getFileContentsOnBranch(
      'versions.txt',
      this.targetBranch
    );
    return VersionsManifest.parseVersions(this.versionsContent.parsedContent);
  }

  protected async buildUpdates(
    options: BuildUpdatesOptions
  ): Promise<Update[]> {
    const updates: Update[] = [];
    const version = options.newVersion;
    const versionsMap = options.versionsMap;

    updates.push({
      path: this.addPath('versions.txt'),
      createIfMissing: false,
      cachedFileContents: this.versionsContent,
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
    logger.info(pomFiles);
    pomFiles.forEach(path => {
      updates.push({
        path: this.addPath(path),
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
        path: this.addPath(path),
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
        path: this.addPath(path),
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
        changelogEntry: options.changelogEntry,
      }),
    });

    return updates;
  }

  protected initialReleaseVersion(): Version {
    return Version.parse('0.1.0');
  }
}
