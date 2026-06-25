# Releasing langtell

Releases are automated with [Changesets](https://github.com/changesets/changesets)
and GitHub Actions.

## Day-to-day

1. Make your change on a branch.
2. Record it: `pnpm changeset` — pick the bump (patch/minor/major) and write a
   one-line summary.
3. Commit the generated `.changeset/*.md` alongside your code and open a PR.

`CI` (`.github/workflows/ci.yml`) runs the full `verify` gate on every PR.

## Publishing

On merge to `main`, `Release` (`.github/workflows/release.yml`):

- **Unreleased changesets present** → opens/updates a **"Version Packages"** PR
  that bumps `version` and updates `CHANGELOG.md`.
- **That PR merged** → runs `pnpm run release` (`build` + `changeset publish`) to
  publish to npm with provenance.

The first real release graduates `0.0.1` → `0.1.0`.

## One-time npm setup (required before CI can publish)

CI publishes via npm **trusted publishing (OIDC)** — no tokens stored in the repo.

1. On npmjs.com, open the `langtell` package → **Settings → Trusted Publishers**
   and add this GitHub repository with the workflow file
   `.github/workflows/release.yml`.
2. The workflow already sets `id-token: write`, upgrades to npm ≥ 11.5.1, and
   publishes with `provenance: true`.

### Token-based fallback

If you prefer not to use OIDC: create a **granular automation** access token on
npm (it bypasses 2FA in CI), store it as the `NPM_TOKEN` repository secret, and
uncomment the `NODE_AUTH_TOKEN` line in `release.yml`.
