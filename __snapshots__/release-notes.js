exports['ReleaseNotes buildNotes should build default release notes 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)


### ⚠ BREAKING CHANGES

* some bugfix

### Features

* feat: some feature


### Bug Fixes

* fix!: some bugfix
`

exports['ReleaseNotes buildNotes should build with custom changelog sections 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)


### ⚠ BREAKING CHANGES

* some bugfix

### Features

* feat: some feature


### Bug Fixes

* fix!: some bugfix


### Documentation

* docs: some documentation
`

exports['ReleaseNotes buildNotes should ignore RELEASE AS notes 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)


### ⚠ BREAKING CHANGES

* some bugfix

### Bug Fixes

* fix!: some bugfix
`

exports['ReleaseNotes buildNotes with commit parsing handles Release-As footers 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)
`

exports['ReleaseNotes buildNotes with commit parsing should handle BREAKING CHANGE body 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)


### Features

* feat: some feature
`

exports['ReleaseNotes buildNotes with commit parsing should handle a breaking change 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)


### ⚠ BREAKING CHANGES

* some bugfix

### Bug Fixes

* fix!: some bugfix
`

exports['ReleaseNotes buildNotes with commit parsing should handle bug links 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)


### Bug Fixes

* fix: some fix, closes [#123](github.com/googleapis/java-asset/issues/123)
`

exports['ReleaseNotes buildNotes with commit parsing should handle git trailers 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)


### Bug Fixes

* fix: some fix
`

exports['ReleaseNotes buildNotes with commit parsing should handle meta commits 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)


### Features

* **recaptchaenterprise:** feat(recaptchaenterprise): migrate microgenerator


### Bug Fixes

* fix: fixes bug #733
* **securitycenter:** fix(securitycenter): fixes security center.
`

exports['ReleaseNotes buildNotes with commit parsing should handle multi-line breaking change, if prefixed with list 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)
`

exports['ReleaseNotes buildNotes with commit parsing should handle multi-line breaking changes 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)
`

exports['ReleaseNotes buildNotes with commit parsing should not include content two newlines after BREAKING CHANGE 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)
`

exports['ReleaseNotes buildNotes with commit parsing should parse multiple commit messages from a single commit 1'] = `
### [1.2.3](github.com/googleapis/java-asset/compare/v1.2.2...v1.2.3) (1983-10-10)


### Features

* feat: some feature


### Bug Fixes

* fix: some bugfix
`
