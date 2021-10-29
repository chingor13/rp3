exports['Go buildReleasePullRequest builds a release pull request 1'] = {
  "title": {
    "version": {
      "major": 0,
      "minor": 123,
      "patch": 5
    },
    "component": "some-go-package",
    "targetBranch": "main",
    "pullRequestTitlePattern": "chore${scope}: release${component} ${version}",
    "matchPattern": {}
  },
  "body": {
    "header": ":robot: I have created a release *beep* *boop*",
    "footer": "This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).",
    "releaseData": [
      {
        "component": "some-go-package",
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "notes": "### [0.123.5](github.com/googleapis/go-test-repo/compare/some-go-package-v0.123.4...some-go-package-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
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
        "changelogEntry": "### [0.123.5](github.com/googleapis/go-test-repo/compare/some-go-package-v0.123.4...some-go-package-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
      }
    }
  ],
  "labels": [
    "autorelease: pending",
    "type: release"
  ],
  "headRefName": "release-please/branches/main/components/some-go-package",
  "version": {
    "major": 0,
    "minor": 123,
    "patch": 5
  }
}
