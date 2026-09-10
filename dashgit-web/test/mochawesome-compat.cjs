"use strict";

// Compatibility wrapper that lets the mochawesome reporter run on Mocha 12.
//
// Mocha 12 rewrote its internals as ES modules, which breaks the CommonJS
// entry points that mochawesome 8 still requires:
//   mocha/lib/utils            -> moved to mocha/lib/utils.cjs
//   mocha/lib/reporters/<name> -> named exports of mocha/lib/reporters/index.cjs
//   mocha/lib/stats-collector  -> named export createStatsCollector
// and the bundled reporters are now ES classes, so mochawesome's
// `Base.call(this, runner)` throws "Class constructor Base cannot be invoked
// without 'new'". Loading the reporter therefore fails with
// ERR_MOCHA_INVALID_REPORTER / MODULE_NOT_FOUND.
//
// This module redirects those specifiers to their Mocha 12 equivalents and
// exposes mochawesome as the reporter. Drop it and go back to
// `--reporter mochawesome` once mochawesome supports Mocha 12:
// https://github.com/adamgruber/mochawesome/issues/427

const Module = require("node:module");

const REPORTERS_PREFIX = "mocha/lib/reporters/";

const reporters = require("mocha/lib/reporters/index.cjs");

// Callable stand-in for the Base reporter class: applies the properties set by
// the real constructor (runner, stats, options and the shared failures array)
// onto the mochawesome instance, and inherits its static members.
function CallableBase(runner, options) {
  Object.assign(this, new reporters.Base(runner, options));
}
CallableBase.prototype = reporters.Base.prototype;
Object.setPrototypeOf(CallableBase, reporters.Base);

const originalLoad = Module._load;

Module._load = function (request, ...rest) {
  if (request === "mocha/lib/utils") {
    return originalLoad.call(this, "mocha/lib/utils.cjs", ...rest);
  }
  if (request === "mocha/lib/stats-collector") {
    return originalLoad.call(this, "mocha/lib/stats-collector.js", ...rest)
      .createStatsCollector;
  }
  if (request.startsWith(REPORTERS_PREFIX)) {
    const name = request.slice(REPORTERS_PREFIX.length);
    if (name === "base") {
      return CallableBase;
    }
    if (reporters[name] === undefined) {
      throw new Error(`Unknown mocha reporter '${name}'`);
    }
    return reporters[name];
  }
  return originalLoad.call(this, request, ...rest);
};

// The patch stays installed for the whole run: mochawesome also resolves the
// console reporter lazily, from inside its constructor.
module.exports = require("mochawesome");
