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
import {GitHub, GitHubRelease} from '../src/github';
import * as sinon from 'sinon';
import {Commit} from '../src/commit';
import {buildGitHubFileContent, buildGitHubFileRaw} from './helpers';
import {expect} from 'chai';
import {Version} from '../src/version';
import {PullRequest} from '../src/pull-request';
import {readFileSync} from 'fs';
import {resolve} from 'path';

const sandbox = sinon.createSandbox();
const fixturesPath = './test/fixtures';

function mockCommits(github: GitHub, commits: Commit[]) {
  async function* fakeGenerator() {
    for (const commit of commits) {
      yield commit;
    }
  }
  sandbox.stub(github, 'mergeCommitIterator').returns(fakeGenerator());
}

function mockReleases(github: GitHub, releases: GitHubRelease[]) {
  async function* fakeGenerator() {
    for (const release of releases) {
      yield release;
    }
  }
  sandbox.stub(github, 'releaseIterator').returns(fakeGenerator());
}

function mockPullRequests(github: GitHub, pullRequests: PullRequest[]) {
  async function* fakeGenerator() {
    for (const pullRequest of pullRequests) {
      yield pullRequest;
    }
  }
  sandbox.stub(github, 'mergedPullRequestIterator').returns(fakeGenerator());
}

function pullRequestBody(path: string): string {
  return readFileSync(resolve(fixturesPath, path), 'utf8').replace(
    /\r\n/g,
    '\n'
  );
}

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

  describe('fromManifest', () => {
    it('it should parse config and manifest from repostiory', async () => {
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
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(8);
      expect(Object.keys(manifest.releasedVersions)).lengthOf(8);
    });
  });

  describe('fromConfig', () => {
    it('should pass strategy options to the strategy', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'node',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1);
      expect(Object.keys(manifest.releasedVersions)).lengthOf(1);
    });
  });

  describe('buildPullRequests', () => {
    it('should handle single package repository', async () => {
      mockReleases(github, [
        {
          sha: 'abc123',
          tagName: 'v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'def456',
          message: 'fix: some bugfix',
          files: [],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
          },
        },
        {
          '.': Version.parse('1.0.0'),
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).lengthOf(1);
      const pullRequest = pullRequests[0];
      expect(pullRequest.version?.toString()).to.eql('1.0.1');
      // simple release type updates the changelog and version.txt
      expect(pullRequest.updates).lengthOf(2);
    });

    it('should find the component from config', async () => {
      mockReleases(github, [
        {
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'def456',
          message: 'fix: some bugfix',
          files: [],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
      ]);
      const getFileContentsStub = sandbox.stub(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .resolves(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/repo/node/pkg1/package.json'
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.0.0'),
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).lengthOf(1);
      const pullRequest = pullRequests[0];
      expect(pullRequest.version?.toString()).to.eql('1.0.1');
    });

    it('should handle multiple package repository', async () => {
      mockReleases(github, [
        {
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
        },
        {
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release main',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release main',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).lengthOf(1);
    });

    it('should allow creating multiple pull requests', async () => {
      mockReleases(github, [
        {
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
        },
        {
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release 0.2.3',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg2',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 0.2.3',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).lengthOf(2);
    });
  });

  describe('buildReleases', () => {
    it('should handle a single manifest release', async () => {
      mockPullRequests(github, [
        {
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          number: 1234,
          title: 'chore: release main',
          body: pullRequestBody('release-notes/single-manifest.txt'),
          labels: [],
          files: [],
          sha: 'abc123',
        },
      ]);
      const getFileContentsStub = sandbox.stub(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .resolves(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1);
      expect(releases[0].tag.toString()).to.eql('release-brancher-v1.3.1');
      expect(releases[0].sha).to.eql('abc123');
      expect(releases[0].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Bug Fixes'));
    });
    it('should handle a multiple manifest release', async () => {
      mockPullRequests(github, [
        {
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          number: 1234,
          title: 'chore: release main',
          body: pullRequestBody('release-notes/multiple.txt'),
          labels: [],
          files: [
            'packages/bot-config-utils/package.json',
            'packages/label-utils/package.json',
            'packages/object-selector/package.json',
            'packages/datastore-lock/package.json',
          ],
          sha: 'abc123',
        },
      ]);
      const getFileContentsStub = sandbox.stub(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('packages/bot-config-utils/package.json', 'main')
        .resolves(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .withArgs('packages/label-utils/package.json', 'main')
        .resolves(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .withArgs('packages/object-selector/package.json', 'main')
        .resolves(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .withArgs('packages/datastore-lock/package.json', 'main')
        .resolves(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(4);
      expect(releases[0].tag.toString()).to.eql('bot-config-utils-v3.2.0');
      expect(releases[0].sha).to.eql('abc123');
      expect(releases[0].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[1].tag.toString()).to.eql('label-utils-v1.1.0');
      expect(releases[1].sha).to.eql('abc123');
      expect(releases[1].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[2].tag.toString()).to.eql('object-selector-v1.1.0');
      expect(releases[2].sha).to.eql('abc123');
      expect(releases[2].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[3].tag.toString()).to.eql('datastore-lock-v2.1.0');
      expect(releases[3].sha).to.eql('abc123');
      expect(releases[3].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
    });
    it('should handle a single standalone release', async () => {
      mockPullRequests(github, [
        {
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          number: 1234,
          title: 'chore(main): release 3.2.7',
          body: pullRequestBody('release-notes/single.txt'),
          labels: [],
          files: [],
          sha: 'abc123',
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
          },
        },
        {
          '.': Version.parse('3.2.6'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1);
      expect(releases[0].tag.toString()).to.eql('v3.2.7');
      expect(releases[0].sha).to.eql('abc123');
      expect(releases[0].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### [3.2.7]'));
    });
  });
});
