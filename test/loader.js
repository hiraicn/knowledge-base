/**
 * test/loader.js — 模拟浏览器环境,在 Node.js 中加载 kb-engine.js
 *
 * kb-engine.js 使用浏览器 IIFE 模式(var KBEngine = ...),依赖全局 TAXONOMY。
 * 本文件提供 mock 的 chrome / self / TurndownService,然后用 vm.runInThisContext
 * 加载 taxonomy.js 和 kb-engine.js,使其 var 声明变成全局变量。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ─── 模拟浏览器全局对象 ───

global.self = global;

// chrome.storage.local 模拟(回调风格)
var _storage = {};
global.chrome = {
  storage: {
    local: {
      get: function (keys, callback) {
        var result = {};
        if (typeof keys === 'string') {
          result[keys] = _storage[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach(function (k) { result[k] = _storage[k]; });
        } else {
          result = Object.assign({}, _storage);
        }
        callback(result);
      },
      set: function (obj, callback) {
        Object.keys(obj).forEach(function (k) { _storage[k] = obj[k]; });
        if (callback) callback();
      },
    },
  },
  scripting: {
    executeScript: async function () { return [{ result: {} }]; },
  },
  tabs: {
    query: async function () { return [{ id: 1 }]; },
  },
};

// TurndownService 模拟(不会被测试调用,但文件加载时需要存在)
global.TurndownService = function () {
  this.turndown = function () { return ''; };
  this.remove = function () {};
  this.addRule = function () {};
};

// ─── 加载 taxonomy.js ───

var taxonomyPath = path.join(__dirname, '..', 'extension', 'lib', 'taxonomy.js');
var taxonomyCode = fs.readFileSync(taxonomyPath, 'utf-8');
vm.runInThisContext(taxonomyCode, { filename: 'taxonomy.js' });

// ─── 加载 kb-engine.js ───

var kbEnginePath = path.join(__dirname, '..', 'extension', 'lib', 'kb-engine.js');
var kbEngineCode = fs.readFileSync(kbEnginePath, 'utf-8');
vm.runInThisContext(kbEngineCode, { filename: 'kb-engine.js' });

// ─── 导出 ───

module.exports = {
  KBEngine: global.KBEngine,
  GistSync: global.GistSync,
  TAXONOMY: global.TAXONOMY,
};
