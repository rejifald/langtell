# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).
Each unreleased change adds a small markdown file here describing the bump
(`patch` / `minor` / `major`) and a human-readable summary.

Add one with:

```sh
pnpm changeset
```

On merge to `main`, the Release workflow turns accumulated changesets into a
version bump + `CHANGELOG.md` entry (via a "Version Packages" PR), then publishes
to npm when that PR is merged. See [../RELEASING.md](../RELEASING.md).
