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

Bump the version and lockfile in a pull request (`npm version patch --no-git-tag-version`)
and merge it. Then run the Release workflow on `main` from GitHub Actions. It
verifies the version, checks formatting and types, runs tests and package
checks, publishes with OIDC and provenance, then creates the `v<version>` tag and
GitHub release. Pushing a matching `v*` tag runs the same release. Stable
versions only; a tag must exactly match `package.json`.

An npm version can only be published once. The workflow skips publishing when
the version is already on npm and skips the GitHub release when it already
exists, so re-running it after a partial failure only fills in what is missing.
