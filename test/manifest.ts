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
import {Manifest} from '../src/manifest';
import {GitHub} from '../src/github';

describe('Manifest', () => {
  describe('fromManifest', () => {});

  describe('fromConfig', () => {});

  describe('createPullRequests', () => {
    it('should handle single package repository', async () => {
      const github = await GitHub.create({
        owner: 'googleapis',
        repo: 'repo-automation-bots',
        token: process.env.GITHUB_TOKEN!,
      });
      const rp = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      const pullRequestNumbers = await rp.createPullRequests();
      console.log(pullRequestNumbers);
    });

    it('should handle multiple package repository', async () => {});
  });
});
