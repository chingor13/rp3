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

import {PullRequest} from './pull-request';
import {Commit} from './commit';
import {Release} from './release';

import {OctokitResponse} from '@octokit/types';
import {Octokit} from '@octokit/rest';
import {request} from '@octokit/request';
import {graphql} from '@octokit/graphql';
import {RequestError} from '@octokit/request-error';
import {GitHubAPIError} from './errors';

const GH_API_URL = 'https://api.github.com';
const GH_GRAPHQL_URL = 'https://api.github.com';
type OctokitType = InstanceType<typeof Octokit>;

// The return types for responses have not yet been exposed in the
// @octokit/* libraries, we explicitly define the types below to work
// around this,. See: https://github.com/octokit/rest.js/issues/1624
// https://github.com/octokit/types.ts/issues/25.
import {PromiseValue} from 'type-fest';
type GitGetTreeResponse = PromiseValue<
  ReturnType<InstanceType<typeof Octokit>['git']['getTree']>
>['data'];

// Extract some types from the `request` package.
type RequestBuilderType = typeof request;
type DefaultFunctionType = RequestBuilderType['defaults'];
type RequestFunctionType = ReturnType<DefaultFunctionType>;
type RequestOptionsType = Parameters<DefaultFunctionType>[0];
export interface OctokitAPIs {
  graphql: Function;
  request: RequestFunctionType;
  octokit: OctokitType;
}

interface GitHubOptions {
  owner: string;
  repo: string;
  defaultBranch: string;
  apiUrl?: string;
  graphqlUrl?: string;
  octokitAPIs?: OctokitAPIs;
  token?: string;
}

export interface GitHubFileContents {
  sha: string;
  content: string;
  parsedContent: string;
}

export class GitHub {
  owner: string;
  repo: string;
  defaultBranch: string;
  octokit: OctokitType;
  token?: string;
  probotMode: boolean;
  request: RequestFunctionType;
  graphql: Function;
  apiUrl: string;
  graphqlUrl: string;

  constructor(options: GitHubOptions) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.defaultBranch = options.defaultBranch;
    this.token = options.token;
    this.apiUrl = options.apiUrl || GH_API_URL;
    this.graphqlUrl = options.graphqlUrl || GH_GRAPHQL_URL;

    if (options.octokitAPIs === undefined) {
      this.probotMode = false;
      this.octokit = new Octokit({
        baseUrl: options.apiUrl,
        auth: this.token,
      });
      const defaults: RequestOptionsType = {
        baseUrl: this.apiUrl,
        headers: {
          'user-agent': `release-please/${
            require('../../package.json').version
          }`,
          Authorization: `token ${this.token}`,
        },
      };
      this.request = request.defaults(defaults);
      this.graphql = graphql;
    } else {
      // for the benefit of probot applications, we allow a configured instance
      // of octokit to be passed in as a parameter.
      this.probotMode = true;
      this.octokit = options.octokitAPIs.octokit;
      this.request = options.octokitAPIs.request;
      this.graphql = options.octokitAPIs.graphql;
    }
  }

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

  /**
   * Fetch the contents of a file from the configured branch
   *
   * @param {string} path The path to the file in the repository
   * @returns {GitHubFileContents}
   * @throws {GitHubAPIError} on other API errors
   */
  async getFileContents(path: string): Promise<GitHubFileContents> {
    return await this.getFileContentsOnBranch(path, this.defaultBranch);
  }

  /**
   * Fetch the contents of a file with the Contents API
   *
   * @param {string} path The path to the file in the repository
   * @param {string} branch The branch to fetch from
   * @returns {GitHubFileContents}
   * @throws {GitHubAPIError} on other API errors
   */
  private getFileContentsWithSimpleAPI = wrapAsync(
    async (
      path: string,
      ref: string,
      isBranch = true
    ): Promise<GitHubFileContents> => {
      ref = isBranch ? fullyQualifyBranchRef(ref) : ref;
      const options: RequestOptionsType = {
        owner: this.owner,
        repo: this.repo,
        path,
        ref,
      };
      const resp = await this.request(
        'GET /repos/:owner/:repo/contents/:path',
        options
      );
      return {
        parsedContent: Buffer.from(resp.data.content, 'base64').toString(
          'utf8'
        ),
        content: resp.data.content,
        sha: resp.data.sha,
      };
    }
  );

  /**
   * Fetch the contents of a file using the Git data API
   *
   * @param {string} path The path to the file in the repository
   * @param {string} branch The branch to fetch from
   * @returns {GitHubFileContents}
   * @throws {GitHubAPIError} on other API errors
   */
  private getFileContentsWithDataAPI = wrapAsync(
    async (path: string, branch: string): Promise<GitHubFileContents> => {
      const options: RequestOptionsType = {
        owner: this.owner,
        repo: this.repo,
        branch,
      };
      const repoTree: OctokitResponse<GitGetTreeResponse> = await this.request(
        'GET /repos/:owner/:repo/git/trees/:branch',
        options
      );

      const blobDescriptor = repoTree.data.tree.find(
        tree => tree.path === path
      );
      if (!blobDescriptor) {
        throw new Error(`Could not find requested path: ${path}`);
      }

      const resp = await this.request(
        'GET /repos/:owner/:repo/git/blobs/:sha',
        {
          owner: this.owner,
          repo: this.repo,
          sha: blobDescriptor.sha,
        }
      );

      return {
        parsedContent: Buffer.from(resp.data.content, 'base64').toString(
          'utf8'
        ),
        content: resp.data.content,
        sha: resp.data.sha,
      };
    }
  );

  /**
   * Fetch the contents of a file
   *
   * @param {string} path The path to the file in the repository
   * @param {string} branch The branch to fetch from
   * @returns {GitHubFileContents}
   * @throws {GitHubAPIError} on other API errors
   */
  async getFileContentsOnBranch(
    path: string,
    branch: string
  ): Promise<GitHubFileContents> {
    try {
      return await this.getFileContentsWithSimpleAPI(path, branch);
    } catch (err) {
      if (err.status === 403) {
        return await this.getFileContentsWithDataAPI(path, branch);
      }
      throw err;
    }
  }

  /**
   * Returns a list of paths to all files with a given name.
   *
   * If a prefix is specified, only return paths that match
   * the provided prefix.
   *
   * @param filename The name of the file to find
   * @param prefix Optional path prefix used to filter results
   * @returns {string[]} List of file paths
   * @throws {GitHubAPIError} on an API error
   */
  async findFilesByFilename(
    filename: string,
    prefix?: string
  ): Promise<string[]> {
    return this.findFilesByFilenameAndRef(filename, this.defaultBranch, prefix);
  }

  /**
   * Returns a list of paths to all files with a given name.
   *
   * If a prefix is specified, only return paths that match
   * the provided prefix.
   *
   * @param filename The name of the file to find
   * @param ref Git reference to search files in
   * @param prefix Optional path prefix used to filter results
   * @throws {GitHubAPIError} on an API error
   */
  findFilesByFilenameAndRef = wrapAsync(
    async (
      filename: string,
      ref: string,
      prefix?: string
    ): Promise<string[]> => {
      if (prefix) {
        prefix = normalizePrefix(prefix);
      }
      const response: {
        data: GitGetTreeResponse;
      } = await this.octokit.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: ref,
        recursive: 'true',
      });
      return response.data.tree
        .filter(file => {
          const path = file.path;
          return (
            path &&
            // match the filename
            path.endsWith(filename) &&
            // match the prefix if provided
            (!prefix || path.startsWith(prefix))
          );
        })
        .map(file => {
          let path = file.path!;
          // strip the prefix if provided
          if (prefix) {
            const pfix = new RegExp(`^${prefix}[/\\\\]`);
            path = path.replace(pfix, '');
          }
          return path;
        });
    }
  );
}

// Takes a potentially unqualified branch name, and turns it
// into a fully qualified ref.
//
// e.g. main -> refs/heads/main
function fullyQualifyBranchRef(refName: string): string {
  let final = refName;
  if (final.indexOf('/') < 0) {
    final = `refs/heads/${final}`;
  }

  return final;
}

/**
 * Normalize a provided prefix by removing leading and trailing
 * slashes.
 *
 * @param prefix String to normalize
 */
function normalizePrefix(prefix: string) {
  return prefix.replace(/^[/\\]/, '').replace(/[/\\]$/, '');
}

/**
 * Wrap an async method with error handling
 *
 * @param fn Async function that can throw Errors
 * @param errorHandler An optional error handler for rethrowing custom exceptions
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const wrapAsync = <T extends Array<any>, V>(
  fn: (...args: T) => Promise<V>,
  errorHandler?: (e: Error) => void
) => {
  return async (...args: T): Promise<V> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (errorHandler) {
        errorHandler(e);
      }
      if (e instanceof RequestError) {
        throw new GitHubAPIError(e);
      }
      throw e;
    }
  };
};
