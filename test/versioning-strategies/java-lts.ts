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
import {JavaLTSVersioningStrategy} from '../../src/versioning-strategies/java-lts';
import {Version} from '../../src/version';

describe('JavaLTSVersioningStrategy', () => {
  describe('with breaking change', () => {
    const commits = [
      {
        sha: 'sha1',
        message: 'feat: some feature',
        files: ['path1/file1.txt'],
        type: 'feat',
        scope: null,
        bareMessage: 'some feature',
        breaking: false,
      },
      {
        sha: 'sha2',
        message: 'fix!: some bugfix',
        files: ['path1/file1.rb'],
        type: 'fix',
        scope: null,
        bareMessage: 'some bugfix',
        breaking: true,
      },
      {
        sha: 'sha3',
        message: 'docs: some documentation',
        files: ['path1/file1.java'],
        type: 'docs',
        scope: null,
        bareMessage: 'some documentation',
        breaking: false,
      },
    ];
    it('should bump to snapshot', async () => {
      const strategy = new JavaLTSVersioningStrategy({});
      const oldVersion = Version.parse('1.2.3');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('1.2.3-sp.1-SNAPSHOT');
    });

    it('can bump a major', async () => {
      const strategy = new JavaLTSVersioningStrategy({});
      const oldVersion = Version.parse('1.2.3-sp.1-SNAPSHOT');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('1.2.3-sp.1');
    });

    it('can bump a major on pre major for breaking change', async () => {
      const strategy = new JavaLTSVersioningStrategy({});
      const oldVersion = Version.parse('0.1.2-sp.1-SNAPSHOT');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('0.1.2-sp.1');
    });

    it('can bump a minor pre major for breaking change', async () => {
      const strategy = new JavaLTSVersioningStrategy({bumpMinorPreMajor: true});
      const oldVersion = Version.parse('0.1.2-sp.1-SNAPSHOT');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('0.1.2-sp.1');
    });

    it('can bump to next snapshot', async () => {
      const strategy = new JavaLTSVersioningStrategy({});
      const oldVersion = Version.parse('1.2.3-sp.1');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('1.2.3-sp.2-SNAPSHOT');
    });
  });

  describe('with a feature', () => {
    const commits = [
      {
        sha: 'sha1',
        message: 'feat: some feature',
        files: ['path1/file1.txt'],
        type: 'feat',
        scope: null,
        bareMessage: 'some feature',
        breaking: false,
      },
      {
        sha: 'sha2',
        message: 'fix: some bugfix',
        files: ['path1/file1.rb'],
        type: 'fix',
        scope: null,
        bareMessage: 'some bugfix',
        breaking: false,
      },
      {
        sha: 'sha3',
        message: 'docs: some documentation',
        files: ['path1/file1.java'],
        type: 'docs',
        scope: null,
        bareMessage: 'some documentation',
        breaking: false,
      },
    ];
    it('should bump to snapshot', async () => {
      const strategy = new JavaLTSVersioningStrategy({});
      const oldVersion = Version.parse('1.2.3');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('1.2.3-sp.1-SNAPSHOT');
    });

    it('can bump a minor', async () => {
      const strategy = new JavaLTSVersioningStrategy({});
      const oldVersion = Version.parse('1.2.3-sp.1-SNAPSHOT');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('1.2.3-sp.1');
    });

    it('can bump a minor on pre major for breaking change', async () => {
      const strategy = new JavaLTSVersioningStrategy({});
      const oldVersion = Version.parse('0.1.2-sp.1-SNAPSHOT');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('0.1.2-sp.1');
    });

    it('can bump a minor pre major for breaking change', async () => {
      const strategy = new JavaLTSVersioningStrategy({bumpMinorPreMajor: true});
      const oldVersion = Version.parse('0.1.2-sp.1-SNAPSHOT');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('0.1.2-sp.1');
    });

    it('can bump to next snapshot', async () => {
      const strategy = new JavaLTSVersioningStrategy({});
      const oldVersion = Version.parse('1.2.3-sp.1');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('1.2.3-sp.2-SNAPSHOT');
    });
  });
  describe('with a fix', () => {
    const commits = [
      {
        sha: 'sha2',
        message: 'fix: some bugfix',
        files: ['path1/file1.rb'],
        type: 'fix',
        scope: null,
        bareMessage: 'some bugfix',
        breaking: false,
      },
      {
        sha: 'sha3',
        message: 'docs: some documentation',
        files: ['path1/file1.java'],
        type: 'docs',
        scope: null,
        bareMessage: 'some documentation',
        breaking: false,
      },
    ];
    it('should bump to snapshot', async () => {
      const strategy = new JavaLTSVersioningStrategy({});
      const oldVersion = Version.parse('1.2.3');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('1.2.3-sp.1-SNAPSHOT');
    });

    it('can bump a patch', async () => {
      const strategy = new JavaLTSVersioningStrategy({});
      const oldVersion = Version.parse('1.2.3-sp.1-SNAPSHOT');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('1.2.3-sp.1');
    });

    it('can bump a patch on pre major for breaking change', async () => {
      const strategy = new JavaLTSVersioningStrategy({});
      const oldVersion = Version.parse('0.1.2-sp.1-SNAPSHOT');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('0.1.2-sp.1');
    });

    it('can bump a patch pre major for breaking change', async () => {
      const strategy = new JavaLTSVersioningStrategy({bumpMinorPreMajor: true});
      const oldVersion = Version.parse('0.1.2-sp.1-SNAPSHOT');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('0.1.2-sp.1');
    });

    it('can bump to next snapshot', async () => {
      const strategy = new JavaLTSVersioningStrategy({});
      const oldVersion = Version.parse('1.2.3-sp.1');
      const newVersion = await strategy.bump(oldVersion, commits);
      expect(newVersion.toString()).to.equal('1.2.3-sp.2-SNAPSHOT');
    });
  });
});
