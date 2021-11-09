#!/usr/bin/env node

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

import chalk = require('chalk');
import {coerceOption} from '../util/coerce-option';
import * as yargs from 'yargs';
import {GitHub, GH_API_URL, GH_GRAPHQL_URL} from '../github';
import {Manifest} from '../manifest';
import {ChangelogSection} from '../release-notes';
import {logger} from '../util/logger';
import {getReleaserTypes, ReleaseType} from '../factory';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const parseGithubRepoUrl = require('parse-github-repo-url');

interface ErrorObject {
  body?: object;
  status?: number;
  message: string;
  stack: string;
}

interface GitHubArgs {
  dryRun?: boolean;
  repoUrl?: string;
  token?: string;
  apiUrl?: string;
  graphqlUrl?: string;
  fork?: boolean;

  // deprecated in favor of targetBranch
  defaultBranch?: string;
  targetBranch?: string;
}

interface ManifestArgs {
  configFile?: string;
  manifestFile?: string;
}

interface VersioningArgs {
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;
  releaseAs?: string;

  // only for Ruby: TODO replace with generic bootstrap option
  // deprecated in favor of latestTagVersion
  lastPackageVersion?: string;

  latestTagVersion?: string;
  latestTagSha?: string;
  latestTagName?: string;
}

interface ManifestConfigArgs {
  path?: string;
  component?: string;
  releaseType?: ReleaseType;
}

interface ReleaseArgs {
  draft?: boolean;
  releaseLabel?: string;
}

interface PullRequestArgs {
  label?: string;
  snapshot?: boolean;
  monorepoTags?: boolean;
  changelogSections?: ChangelogSection[];
  changelogPath?: string;

  // for Ruby: TODO refactor to find version.rb like Python finds version.py
  // and then remove this property
  versionFile?: string;
  pullRequestTitlePattern?: string;
  signoff?: string;
  extraFiles?: string[];
}

interface CreatePullRequestArgs
  extends GitHubArgs,
    ManifestArgs,
    ManifestConfigArgs,
    VersioningArgs,
    PullRequestArgs {}
interface CreateReleaseArgs
  extends GitHubArgs,
    ManifestArgs,
    ManifestConfigArgs,
    ReleaseArgs {}
interface CreateManifestPullRequestArgs extends GitHubArgs, ManifestArgs {}
interface CreateManifestReleaseArgs
  extends GitHubArgs,
    ManifestArgs,
    ReleaseArgs {}

function gitHubOptions(yargs: yargs.Argv): yargs.Argv {
  return yargs
    .option('token', {describe: 'GitHub token with repo write permissions'})
    .option('api-url', {
      describe: 'URL to use when making API requests',
      default: GH_API_URL,
      type: 'string',
    })
    .option('graphql-url', {
      describe: 'URL to use when making GraphQL requests',
      default: GH_GRAPHQL_URL,
      type: 'string',
    })
    .option('default-branch', {
      describe: 'The branch to open release PRs against and tag releases on',
      type: 'string',
      deprecated: 'use --target-branch instead',
    })
    .option('target-branch', {
      describe: 'The branch to open release PRs against and tag releases on',
      type: 'string',
    })
    .option('repo-url', {
      describe: 'GitHub URL to generate release for',
      demand: true,
    })
    .option('dry-run', {
      describe: 'Prepare but do not take action',
      type: 'boolean',
      default: false,
    })
    .option('fork', {
      describe: 'should the PR be created from a fork',
      type: 'boolean',
      default: false,
    })
    .middleware(_argv => {
      const argv = _argv as GitHubArgs;
      // allow secrets to be loaded from file path
      // rather than being passed directly to the bin.
      if (argv.token) argv.token = coerceOption(argv.token);
      if (argv.apiUrl) argv.apiUrl = coerceOption(argv.apiUrl);
      if (argv.graphqlUrl) argv.graphqlUrl = coerceOption(argv.graphqlUrl);
    });
}

function releaseOptions(yargs: yargs.Argv): yargs.Argv {
  return yargs
    .option('draft', {
      describe:
        'mark release as a draft. no tag is created but tag_name and ' +
        'target_commitish are associated with the release for future ' +
        'tag creation upon "un-drafting" the release.',
      type: 'boolean',
      default: false,
    })
    .option('release-label', {
      describe: 'set a pull request label other than "autorelease: tagged"',
      type: 'string',
    });
}

function pullRequestOptions(yargs: yargs.Argv): yargs.Argv {
  // common to ReleasePR and GitHubRelease
  return yargs
    .option('label', {
      default: 'autorelease: pending',
      describe: 'label to remove from release PR',
    })
    .option('release-as', {
      describe: 'override the semantically determined release version',
      type: 'string',
    })
    .option('bump-minor-pre-major', {
      describe:
        'should we bump the semver minor prior to the first major release',
      default: false,
      type: 'boolean',
    })
    .option('bump-patch-for-minor-pre-major', {
      describe:
        'should we bump the semver patch instead of the minor for non-breaking' +
        ' changes prior to the first major release',
      default: false,
      type: 'boolean',
    })
    .option('monorepo-tags', {
      describe: 'include library name in tags and release branches',
      type: 'boolean',
      default: false,
    })
    .option('version-file', {
      describe: 'path to version file to update, e.g., version.rb',
      type: 'string',
    })
    .option('snapshot', {
      describe: 'is it a snapshot (or pre-release) being generated?',
      type: 'boolean',
      default: false,
    })
    .option('pull-request-title-pattern', {
      describe: 'Title pattern to make release PR',
      type: 'string',
    })
    .option('signoff', {
      describe:
        'Add Signed-off-by line at the end of the commit log message using the user and email provided. (format "Name <email@example.com>").',
      type: 'string',
    })
    .option('changelog-path', {
      default: 'CHANGELOG.md',
      describe: 'where can the CHANGELOG be found in the project?',
      type: 'string',
    })
    .option('last-package-version', {
      describe: 'last version # that package was released as',
      type: 'string',
      deprecated: 'use --latest-tag-version instead',
    })
    .option('latest-tag-version', {
      describe: 'Override the detected latest tag version',
      type: 'string',
    })
    .option('latest-tag-sha', {
      describe: 'Override the detected latest tag SHA',
      type: 'string',
    })
    .option('latest-tag-name', {
      describe: 'Override the detected latest tag name',
      type: 'string',
    })
    .middleware(_argv => {
      const argv = _argv as CreatePullRequestArgs;

      if (argv.defaultBranch) {
        logger.warn(
          '--default-branch is deprecated. Please use --target-branch instead.'
        );
        argv.targetBranch = argv.targetBranch || argv.defaultBranch;
      }

      if (argv.lastPackageVersion) {
        logger.warn(
          '--latest-package-version is deprecated. Please use --latest-tag-version instead.'
        );
        argv.latestTagVersion =
          argv.latestTagVersion || argv.lastPackageVersion;
      }
    });
}

function manifestConfigOptions(
  yargs: yargs.Argv,
  defaultType?: string
): yargs.Argv {
  return yargs
    .option('path', {
      describe: 'release from path other than root directory',
      type: 'string',
    })
    .option('component', {
      describe: 'name of component release is being minted for',
      type: 'string',
    })
    .option('package-name', {
      describe: 'name of package release is being minted for',
      type: 'string',
    })
    .option('release-type', {
      describe: 'what type of repo is a release being created for?',
      choices: getReleaserTypes(),
      default: defaultType,
    });
}

function manifestOptions(yargs: yargs.Argv): yargs.Argv {
  return yargs
    .option('config-file', {
      default: 'release-please-config.json',
      describe: 'where can the config file be found in the project?',
    })
    .option('manifest-file', {
      default: '.release-please-manifest.json',
      describe: 'where can the manifest file be found in the project?',
    });
}

const createReleasePullRequestCommand: yargs.CommandModule<
  {},
  CreatePullRequestArgs
> = {
  command: 'release-pr',
  describe: 'create or update a PR representing the next release',
  builder(yargs) {
    return manifestOptions(
      manifestConfigOptions(pullRequestOptions(gitHubOptions(yargs)))
    );
  },
  async handler(argv) {
    const github = await buildGitHub(argv);
    const targetBranch = argv.targetBranch || github.repository.defaultBranch;
    let manifest: Manifest;
    if (argv.releaseType) {
      manifest = await Manifest.fromConfig(github, targetBranch, {
        releaseType: argv.releaseType,
        component: argv.component || '',
      });
    } else {
      manifest = await Manifest.fromManifest(
        github,
        targetBranch,
        argv.configFile,
        argv.manifestFile
      );
    }

    if (argv.dryRun) {
      const pullRequests = await manifest.buildPullRequests();
      logger.info(pullRequests);
    } else {
      const pullRequestNumbers = await manifest.createPullRequests();
      console.log(pullRequestNumbers);
    }
  },
};

const createReleaseCommand: yargs.CommandModule<{}, CreateReleaseArgs> = {
  command: 'github-release',
  describe: 'create a GitHub release from a release PR',
  builder(yargs) {
    return releaseOptions(
      manifestOptions(manifestConfigOptions(gitHubOptions(yargs)))
    );
  },
  async handler(argv) {
    const github = await buildGitHub(argv);
    const targetBranch = argv.targetBranch || github.repository.defaultBranch;
    let manifest: Manifest;
    if (argv.releaseType) {
      manifest = await Manifest.fromConfig(github, targetBranch, {
        releaseType: argv.releaseType,
        component: argv.component || '',
      });
    } else {
      manifest = await Manifest.fromManifest(
        github,
        targetBranch,
        argv.configFile,
        argv.manifestFile
      );
    }

    if (argv.dryRun) {
      const releases = await manifest.buildReleases();
      logger.info(releases);
    } else {
      const releaseNumbers = await manifest.createReleases();
      console.log(releaseNumbers);
    }
  },
};

const createManifestPullRequestCommand: yargs.CommandModule<
  {},
  CreateManifestPullRequestArgs
> = {
  command: 'manifest-pr',
  describe: 'create a release-PR using a manifest file',
  deprecated: 'use release-pr instead.',
  builder(yargs) {
    return releaseOptions(
      manifestOptions(
        manifestConfigOptions(pullRequestOptions(gitHubOptions(yargs)))
      )
    );
  },
  async handler(argv) {
    logger.warn('manifest-pr is deprecated. Please use release-pr instead.');
    const github = await buildGitHub(argv);
    const targetBranch = argv.targetBranch || github.repository.defaultBranch;
    const manifest = await Manifest.fromManifest(
      github,
      targetBranch,
      argv.configFile,
      argv.manifestFile
    );

    if (argv.dryRun) {
      const pullRequests = await manifest.buildPullRequests();
      logger.info(pullRequests);
    } else {
      const pullRequestNumbers = await manifest.createPullRequests();
      console.log(pullRequestNumbers);
    }
  },
};

const createManifestReleaseCommand: yargs.CommandModule<
  {},
  CreateManifestReleaseArgs
> = {
  command: 'manifest-release',
  describe: 'create releases/tags from last release-PR using a manifest file',
  deprecated: 'use github-release instead',
  builder(yargs) {
    return manifestOptions(pullRequestOptions(gitHubOptions(yargs)));
  },
  async handler(argv) {
    logger.warn(
      'manifest-release is deprecated. Please use github-release instead.'
    );
    logger.warn('manifest-pr is deprecated. Please use release-pr instead.');
    const github = await buildGitHub(argv);
    const targetBranch = argv.targetBranch || github.repository.defaultBranch;
    const manifest = await Manifest.fromManifest(
      github,
      targetBranch,
      argv.configFile,
      argv.manifestFile
    );

    if (argv.dryRun) {
      const releases = await manifest.buildReleases();
      logger.info(releases);
    } else {
      const releaseNumbers = await manifest.createReleases();
      console.log(releaseNumbers);
    }
  },
};

async function buildGitHub(argv: GitHubArgs): Promise<GitHub> {
  const [owner, repo] = parseGithubRepoUrl(argv.repoUrl);
  const github = await GitHub.create({
    owner,
    repo,
    token: argv.token!,
  });
  return github;
}

export const parser = yargs
  .command(createReleasePullRequestCommand)
  .command(createReleaseCommand)
  .command(createManifestPullRequestCommand)
  .command(createManifestReleaseCommand)
  .demandCommand(1)
  .strict(true)
  .scriptName('release-please');

interface HandleError {
  (err: ErrorObject): void;
  logger?: Console;
  yargsArgs?: yargs.Arguments;
}

// The errors returned by octokit currently contain the
// request object, this contains information we don't want to
// leak. For this reason, we capture exceptions and print
// a less verbose error message (run with --debug to output
// the request object, don't do this in CI/CD).
export const handleError: HandleError = (err: ErrorObject) => {
  let status = '';
  if (handleError.yargsArgs === undefined) {
    throw new Error(
      'Set handleError.yargsArgs with a yargs.Arguments instance.'
    );
  }
  if (!handleError.logger) {
    handleError.logger = console;
  }
  const ya = handleError.yargsArgs;
  const logger = handleError.logger;
  const command = ya?._?.length ? ya._[0] : '';
  if (err.status) {
    status = '' + err.status;
  }
  logger.error(
    chalk.red(
      `command ${command} failed${status ? ` with status ${status}` : ''}`
    )
  );
  if (ya?.debug) {
    logger.error('---------');
    logger.error(err.stack);
  }
  process.exitCode = 1;
};

// Only run parser if executed with node bin, this allows
// for the parser to be easily tested:
let argv: yargs.Arguments;
if (require.main === module) {
  argv = parser.parse();
  handleError.yargsArgs = argv;
  process.on('unhandledRejection', err => {
    handleError(err as ErrorObject);
  });

  process.on('uncaughtException', err => {
    handleError(err as ErrorObject);
  });
}
