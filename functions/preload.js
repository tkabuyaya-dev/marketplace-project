/**
 * NUNULIA — Module preload for Firebase CLI deployment
 *
 * Loaded via NODE_OPTIONS="--require ./preload.js" BEFORE the Firebase CLI
 * discovery subprocess starts. Patches Module._load to defer loading of
 * firebase-admin (which takes 10+ seconds on Node 24).
 *
 * Without this, the Firebase CLI's discovery subprocess loads firebase-functions
 * from node_modules, which internally requires firebase-admin, exceeding the
 * 10-second discovery timeout.
 */
"use strict";

const Module = require("module");
const origLoad = Module._load;
const proxyCache = {};
const loadingFlag = {};

function makeDeepProxy(moduleName, parent, isMain) {
  let real = null;
  function loadReal() {
    if (!real) {
      loadingFlag[moduleName] = true;
      real = origLoad.call(Module, moduleName, parent, isMain);
      delete loadingFlag[moduleName];
    }
    return real;
  }
  function mkProxy(getFn) {
    return new Proxy(function () {}, {
      get(_, key) {
        if (key === "__esModule") return true;
        if (key === "then") return undefined;
        if (typeof key === "symbol") return undefined;
        return mkProxy(function () { return getFn()[key]; });
      },
      apply(_, thisArg, args) { return getFn().apply(thisArg, args); },
      construct(_, args, newTarget) { return Reflect.construct(getFn(), args, newTarget); },
      ownKeys() { return Reflect.ownKeys(getFn()); },
      getOwnPropertyDescriptor(_, key) { return Object.getOwnPropertyDescriptor(getFn(), key); },
      has(_, key) { return key in getFn(); },
    });
  }
  return mkProxy(loadReal);
}

Module._load = function (request, parent, isMain) {
  if (request === "firebase-admin" || request.startsWith("firebase-admin/")) {
    if (!proxyCache[request]) {
      proxyCache[request] = makeDeepProxy(request, parent, isMain);
    }
    if (!loadingFlag[request]) return proxyCache[request];
  }
  return origLoad.call(Module, request, parent, isMain);
};
