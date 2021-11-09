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

import {ManifestPlugin} from '../plugin';
import {CandidateReleasePullRequest, RepositoryConfig} from '../manifest';
import {logger} from '../util/logger';
import {VersionsMap, Version} from '../version';
import {Merge} from './merge';
import {GitHub} from '../github';

export type DependencyGraph<T> = Map<string, DependencyNode<T>>;
export interface DependencyNode<T> {
  deps: string[];
  value: T;
}

export interface WorkspacePluginOptions {
  updateAllPackages?: boolean;
}

export abstract class WorkspacePlugin<T> extends ManifestPlugin {
  private updateAllPackages: boolean;
  constructor(
    github: GitHub,
    targetBranch: string,
    repositoryConfig: RepositoryConfig,
    options: WorkspacePluginOptions = {}
  ) {
    super(github, targetBranch, repositoryConfig);
    this.updateAllPackages = options.updateAllPackages ?? false;
  }
  async run(
    candidates: CandidateReleasePullRequest[]
  ): Promise<CandidateReleasePullRequest[]> {
    logger.info('Running workspace plugin');

    const [inScopeCandidates, outOfScopeCandidates] = candidates.reduce(
      (collection, candidate) => {
        if (!candidate.pullRequest.version) {
          logger.warn('pull request missing version', candidate);
          return collection;
        }
        if (this.inScope(candidate)) {
          collection[0].push(candidate);
        } else {
          collection[1].push(candidate);
        }
        return collection;
      },
      [[], []] as CandidateReleasePullRequest[][]
    );

    logger.debug(`found ${inScopeCandidates.length} in-scope releases.`);
    if (inScopeCandidates.length === 0) {
      return outOfScopeCandidates;
    }

    logger.debug(inScopeCandidates);
    logger.debug('building list of all packages');
    const {allPackages, candidatesByPackage} = await this.buildAllPackages(
      inScopeCandidates
    );
    const graph = await this.buildGraph(allPackages);

    const packageNamesToUpdate = this.updateAllPackages
      ? allPackages.map(this.packageNameFromPackage)
      : Object.keys(candidatesByPackage);
    const orderedPackages = this.buildGraphOrder(graph, packageNamesToUpdate);

    logger.info('order of packages');
    const updatedVersions: VersionsMap = new Map();
    for (const pkg of orderedPackages) {
      const packageName = this.packageNameFromPackage(pkg);
      logger.info(`package: ${packageName}`);
      const existingCandidate = candidatesByPackage[packageName];
      if (existingCandidate) {
        const version = existingCandidate.pullRequest.version!;
        logger.info(`version: ${version} from release-please`);
        updatedVersions.set(packageName, version);
      } else {
        const version = this.bumpVersion(pkg);
        logger.info(`version: ${version} forced bump`);
        updatedVersions.set(packageName, version);
      }
    }

    let newCandidates: CandidateReleasePullRequest[] = [];
    for (const pkg of orderedPackages) {
      const packageName = this.packageNameFromPackage(pkg);
      const existingCandidate = candidatesByPackage[packageName];
      if (existingCandidate) {
        // if already has an pull request, update the changelog and update
        logger.info('updating exising candidate');
        const newCandidate = this.updateCandidate(
          existingCandidate,
          pkg,
          updatedVersions
        );
        newCandidates.push(newCandidate);
      } else {
        // otherwise, build a new pull request with changelog and entry update
        logger.info('creating new candidate');
        const newCandidate = this.newCandidate(pkg, updatedVersions);
        newCandidates.push(newCandidate);
      }
    }

    logger.info(`Merging ${newCandidates.length} candidates.`);
    const mergePlugin = new Merge(
      this.github,
      this.targetBranch,
      this.repositoryConfig
    );
    newCandidates = await mergePlugin.run(newCandidates);

    return [...outOfScopeCandidates, ...newCandidates];
  }

  abstract bumpVersion(pkg: T): Version;
  abstract updateCandidate(
    existingCandidate: CandidateReleasePullRequest,
    pkg: T,
    updatedVersions: VersionsMap
  ): CandidateReleasePullRequest;
  abstract newCandidate(
    pkg: T,
    updatedVersions: VersionsMap
  ): CandidateReleasePullRequest;

  abstract buildAllPackages(
    candidates: CandidateReleasePullRequest[]
  ): Promise<{
    allPackages: T[];
    candidatesByPackage: Record<string, CandidateReleasePullRequest>;
  }>;

  /**
   * Builds a graph of dependencies that have been touched
   */
  abstract buildGraph(allPackages: T[]): Promise<DependencyGraph<T>>;

  abstract inScope(candidate: CandidateReleasePullRequest): boolean;

  abstract packageNameFromPackage(pkg: T): string;

  private invertGraph(graph: DependencyGraph<T>): DependencyGraph<T> {
    const dependentGraph: DependencyGraph<T> = new Map();
    for (const [packageName, node] of graph) {
      dependentGraph.set(packageName, {
        deps: [],
        value: node.value,
      });
    }

    for (const [packageName, node] of graph) {
      for (const depName of node.deps) {
        if (dependentGraph.has(depName)) {
          dependentGraph.get(depName)!.deps.push(packageName);
        }
      }
    }

    return dependentGraph;
  }

  buildGraphOrder(
    graph: DependencyGraph<T>,
    packageNamesToUpdate: string[]
  ): T[] {
    // invert the graph so it's dependency name => packages that depend on it
    const dependentGraph = this.invertGraph(graph);
    const visited: Set<T> = new Set();

    // we're iterating the `Map` in insertion order (as per ECMA262), but
    // that does not reflect any particular traversal of the graph, so we
    // visit all nodes, opportunistically short-circuiting leafs when we've
    // already visited them.
    for (const name of packageNamesToUpdate) {
      this.visitPostOrder(dependentGraph, name, visited, []);
    }

    return Array.from(visited).sort((a, b) =>
      this.packageNameFromPackage(a).localeCompare(
        this.packageNameFromPackage(b)
      )
    );
  }

  private visitPostOrder(
    graph: DependencyGraph<T>,
    name: string,
    visited: Set<T>,
    path: string[]
  ) {
    logger.info(`visiting ${name}`);
    if (path.indexOf(name) !== -1) {
      throw new Error(
        `found cycle in dependency graph: ${path.join(' -> ')} -> ${name}`
      );
    }
    const node = graph.get(name);
    if (!node) {
      logger.warn(`Didn't find node: ${name} in graph`);
      return;
    }

    const nextPath = [...path, name];

    for (const depName of node.deps) {
      const dep = graph.get(depName);
      if (!dep) {
        logger.warn(`dependency not found in graph: ${depName}`);
        return;
      }

      this.visitPostOrder(graph, depName, visited, nextPath);
    }

    if (!visited.has(node.value)) {
      logger.info(
        `marking ${name} as visited and adding ${this.packageNameFromPackage(
          node.value
        )} to order`
      );
      visited.add(node.value);
    }
  }
}
