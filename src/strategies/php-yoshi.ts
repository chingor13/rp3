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

import {Strategy, BuildUpdatesOptions} from '../strategy';
import {Update} from '../update';
import {Changelog} from '../updaters/changelog';
import {RootComposerUpdatePackages} from '../updaters/php/root-composer-update-packages';
import {PHPManifest} from '../updaters/php/php-manifest';
import {PHPClientVersion} from '../updaters/php/php-client-version';
import {VersionsMap, Version} from '../version';
import {Commit, parseConventionalCommits} from '../commit';
import {CommitSplit} from '../util/commit-split';
import {DefaultUpdater} from '../updaters/default';
import {Release} from '../release';
import {ReleasePullRequest} from '../release-pull-request';
import {logger} from '../util/logger';
import {TagName} from '../util/tag-name';
import {PullRequestTitle} from '../util/pull-request-title';
import {BranchName} from '../util/branch-name';
import {PullRequestBody} from '../util/pull-request-body';
import {GitHubFileContents} from '../github';
import {ReleaseNotes} from '../release-notes';

const CHANGELOG_SECTIONS = [
  {type: 'feat', section: 'Features'},
  {type: 'fix', section: 'Bug Fixes'},
  {type: 'perf', section: 'Performance Improvements'},
  {type: 'revert', section: 'Reverts'},
  {type: 'docs', section: 'Documentation'},
  {type: 'chore', section: 'Miscellaneous Chores'},
  {type: 'style', section: 'Styles', hidden: true},
  {type: 'refactor', section: 'Code Refactoring', hidden: true},
  {type: 'test', section: 'Tests', hidden: true},
  {type: 'build', section: 'Build System', hidden: true},
  {type: 'ci', section: 'Continuous Integration', hidden: true},
];
interface ComposerJson {
  name: string;
  extra?: {
    component?: {
      entry?: string;
    };
  };
}
interface ComponentInfo {
  versionContents: GitHubFileContents;
  composer: ComposerJson;
}

export class PHPYoshi extends Strategy {
  async buildReleasePullRequest(
    commits: Commit[],
    latestRelease?: Release
  ): Promise<ReleasePullRequest> {
    const conventionalCommits = this.postProcessCommits(
      parseConventionalCommits(commits)
    );

    const newVersion = latestRelease
      ? await this.versioningStrategy.bump(
          latestRelease.tag.version,
          conventionalCommits
        )
      : this.initialReleaseVersion();
    const cs = new CommitSplit();
    const splitCommits = cs.split(conventionalCommits);
    const topLevelDirectories = Object.keys(splitCommits).sort();
    const versionsMap: VersionsMap = new Map();
    const directoryVersionContents: Record<string, ComponentInfo> = {};
    const releaseNotes = new ReleaseNotes({
      changelogSections: CHANGELOG_SECTIONS,
      commitPartial: this.commitPartial,
      headerPartial: this.headerPartial,
      mainTemplate: this.mainTemplate,
    });
    const component = this.component || (await this.getDefaultComponent());
    const newVersionTag = new TagName(newVersion, component);
    let releaseNotesBody = '';
    for (const directory of topLevelDirectories) {
      try {
        const contents = await this.github.getFileContentsOnBranch(
          this.addPath(`${directory}/VERSION`),
          this.targetBranch
        );
        const version = Version.parse(contents.parsedContent);
        const composer = await this.github.getFileJson<ComposerJson>(
          this.addPath(`${directory}/composer.json`),
          this.targetBranch
        );
        directoryVersionContents[directory] = {
          versionContents: contents,
          composer,
        };
        const newVersion = await this.versioningStrategy.bump(
          version,
          splitCommits[directory]
        );
        versionsMap.set(composer.name, newVersion);
        const partialReleaseNotes = await releaseNotes.buildNotes(
          splitCommits[directory],
          {
            owner: this.repository.owner,
            repository: this.repository.repo,
            version: newVersion.toString(),
            previousTag: latestRelease?.tag?.toString(),
            currentTag: newVersionTag.toString(),
          }
        );
        releaseNotesBody = updatePHPChangelogEntry(
          `${composer.name} ${newVersion.toString()}`,
          releaseNotesBody,
          partialReleaseNotes
        );
      } catch (err) {
        if (err.status === 404) {
          // if the updated path has no VERSION, assume this isn't a
          // module that needs updating.
          continue;
        } else {
          throw err;
        }
      }
    }
    const pullRequestTitle = PullRequestTitle.ofComponentTargetBranchVersion(
      component || '',
      this.targetBranch,
      newVersion
    );
    const branchName = component
      ? BranchName.ofComponentTargetBranch(component, this.targetBranch)
      : BranchName.ofTargetBranch(this.targetBranch);
    const updates = await this.buildUpdates({
      changelogEntry: releaseNotesBody,
      newVersion,
      versionsMap,
      latestVersion: latestRelease?.tag.version,
    });
    for (const directory in directoryVersionContents) {
      const componentInfo = directoryVersionContents[directory];
      const version = versionsMap.get(componentInfo.composer.name);
      if (!version) {
        logger.warn(`No version found for ${componentInfo.composer.name}`);
        continue;
      }
      updates.push({
        path: this.addPath(`${directory}/VERSION`),
        createIfMissing: false,
        cachedFileContents: componentInfo.versionContents,
        updater: new DefaultUpdater({
          version,
        }),
      });
      if (componentInfo.composer.extra?.component?.entry) {
        updates.push({
          path: this.addPath(
            `${directory}/${componentInfo.composer.extra.component.entry}`
          ),
          createIfMissing: false,
          updater: new PHPClientVersion({
            version,
          }),
        });
      }
    }
    const pullRequestBody = new PullRequestBody([
      {
        component,
        version: newVersion,
        notes: releaseNotesBody,
      },
    ]);

    return {
      title: pullRequestTitle,
      body: pullRequestBody,
      updates,
      labels: this.labels,
      headRefName: branchName.toString(),
      version: newVersion,
    };
  }

  protected async buildUpdates(
    options: BuildUpdatesOptions
  ): Promise<Update[]> {
    const updates: Update[] = [];
    const version = options.newVersion;
    const versionsMap = options.versionsMap;

    updates.push({
      path: this.addPath(this.changelogPath),
      createIfMissing: true,
      updater: new Changelog({
        version,
        changelogEntry: options.changelogEntry,
      }),
    });

    // update the aggregate package information in the root
    // composer.json and manifest.json.
    updates.push({
      path: this.addPath('composer.json'),
      createIfMissing: false,
      updater: new RootComposerUpdatePackages({
        version,
        versionsMap,
      }),
    });

    updates.push({
      path: this.addPath('docs/manifest.json'),
      createIfMissing: false,
      updater: new PHPManifest({
        version,
        versionsMap,
      }),
    });

    updates.push({
      path: this.addPath('src/Version.php'),
      createIfMissing: false,
      updater: new PHPClientVersion({
        version,
        versionsMap,
      }),
    });

    updates.push({
      path: this.addPath('src/ServiceBuilder.php'),
      createIfMissing: false,
      updater: new PHPClientVersion({
        version,
        versionsMap,
      }),
    });

    return updates;
  }
}

function updatePHPChangelogEntry(
  pkgKey: string,
  changelogEntry: string,
  entryUpdate: string
) {
  {
    // Remove the first line of the entry, in favor of <summary>.
    // This also allows us to use the same regex for extracting release
    // notes (since the string "## v0.0.0" doesn't show up multiple times).
    const entryUpdateSplit: string[] = entryUpdate.split(/\r?\n/);
    entryUpdateSplit.shift();
    entryUpdate = entryUpdateSplit.join('\n');
  }
  return `${changelogEntry}

<details><summary>${pkgKey}</summary>

${entryUpdate}

</details>`;
}
