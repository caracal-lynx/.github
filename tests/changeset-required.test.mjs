// Asserts the VERDICT of node-ci.yml's `Changeset required` step, which smoke.yml can only
// execute (its fixture is private, so the step always passes there).
//
// The step's own `run:` block is lifted out of node-ci.yml and run as-is against a throwaway
// git repo: base commit on origin/master, the PR's change on HEAD. `pnpm` is stubbed to fail
// the way `changeset status` does when no changeset is present, so the exit code IS the
// verdict: 0 = changeset not required, non-zero = required.
//
// Run: node --test tests/*.test.mjs
// On Windows set BASH_BIN to Git Bash; plain `bash` there can resolve to WSL's.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASH = process.env.BASH_BIN || "bash";
// NODE_CI_WORKFLOW points the suite at another copy, e.g. master's, to watch it fail there.
const WORKFLOW =
  process.env.NODE_CI_WORKFLOW ||
  join(dirname(fileURLToPath(import.meta.url)), "../.github/workflows/node-ci.yml");
const MONOREPO_PATTERN = "^(packages|tools)/[^/]+/src/"; // data-gubbins' changed-paths-pattern

function extractStep() {
  const lines = readFileSync(WORKFLOW, "utf8").split("\n");
  const name = lines.findIndex((l) => l.includes("name: Verify a changeset is present"));
  assert.ok(name >= 0, "changeset step not found in node-ci.yml");
  const run = lines.findIndex((l, i) => i > name && /^\s+run: \|\s*$/.test(l));
  const indent = lines[run + 1].match(/^ */)[0].length;
  const body = [];
  for (const l of lines.slice(run + 1)) {
    if (l.trim() && l.match(/^ */)[0].length < indent) break;
    body.push(l.slice(indent));
  }
  return body.join("\n");
}

const STEP = extractStep();

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
}

const write = (root, files) => {
  for (const [path, content] of Object.entries(files)) {
    if (content === null) { rmSync(join(root, path)); continue; }
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof content === "string" ? content : JSON.stringify(content, null, 2) + "\n");
  }
};

// Runs the step for a PR that turns `base` into `head` (path -> content; null deletes).
function verdict(base, head, pattern = MONOREPO_PATTERN) {
  const root = mkdtempSync(join(tmpdir(), "changeset-required-"));
  try {
    git(root, "init", "-q", "-b", "master");
    git(root, "config", "user.email", "test@example.invalid");
    git(root, "config", "user.name", "test");
    git(root, "config", "core.autocrlf", "false");
    write(root, base);
    git(root, "add", "-A");
    git(root, "commit", "-qm", "base");
    git(root, "update-ref", "refs/remotes/origin/master", "HEAD");
    write(root, head);
    git(root, "add", "-A");
    git(root, "commit", "-qm", "pr", "--allow-empty");

    const bin = join(root, ".stub-bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "pnpm"), "#!/usr/bin/env bash\necho 'stub: no changeset found'\nexit 1\n");
    chmodSync(join(bin, "pnpm"), 0o755);
    writeFileSync(join(bin, "step.sh"), STEP);

    const r = spawnSync(BASH, ["--noprofile", "--norc", "-eo", "pipefail", join(bin, "step.sh")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
        PM: "pnpm",
        BASE: "master",
        CHANGED_PATHS_PATTERN: pattern,
        RUNNER_TEMP: bin,
      },
    });
    return { required: r.status !== 0, out: r.stdout + r.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const sluice = (deps = {}, extra = {}) => ({
  name: "@caracal-lynx/sluice",
  version: "0.11.0",
  main: "dist/index.js",
  dependencies: deps,
  devDependencies: { vitest: "^4.0.0" },
  ...extra,
});
const PKG = "packages/sluice/package.json";
const LOCK = "pnpm-lock.yaml";

const required = (base, head, why) => {
  const r = verdict(base, head);
  assert.ok(r.required, `expected a changeset to be required (${why})\n${r.out}`);
  assert.match(r.out, /a changeset is required/);
};
const exempt = (base, head, why) => {
  const r = verdict(base, head);
  assert.ok(!r.required, `expected no changeset to be required (${why})\n${r.out}`);
  assert.match(r.out, /changeset not required/);
};

test("data-gubbins#210: runtime dependency major in a published package", () => {
  required(
    { [PKG]: sluice({ "@duckdb/node-api": "~1.5.6-r", axios: "catalog:" }), [LOCK]: "a\n" },
    { [PKG]: sluice({ "@duckdb/node-api": "~2.0.0-r", axios: "catalog:" }), [LOCK]: "b\n" },
    "the #210 diff",
  );
});

test("lockfile-only change (Renovate in-range update / lockFileMaintenance)", () => {
  exempt({ [PKG]: sluice({ pino: "^10.0.0" }), [LOCK]: "a\n" }, { [LOCK]: "b\n" }, "lockfile only");
});

test("devDependency major in a published package", () => {
  exempt(
    { [PKG]: sluice({ pino: "^10.0.0" }) },
    { [PKG]: sluice({ pino: "^10.0.0" }, { devDependencies: { vitest: "^5.0.0" } }) },
    "devDependencies are not consumer-visible",
  );
});

test("in-range dependency floor bump (rangeStrategy: bump)", () => {
  exempt({ [PKG]: sluice({ pg: "^8.20.0" }) }, { [PKG]: sluice({ pg: "^8.21.0" }) }, "^8.20 -> ^8.21");
  exempt({ [PKG]: sluice({ pg: "~8.20.0" }) }, { [PKG]: sluice({ pg: "~8.20.4" }) }, "~8.20.0 -> ~8.20.4");
  exempt({ [PKG]: sluice({ z: "^0.3.1" }) }, { [PKG]: sluice({ z: "^0.3.5" }) }, "^0.3.1 -> ^0.3.5");
});

test("dependency reordering only", () => {
  exempt(
    { [PKG]: sluice({ a: "^1.0.0", b: "^2.0.0" }) },
    { [PKG]: sluice({ b: "^2.0.0", a: "^1.0.0" }) },
    "reorder",
  );
});

test("dependency range moved out of what the published range allows", () => {
  required({ [PKG]: sluice({ pg: "~8.20.0" }) }, { [PKG]: sluice({ pg: "~8.21.0" }) }, "tilde minor");
  required({ [PKG]: sluice({ z: "^0.3.1" }) }, { [PKG]: sluice({ z: "^0.4.0" }) }, "0.x caret minor");
  required({ [PKG]: sluice({ x: "1.2.3" }) }, { [PKG]: sluice({ x: "1.2.4" }) }, "exact pin");
  // data-gubbins#186: a prerelease satisfies a range only within the same x.y.z.
  required(
    { [PKG]: sluice({ "@duckdb/node-api": "~1.5.5-r.4" }) },
    { [PKG]: sluice({ "@duckdb/node-api": "~1.5.6-r" }) },
    "prerelease tuple change",
  );
  required(
    { [PKG]: sluice({ x: "^1.0.0 || ^2.0.0" }) },
    { [PKG]: sluice({ x: "^2.0.0 || ^3.0.0" }) },
    "unparsed range falls back to text",
  );
});

test("runtime dependency added or removed", () => {
  required({ [PKG]: sluice({ a: "^1.0.0" }) }, { [PKG]: sluice({ a: "^1.0.0", b: "^1.0.0" }) }, "added");
  required({ [PKG]: sluice({ a: "^1.0.0", b: "^1.0.0" }) }, { [PKG]: sluice({ a: "^1.0.0" }) }, "removed");
});

test("optionalDependencies follow the same reach rule", () => {
  const opt = (r) => sluice({}, { optionalDependencies: { fsevents: r } });
  exempt({ [PKG]: opt("^2.3.0") }, { [PKG]: opt("^2.3.3") }, "in range");
  required({ [PKG]: opt("^2.3.0") }, { [PKG]: opt("^3.0.0") }, "major");
});

test("peerDependencies still fire on any change", () => {
  const peer = (r) => sluice({}, { peerDependencies: { typescript: r } });
  required({ [PKG]: peer(">=5.9.3") }, { [PKG]: peer(">=5.9.3 <8") }, "peer widening");
});

test("private package is never gated", () => {
  exempt(
    { [PKG]: sluice({ a: "^1.0.0" }, { private: true }) },
    { [PKG]: sluice({ a: "^2.0.0" }, { private: true }) },
    "private",
  );
});

test("src/ change still fires on the path pattern", () => {
  required({ [PKG]: sluice(), "packages/sluice/src/a.ts": "a\n" }, { "packages/sluice/src/a.ts": "b\n" }, "src");
});
