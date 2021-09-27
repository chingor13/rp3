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

import {describe, it} from 'mocha';

import {expect} from 'chai';
import {parseConventionalCommits} from '../src/commit';

describe('parseConventionalCommits', () => {
  it('can parse plain commit messages', async () => {
    const commits = [
      {sha: 'sha1', message: 'feat: some feature', files: ['path1/file1.txt']},
      {sha: 'sha2', message: 'fix: some bugfix', files: ['path1/file1.rb']},
      {
        sha: 'sha3',
        message: 'docs: some documentation',
        files: ['path1/file1.java'],
      },
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).lengthOf(3);
    expect(conventionalCommits[0].type).to.equal('feat');
    expect(conventionalCommits[0].scope).is.null;
    expect(conventionalCommits[1].type).to.equal('fix');
    expect(conventionalCommits[1].scope).is.null;
    expect(conventionalCommits[2].type).to.equal('docs');
    expect(conventionalCommits[2].scope).is.null;
  });

  it('can parse a breaking change', async () => {
    const commits = [
      {sha: 'sha1', message: 'fix!: some feature', files: ['path1/file1.txt']},
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).lengthOf(1);
    expect(conventionalCommits[0].type).to.equal('fix');
    expect(conventionalCommits[0].scope).is.null;
  });

  // it('ignores reverted commits', async () => {
  //   const commits = [
  //     {sha: 'sha1', message: 'feat: some feature', files: ['path1/file1.txt']},
  //     {
  //       sha: 'sha2',
  //       message: 'revert: feat: some feature\nThe reverts commit sha1.\n',
  //       files: ['path1/file1.rb'],
  //     },
  //     {
  //       sha: 'sha3',
  //       message: 'docs: some documentation',
  //       files: ['path1/file1.java'],
  //     },
  //   ];
  //   const conventionalCommits = parseConventionalCommits(commits);
  //   expect(conventionalCommits).lengthOf(1);
  //   expect(conventionalCommits[0].type).to.equal('docs');
  //   expect(conventionalCommits[0].scope).is.null;
  // });
});
