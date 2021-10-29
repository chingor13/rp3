exports['KRMBlueprint buildReleasePullRequest builds a release pull request 1'] = {
  "title": {
    "version": {
      "major": 0,
      "minor": 123,
      "patch": 5
    },
    "component": "some-krm-blueprint-package",
    "targetBranch": "main",
    "pullRequestTitlePattern": "chore${scope}: release${component} ${version}",
    "matchPattern": {}
  },
  "body": {
    "header": ":robot: I have created a release *beep* *boop*",
    "footer": "This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).",
    "releaseData": [
      {
        "component": "some-krm-blueprint-package",
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "notes": "### [0.123.5](github.com/googleapis/krm-blueprint-test-repo/compare/some-krm-blueprint-package-v0.123.4...some-krm-blueprint-package-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
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
        "changelogEntry": "### [0.123.5](github.com/googleapis/krm-blueprint-test-repo/compare/some-krm-blueprint-package-v0.123.4...some-krm-blueprint-package-v0.123.5) (2021-10-29)\n\n\n### Bug Fixes\n\n* **deps:** fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0"
      }
    },
    {
      "path": "project.yaml",
      "createIfMissing": false,
      "cachedFileContents": {
        "content": "IyBDb3B5cmlnaHQgMjAyMSBHb29nbGUgTExDCiMKIyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgIkxpY2Vuc2UiKTsKIyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuCiMgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0CiMKIyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMAojCiMgVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZQojIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuICJBUyBJUyIgQkFTSVMsCiMgV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuCiMgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZAojIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLgoKYXBpVmVyc2lvbjogcmVzb3VyY2VtYW5hZ2VyLmNucm0uY2xvdWQuZ29vZ2xlLmNvbS92MWJldGExCmtpbmQ6IFByb2plY3QKbWV0YWRhdGE6CiAgbmFtZTogcHJvamVjdC1pZCAjIHsiJGtwdC1zZXQiOiJwcm9qZWN0LWlkIn0KICBuYW1lc3BhY2U6IHByb2plY3RzICMgeyIka3B0LXNldCI6InByb2plY3RzLW5hbWVzcGFjZSJ9CiAgYW5ub3RhdGlvbnM6CiAgICBjbnJtLmNsb3VkLmdvb2dsZS5jb20vYXV0by1jcmVhdGUtbmV0d29yazogImZhbHNlIgogICAgY25ybS5jbG91ZC5nb29nbGUuY29tL2JsdWVwcmludDogY25ybS9sYW5kaW5nLXpvbmU6cHJvamVjdC92My4wLjAKICAgIGNvbmZpZy5rdWJlcm5ldGVzLmlvL2Z1bmN0aW9uOiB8CiAgICAgIGNvbnRhaW5lcjoKICAgICAgICBpbWFnZTogZ2NyLmlvL3lha2ltYS1lYXAvZm9sZGVyLXJlZjpsYXRlc3QKc3BlYzoKICBuYW1lOiBwcm9qZWN0LWlkICMgeyIka3B0LXNldCI6InByb2plY3QtaWQifQogIGJpbGxpbmdBY2NvdW50UmVmOgogICAgZXh0ZXJuYWw6ICJBQUFBQUEtQkJCQkJCLUNDQ0NDQyIgIyB7IiRrcHQtc2V0IjoiYmlsbGluZy1hY2NvdW50LWlkIn0KICBmb2xkZXJSZWY6CiAgICBuYW1lOiBuYW1lLm9mLmZvbGRlciAjIHsiJGtwdC1zZXQiOiJmb2xkZXItbmFtZSJ9CiAgICBuYW1lc3BhY2U6IGhpZXJhcmNoeSAjIHsiJGtwdC1zZXQiOiJmb2xkZXItbmFtZXNwYWNlIn0=",
        "parsedContent": "# Copyright 2021 Google LLC\n#\n# Licensed under the Apache License, Version 2.0 (the \"License\");\n# you may not use this file except in compliance with the License.\n# You may obtain a copy of the License at\n#\n#      http://www.apache.org/licenses/LICENSE-2.0\n#\n# Unless required by applicable law or agreed to in writing, software\n# distributed under the License is distributed on an \"AS IS\" BASIS,\n# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n# See the License for the specific language governing permissions and\n# limitations under the License.\n\napiVersion: resourcemanager.cnrm.cloud.google.com/v1beta1\nkind: Project\nmetadata:\n  name: project-id # {\"$kpt-set\":\"project-id\"}\n  namespace: projects # {\"$kpt-set\":\"projects-namespace\"}\n  annotations:\n    cnrm.cloud.google.com/auto-create-network: \"false\"\n    cnrm.cloud.google.com/blueprint: cnrm/landing-zone:project/v3.0.0\n    config.kubernetes.io/function: |\n      container:\n        image: gcr.io/yakima-eap/folder-ref:latest\nspec:\n  name: project-id # {\"$kpt-set\":\"project-id\"}\n  billingAccountRef:\n    external: \"AAAAAA-BBBBBB-CCCCCC\" # {\"$kpt-set\":\"billing-account-id\"}\n  folderRef:\n    name: name.of.folder # {\"$kpt-set\":\"folder-name\"}\n    namespace: hierarchy # {\"$kpt-set\":\"folder-namespace\"}",
        "sha": "ea83936f9096af5bc8b3a508a20c2570"
      },
      "updater": {
        "version": {
          "major": 0,
          "minor": 123,
          "patch": 5
        },
        "versionsMap": {}
      }
    }
  ],
  "labels": [
    "autorelease: pending",
    "type: release"
  ],
  "headRefName": "release-please/branches/main/components/some-krm-blueprint-package",
  "version": {
    "major": 0,
    "minor": 123,
    "patch": 5
  }
}
