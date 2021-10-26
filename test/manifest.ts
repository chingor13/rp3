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
import {Manifest} from '../src/manifest';
import {GitHub} from '../src/github';
import * as sinon from 'sinon';
import {Commit} from '../src/commit';
import {buildGitHubFileContent} from './helpers';

const sandbox = sinon.createSandbox();
const fixturesPath = './test/fixtures';

describe('Manifest', () => {
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

  describe('fromManifest', () => {});

  describe('fromConfig', () => {
    it('should pass strategy options to the strategy', async () => {
      async function* fakeGenerator() {
        const commit: Commit = {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
        };
        yield commit;
      }
      sandbox.stub(github, 'mergeCommitIterator').returns(fakeGenerator());

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'node',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
      });
      console.log(manifest);
    });
  });

  describe('createPullRequests', () => {
    it('should handle single package repository', async () => {
      const getFileContentsStub = sandbox.stub(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'main')
        .resolves(
          buildGitHubFileContent(fixturesPath, 'manifest/config/config.json')
        )
        .withArgs('.release-please-manifest.json', 'main')
        .resolves(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      sandbox.stub(github, 'listReleases').resolves([]);
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      const pullRequestNumbers = await manifest.createPullRequests();
      console.log(pullRequestNumbers);
    });

    it('should handle multiple package repository', async () => {});
  });
});
