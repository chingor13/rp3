exports['Dart buildReleasePullRequest builds a release pull request 1'] = {
  "title": {
    "version": {
      "major": 0,
      "minor": 123,
      "patch": 5
    },
    "component": "some-dart-package",
    "targetBranch": "main",
    "pullRequestTitlePattern": "chore${scope}: release${component} ${version}",
    "matchPattern": {}
  },
  "body": {
    "header": ":robot: I have created a release *beep* *boop*",
    "footer": "This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).",
    "releaseData": [
      {
        "component": "some-dart-package",
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "notes": "### [0.123.5](github.com/googleapis/py-test-repo/compare/some-dart-package-v0.123.4...some-dart-package-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
      }
    ]
  },
  "updates": [
    {
      "path": "CHANGELOG.md",
      "createIfMissing": true,
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "changelogEntry": "### [0.123.5](github.com/googleapis/py-test-repo/compare/some-dart-package-v0.123.4...some-dart-package-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
      }
    },
    {
      "path": "pubspec.yaml",
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
  "headRefName": "release-please/branches/main/components/some-dart-package",
  "version": {
    "major": 0,
    "minor": 123,
    "patch": 5
  }
}

exports['Dart buildReleasePullRequest detects a default component 1'] = {
  "title": {
    "version": {
      "major": 0,
      "minor": 123,
      "patch": 5
    },
    "component": "hello_world",
    "targetBranch": "main",
    "pullRequestTitlePattern": "chore${scope}: release${component} ${version}",
    "matchPattern": {}
  },
  "body": {
    "header": ":robot: I have created a release *beep* *boop*",
    "footer": "This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).",
    "releaseData": [
      {
        "component": "hello_world",
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "notes": "### [0.123.5](github.com/googleapis/py-test-repo/compare/hello_world-v0.123.4...hello_world-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
      }
    ]
  },
  "updates": [
    {
      "path": "CHANGELOG.md",
      "createIfMissing": true,
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "changelogEntry": "### [0.123.5](github.com/googleapis/py-test-repo/compare/hello_world-v0.123.4...hello_world-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
      }
    },
    {
      "path": "pubspec.yaml",
      "createIfMissing": false,
      "cachedFileContents": {
        "content": "bmFtZTogaGVsbG9fd29ybGQKZGVzY3JpcHRpb246IEhlbGxvIFdvcmxkCnB1Ymxpc2hfdG86ICdub25lJyAjIFJlbW92ZSB0aGlzIGxpbmUgaWYgeW91IHdpc2ggdG8gcHVibGlzaCB0byBwdWIuZGV2Cgp2ZXJzaW9uOiAwLjUuMCsxMgoKZW52aXJvbm1lbnQ6CiAgc2RrOiAnPj0yLjEyLjAgPDMuMC4wJwo=",
        "parsedContent": "name: hello_world\ndescription: Hello World\npublish_to: 'none' # Remove this line if you wish to publish to pub.dev\n\nversion: 0.5.0+12\n\nenvironment:\n  sdk: '>=2.12.0 <3.0.0'\n",
        "sha": "3e511ea232a00d1585f72d1f248ce9c8"
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
  "headRefName": "release-please/branches/main/components/hello_world",
  "version": {
    "major": 0,
    "minor": 123,
    "patch": 5
  }
}
