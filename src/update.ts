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

import {Version, VersionsMap} from './version';
import {GitHubFileContents} from './github';

export interface UpdateOptions {
  version: Version;
  versionsMap?: VersionsMap;
}

export interface Update {
  // If provided, skip looking up the file
  cachedFileContents?: GitHubFileContents;

  // Whether or not we should create the file if it is missing.
  // Defaults to `true`.
  createIfMissing: boolean;

  // Path to the file in the repository to update
  path: string;

  // How to update the file
  updater: Updater;
}

export interface Updater {
  updateContent(content: string | undefined): string;
}
