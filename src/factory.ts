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
import {Go} from './strategies/go';
import {JavaYoshi} from './strategies/java-yoshi';
import {KRMBlueprint} from './strategies/krm-blueprint';
import {OCaml} from './strategies/ocaml';
import {PHP} from './strategies/php';
import {Python} from './strategies/python';
import {Ruby} from './strategies/ruby';
import {Rust} from './strategies/rust';
import {Simple} from './strategies/simple';
import {TerraformModule} from './strategies/terraform-module';
import {Helm} from './strategies/helm';
import {Elixir} from './strategies/elixir';
import {Dart} from './strategies/dart';
import {Node} from './strategies/node';
import {GitHub} from './github';
import {ReleaserConfig} from './manifest';
import {DefaultVersioningStrategy} from './versioning-strategies/default';
import {VersioningStrategy} from './versioning-strategy';
import {AlwaysBumpPatch} from './versioning-strategies/always-bump-patch';
import {ServicePackVersioningStrategy} from './versioning-strategies/service-pack';

// Factory shared by GitHub Action and CLI for creating Release PRs
// and GitHub Releases:
// add any new releasers you create to this type as well as the `releasers`
// object below.
export type ReleaseType =
  | 'go'
  | 'go-yoshi'
  | 'java-backport'
  | 'java-bom'
  | 'java-lts'
  | 'java-yoshi'
  | 'krm-blueprint'
  | 'node'
  | 'ocaml'
  | 'php'
  | 'php-yoshi'
  | 'python'
  | 'ruby'
  | 'ruby-yoshi'
  | 'rust'
  | 'simple'
  | 'terraform-module'
  | 'helm'
  | 'elixir'
  | 'dart';
type Releasers = Record<string, typeof Strategy>;
const releasers: Releasers = {
  go: Go,
  'java-yoshi': JavaYoshi,
  'krm-blueprint': KRMBlueprint,
  node: Node,
  ocaml: OCaml,
  php: PHP,
  python: Python,
  ruby: Ruby,
  rust: Rust,
  simple: Simple,
  'terraform-module': TerraformModule,
  helm: Helm,
  elixir: Elixir,
  dart: Dart,
};

export function getReleaserTypes(): readonly ReleaseType[] {
  const names: ReleaseType[] = [];
  for (const releaseType of Object.keys(releasers)) {
    names.push(releaseType as ReleaseType);
  }
  return names;
}

export interface StrategyFactoryOptions extends ReleaserConfig {
  github: GitHub;
  path?: string;
  targetBranch?: string;
}

export async function buildStrategy(
  options: StrategyFactoryOptions
): Promise<Strategy> {
  const targetBranch =
    options.targetBranch ?? options.github.repository.defaultBranch;
  const versioningStrategy = buildVersioningStrategy({
    type: options.versioning,
    bumpMinorPreMajor: options.bumpMinorPreMajor,
    bumpPatchForMinorPreMajor: options.bumpPatchForMinorPreMajor,
  });
  const strategyOptions = {
    github: options.github,
    targetBranch,
    path: options.path,
    bumpMinorPreMajor: options.bumpMinorPreMajor,
    bumpPatchForMinorPreMajor: options.bumpPatchForMinorPreMajor,
    component: options.component,
    changelogPath: options.changelogPath,
    changelogSections: options.changelogSections,
    versioningStrategy,
  };
  switch (options.releaseType) {
    case 'ruby': {
      return new Ruby({
        ...strategyOptions,
        versionFile: options.versionFile,
      });
    }
    case 'java-yoshi': {
      return new JavaYoshi({
        ...strategyOptions,
        extraFiles: options.extraFiles,
      });
    }
    case 'java-backport': {
      return new JavaYoshi({
        ...strategyOptions,
        extraFiles: options.extraFiles,
        versioningStrategy: new AlwaysBumpPatch(),
      });
    }
    case 'java-bom': {
      return new JavaYoshi({
        ...strategyOptions,
        extraFiles: options.extraFiles,
        // FIXME: do dependency version bumps
      });
    }
    case 'java-lts': {
      return new JavaYoshi({
        ...strategyOptions,
        extraFiles: options.extraFiles,
        versioningStrategy: new ServicePackVersioningStrategy(),
      });
    }
    default: {
      const clazz = releasers[options.releaseType];
      if (clazz) {
        return new clazz(strategyOptions);
      }
      throw new Error(`Unknown release type: ${options.releaseType}`);
    }
  }
}

export type VersioningStrategyType =
  | 'default'
  | 'always-bump-patch'
  | 'service-pack';
interface VersioningStrategyFactoryOptions {
  type?: VersioningStrategyType;
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
}
function buildVersioningStrategy(
  options: VersioningStrategyFactoryOptions
): VersioningStrategy {
  switch (options.type) {
    case 'always-bump-patch':
      return new AlwaysBumpPatch(options);
    case 'service-pack':
      return new ServicePackVersioningStrategy(options);
    default:
      return new DefaultVersioningStrategy(options);
  }
}
