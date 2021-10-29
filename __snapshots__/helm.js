exports['Helm buildReleasePullRequest builds a release pull request 1'] = {
  "title": {
    "version": {
      "major": 0,
      "minor": 123,
      "patch": 5
    },
    "component": "some-helm-package",
    "targetBranch": "main",
    "pullRequestTitlePattern": "chore${scope}: release${component} ${version}",
    "matchPattern": {}
  },
  "body": {
    "header": ":robot: I have created a release *beep* *boop*",
    "footer": "This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).",
    "releaseData": [
      {
        "component": "some-helm-package",
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "notes": "### [0.123.5](github.com/googleapis/helm-test-repo/compare/some-helm-package-v0.123.4...some-helm-package-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
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
        "changelogEntry": "### [0.123.5](github.com/googleapis/helm-test-repo/compare/some-helm-package-v0.123.4...some-helm-package-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
      }
    },
    {
      "path": "Chart.yaml",
      "createIfMissing": false,
      "cachedFileContents": {
        "content": "IyBDb3B5cmlnaHQgMjAyMSBHb29nbGUgTExDCiMKIyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgIkxpY2Vuc2UiKTsKIyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuCiMgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0CiMKIyAgICAgaHR0cHM6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMAojCiMgVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZQojIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuICJBUyBJUyIgQkFTSVMsCiMgV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuCiMgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZAojIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLgoKbmFtZTogaGVsbS10ZXN0LXJlcG8KdmVyc2lvbjogMS4wLjAKYXBpVmVyc2lvbjogdjIKYXBwVmVyc2lvbjogMi4wLjAKZGVwZW5kZW5jaWVzOgogIC0gbmFtZTogYW5vdGhlci1yZXBvCiAgICB2ZXJzaW9uOiAwLjE1LjMKICAgIHJlcG9zaXRvcnk6ICJsaW5rVG9IZWxtQ2hhcnRSZXBvIgptYWludGFpbmVyczoKICAtIEFiaGluYXYgS2hhbm5h",
        "parsedContent": "# Copyright 2021 Google LLC\n#\n# Licensed under the Apache License, Version 2.0 (the \"License\");\n# you may not use this file except in compliance with the License.\n# You may obtain a copy of the License at\n#\n#     https://www.apache.org/licenses/LICENSE-2.0\n#\n# Unless required by applicable law or agreed to in writing, software\n# distributed under the License is distributed on an \"AS IS\" BASIS,\n# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n# See the License for the specific language governing permissions and\n# limitations under the License.\n\nname: helm-test-repo\nversion: 1.0.0\napiVersion: v2\nappVersion: 2.0.0\ndependencies:\n  - name: another-repo\n    version: 0.15.3\n    repository: \"linkToHelmChartRepo\"\nmaintainers:\n  - Abhinav Khanna",
        "sha": "dd97bc82f7c7d9b1d8d3a9b37300d10c"
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
  "headRefName": "release-please/branches/main/components/some-helm-package",
  "version": {
    "major": 0,
    "minor": 123,
    "patch": 5
  }
}

exports['Helm buildReleasePullRequest detects a default component 1'] = {
  "title": {
    "version": {
      "major": 0,
      "minor": 123,
      "patch": 5
    },
    "component": "helm-test-repo",
    "targetBranch": "main",
    "pullRequestTitlePattern": "chore${scope}: release${component} ${version}",
    "matchPattern": {}
  },
  "body": {
    "header": ":robot: I have created a release *beep* *boop*",
    "footer": "This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).",
    "releaseData": [
      {
        "component": "helm-test-repo",
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "notes": "### [0.123.5](github.com/googleapis/helm-test-repo/compare/helm-test-repo-v0.123.4...helm-test-repo-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
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
        "changelogEntry": "### [0.123.5](github.com/googleapis/helm-test-repo/compare/helm-test-repo-v0.123.4...helm-test-repo-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
      }
    },
    {
      "path": "Chart.yaml",
      "createIfMissing": false,
      "cachedFileContents": {
        "content": "IyBDb3B5cmlnaHQgMjAyMSBHb29nbGUgTExDCiMKIyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgIkxpY2Vuc2UiKTsKIyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuCiMgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0CiMKIyAgICAgaHR0cHM6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMAojCiMgVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZQojIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuICJBUyBJUyIgQkFTSVMsCiMgV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuCiMgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZAojIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLgoKbmFtZTogaGVsbS10ZXN0LXJlcG8KdmVyc2lvbjogMS4wLjAKYXBpVmVyc2lvbjogdjIKYXBwVmVyc2lvbjogMi4wLjAKZGVwZW5kZW5jaWVzOgogIC0gbmFtZTogYW5vdGhlci1yZXBvCiAgICB2ZXJzaW9uOiAwLjE1LjMKICAgIHJlcG9zaXRvcnk6ICJsaW5rVG9IZWxtQ2hhcnRSZXBvIgptYWludGFpbmVyczoKICAtIEFiaGluYXYgS2hhbm5h",
        "parsedContent": "# Copyright 2021 Google LLC\n#\n# Licensed under the Apache License, Version 2.0 (the \"License\");\n# you may not use this file except in compliance with the License.\n# You may obtain a copy of the License at\n#\n#     https://www.apache.org/licenses/LICENSE-2.0\n#\n# Unless required by applicable law or agreed to in writing, software\n# distributed under the License is distributed on an \"AS IS\" BASIS,\n# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n# See the License for the specific language governing permissions and\n# limitations under the License.\n\nname: helm-test-repo\nversion: 1.0.0\napiVersion: v2\nappVersion: 2.0.0\ndependencies:\n  - name: another-repo\n    version: 0.15.3\n    repository: \"linkToHelmChartRepo\"\nmaintainers:\n  - Abhinav Khanna",
        "sha": "dd97bc82f7c7d9b1d8d3a9b37300d10c"
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
  "headRefName": "release-please/branches/main/components/helm-test-repo",
  "version": {
    "major": 0,
    "minor": 123,
    "patch": 5
  }
}
