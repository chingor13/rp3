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

import {ConventionalCommit} from './commit';
import {MissingReleaseNotesError} from './errors';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const conventionalChangelogWriter = require('conventional-changelog-writer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const presetFactory = require('conventional-changelog-conventionalcommits');

export interface ChangelogSection {
  type: string;
  section: string;
  hidden?: boolean;
}

interface ReleaseNotesOptions {
  changelogSections?: ChangelogSection[];
  commitPartial?: string;
  headerPartial?: string;
  mainTemplate?: string;
}

interface BuildNotesOptions {
  host?: string;
  owner: string;
  repository: string;
  version: string;
  previousTag?: string;
  currentTag: string;
}

export class ReleaseNotes {
  // allow for customized commit template.
  changelogSections?: ChangelogSection[];
  commitPartial?: string;
  headerPartial?: string;
  mainTemplate?: string;

  constructor(options: ReleaseNotesOptions = {}) {
    this.changelogSections = options.changelogSections;
    this.commitPartial = options.commitPartial;
    this.headerPartial = options.headerPartial;
    this.mainTemplate = options.mainTemplate;
  }

  async buildNotes(
    commits: ConventionalCommit[],
    options: BuildNotesOptions
  ): Promise<string> {
    const context = {
      host: options.host || 'github.com',
      owner: options.owner,
      repository: options.repository,
      version: options.version,
      previousTag: options.previousTag,
      currentTag: options.currentTag,
      linkCompare: !!options.previousTag,
    };

    const config: {[key: string]: ChangelogSection[]} = {};
    if (this.changelogSections) {
      config.types = this.changelogSections;
    }
    const preset = await presetFactory(config);
    preset.writerOpts.commitPartial =
      this.commitPartial || preset.writerOpts.commitPartial;
    preset.writerOpts.headerPartial =
      this.headerPartial || preset.writerOpts.headerPartial;
    preset.writerOpts.mainTemplate =
      this.mainTemplate || preset.writerOpts.mainTemplate;

    const changelogCommits = commits.map(commit => {
      return {
        ...commit,
        header: commit.message,
        notes: [],
      };
    });

    return conventionalChangelogWriter
      .parseArray(changelogCommits, context, preset.writerOpts)
      .trim();
  }
}

/**
 * Parse release notes for a specific release from the CHANGELOG contents
 *
 * @param {string} changelogContents The entire CHANGELOG contents
 * @param {string} version The release version to extract notes from
 */
export function extractReleaseNotes(
  changelogContents: string,
  version: string
): string {
  version = version.replace(/^v/, '');
  const latestRe = new RegExp(
    `## v?\\[?${version}[^\\n]*\\n(.*?)(\\n##\\s|\\n### \\[?[0-9]+\\.|($(?![\r\n])))`,
    'ms'
  );
  const match = changelogContents.match(latestRe);
  if (!match) {
    throw new MissingReleaseNotesError(changelogContents, version);
  }
  return match[1];
}
