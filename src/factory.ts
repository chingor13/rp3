// Copyright 2019 Google LLC
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

import {Strategy} from './strategy';
import {JavaYoshi} from './strategies/java-yoshi';
import {GitHub, OctokitAPIs} from './github';

// Factory shared by GitHub Action and CLI for creating Release PRs
// and GitHub Releases:

type StrategyType = typeof Strategy;

export interface StrategyOptions {
  strategy: StrategyType;
  octokitAPIs?: OctokitAPIs;
  owner: string;
  repo: string;
  defaultBranch?: string;
  targetBranch?: string;
}

export async function strategy(options: StrategyOptions): Promise<Strategy> {
  const github = await GitHub.create({
    owner: options.owner,
    repo: options.repo,
    defaultBranch: options.defaultBranch,
    octokitAPIs: options.octokitAPIs,
  });
  const targetBranch = options.targetBranch ?? github.repository.defaultBranch;
  return new JavaYoshi({
    github,
    targetBranch,
  });
}
