# Contributing and releases

Requires Node.js 22.14 or newer.

```sh
npm ci
npm run format:check
npm run typecheck
npm test
npm run check:package
```

CI checks Node.js 22 and 24. Package checks install the built tarball in a clean
consumer without optional peers. Tests use mocked HTTP and never send feedback
or email to production.

## First publication

An npm maintainer publishes the initial version locally:

```sh
npm ci
npm publish --access public
```

On npmjs.com, open the `agentback` package settings and add a GitHub Actions
trusted publisher with these values:

- Organization: `superagents-lab`
- Repository: `agentback-js`
- Workflow filename: `release.yml`
- Environment: leave empty
- Allowed actions: enable direct publishing with `npm publish`

No npm token is needed in GitHub. See the [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

## Subsequent releases

Update the version and lockfile, commit, then push a matching tag:

```sh
npm version patch
git push origin main --follow-tags
```

The `v*` tag workflow verifies the version, checks formatting and types, runs
tests and package checks, publishes with OIDC and provenance, then creates a
GitHub release. Stable versions only; the tag must exactly match `package.json`.

Run the Release workflow manually from GitHub Actions to validate all release
checks without publishing. The initial `0.1.0` was published locally; use a new
version for the first tag-based publication after configuring trusted publishing.

An npm version can only be published once. If publication succeeded but GitHub
release creation failed, create the missing GitHub release for that existing
tag rather than publishing the version again.
