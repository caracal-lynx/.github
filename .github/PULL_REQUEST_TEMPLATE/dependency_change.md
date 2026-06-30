# 📦 Dependency Change PR

> This template is for PRs that include changes to `pnpm-lock.yaml` / `package.json`
> (or `package-lock.json` on the few npm repos). Select it by adding
> `?template=dependency_change.md` to the PR URL.

---

## Why did the lock file change?

<!-- Tell the reviewer what triggered this — pick one and explain -->

- [ ] I added a new dependency
- [ ] I updated an existing dependency
- [ ] I removed a dependency
- [ ] I ran `pnpm install` (or `npm install`) to regenerate the lock file
- [ ] The lock file changed as a side-effect of something else (explain below)

**Details:**
<!-- e.g. "Added `dayjs` as a lighter replacement for `moment`" -->

---

## New packages added

<!-- Complete this section for every NEW package introduced. Delete if none. -->

| Package | Version | Purpose | npm link |
|---------|---------|---------|---------|
| | | | |

**Author checklist for each new package:**
- [ ] Name spelling verified (no typosquatting)
- [ ] Publisher is legitimate and well-known
- [ ] Package has a reasonable download count and publish history
- [ ] Resolved URL points to `registry.npmjs.org`
- [ ] `pnpm audit` run and clean after adding

---

## Updated packages

<!-- List any packages with intentional version changes. Delete if none. -->

| Package | Old Version | New Version | Reason |
|---------|-------------|-------------|--------|
| | | | |

**Author checklist:**
- [ ] Changelog reviewed for breaking changes (especially major bumps)
- [ ] No new CVEs introduced (checked via `pnpm audit`)
- [ ] Any resolved CVEs noted above

---

## Removed packages

<!-- List any packages intentionally removed. Delete if none. -->

| Package | Reason for removal |
|---------|--------------------|
| | |

**Author checklist:**
- [ ] No remaining code references to removed packages
- [ ] No other dependencies rely on this package directly

---

## Security & audit

```
<!-- Paste the output of `pnpm audit` here -->
```

- [ ] `pnpm audit` shows no new vulnerabilities introduced by this PR
- [ ] No `integrity` hash changes on packages whose version did not change

---

## Transitive dependency changes

- [ ] I have reviewed the transitive dependency changes in the lock file diff
- [ ] Any unexpected transitive changes are explained below

**Notes:**
<!-- If the diff is large, summarise what changed and why here -->

---

## Lock file format

- [ ] `lockfileVersion` is unchanged (or the change is intentional and explained)
- [ ] Only one lock file format is present (`package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`)

---

## Author notes for reviewer

<!-- Anything specific you'd like the reviewer to focus on? -->

---

---

## 👀 Reviewer checklist

> **For the reviewer** — complete this section before approving.
> Full guidance: [REVIEWING.md](../REVIEWING.md)

### Does the change make sense?
- [ ] The reason for the lock file change is clearly explained above
- [ ] `package.json` changes (if any) align with what's described
- [ ] The scope of change looks proportionate — no unexplained mass regeneration

### New packages
- [ ] Package names checked for typosquatting
- [ ] Publisher and provenance look legitimate
- [ ] Resolved URLs point to `registry.npmjs.org`
- [ ] No suspiciously new or obscure packages without justification

### Version changes
- [ ] Patch/minor bumps look routine
- [ ] Any major version bumps are justified and changelogs reviewed
- [ ] No known CVEs introduced (verified via `pnpm audit` output above)

### Security
- [ ] `integrity` hashes have not changed on packages whose version did not change
- [ ] `pnpm audit` output shows no new high/critical vulnerabilities
- [ ] Lock file version (`lockfileVersion`) is unchanged or change is explained

### Transitive dependencies
- [ ] Transitive changes are proportionate to the stated change
- [ ] No unexpected new top-level resolved packages

### Overall
- [ ] I am satisfied this change is safe to merge
- [ ] _(optional)_ I ran `pnpm install --frozen-lockfile` (or `npm ci`) locally and the build passes

**Reviewer comments:**
<!-- Add any comments, concerns, or questions here before submitting your review -->
