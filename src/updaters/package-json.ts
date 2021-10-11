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

import {jsonStringify} from '../util/json-stringify';
import {logger} from '../util/logger';
import {DefaultUpdater} from './default';

type LockFile = {version: string};

export class PackageJson extends DefaultUpdater {
  updateContent(content: string): string {
    const parsed = JSON.parse(content) as LockFile;
    logger.info(`updating from ${parsed.version} to ${this.version}`);
    parsed.version = this.version.toString();
    return jsonStringify(parsed, content);
  }
}
