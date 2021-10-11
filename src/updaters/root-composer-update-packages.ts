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

import {logger} from '../util/logger';
import {jsonStringify} from '../util/json-stringify';
import {DefaultUpdater} from './default';

export class RootComposerUpdatePackages extends DefaultUpdater {
  updateContent(content: string): string {
    if (!this.versionsMap || this.versionsMap.size === 0) {
      logger.info('no updates necessary');
      return content;
    }
    const parsed = JSON.parse(content);
    if (this.versionsMap) {
      // eslint-disable-next-line prefer-const
      for (let [key, version] of this.versionsMap.entries()) {
        version = version || '1.0.0';
        logger.info(
          `updating ${key} from ${parsed.replace[key]} to ${version}`
        );
        parsed.replace[key] = version;
      }
    }
    return jsonStringify(parsed, content);
  }
}
