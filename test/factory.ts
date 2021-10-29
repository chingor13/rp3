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

import {describe, it, beforeEach, afterEach} from 'mocha';
import { buildStrategy } from '../src/factory';
import { GitHub } from '../src/github';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { Simple } from '../src/strategies/simple';
import { DefaultVersioningStrategy } from '../src/versioning-strategies/default';

const sandbox = sinon.createSandbox();

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
  afterEach(() => {
    sandbox.restore();
  });
  describe('buildStrategy', () => {
    it('should build a basic strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'simple',
      });
      expect(strategy).instanceof(Simple);
      expect(strategy.versioningStrategy).instanceof(DefaultVersioningStrategy);
      const versioningStrategy = strategy.versioningStrategy as DefaultVersioningStrategy;
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
      const versioningStrategy = strategy.versioningStrategy as DefaultVersioningStrategy;
      expect(versioningStrategy.bumpMinorPreMajor).to.be.true;
      expect(versioningStrategy.bumpPatchForMinorPreMajor).to.be.true;
    })
  });
});