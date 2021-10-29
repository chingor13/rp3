exports['Node buildReleasePullRequest builds a release pull request 1'] = {
  "title": {
    "version": {
      "major": 0,
      "minor": 123,
      "patch": 5
    },
    "component": "some-node-package",
    "targetBranch": "main",
    "pullRequestTitlePattern": "chore${scope}: release${component} ${version}",
    "matchPattern": {}
  },
  "body": {
    "header": ":robot: I have created a release *beep* *boop*",
    "footer": "This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).",
    "releaseData": [
      {
        "component": "some-node-package",
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "notes": "### [0.123.5](github.com/googleapis/node-test-repo/compare/some-node-package-v0.123.4...some-node-package-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
      }
    ]
  },
  "updates": [
    {
      "path": "package-lock.json",
      "createIfMissing": false,
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        }
      }
    },
    {
      "path": "npm-shrinkwrap.json",
      "createIfMissing": false,
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        }
      }
    },
    {
      "path": "samples/package.json",
      "createIfMissing": false,
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "packageName": "some-node-package"
      }
    },
    {
      "path": "CHANGELOG.md",
      "createIfMissing": true,
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "changelogEntry": "### [0.123.5](github.com/googleapis/node-test-repo/compare/some-node-package-v0.123.4...some-node-package-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
      }
    },
    {
      "path": "package.json",
      "createIfMissing": false,
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        }
      }
    }
  ],
  "labels": [
    "autorelease: pending",
    "type: release"
  ],
  "headRefName": "release-please/branches/main/components/some-node-package",
  "version": {
    "major": 0,
    "minor": 123,
    "patch": 5
  }
}

exports['Node buildReleasePullRequest detects a default component 1'] = {
  "title": {
    "version": {
      "major": 0,
      "minor": 123,
      "patch": 5
    },
    "component": "node-test-repo",
    "targetBranch": "main",
    "pullRequestTitlePattern": "chore${scope}: release${component} ${version}",
    "matchPattern": {}
  },
  "body": {
    "header": ":robot: I have created a release *beep* *boop*",
    "footer": "This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).",
    "releaseData": [
      {
        "component": "node-test-repo",
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "notes": "### [0.123.5](github.com/googleapis/node-test-repo/compare/node-test-repo-v0.123.4...node-test-repo-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
      }
    ]
  },
  "updates": [
    {
      "path": "package-lock.json",
      "createIfMissing": false,
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        }
      }
    },
    {
      "path": "npm-shrinkwrap.json",
      "createIfMissing": false,
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        }
      }
    },
    {
      "path": "samples/package.json",
      "createIfMissing": false,
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "packageName": ""
      }
    },
    {
      "path": "CHANGELOG.md",
      "createIfMissing": true,
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "changelogEntry": "### [0.123.5](github.com/googleapis/node-test-repo/compare/node-test-repo-v0.123.4...node-test-repo-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
      }
    },
    {
      "path": "package.json",
      "createIfMissing": false,
      "cachedFileContents": {
        "content": "ewogICJuYW1lIjogIm5vZGUtdGVzdC1yZXBvIiwKICAidmVyc2lvbiI6ICIwLjEyMy40IiwKICAicmVwb3NpdG9yeSI6IHsKICAgICJ1cmwiOiAiZ2l0QGdpdGh1Yi5jb206c2FtcGxlcy9ub2RlLXRlc3QtcmVwby5naXQiCiAgfQp9Cg==",
        "parsedContent": "{\n  \"name\": \"node-test-repo\",\n  \"version\": \"0.123.4\",\n  \"repository\": {\n    \"url\": \"git@github.com:samples/node-test-repo.git\"\n  }\n}\n",
        "sha": "18863b7fc7061f51b3329e462c1d5048"
      },
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        }
      }
    }
  ],
  "labels": [
    "autorelease: pending",
    "type: release"
  ],
  "headRefName": "release-please/branches/main/components/node-test-repo",
  "version": {
    "major": 0,
    "minor": 123,
    "patch": 5
  }
}
