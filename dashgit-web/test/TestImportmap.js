//The app is not built nor installed: the libraries are loaded from a CDN using the importmap of index.html.
//app/package.json declares the same versions only to let dependabot watch them, but nothing keeps both in sync:
//when a dependabot update lands in app/package.json, the importmap must be updated by hand.
//These tests fail if that manual step is forgotten (in any of the two directions).

import assert from 'assert';
import fs from "fs"

const manifestFile = "../app/package.json";
const indexFile = "../app/index.html";

//Extracts the json inside the <script type="importmap"> element of index.html
function readImportmap(html) {
  let match = /<script\s+type="importmap"\s*>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, `Can't find the importmap in ${indexFile}`);
  return JSON.parse(match[1]);
}

//Maps each importmap entry to the package name and version resolved from the CDN url,
//e.g. https://esm.sh/@octokit/rest@22.0.1 -> { "@octokit/rest": "22.0.1" }
function importmapVersions(importmap) {
  let versions = {};
  for (let url of Object.values(importmap.imports)) {
    let match = /^https:\/\/esm\.sh\/(.+)@([^@/]+)$/.exec(url);
    assert.ok(match, `Importmap url does not pin a version: ${url}`);
    versions[match[1]] = match[2];
  }
  return versions;
}

describe("TestImportmap", async function () {
  describe("App dependency versions declared for dependabot", async function () {
    let manifest = JSON.parse(fs.readFileSync(manifestFile));
    let importmap = importmapVersions(readImportmap(fs.readFileSync(indexFile, "utf8")));

    it("Every dependency of app/package.json is loaded from the importmap at the same version", function () {
      assert.deepEqual(manifest.dependencies, importmap);
    });

    it("The app manifest is not installed: it must stay private and without lockfile", function () {
      assert.equal(true, manifest.private, "app/package.json must declare private: true");
      assert.equal(false, fs.existsSync("../app/package-lock.json"),
        "app/package-lock.json must not exist: the app is not installed, see the comment in app/package.json");
    });
  });
});
