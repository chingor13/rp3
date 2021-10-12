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

import {ChangelogSection} from './release-notes';
import {ReleaseType} from './factory';
import {GitHub} from './github';
import {Version} from './version';

export interface ReleaserConfig {
  releaseType?: ReleaseType;
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
  changelogSections?: ChangelogSection[];
  changelogPath?: string;
  releaseAs?: string;
  skipGithubRelease?: boolean;
  draft?: boolean;
  packageName?: string;
}

interface ReleaserConfigJson {
  'release-type'?: ReleaseType;
  'bump-minor-pre-major'?: boolean;
  'bump-patch-for-minor-pre-major'?: boolean;
  'changelog-sections'?: ChangelogSection[];
  'release-as'?: string;
  'skip-github-release'?: boolean;
  draft?: boolean;
}

interface ReleaserPackageConfig extends ReleaserConfigJson {
  'package-name'?: string;
  'changelog-path'?: string;
}

export type PluginType = 'node-workspace' | 'cargo-workspace';
export interface Config extends ReleaserConfigJson {
  packages: Record<string, ReleaserPackageConfig>;
  'bootstrap-sha'?: string;
  'last-release-sha'?: string;
  'always-link-local'?: boolean;
  plugins?: PluginType[];
}
export type Manifest = Record<string, Version>;

export interface RepositoryPackage {
  path: string;
  config: ReleaserConfig;
}

function extractReleaserConfig(config: ReleaserPackageConfig): ReleaserConfig {
  return {
    releaseType: config['release-type'],
    bumpMinorPreMajor: config['bump-minor-pre-major'],
    bumpPatchForMinorPreMajor: config['bump-patch-for-minor-pre-major'],
    changelogSections: config['changelog-sections'],
    changelogPath: config['changelog-path'],
    releaseAs: config['release-as'],
    skipGithubRelease: config['skip-github-release'],
    draft: config.draft,
    packageName: config['package-name'],
  };
}

export async function parseConfig(
  github: GitHub,
  configFile: string,
  branch: string
): Promise<RepositoryPackage[]> {
  const config = await github.getFileJson<Config>(configFile, branch);
  const defaultConfig = extractReleaserConfig(config);
  const packages: RepositoryPackage[] = [];
  for (const path in config.packages) {
    const packageConfig: ReleaserConfig = {
      ...defaultConfig,
      ...extractReleaserConfig(config.packages[path]),
    };
    packages.push({
      path,
      config: packageConfig,
    });
  }
  return packages;
}

export async function parseManifest(
  github: GitHub,
  manifestFile: string,
  branch: string
): Promise<Manifest> {
  const manifestJson = await github.getFileJson<Record<string, string>>(
    manifestFile,
    branch
  );
  const manifest: Manifest = {};
  for (const packageName in manifestJson) {
    manifest[packageName] = Version.parse(manifestJson[packageName]);
  }
  return manifest;
}
