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
import {logger} from './util/logger';
type GitGetTreeResponse = PromiseValue<
  ReturnType<InstanceType<typeof Octokit>['git']['getTree']>
>['data'];
type PullsListResponseItems = PromiseValue<
  ReturnType<InstanceType<typeof Octokit>['pulls']['list']>
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

type CommitFilter = (commit: Commit, pullRequest?: PullRequest) => boolean;
type MergedPullRequestFilter = (filter: PullRequest) => boolean;

interface GraphQLCommit {
  sha: string;
  message: string;
  associatedPullRequests: {
    nodes: {
      number: number;
      title: string;
      body: string;
      baseRefName: string;
      headRefName: string;
      labels: {
        nodes: {
          name: string;
        }[];
      };
      mergeCommit?: {
        oid: string;
      };
    }[];
  };
}

interface CommitWithPullRequest {
  commit: Commit;
  pullRequest?: PullRequest;
}

interface PullRequestHistory {
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | undefined;
  };
  data: CommitWithPullRequest[];
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

  async lastMergedPRByHeadBranch(
    _branchName: string
  ): Promise<PullRequest | undefined> {
    return undefined;
  }

  /**
   * Returns the list of commits to the default branch after the provided filter
   * query has been satified.
   *
   * @param {string} targetBranch target branch of commit
   * @param {CommitFilter} filter - Callback function that returns whether a
   *   commit/pull request matches certain criteria
   * @param {number} maxResults - Limit the number of results searched.
   *   Defaults to unlimited.
   * @returns {Commit[]} - List of commits to current branch
   * @throws {GitHubAPIError} on an API error
   */
  async commitsSince(
    targetBranch: string,
    filter: CommitFilter,
    maxResults: number = Number.MAX_SAFE_INTEGER
  ): Promise<Commit[]> {
    const commits: Commit[] = [];
    const generator = this.mergeCommitIterator(targetBranch, maxResults);
    for await (const commitWithPullRequest of generator) {
      if (
        filter(commitWithPullRequest.commit, commitWithPullRequest.pullRequest)
      ) {
        break;
      }
      commits.push(commitWithPullRequest.commit);
    }
    return commits;
  }

  /**
   * Iterate through commit history with a max number of results scanned.
   *
   * @param targetBranch {string} target branch of commit
   * @param maxResults {number} maxResults - Limit the number of results searched.
   *   Defaults to unlimited.
   * @yields {CommitWithPullRequest}
   * @throws {GitHubAPIError} on an API error
   */
  private async *mergeCommitIterator(
    targetBranch: string,
    maxResults: number = Number.MAX_SAFE_INTEGER
  ) {
    let cursor: string | undefined = undefined;
    let results = 0;
    while (results < maxResults) {
      const response: PullRequestHistory | null =
        await this.mergeCommitsGraphQL(targetBranch, cursor);
      // no response usually means that the branch can't be found
      if (!response) {
        break;
      }
      for (let i = 0; i < response.data.length; i++) {
        results += 1;
        yield response.data[i];
      }
      if (!response.pageInfo.hasNextPage) {
        break;
      }
      cursor = response.pageInfo.endCursor;
    }
  }

  private async mergeCommitsGraphQL(
    targetBranch: string,
    cursor?: string
  ): Promise<PullRequestHistory | null> {
    const response = await this.graphqlRequest({
      query: `query pullRequestsSince($owner: String!, $repo: String!, $num: Int!, $targetBranch: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          ref(qualifiedName: $targetBranch) {
            target {
              ... on Commit {
                history(first: $num, after: $cursor) {
                  nodes {
                    associatedPullRequests(first: 10) {
                      nodes {
                        number
                        title
                        baseRefName
                        headRefName
                        labels(first: 10) {
                          nodes {
                            name
                          }
                        }
                        body
                        mergeCommit {
                          oid
                        }
                      }
                    }
                    sha: oid
                    message
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }
          }
        }
      }`,
      cursor,
      owner: this.owner,
      repo: this.repo,
      num: 25,
      targetBranch,
    });

    // if the branch does exist, return null
    if (!response.repository.ref) {
      logger.warn(
        `Could not find commits for branch ${targetBranch} - it likely does not exist.`
      );
      return null;
    }
    const history = response.repository.ref.target.history;
    const commits = (history.nodes || []) as GraphQLCommit[];
    return {
      pageInfo: history.pageInfo,
      data: commits.map(graphCommit => {
        const commit = {
          sha: graphCommit.sha,
          message: graphCommit.message,
          files: [] as string[],
        };
        const pullRequest = graphCommit.associatedPullRequests.nodes.find(
          pr => {
            return pr.mergeCommit && pr.mergeCommit.oid === graphCommit.sha;
          }
        );
        if (pullRequest) {
          return {
            commit,
            pullRequest: {
              sha: commit.sha,
              number: pullRequest.number,
              baseBranchName: pullRequest.baseRefName,
              headBranchName: pullRequest.headRefName,
              title: pullRequest.title,
              body: pullRequest.body,
              labels: pullRequest.labels.nodes.map(node => node.name),
              files: [], // FIXME
            },
          };
        }
        return {
          commit,
        };
      }),
    };
  }

  private graphqlRequest = wrapAsync(
    async (
      opts: {
        [key: string]: string | number | null | undefined;
      },
      maxRetries = 1
    ) => {
      while (maxRetries >= 0) {
        try {
          return await this.makeGraphqlRequest(opts);
        } catch (err) {
          if (err.status !== 502) {
            throw err;
          }
        }
        maxRetries -= 1;
      }
    }
  );

  private async makeGraphqlRequest(_opts: {
    [key: string]: string | number | null | undefined;
  }) {
    let opts = Object.assign({}, _opts);
    if (!this.probotMode) {
      opts = Object.assign(opts, {
        url: `${this.graphqlUrl}/graphql`,
        headers: {
          authorization: `token ${this.token}`,
          'content-type': 'application/vnd.github.v3+json',
        },
      });
    }
    return this.graphql(opts);
  }

  /**
   * Iterate through merged pull requests with a max number of results scanned.
   *
   * @param maxResults {number} maxResults - Limit the number of results searched.
   *   Defaults to unlimited.
   * @yields {MergedGitHubPR}
   * @throws {GitHubAPIError} on an API error
   */
  async *mergedPullRequestIterator(
    targetBranch: string,
    maxResults: number = Number.MAX_SAFE_INTEGER
  ) {
    let page = 1;
    const results = 0;
    while (results < maxResults) {
      const pullRequests = await this.findMergedPullRequests(
        targetBranch,
        page
      );
      // no response usually means we ran out of results
      if (pullRequests.length === 0) {
        break;
      }
      for (let i = 0; i < pullRequests.length; i++) {
        yield pullRequests[i];
      }
      page += 1;
    }
  }

  /**
   * Return a list of merged pull requests. The list is not guaranteed to be sorted
   * by merged_at, but is generally most recent first.
   *
   * @param {string} targetBranch - Base branch of the pull request. Defaults to
   *   the configured default branch.
   * @param {number} page - Page of results. Defaults to 1.
   * @param {number} perPage - Number of results per page. Defaults to 100.
   * @returns {MergedGitHubPR[]} - List of merged pull requests
   * @throws {GitHubAPIError} on an API error
   */
  private findMergedPullRequests = wrapAsync(
    async (
      targetBranch?: string,
      page = 1,
      perPage = 100
    ): Promise<PullRequest[]> => {
      if (!targetBranch) {
        targetBranch = this.defaultBranch;
      }
      // TODO: is sorting by updated better?
      const pullsResponse = (await this.request(
        `GET /repos/:owner/:repo/pulls?state=closed&per_page=${perPage}&page=${page}&base=${targetBranch}&sort=created&direction=desc`,
        {
          owner: this.owner,
          repo: this.repo,
        }
      )) as {data: PullsListResponseItems};

      // TODO: distinguish between no more pages and a full page of
      // closed, non-merged pull requests. At page size of 100, this unlikely
      // to matter

      if (!pullsResponse.data) {
        return [];
      }

      return (
        pullsResponse.data
          // only return merged pull requests
          .filter(pull => {
            return !!pull.merged_at;
          })
          .map(pull => {
            const labels = pull.labels
              ? pull.labels.map(l => {
                  return l.name + '';
                })
              : [];
            return {
              sha: pull.merge_commit_sha!, // already filtered non-merged
              number: pull.number,
              baseBranchName: pull.base.ref,
              headBranchName: pull.head.ref,
              labels,
              title: pull.title,
              body: pull.body + '',
              files: [], // FIXME
            };
          })
      );
    }
  );

  /**
   * Helper to find the first merged pull request that matches the
   * given criteria. The helper will paginate over all pull requests
   * merged into the specified target branch.
   *
   * @param {string} targetBranch - Base branch of the pull request
   * @param {MergedPullRequestFilter} filter - Callback function that
   *   returns whether a pull request matches certain criteria
   * @param {number} maxResults - Limit the number of results searched.
   *   Defaults to unlimited.
   * @returns {MergedGitHubPR | undefined} - Returns the first matching
   *   pull request, or `undefined` if no matching pull request found.
   * @throws {GitHubAPIError} on an API error
   */
  async findMergedPullRequest(
    targetBranch: string,
    filter: MergedPullRequestFilter,
    maxResults: number = Number.MAX_SAFE_INTEGER
  ): Promise<PullRequest | undefined> {
    const generator = this.mergedPullRequestIterator(targetBranch, maxResults);
    for await (const mergedPullRequest of generator) {
      if (filter(mergedPullRequest)) {
        return mergedPullRequest;
      }
    }
    return undefined;
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
