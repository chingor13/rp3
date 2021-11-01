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
import {KRMBlueprint} from '../../src/strategies/krm-blueprint';
import {
  buildMockCommit,
  stubFilesFromFixtures,
  assertHasUpdate,
  assertNoHasUpdate,
} from '../helpers';
import * as nock from 'nock';
import * as sinon from 'sinon';
import {GitHub} from '../../src/github';
import {Version} from '../../src/version';
import {TagName} from '../../src/util/tag-name';
import {expect} from 'chai';
import snapshot = require('snap-shot-it');
import {KRMBlueprintVersion} from '../../src/updaters/krm/krm-blueprint-version';
import {Changelog} from '../../src/updaters/changelog';

nock.disableNetConnect();
const sandbox = sinon.createSandbox();
const fixturesPath = './test/fixtures/strategies/krm-blueprint';

describe('KRMBlueprint', () => {
  let github: GitHub;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'googleapis',
      repo: 'krm-blueprint-test-repo',
      defaultBranch: 'main',
    });
  });
  afterEach(() => {
    sandbox.restore();
  });
  describe('buildReleasePullRequest', () => {
    it('builds a release pull request', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new KRMBlueprint({
        targetBranch: 'main',
        github,
        component: 'some-krm-blueprint-package',
      });
      const commits = [
        buildMockCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0'
        ),
      ];
      const latestRelease = {
        tag: new TagName(
          Version.parse('0.123.4'),
          'some-krm-blueprint-package'
        ),
        sha: 'abc123',
        notes: 'some notes',
      };
      sandbox
        .stub(github, 'findFilesByExtension')
        .withArgs('yaml', undefined)
        .resolves(['project.yaml', 'no-attrib-bucket.yaml']);
      stubFilesFromFixtures({
        github,
        sandbox,
        fixturePath: `${fixturesPath}/nested-pkg`,
        files: ['project.yaml', 'no-attrib-bucket.yaml'],
        targetBranch: 'main',
      });
      const pullRequest = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      expect(pullRequest.version?.toString()).to.eql(expectedVersion);
      expect(pullRequest.updates).lengthOf(2);
      assertHasUpdate(pullRequest.updates, 'CHANGELOG.md', Changelog);
      assertHasUpdate(pullRequest.updates, 'project.yaml', KRMBlueprintVersion);
      assertNoHasUpdate(pullRequest.updates, 'no-attrib-bucket.yaml');
      snapshot(pullRequest);
    });
  });
});