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

import {PullRequest} from './pull_request';
import {logger} from './util/logger';
import {
  ConventionalChangelogCommit,
  parser,
  Note,
  Reference,
} from '@conventional-commits/parser';
import toConventionalChangelogFormat from './util/to-conventional-changelog-format';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const conventionalCommitsFilter = require('conventional-commits-filter');

export interface Commit {
  sha: string;
  message: string;
  files: string[];
  pullRequest?: PullRequest;
}

export interface ConventionalCommit extends Commit {
  type: string;
  scope: string | null;
  notes: Note[];
  references: Reference[];
  bareMessage: string;
  breaking: boolean;
}

// TODO(@bcoe): now that we walk the actual AST of conventional commits
// we should be able to move post processing into
// to-conventional-changelog.ts.
function postProcessCommits(commit: ConventionalChangelogCommit) {
  commit.notes.forEach(note => {
    let text = '';
    let i = 0;
    let extendedContext = false;
    for (const chunk of note.text.split(/\r?\n/)) {
      if (i > 0 && hasExtendedContext(chunk) && !extendedContext) {
        text = `${text.trim()}\n`;
        extendedContext = true;
      }
      if (chunk === '') break;
      else if (extendedContext) {
        text += `    ${chunk}\n`;
      } else {
        text += `${chunk} `;
      }
      i++;
    }
    note.text = text.trim();
  });
  return commit;
}

// If someone wishes to include additional contextual information for a
// BREAKING CHANGE using markdown, they can do so by starting the line after the initial
// breaking change description with either:
//
// 1. a fourth-level header.
// 2. a bulleted list (using either '*' or '-').
//
// BREAKING CHANGE: there were breaking changes
// #### Deleted Endpoints
// - endpoint 1
// - endpoint 2
function hasExtendedContext(line: string) {
  if (line.match(/^#### |^[*-] /)) return true;
  return false;
}

function parseCommits(message: string): ConventionalChangelogCommit[] {
  return conventionalCommitsFilter(
    toConventionalChangelogFormat(parser(message))
  ).map(postProcessCommits);
}

/**
 * Given a list of raw commits, parse and expand into conventional commits.
 *
 * @param commits {Commit[]} The input commits
 *
 * @returns {ConventionalCommit[]} Parsed and expanded commits. There may be
 *   more commits returned as a single raw commit may contain multiple release
 *   messages.
 */
export function parseConventionalCommits(
  commits: Commit[]
): ConventionalCommit[] {
  const conventionalCommits: ConventionalCommit[] = [];

  for (const commit of commits) {
    try {
      for (const parsedCommit of parseCommits(commit.message)) {
        conventionalCommits.push({
          sha: commit.sha,
          message: parsedCommit.header,
          files: commit.files,
          pullRequest: commit.pullRequest,
          type: parsedCommit.type,
          scope: parsedCommit.scope,
          bareMessage: parsedCommit.subject,
          notes: parsedCommit.notes,
          references: parsedCommit.references,
          breaking: parsedCommit.notes.length > 0,
        });
      }
    } catch (_err) {
      logger.warn(`commit could not be parsed: ${commit}`);
    }
  }

  return conventionalCommits;
}
