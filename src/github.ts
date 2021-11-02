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

import {Octokit} from '@octokit/rest';
import {request} from '@octokit/request';
import {graphql} from '@octokit/graphql';
import {RequestError} from '@octokit/request-error';
import {GitHubAPIError, DuplicateReleaseError} from './errors';

const MAX_ISSUE_BODY_SIZE = 65536;
export const GH_API_URL = 'https://api.github.com';
export const GH_GRAPHQL_URL = 'https://api.github.com';
type OctokitType = InstanceType<typeof Octokit>;

import {logger} from './util/logger';
import {Repository} from './repository';
import {ReleasePullRequest} from './release-pull-request';
import {Update} from './update';
import {Release} from './release';

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
    nodes: GraphQLPullRequest[];
  };
}

interface GraphQLPullRequest {
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
  files: {
    nodes: {
      path: string;
    }[];
  };
}

interface CommitHistory {
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | undefined;
  };
  data: Commit[];
}
interface PullRequestHistory {
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | undefined;
  };
  data: PullRequest[];
}

export interface GitHubRelease {
  name?: string;
  tagName: string;
  sha: string;
  notes?: string;
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

  /**
   * Returns the default branch for a given repository.
   *
   * @param {string} owner The GitHub repository owner
   * @param {string} repo The GitHub repository name
   * @param {OctokitType} octokit An authenticated octokit instance
   * @returns {string} Name of the default branch
   */
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
   * @param {string} targetBranch Target branch of commit
   * @param {CommitFilter} filter Callback function that returns whether a
   *   commit/pull request matches certain criteria
   * @param {number} maxResults Limit the number of results searched.
   *   Defaults to unlimited.
   * @returns {Commit[]} List of commits to current branch
   * @throws {GitHubAPIError} on an API error
   */
  async commitsSince(
    targetBranch: string,
    filter: CommitFilter,
    maxResults: number = Number.MAX_SAFE_INTEGER
  ): Promise<Commit[]> {
    const commits: Commit[] = [];
    const generator = this.mergeCommitIterator(targetBranch, maxResults);
    for await (const commit of generator) {
      if (filter(commit, commit.pullRequest)) {
        break;
      }
      commits.push(commit);
    }
    return commits;
  }

  /**
   * Iterate through commit history with a max number of results scanned.
   *
   * @param {string} targetBranch target branch of commit
   * @param {number} maxResults maxResults - Limit the number of results searched.
   *   Defaults to unlimited.
   * @yields {Commit}
   * @throws {GitHubAPIError} on an API error
   */
  async *mergeCommitIterator(
    targetBranch: string,
    maxResults: number = Number.MAX_SAFE_INTEGER
  ) {
    let cursor: string | undefined = undefined;
    let results = 0;
    while (results < maxResults) {
      const response: CommitHistory | null = await this.mergeCommitsGraphQL(
        targetBranch,
        cursor
      );
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

  // TODO: fetch files touched by merge commits
  private async mergeCommitsGraphQL(
    targetBranch: string,
    cursor?: string
  ): Promise<CommitHistory | null> {
    logger.debug(`Fetching merge commits on branch ${targetBranch}`);
    const response = await this.graphqlRequest({
      query: `query pullRequestsSince($owner: String!, $repo: String!, $num: Int!, $maxFilesChanged: Int, $targetBranch: String!, $cursor: String) {
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
                        files(first: $maxFilesChanged) {
                          nodes {
                            path
                          }
                          pageInfo {
                            endCursor
                            hasNextPage
                          }
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
      maxFilesChanged: 64,
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
        const commit: Commit = {
          sha: graphCommit.sha,
          message: graphCommit.message,
          files: [],
        };
        const pullRequest = graphCommit.associatedPullRequests.nodes.find(
          pr => {
            return pr.mergeCommit && pr.mergeCommit.oid === graphCommit.sha;
          }
        );
        if (pullRequest) {
          const files = pullRequest.files.nodes.map(node => node.path);
          commit.pullRequest = {
            sha: commit.sha,
            number: pullRequest.number,
            baseBranchName: pullRequest.baseRefName,
            headBranchName: pullRequest.headRefName,
            title: pullRequest.title,
            body: pullRequest.body,
            labels: pullRequest.labels.nodes.map(node => node.name),
            files,
          };
          // We cannot directly fetch files on commits via graphql, only provide file
          // information for commits with associated pull requests
          commit.files = files;
        } else {
          logger.warn(
            `No merged pull request for commit: ${graphCommit.sha} - files unavailable`
          );
        }
        return commit;
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
   * @yields {PullRequest}
   * @throws {GitHubAPIError} on an API error
   */
  async *mergedPullRequestIterator(
    targetBranch: string,
    maxResults: number = Number.MAX_SAFE_INTEGER
  ) {
    let cursor: string | undefined = undefined;
    const results = 0;
    while (results < maxResults) {
      const response: PullRequestHistory | null =
        await this.pullRequestsGraphQL(targetBranch, cursor);
      // no response usually means we ran out of results
      if (!response) {
        break;
      }
      for (let i = 0; i < response.data.length; i++) {
        yield response.data[i];
      }
      if (!response.pageInfo.hasNextPage) {
        break;
      }
      cursor = response.pageInfo.endCursor;
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
   * @returns {PullRequestHistory | null} - List of merged pull requests
   * @throws {GitHubAPIError} on an API error
   */
  private async pullRequestsGraphQL(
    targetBranch: string,
    cursor?: string
  ): Promise<PullRequestHistory | null> {
    logger.debug(`Fetching merged pull requests on branch ${targetBranch}`);
    const response = await this.graphqlRequest({
      query: `query mergedPullRequests($owner: String!, $repo: String!, $num: Int!, $maxFilesChanged: Int, $targetBranch: String!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            pullRequests(first: $num, after: $cursor, baseRefName: $targetBranch, states: MERGED, orderBy: {field: CREATED_AT, direction: DESC}) {
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
                files(first: $maxFilesChanged) {
                  nodes {
                    path
                  }
                  pageInfo {
                    endCursor
                    hasNextPage
                  }
                }
              }
              pageInfo {
                endCursor
                hasNextPage
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
    if (!response.repository.pullRequests) {
      logger.warn(
        `Could not find merged pull requests for branch ${targetBranch} - it likely does not exist.`
      );
      return null;
    }
    const pullRequests = (response.repository.pullRequests.nodes ||
      []) as GraphQLPullRequest[];
    return {
      pageInfo: response.repository.pullRequests.pageInfo,
      data: pullRequests
        .filter(pullRequest => !!pullRequest.mergeCommit)
        .map(pullRequest => {
          return {
            sha: pullRequest.mergeCommit?.oid, // already filtered non-merged
            number: pullRequest.number,
            baseBranchName: pullRequest.baseRefName,
            headBranchName: pullRequest.headRefName,
            labels: (pullRequest.labels.nodes || []).map(l => l.name),
            title: pullRequest.title,
            body: pullRequest.body + '',
            files: pullRequest.files.nodes.map(node => node.path),
          };
        }),
    };
  }

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
   * @yields {GitHubRelease}
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
  private listReleases = wrapAsync(
    async (page = 1, perPage = 100): Promise<GitHubRelease[]> => {
      logger.debug(`Fetching releases page ${page}`);
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
          notes: release.body_text,
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
      const repoTree = await this.octokit.git.getTree({
        owner: this.repository.owner,
        repo: this.repository.repo,
        tree_sha: branch,
      });

      const blobDescriptor = repoTree.data.tree.find(
        tree => tree.path === path
      );
      if (!blobDescriptor) {
        throw new Error(`Could not find requested path: ${path}`);
      }

      const resp = await this.octokit.git.getBlob({
        owner: this.repository.owner,
        repo: this.repository.repo,
        file_sha: blobDescriptor.sha!,
      });

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
    logger.debug(`Fetching ${path} from branch ${branch}`);
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
      logger.info(
        `finding files by filename and ref: ${filename}/${ref}/${prefix}`
      );
      const response = await this.octokit.git.getTree({
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
        title: releasePullRequest.title.toString(),
        branch: releasePullRequest.headRefName,
        description: releasePullRequest.body
          .toString()
          .slice(0, MAX_ISSUE_BODY_SIZE),
        primary: targetBranch,
        force: true,
        fork: true, // FIXME
        message: releasePullRequest.title.toString(),
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
        if (update.cachedFileContents) {
          // we already loaded the file contents earlier, let's not
          // hit GitHub again.
          content = {data: update.cachedFileContents};
        } else {
          const fileContent = await this.getFileContentsOnBranch(
            update.path,
            defaultBranch
          );
          content = {data: fileContent};
        }
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

  /**
   * Returns a list of paths to all files with a given file
   * extension.
   *
   * If a prefix is specified, only return paths that match
   * the provided prefix.
   *
   * @param extension The file extension used to filter results.
   *   Example: `js`, `java`
   * @param ref Git reference to search files in
   * @param prefix Optional path prefix used to filter results
   * @returns {string[]} List of file paths
   * @throws {GitHubAPIError} on an API error
   */
  findFilesByExtensionAndRef = wrapAsync(
    async (
      extension: string,
      ref: string,
      prefix?: string
    ): Promise<string[]> => {
      if (prefix) {
        prefix = normalizePrefix(prefix);
      }
      const response = await this.octokit.git.getTree({
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
            // match the file extension
            path.endsWith(`.${extension}`) &&
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
   * Returns a list of paths to all files with a given file
   * extension.
   *
   * If a prefix is specified, only return paths that match
   * the provided prefix.
   *
   * @param extension The file extension used to filter results.
   *   Example: `js`, `java`
   * @param prefix Optional path prefix used to filter results
   * @returns {string[]} List of file paths
   * @throws {GitHubAPIError} on an API error
   */
  async findFilesByExtension(
    extension: string,
    prefix?: string
  ): Promise<string[]> {
    return this.findFilesByExtensionAndRef(
      extension,
      this.repository.defaultBranch,
      prefix
    );
  }

  createRelease = wrapAsync(
    async (release: Release): Promise<GitHubRelease> => {
      const resp = await this.octokit.repos.createRelease({
        owner: this.repository.owner,
        repo: this.repository.repo,
        tag_name: release.tag.toString(),
        body: release.notes,
        sha: release.sha,
      });
      return {
        name: resp.data.name || undefined,
        tagName: resp.data.tag_name,
        sha: resp.data.target_commitish,
        notes: resp.data.body_text,
      };
    },
    e => {
      if (e instanceof RequestError) {
        if (
          e.status === 422 &&
          GitHubAPIError.parseErrors(e).some(error => {
            return error.code === 'already_exists';
          })
        ) {
          throw new DuplicateReleaseError(e, 'tagName');
        }
      }
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
