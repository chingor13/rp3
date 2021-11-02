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
      {
        sha: 'sha1',
        message: 'fix!: some breaking fix',
        files: ['path1/file1.txt'],
      },
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).lengthOf(1);
    expect(conventionalCommits[0].type).to.equal('fix');
    expect(conventionalCommits[0].scope).is.null;
    expect(conventionalCommits[0].breaking).to.be.true;
    expect(conventionalCommits[0].notes).lengthOf(1);
    expect(conventionalCommits[0].notes[0].title).to.equal('BREAKING CHANGE');
    expect(conventionalCommits[0].notes[0].text).to.equal('some breaking fix');
  });

  it('can parse multiple commit messages from a single commit', async () => {
    const commits = [
      {
        sha: 'sha1',
        message: 'feat: some feature\n\nfix: some bugfix',
        files: ['path1/file1.txt'],
      },
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).lengthOf(2);
    expect(conventionalCommits[0].type).to.equal('fix');
    expect(conventionalCommits[0].scope).is.null;
    expect(conventionalCommits[1].type).to.equal('feat');
    expect(conventionalCommits[1].scope).is.null;
  });

  it('handles BREAKING CHANGE body', async () => {
    const commits = [
      {
        sha: 'sha1',
        message:
          'feat: some feature\n\nextended body\n\nBREAKING CHANGE: this is actually a breaking change',
        files: [],
      },
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).lengthOf(1);
    expect(conventionalCommits[0].type).to.eql('feat');
    expect(conventionalCommits[0].breaking).to.be.true;
    expect(conventionalCommits[0].notes).lengthOf(1);
    expect(conventionalCommits[0].notes[0].title).to.eql('BREAKING CHANGE');
    expect(conventionalCommits[0].notes[0].text).to.eql(
      'this is actually a breaking change'
    );
  });

  it('links bugs', async () => {
    const commits = [
      {
        sha: 'sha1',
        message: 'fix: some fix\n\nFixes #123',
        files: [],
      },
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).lengthOf(1);
    expect(conventionalCommits[0].type).to.eql('fix');
    expect(conventionalCommits[0].breaking).to.be.false;
    expect(conventionalCommits[0].references).lengthOf(1);
    expect(conventionalCommits[0].references[0].prefix).to.eql('#');
    expect(conventionalCommits[0].references[0].issue).to.eql('123');
    expect(conventionalCommits[0].references[0].action).to.eql('Fixes');
  });

  it('captures git trailers', async () => {
    const commits = [
      {
        sha: 'sha1',
        message: `fix: some fix

some body
PiperOrigin-RevId: 12345
Source-Link: https://github.com/googleapis/googleapis/commit/abc123
BREAKING CHANGE: this is actually a breaking change`,
        files: [],
      },
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    // the parser detects git trailers as extra semantic commits
    // expect(conventionalCommits).lengthOf(1);
    const mainCommit = conventionalCommits.find(
      conventionalCommit => conventionalCommit.bareMessage === 'some fix'
    );
    expect(mainCommit).to.not.be.undefined;
    expect(mainCommit!.type).to.eql('fix');
    expect(mainCommit!.breaking).to.be.true;
    expect(mainCommit!.notes).lengthOf(1);
    expect(mainCommit!.notes[0].title).to.eql('BREAKING CHANGE');
    expect(mainCommit!.notes[0].text).to.eql(
      'this is actually a breaking change'
    );
  });

  it('parses meta commits', async () => {
    const commits = [
      {
        sha: 'sha1',
        message: `meta: multiple commits.

Details.

Some clarifying facts.

fix: fixes bug #733
feat(recaptchaenterprise): migrate microgenerator
  Committer: @miraleung
  PiperOrigin-RevId: 345559154
  BREAKING-CHANGE: for some reason this migration is breaking.
  Source-Link: googleapis/googleapis@5e0dcb2

fix(securitycenter): fixes security center.
  Committer: @miraleung
  PiperOrigin-RevId: 345559182
  Source-Link: googleapis/googleapis@e5eef86`,
        files: [],
      },
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    const fixCommit1 = conventionalCommits.find(
      conventionalCommit => conventionalCommit.bareMessage === 'fixes bug #733'
    );
    expect(fixCommit1).to.not.be.undefined;
    expect(fixCommit1!.type).to.eql('fix');
    expect(fixCommit1!.scope).to.be.null;
    const fixCommit2 = conventionalCommits.find(
      conventionalCommit =>
        conventionalCommit.bareMessage === 'fixes security center.'
    );
    expect(fixCommit2).to.not.be.undefined;
    expect(fixCommit2!.type).to.eql('fix');
    expect(fixCommit2!.scope).to.eql('securitycenter');
    const featCommit = conventionalCommits.find(
      conventionalCommit =>
        conventionalCommit.bareMessage === 'migrate microgenerator'
    );
    expect(featCommit).to.not.be.undefined;
    expect(featCommit!.breaking).to.be.true;
    expect(featCommit!.type).to.eql('feat');
    expect(featCommit!.scope).to.eql('recaptchaenterprise');
  });

  it('includes multi-line breaking changes', async () => {
    const commits = [
      {
        message:
          'chore: upgrade to Node 7\n\nBREAKING CHANGE: we were on Node 6\nsecond line\nthird line',
        sha: 'abc345',
        files: [],
      },
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).lengthOf(1);
    expect(conventionalCommits[0].breaking).to.be.true;
    expect(conventionalCommits[0].notes).lengthOf(1);
    expect(conventionalCommits[0].notes[0].text).includes('second line');
    expect(conventionalCommits[0].notes[0].text).includes('third line');
  });

  it('supports additional markdown for breaking change, if prefixed with list', async () => {
    const commits = [
      {
        message:
          'chore: upgrade to Node 7\n\nBREAKING CHANGE: we were on Node 6\n- deleted API foo\n- deleted API bar',
        sha: 'abc345',
        files: [],
      },
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).lengthOf(1);
    expect(conventionalCommits[0].breaking).to.be.true;
    expect(conventionalCommits[0].notes).lengthOf(1);
    expect(conventionalCommits[0].notes[0].text).includes('deleted API foo');
    expect(conventionalCommits[0].notes[0].text).includes('deleted API bar');
  });

  it('does not include content two newlines after BREAKING CHANGE', async () => {
    const commits = [
      {
        message:
          'chore: upgrade to Node 7\n\nBREAKING CHANGE: we were on Node 6\n\nI should be removed',
        sha: 'abc345',
        files: [],
      },
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).lengthOf(1);
    expect(conventionalCommits[0].breaking).to.be.true;
    expect(conventionalCommits[0].message).not.include('I should be removed');
  });

  it('handles Release-As footers', async () => {
    const commits = [
      {
        message: 'meta: correct release\n\nRelease-As: v3.0.0',
        sha: 'abc345',
        files: [],
      },
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    const metaCommit = conventionalCommits.find(
      conventionalCommit => conventionalCommit.bareMessage === 'correct release'
    );
    expect(metaCommit).to.not.be.undefined;
    expect(metaCommit!.breaking).to.be.false;
    expect(metaCommit!.notes).lengthOf(1);
    expect(metaCommit!.notes[0].title).to.eql('RELEASE AS');
    expect(metaCommit!.notes[0].text).to.eql('v3.0.0');
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
