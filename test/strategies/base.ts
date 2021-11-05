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

import {describe, it, afterEach, beforeEach} from 'mocha';
import * as sinon from 'sinon';
import {expect} from 'chai';
import {Strategy} from '../../src/strategy';
import {Update} from '../../src/update';
import {GitHub} from '../../src/github';

const sandbox = sinon.createSandbox();

class TestStrategy extends Strategy {
  async buildUpdates(): Promise<Update[]> {
    return [];
  }
}

describe('Strategy', () => {
  let github: GitHub;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'googleapis',
      repo: 'base-test-repo',
      defaultBranch: 'main',
    });
  });
  afterEach(() => {
    sandbox.restore();
  });
  describe('buildReleasePullRequest', () => {
    it('should ignore empty commits', async () => {
      const strategy = new TestStrategy({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      const pullRequest = await strategy.buildReleasePullRequest([]);
      expect(pullRequest).to.be.undefined;
    });
  });
});
