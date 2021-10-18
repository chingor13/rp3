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

import {createPullRequest, Changes} from 'code-suggester';
import {PullRequest} from './pull-request';
import {Commit} from './commit';

import {OctokitResponse} from '@octokit/types';
import {Octokit} from '@octokit/rest';
import {request} from '@octokit/request';
import {graphql} from '@octokit/graphql';
import {RequestError} from '@octokit/request-error';
import {GitHubAPIError} from './errors';

const MAX_ISSUE_BODY_SIZE = 65536;
const GH_API_URL = 'https://api.github.com';
const GH_GRAPHQL_URL = 'https://api.github.com';
type OctokitType = InstanceType<typeof Octokit>;

// The return types for responses have not yet been exposed in the
// @octokit/* libraries, we explicitly define the types below to work
// around this,. See: https://github.com/octokit/rest.js/issues/1624
// https://github.com/octokit/types.ts/issues/25.
import {PromiseValue} from 'type-fest';
import {logger} from './util/logger';
import {Repository} from './repository';
import {ReleasePullRequest} from './release-pull-request';
import {Update} from './update';
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

export interface GitHubOptions {
  repository: Repository;
  octokitAPIs: OctokitAPIs;
}

interface GitHubCreateOptions {
  owner: string;
  repo: string;
  defaultBranch?: string;
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

interface Release {
  name?: string;
  tagName: string;
  sha: string;
}

export class GitHub {
  repository: Repository;
  octokit: OctokitType;
  request: RequestFunctionType;
  graphql: Function;

  constructor(options: GitHubOptions) {
    this.repository = options.repository;
    this.octokit = options.octokitAPIs.octokit;
    this.request = options.octokitAPIs.request;
    this.graphql = options.octokitAPIs.graphql;
  }

  static async create(options: GitHubCreateOptions): Promise<GitHub> {
    const apiUrl = options.apiUrl ?? GH_API_URL;
    const graphqlUrl = options.graphqlUrl ?? GH_GRAPHQL_URL;
    const releasePleaseVersion = require('../../package.json').version;
    const apis = options.octokitAPIs ?? {
      octokit: new Octokit({
        baseUrl: apiUrl,
        auth: options.token,
      }),
      request: request.defaults({
        baseUrl: apiUrl,
        headers: {
          'user-agent': `release-please/${releasePleaseVersion}`,
          Authorization: `token ${options.token}`,
        },
      }),
      graphql: graphql.defaults({
        baseUrl: graphqlUrl,
        headers: {
          'user-agent': `release-please/${releasePleaseVersion}`,
          Authorization: `token ${options.token}`,
          'content-type': 'application/vnd.github.v3+json',
        },
      }),
    };
    const opts = {
      repository: {
        owner: options.owner,
        repo: options.repo,
        defaultBranch:
          options.defaultBranch ??
          (await GitHub.defaultBranch(
            options.owner,
            options.repo,
            apis.octokit
          )),
      },
      octokitAPIs: apis,
    };
    return new GitHub(opts);
  }

  static async defaultBranch(
    owner: string,
    repo: string,
    octokit: OctokitType
  ): Promise<string> {
    const {data} = await octokit.repos.get({
      repo,
      owner,
    });
    return data.default_branch;
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
   * @param {string} targetBranch target branch of commit
   * @param {number} maxResults maxResults - Limit the number of results searched.
   *   Defaults to unlimited.
   * @yields {CommitWithPullRequest}
   * @throws {GitHubAPIError} on an API error
   */
  async *mergeCommitIterator(
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
      owner: this.repository.owner,
      repo: this.repository.repo,
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
          return await this.graphql(opts);
        } catch (err) {
          if (err.status !== 502) {
            throw err;
          }
        }
        maxRetries -= 1;
      }
    }
  );

  /**
   * Iterate through merged pull requests with a max number of results scanned.
   *
   * @param {number} maxResults maxResults - Limit the number of results searched.
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
  findMergedPullRequests = wrapAsync(
    async (
      targetBranch?: string,
      page = 1,
      perPage = 100
    ): Promise<PullRequest[]> => {
      if (!targetBranch) {
        targetBranch = this.repository.defaultBranch;
      }
      // TODO: is sorting by updated better?
      const pullsResponse = (await this.request(
        `GET /repos/:owner/:repo/pulls?state=closed&per_page=${perPage}&page=${page}&base=${targetBranch}&sort=created&direction=desc`,
        {
          owner: this.repository.owner,
          repo: this.repository.repo,
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
   * Iterate through merged pull requests with a max number of results scanned.
   *
   * @param {number} maxResults maxResults - Limit the number of results searched.
   *   Defaults to unlimited.
   * @yields {MergedGitHubPR}
   * @throws {GitHubAPIError} on an API error
   */
  async *releaseIterator(maxResults: number = Number.MAX_SAFE_INTEGER) {
    let page = 1;
    const results = 0;
    while (results < maxResults) {
      const tags = await this.listReleases(page);
      // no response usually means we ran out of results
      if (tags.length === 0) {
        break;
      }
      for (let i = 0; i < tags.length; i++) {
        yield tags[i];
      }
      page += 1;
    }
  }

  /**
   * Return a list of tags. The list is not guaranteed to be sorted.
   *
   * @param {number} page - Page of results. Defaults to 1.
   * @param {number} perPage - Number of results per page. Defaults to 100.
   * @returns {Tag[]} - List of tags
   * @throws {GitHubAPIError} on an API error
   */
  listReleases = wrapAsync(
    async (page = 1, perPage = 100): Promise<Release[]> => {
      const releases = await this.octokit.repos.listReleases({
        owner: this.repository.owner,
        repo: this.repository.repo,
        page,
        per_page: perPage,
      });

      return releases.data.map(release => {
        return {
          name: release.name || undefined,
          tagName: release.tag_name,
          sha: release.target_commitish,
        };
      });
    }
  );

  /**
   * Fetch the contents of a file from the configured branch
   *
   * @param {string} path The path to the file in the repository
   * @returns {GitHubFileContents}
   * @throws {GitHubAPIError} on other API errors
   */
  async getFileContents(path: string): Promise<GitHubFileContents> {
    return await this.getFileContentsOnBranch(
      path,
      this.repository.defaultBranch
    );
  }

  /**
   * Fetch the contents of a file with the Contents API
   *
   * @param {string} path The path to the file in the repository
   * @param {string} branch The branch to fetch from
   * @returns {GitHubFileContents}
   * @throws {GitHubAPIError} on other API errors
   */
  getFileContentsWithSimpleAPI = wrapAsync(
    async (
      path: string,
      ref: string,
      isBranch = true
    ): Promise<GitHubFileContents> => {
      ref = isBranch ? fullyQualifyBranchRef(ref) : ref;
      const options: RequestOptionsType = {
        owner: this.repository.owner,
        repo: this.repository.repo,
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
  getFileContentsWithDataAPI = wrapAsync(
    async (path: string, branch: string): Promise<GitHubFileContents> => {
      const options: RequestOptionsType = {
        owner: this.repository.owner,
        repo: this.repository.repo,
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
          owner: this.repository.owner,
          repo: this.repository.repo,
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

  async getFileJson<T>(path: string, branch: string): Promise<T> {
    const content = await this.getFileContentsOnBranch(path, branch);
    return JSON.parse(content.parsedContent);
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
    return this.findFilesByFilenameAndRef(
      filename,
      this.repository.defaultBranch,
      prefix
    );
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
      logger.info(`finding files by filename and ref: ${filename}/${ref}/${prefix}`);
      const response: {
        data: GitGetTreeResponse;
      } = await this.octokit.git.getTree({
        owner: this.repository.owner,
        repo: this.repository.repo,
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

  /**
   * Open a pull request
   *
   * @param {GitHubPR} options The pull request options
   * @throws {GitHubAPIError} on an API error
   */
  openPR = wrapAsync(
    async (
      releasePullRequest: ReleasePullRequest,
      targetBranch: string
    ): Promise<number | undefined> => {
      // check if there's an existing PR, so that we can opt to update it
      // rather than creating a new PR.
      // const headRefName = `refs/heads/${targetBranch}`;
      // let openReleasePR: number | undefined;
      // const releasePRCandidates = await this.findOpenReleasePRs(options.labels);
      // for (const releasePR of releasePRCandidates) {
      //   if (refName && refName.includes(releasePR.head.ref)) {
      //     openReleasePR = releasePR as PullsListResponseItem;
      //     break;
      //   }
      // }

      // Short-circuit if there have been no changes to the pull-request body.
      // if (openReleasePR && openReleasePR.body === releasePullRequest.body) {
      //   logger.info(
      //     `PR https://github.com/${this.repository.owner}/${this.repository.repo}/pull/${openReleasePR} remained the same`
      //   );
      //   return undefined;
      // }

      //  Update the files for the release if not already supplied
      const changes = await this.getChangeSet(
        releasePullRequest.updates,
        targetBranch
      );
      const prNumber = await createPullRequest(this.octokit, changes, {
        upstreamOwner: this.repository.owner,
        upstreamRepo: this.repository.repo,
        title: releasePullRequest.title,
        branch: releasePullRequest.headRefName,
        description: releasePullRequest.body.slice(0, MAX_ISSUE_BODY_SIZE),
        primary: targetBranch,
        force: true,
        fork: true, // FIXME
        message: releasePullRequest.title,
        logger: logger,
      });

      // If a release PR was already open, update the title and body:
      // if (openReleasePR) {
      //   logger.info(
      //     `update pull-request #${openReleasePR}: ${chalk.yellow(
      //       releasePullRequest.title
      //     )}`
      //   );
      //   await this.request('PATCH /repos/:owner/:repo/pulls/:pull_number', {
      //     pull_number: openReleasePR.number,
      //     owner: this.owner,
      //     repo: this.repo,
      //     title: options.title,
      //     body: options.body,
      //     state: 'open',
      //   });
      //   return openReleasePR.number;
      // } else {
      //   return prNumber;
      // }
      return prNumber;
    }
  );

  /**
   * Given a set of proposed updates, build a changeset to suggest.
   *
   * @param {Update[]} updates The proposed updates
   * @param {string} defaultBranch The target branch
   * @return {Changes} The changeset to suggest.
   * @throws {GitHubAPIError} on an API error
   */
  async getChangeSet(
    updates: Update[],
    defaultBranch: string
  ): Promise<Changes> {
    const changes = new Map();
    for (const update of updates) {
      let content;
      try {
        // if (update.contents) {
        //   // we already loaded the file contents earlier, let's not
        //   // hit GitHub again.
        //   content = {data: update.contents};
        // } else {
        const fileContent = await this.getFileContentsOnBranch(
          update.path,
          defaultBranch
        );
        content = {data: fileContent};
        // }
      } catch (err) {
        if (err.status !== 404) throw err;
        // if the file is missing and create = false, just continue
        // to the next update, otherwise create the file.
        if (!update.createIfMissing) {
          logger.warn(`file ${update.path} did not exist`);
          continue;
        }
      }
      const contentText = content
        ? Buffer.from(content.data.content, 'base64').toString('utf8')
        : undefined;
      const updatedContent = update.updater.updateContent(contentText);
      if (updatedContent) {
        changes.set(update.path, {
          content: updatedContent,
          mode: '100644',
        });
      }
    }
    return changes;
  }
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
  const normalized = prefix.replace(/^[/\\]/, '').replace(/[/\\]$/, '');
  if (normalized === '.') {
    return '';
  }
  return normalized;
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
