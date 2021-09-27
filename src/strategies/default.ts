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

import { Strategy } from "../strategy";
import { ReleasePullRequest } from "../release-pull-request";
import { Release } from "../release";
import { GitHub } from "../github";

const DEFAULT_LABELS = ['autorelease: pending'];
interface StrategyOptions {
  path?: string;
  labels?: string[];
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
  github: GitHub;
  component?: string;
}

export class DefaultStrategy implements Strategy {
  bumpMinorPreMajor: boolean;
  bumpPatchForMinorPreMajor: boolean;
  path: string | undefined;
  labels: string[];
  github: GitHub;
  component: string | undefined;

  constructor(options: StrategyOptions) {
    this.bumpMinorPreMajor = options.bumpMinorPreMajor || false;
    this.bumpPatchForMinorPreMajor = options.bumpPatchForMinorPreMajor || false;
    this.path = options.path;
    this.labels = options.labels || DEFAULT_LABELS;
    this.github = options.github;
    this.component = options.component;
  }

  async buildReleasePullRequest(): Promise<ReleasePullRequest> {
    return {
      title: 'FIXME',
      body: 'FIXME',
      updates: [],
      labels: this.labels,
    };
  }

  async buildRelease(): Promise<Release> {
    return {
      tag: 'v1.2.3',
      component: null,
      notes: 'FIXME',
      sha: 'abc123',
    };
  }  
}