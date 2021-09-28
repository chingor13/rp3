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

import {PullRequest} from './pull_request';
import {Commit} from './commit';
import {Release} from './release';

export class GitHub {
  async getDefaultBranch(): Promise<string> {
    return 'FIXME';
  }

  async lastMergedPRByHeadBranch(
    _branchName: string
  ): Promise<PullRequest | undefined> {
    return undefined;
  }

  async commitsSinceSha(_sha?: string): Promise<Commit[]> {
    return [];
  }

  async lastRelease(component?: string): Promise<Release | undefined> {
    return {
      tag: 'v1.2.3',
      component: component || null,
      notes: 'FIXME',
      sha: 'abc123',
    };
  }
}
