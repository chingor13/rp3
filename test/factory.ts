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

import {describe, it, beforeEach} from 'mocha';
import {buildStrategy} from '../src/factory';
import {GitHub} from '../src/github';
import {expect} from 'chai';
import {Simple} from '../src/strategies/simple';
import {DefaultVersioningStrategy} from '../src/versioning-strategies/default';
import {AlwaysBumpPatch} from '../src/versioning-strategies/always-bump-patch';
import {Ruby} from '../src/strategies/ruby';
import {JavaYoshi} from '../src/strategies/java-yoshi';
import {JavaSnapshot} from '../src/versioning-strategies/java-snapshot';
import {ServicePackVersioningStrategy} from '../src/versioning-strategies/service-pack';
import {DependencyManifest} from '../src/versioning-strategies/dependency-manifest';

describe('factory', () => {
  let github: GitHub;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'fake-owner',
      repo: 'fake-repo',
      defaultBranch: 'main',
      token: 'fake-token',
    });
  });
  describe('buildStrategy', () => {
    it('should build a basic strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'simple',
      });
      expect(strategy).instanceof(Simple);
      expect(strategy.versioningStrategy).instanceof(DefaultVersioningStrategy);
      const versioningStrategy =
        strategy.versioningStrategy as DefaultVersioningStrategy;
      expect(versioningStrategy.bumpMinorPreMajor).to.be.false;
      expect(versioningStrategy.bumpPatchForMinorPreMajor).to.be.false;
      expect(strategy.path).to.be.undefined;
      expect(strategy.component).to.be.undefined;
    });
    it('should build a with configuration', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
      });
      expect(strategy).instanceof(Simple);
      expect(strategy.versioningStrategy).instanceof(DefaultVersioningStrategy);
      const versioningStrategy =
        strategy.versioningStrategy as DefaultVersioningStrategy;
      expect(versioningStrategy.bumpMinorPreMajor).to.be.true;
      expect(versioningStrategy.bumpPatchForMinorPreMajor).to.be.true;
    });
    it('should build with a configured versioning strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'simple',
        versioning: 'always-bump-patch',
      });
      expect(strategy).instanceof(Simple);
      expect(strategy.versioningStrategy).instanceof(AlwaysBumpPatch);
    });
    it('should build a ruby strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'ruby',
        versionFile: 'src/version.rb',
      });
      expect(strategy).instanceof(Ruby);
      expect((strategy as Ruby).versionFile).to.eql('src/version.rb');
    });
    it('should build a java-yoshi strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'java-yoshi',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        extraFiles: ['path1/foo1.java', 'path2/foo2.java'],
      });
      expect(strategy).instanceof(JavaYoshi);
      expect((strategy as JavaYoshi).extraFiles).to.eql([
        'path1/foo1.java',
        'path2/foo2.java',
      ]);
      expect(strategy.versioningStrategy).instanceof(JavaSnapshot);
      const versioningStrategy = strategy.versioningStrategy as JavaSnapshot;
      expect(versioningStrategy.strategy).instanceof(DefaultVersioningStrategy);
      const innerVersioningStrategy =
        versioningStrategy.strategy as DefaultVersioningStrategy;
      expect(innerVersioningStrategy.bumpMinorPreMajor).to.be.true;
      expect(innerVersioningStrategy.bumpPatchForMinorPreMajor).to.be.true;
    });
    it('should build a java-backport strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'java-backport',
        extraFiles: ['path1/foo1.java', 'path2/foo2.java'],
      });
      expect(strategy).instanceof(JavaYoshi);
      expect((strategy as JavaYoshi).extraFiles).to.eql([
        'path1/foo1.java',
        'path2/foo2.java',
      ]);
      expect(strategy.versioningStrategy).instanceof(JavaSnapshot);
      const versioningStrategy = strategy.versioningStrategy as JavaSnapshot;
      expect(versioningStrategy.strategy).instanceof(AlwaysBumpPatch);
    });
    it('should build a java-lts strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'java-lts',
        extraFiles: ['path1/foo1.java', 'path2/foo2.java'],
      });
      expect(strategy).instanceof(JavaYoshi);
      expect((strategy as JavaYoshi).extraFiles).to.eql([
        'path1/foo1.java',
        'path2/foo2.java',
      ]);
      expect(strategy.versioningStrategy).instanceof(JavaSnapshot);
      const versioningStrategy = strategy.versioningStrategy as JavaSnapshot;
      expect(versioningStrategy.strategy).instanceof(
        ServicePackVersioningStrategy
      );
    });
    it('should build a java-bom strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'java-bom',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        extraFiles: ['path1/foo1.java', 'path2/foo2.java'],
      });
      expect(strategy).instanceof(JavaYoshi);
      expect((strategy as JavaYoshi).extraFiles).to.eql([
        'path1/foo1.java',
        'path2/foo2.java',
      ]);
      expect(strategy.versioningStrategy).instanceof(JavaSnapshot);
      const versioningStrategy = strategy.versioningStrategy as JavaSnapshot;
      expect(versioningStrategy.strategy).instanceof(DependencyManifest);
      const innerVersioningStrategy =
        versioningStrategy.strategy as DependencyManifest;
      expect(innerVersioningStrategy.bumpMinorPreMajor).to.be.true;
      expect(innerVersioningStrategy.bumpPatchForMinorPreMajor).to.be.true;
    });
  });
});