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

import * as semver from 'semver';
import cu = require('@lerna/collect-updates');
import {ManifestPlugin} from '../plugin';
import {PackageGraph, PackageGraphNode} from '@lerna/package-graph';
import {Package as LernaPackage, PackageJson} from '@lerna/package';
import {GitHub} from '../github';
import {logger} from '../util/logger';
import {CandidateReleasePullRequest, RepositoryConfig} from '../manifest';
import {Version} from '../version';
import {runTopologically} from '@lerna/run-topologically';
import {Merge} from './merge';
import {RawContent} from '../updaters/raw-content';
import {PullRequestTitle} from '../util/pull-request-title';
import {PullRequestBody} from '../util/pull-request-body';
import {ReleasePullRequest} from '../release-pull-request';
import {BranchName} from '../util/branch-name';
import {jsonStringify} from '../util/json-stringify';
import {Changelog} from '../updaters/changelog';

class Package extends LernaPackage {
  constructor(
    public readonly rawContent: string,
    location: string,
    pkg?: PackageJson
  ) {
    super(pkg ?? JSON.parse(rawContent), location);
  }

  clone() {
    return new Package(this.rawContent, this.location, this.toJSON());
  }
}

interface NodeWorkspaceOptions {
  alwaysLinkLocal?: boolean;
  repositoryConfig?: RepositoryConfig;
}

// Merge Node.js pull requests and use lerna to update cross package dependencies
export class NodeWorkspace extends ManifestPlugin {
  alwaysLinkLocal: boolean;
  repositoryConfig: RepositoryConfig;
  constructor(
    github: GitHub,
    targetBranch: string,
    options: NodeWorkspaceOptions = {}
  ) {
    super(github, targetBranch);
    this.alwaysLinkLocal = options.alwaysLinkLocal === false ? false : true;
    this.repositoryConfig = options.repositoryConfig ?? {};
  }
  // merge Node.js prs
  async run(
    candidates: CandidateReleasePullRequest[]
  ): Promise<CandidateReleasePullRequest[]> {
    logger.info('Running node-workspace plugin');

    // Split off non-node pull requests
    const [nodeCandidates, otherCandidates] = candidates.reduce(
      (collection, candidate) => {
        if (!candidate.pullRequest.version) {
          logger.warn('pull request missing version', candidate);
          return collection;
        }
        if (candidate.config.releaseType === 'node' && candidate.path !== '.') {
          collection[0].push(candidate);
        } else {
          collection[1].push(candidate);
        }
        return collection;
      },
      [[], []] as CandidateReleasePullRequest[][]
    );

    logger.debug(`found ${nodeCandidates.length} node releases`);
    if (nodeCandidates.length === 0) {
      return otherCandidates;
    }

    const candidatesByPath = new Map<string, CandidateReleasePullRequest>();
    for (const candidate of nodeCandidates) {
      candidatesByPath.set(candidate.path, candidate);
    }

    // map of path to version and lerna package
    const versionsByPath = new Map<string, Version>();
    const packagesByPath = new Map<string, Package>();
    for (const path in this.repositoryConfig) {
      const config = this.repositoryConfig[path];
      if (config.releaseType !== 'node') {
        continue;
      }

      const candidate = candidatesByPath.get(path);
      if (candidate) {
        logger.info(`found ${candidate.path} in changes`);
        const packagePath = `${candidate.path}/package.json`;
        versionsByPath.set(candidate.path, candidate.pullRequest.version!);
        const packageUpdate = candidate.pullRequest.updates.find(
          update => update.path === packagePath
        );
        if (packageUpdate?.cachedFileContents) {
          packagesByPath.set(
            candidate.path,
            new Package(
              packageUpdate.cachedFileContents.parsedContent,
              candidate.path
            )
          );
        } else {
          const contents = await this.github.getFileContentsOnBranch(
            packagePath,
            this.targetBranch
          );
          packagesByPath.set(
            candidate.path,
            new Package(contents.parsedContent, candidate.path)
          );
        }
      } else {
        logger.info(`no candidate for path: ${path}`);
        const packagePath = `${path}/package.json`;
        const contents = await this.github.getFileContentsOnBranch(
          packagePath,
          this.targetBranch
        );
        packagesByPath.set(path, new Package(contents.parsedContent, path));
      }
    }
    logger.debug('node package versions', versionsByPath);

    // use pkg.clone() which does a shallow copy of the internal data storage
    // so we can preserve the original allPkgs for version diffing later.
    const packages = [...packagesByPath.values()].map(pkg => pkg.clone());
    const packageGraph = new PackageGraph(
      packages,
      'allDependencies',
      this.alwaysLinkLocal
    );

    // release-please already did the work of @lerna/collectUpdates (identifying
    // which packages need version bumps based on conventional commits). We use
    // that as our `isCandidate` callback in @lerna/collectUpdates.collectPackages.
    // similar to https://git.io/JqUOB
    // `collectPackages` includes "localDependents" of our release-please updated
    // packages as they need to be patch bumped.
    const isCandidate = (node: PackageGraphNode) =>
      versionsByPath.has(node.location);
    const updatesWithDependents = cu.collectPackages(packageGraph, {
      isCandidate,
      onInclude: name =>
        logger.info(
          `${name} collected for update (dependency-only = ${!isCandidate(
            packageGraph.get(name)
          )})`
        ),
      excludeDependents: false,
    });

    const updatesVersions = new Map();
    const invalidVersions = new Set();
    for (const node of updatesWithDependents) {
      let version: string;
      let source: string;
      if (versionsByPath.has(node.location)) {
        version = versionsByPath.get(node.location)!.toString();
        source = 'release-please';
      } else {
        // must be a dependent, check for releaseAs config otherwise default
        // to a patch bump.
        const pkgConfig = nodeCandidates.find(candidate => {
          const pkgPath = `${candidate.path}/package.json`;
          const match = pkgPath === node.location;
          logger.info(
            `Checking node "${node.location}" against parsed package "${pkgPath}"`
          );
          return match;
        });
        if (!pkgConfig) {
          logger.warn(`No pkgConfig found for ${node.location}`);
        }
        const patch = semver.inc(node.version, 'patch');
        if (patch === null) {
          logger.warn(
            `Don't know how to patch ${node.name}'s version(${node.version})`
          );
          invalidVersions.add(node.name);
          version = node.version;
          source = 'failed to patch bump';
        } else {
          version = patch;
          source = 'dependency bump';
        }
      }
      logger.info(`setting ${node.location} to ${version} from ${source}`);
      updatesVersions.set(node.name, version);
    }

    // our implementation of a subset of `updatePackageVersions` to produce a
    // callback for updating versions and dependencies (https://git.io/Jqfyu)
    const runner = async (pkg: LernaPackage): Promise<LernaPackage> => {
      logger.info(
        `${pkg.name}.version updated to ${updatesVersions.get(pkg.name)}`
      );
      pkg.version = updatesVersions.get(pkg.name);
      const graphPkg = packageGraph.get(pkg.name);
      for (const [depName, resolved] of graphPkg.localDependencies) {
        const depVersion = updatesVersions.get(depName);
        if (depVersion && resolved.type !== 'directory') {
          pkg.updateLocalDependency(resolved, depVersion, '^');
          logger.info(`${pkg.name}.${depName} updated to ^${depVersion}`);
        }
      }
      return pkg;
    };

    // https://git.io/Jqfyp
    const allUpdated = (await runTopologically(
      updatesWithDependents.map(node => node.pkg),
      runner,
      {
        graphType: 'allDependencies',
        concurrency: 1,
        rejectCycles: false,
      }
    )) as Package[];

    for (const updated of allUpdated) {
      const existingCandidate = candidatesByPath.get(updated.location);
      const original = packagesByPath.get(updated.location);
      if (!original) {
        logger.warn(`couldn't find original package for ${updated.location}`);
        continue;
      }
      const dependencyNotes = getChangelogDepsNotes(original, updated);
      if (existingCandidate) {
        logger.info('Updating exising pull request with updated dependencies');
        existingCandidate.pullRequest.updates =
          existingCandidate.pullRequest.updates.map(update => {
            if (update.path === `${existingCandidate.path}/package.json`) {
              update.updater = new RawContent(
                jsonStringify(updated.toJSON(), updated.rawContent)
              );
            } else if (update.updater instanceof Changelog) {
              // TODO: update changelog entry
              update.updater.changelogEntry =
                appendDependenciesSectionToChangelog(
                  update.updater.changelogEntry,
                  dependencyNotes
                );
            }
            return update;
          });

        // append dependency notes
        if (dependencyNotes) {
          if (existingCandidate.pullRequest.body.releaseData.length > 0) {
            existingCandidate.pullRequest.body.releaseData[0].notes =
              appendDependenciesSectionToChangelog(
                existingCandidate.pullRequest.body.releaseData[0].notes,
                dependencyNotes
              );
          } else {
            existingCandidate.pullRequest.body.releaseData.push({
              component: updated.name,
              version: existingCandidate.pullRequest.version,
              notes: appendDependenciesSectionToChangelog('', dependencyNotes),
            });
          }
        }
      } else {
        logger.info('Creating new release PR for dependency only update');
        const packageJson = updated.toJSON() as PackageJson;
        const version = Version.parse(packageJson.version);
        const pullRequest: ReleasePullRequest = {
          title: PullRequestTitle.ofTargetBranch(this.targetBranch),
          body: new PullRequestBody([
            {
              component: updated.name,
              version,
              notes: appendDependenciesSectionToChangelog('', dependencyNotes),
            },
          ]),
          updates: [
            {
              path: `${updated.location}/package.json`,
              createIfMissing: false,
              updater: new RawContent(
                jsonStringify(packageJson, updated.rawContent)
              ),
            },
            {
              path: `${updated.location}/CHANGELOG.md`,
              createIfMissing: false,
              updater: new Changelog({
                version,
                changelogEntry: dependencyNotes,
              }),
            },
          ],
          labels: [],
          headRefName: BranchName.ofTargetBranch(this.targetBranch).toString(),
          version,
        };
        nodeCandidates.push({
          path: updated.location,
          pullRequest,
          config: {
            releaseType: 'node',
          },
        });
      }
    }

    // merge Node release PRs into a single PR
    logger.info(`Merging ${nodeCandidates.length} node candidates.`);
    const mergePlugin = new Merge(this.github, this.targetBranch);
    const newNodeCandidates = await mergePlugin.run(nodeCandidates);

    return [...otherCandidates, ...newNodeCandidates];
  }
}

function getChangelogDepsNotes(
  original: PackageJson,
  updated: PackageJson
): string {
  let depUpdateNotes = '';
  type DT =
    | 'dependencies'
    | 'devDependencies'
    | 'peerDependencies'
    | 'optionalDependencies';
  const depTypes: DT[] = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];
  const updates: Map<DT, string[]> = new Map();
  for (const depType of depTypes) {
    const depUpdates = [];
    const pkgDepTypes = updated[depType];
    if (pkgDepTypes === undefined) {
      continue;
    }
    for (const [depName, currentDepVer] of Object.entries(pkgDepTypes)) {
      const origDepVer = original[depType]?.[depName];
      if (currentDepVer !== origDepVer) {
        depUpdates.push(
          `\n    * ${depName} bumped from ${origDepVer} to ${currentDepVer}`
        );
      }
    }
    if (depUpdates.length > 0) {
      updates.set(depType, depUpdates);
    }
  }
  for (const [dt, notes] of updates) {
    depUpdateNotes += `\n  * ${dt}`;
    for (const note of notes) {
      depUpdateNotes += note;
    }
  }
  if (depUpdateNotes) {
    return `* The following workspace dependencies were updated${depUpdateNotes}`;
  }
  return '';
}

const DEPENDENCY_HEADER = new RegExp('### Dependencies');
function appendDependenciesSectionToChangelog(
  changelog: string,
  notes: string
): string {
  if (!changelog) {
    return `### Dependencies\n\n${notes}`;
  }

  const newLines: string[] = [];
  let seenDependenciesSection = false;
  let seenDependencySectionSpacer = false;
  let injected = false;
  for (const line of changelog.split('\n')) {
    console.log('line: ', line);
    if (seenDependenciesSection) {
      const trimmedLine = line.trim();
      if (seenDependencySectionSpacer && !injected && !trimmedLine.startsWith('*')) {
        newLines.push(changelog);
        injected = true;
      }
      if (trimmedLine === '') {
        seenDependencySectionSpacer = true;
      }
    }
    if (line.match(DEPENDENCY_HEADER)) {
      seenDependenciesSection = true;
    }
    newLines.push(line);
  }

  if (injected) {
    return newLines.join('\n');
  }
  if (seenDependenciesSection) {
    return `${changelog}\n${notes}`;
  }

  return `${changelog}\n\n\n### Dependencies\n\n${notes}`;
}
