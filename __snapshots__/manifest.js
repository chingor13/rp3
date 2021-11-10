exports['Manifest createPullRequests handles a single pull request: changes'] = `

filename: README.md
some raw content
`

exports['Manifest createPullRequests handles a single pull request: options'] = `

upstreamOwner: fake-owner
upstreamRepo: fake-repo
title: chore(main): release
branch: release-please/branches/main
description: :robot: I have created a release *beep* *boop*
---


Some release notes

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).
primary: main
force: true
fork: false
message: chore(main): release
logger: [object Object]
draft: false
`

exports['Manifest createPullRequests handles fork = true: changes'] = `

filename: README.md
some raw content
`

exports['Manifest createPullRequests handles fork = true: options'] = `

upstreamOwner: fake-owner
upstreamRepo: fake-repo
title: chore(main): release
branch: release-please/branches/main
description: :robot: I have created a release *beep* *boop*
---


Some release notes

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).
primary: main
force: true
fork: true
message: chore(main): release
logger: [object Object]
draft: false
`

exports['Manifest createPullRequests handles signoff users: changes'] = `

filename: README.md
some raw content
`

exports['Manifest createPullRequests handles signoff users: options'] = `

upstreamOwner: fake-owner
upstreamRepo: fake-repo
title: chore(main): release
branch: release-please/branches/main
description: :robot: I have created a release *beep* *boop*
---


Some release notes

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).
primary: main
force: true
fork: false
message: chore(main): release

Signed-off-by: Alice <alice@example.com>
logger: [object Object]
draft: false
`
