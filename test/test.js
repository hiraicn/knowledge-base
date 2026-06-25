/**
 * test/test.js — 知识库核心函数单元测试
 *
 * 使用 Node.js 内置 assert 模块,无需安装测试框架。
 * 运行: node test/test.js
 *
 * 测试内容:
 *   1. autoTag — 自动分类与标签
 *   2. parseFrontmatter — YAML frontmatter 解析
 *   3. GistSync.mergeArticles — 合并去重
 */

const assert = require('assert');
const { KBEngine, GistSync, TAXONOMY } = require('./loader');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (err) {
    console.log('  ✗ ' + name);
    console.log('    ' + err.message);
    failed++;
  }
}

// ═════════════════════════════════════════════════════════
// 1. autoTag 测试
// ═════════════════════════════════════════════════════════

console.log('\n── autoTag 测试 ──');

test('英文 React 文章应分类为「编程开发」', function () {
  var title = 'Building a React App with Hooks and Context API';
  var content = 'In this tutorial we will build a React application using hooks and the context API. ' +
    'We will cover useState, useEffect, and custom hooks. The project uses webpack and babel for bundling.';
  var result = KBEngine.autoTag(title, content, 'reactjs.org');
  assert.strictEqual(result.category, '编程开发',
    '期望「编程开发」, 实际「' + result.category + '」');
});

test('中文机器学习文章应分类为「人工智能」', function () {
  var title = '深度学习在自然语言处理中的应用';
  var content = '本文介绍深度学习和机器学习在自然语言处理领域的最新进展。' +
    '我们将探讨神经网络模型、transformer架构以及大语言模型的训练方法。' +
    '同时分析人工智能在日常场景中的实际应用。';
  var result = KBEngine.autoTag(title, content, 'mp.weixin.qq.com');
  assert.strictEqual(result.category, '人工智能',
    '期望「人工智能」, 实际「' + result.category + '」');
});

test('"ai" 不应匹配 "train" 中的子串', function () {
  // 这篇关于火车的文章不应被分到「人工智能」
  var title = 'How to Train Your Dog: A Complete Guide';
  var content = 'Training your dog is an important part of pet ownership. ' +
    'This guide covers basic training commands, potty training, and socialization. ' +
    'The train to London departs at noon. Dog training requires patience.';
  var result = KBEngine.autoTag(title, content, 'petguide.com');
  assert.notStrictEqual(result.category, '人工智能',
    '包含 "train" 的文章不应被分到「人工智能」(实际: ' + result.category + ')');
});

test('无匹配关键词时返回「未分类」', function () {
  var title = 'A Random Story About Nothing';
  var content = 'Once upon a time there was a completely ordinary day with nothing special happening at all.';
  var result = KBEngine.autoTag(title, content, 'blog.example.com');
  assert.strictEqual(result.category, '未分类',
    '期望「未分类」, 实际「' + result.category + '」');
});

test('标签数量不超过 8', function () {
  var title = 'JavaScript Python Rust Go Java C++ TypeScript Kotlin 编程语言对比';
  var content = 'This article compares multiple programming languages including JavaScript, Python, ' +
    'Rust, Go, Java, C++, TypeScript, Kotlin, Swift, Ruby, PHP, Scala, and more. ' +
    'We discuss frameworks, libraries, tools, and development workflows.';
  var result = KBEngine.autoTag(title, content, 'dev.to');
  assert.ok(result.tags.length <= 8,
    '标签数量应 ≤ 8, 实际 ' + result.tags.length + ' 个: ' + result.tags.join(', '));
});

test('域名应出现在标签中', function () {
  var title = 'Understanding Kubernetes Networking';
  var content = 'Kubernetes networking allows pods to communicate with each other. ' +
    'We cover services, ingress, network policies, and CNI plugins.';
  var result = KBEngine.autoTag(title, content, 'kubernetes.io');
  assert.ok(result.tags.indexOf('kubernetes.io') !== -1,
    '标签中应包含域名 kubernetes.io, 实际: ' + result.tags.join(', '));
});

// ═════════════════════════════════════════════════════════
// 2. parseFrontmatter 测试
// ═════════════════════════════════════════════════════════

console.log('\n── parseFrontmatter 测试 ──');

test('解析标准 frontmatter', function () {
  var raw = '---\nid: "abc123"\ntitle: "Test Article"\nurl: "https://example.com"\ncategory: "编程开发"\ntags: ["javascript", "web"]\n---\n\nThis is the content.';
  var result = KBEngine.parseFrontmatter(raw);
  assert.strictEqual(result.meta.id, 'abc123');
  assert.strictEqual(result.meta.title, 'Test Article');
  assert.strictEqual(result.meta.url, 'https://example.com');
  assert.strictEqual(result.meta.category, '编程开发');
  assert.deepStrictEqual(result.meta.tags, ['javascript', 'web']);
  assert.strictEqual(result.content, 'This is the content.');
});

test('解析带引号的值(双引号和单引号)', function () {
  var raw = '---\ntitle: "Hello World"\nauthor: \'John Doe\'\n---\n\nContent here.';
  var result = KBEngine.parseFrontmatter(raw);
  // 外层引号应被去除
  assert.strictEqual(result.meta.title, 'Hello World',
    '双引号值应去除外层引号, 实际: ' + result.meta.title);
  assert.strictEqual(result.meta.author, 'John Doe',
    '单引号值应去除外层引号, 实际: ' + result.meta.author);
});

test('解析行内数组格式 tags', function () {
  var raw = '---\ntags: ["react", "hooks", "javascript"]\n---\n\nContent.';
  var result = KBEngine.parseFrontmatter(raw);
  assert.ok(Array.isArray(result.meta.tags), 'tags 应为数组');
  assert.strictEqual(result.meta.tags.length, 3);
  assert.strictEqual(result.meta.tags[0], 'react');
  assert.strictEqual(result.meta.tags[2], 'javascript');
});

test('无 frontmatter 时返回纯内容', function () {
  var raw = 'This is just plain content without any frontmatter.\n\nSecond paragraph.';
  var result = KBEngine.parseFrontmatter(raw);
  assert.strictEqual(Object.keys(result.meta).length, 0, 'meta 应为空对象');
  assert.ok(result.content.indexOf('plain content') !== -1, 'content 应保留原文');
});

test('解析多行数组格式(- item)', function () {
  var raw = '---\ntags:\n  - python\n  - data-science\n  - machine-learning\n---\n\nContent.';
  var result = KBEngine.parseFrontmatter(raw);
  assert.ok(Array.isArray(result.meta.tags), 'tags 应为数组');
  assert.strictEqual(result.meta.tags.length, 3);
  assert.strictEqual(result.meta.tags[0], 'python');
  assert.strictEqual(result.meta.tags[2], 'machine-learning');
});

test('值中包含冒号时正确分割', function () {
  var raw = '---\nurl: "https://example.com:8080/path"\n---\n\nContent.';
  var result = KBEngine.parseFrontmatter(raw);
  assert.ok(result.meta.url.indexOf('https://example.com') !== -1,
    'URL 中的冒号不应被截断, 实际: ' + result.meta.url);
});

// ═════════════════════════════════════════════════════════
// 3. GistSync.mergeArticles 测试
// ═════════════════════════════════════════════════════════

console.log('\n── GistSync.mergeArticles 测试 ──');

test('URL 相同的文章去重', function () {
  var local = [
    { id: '1', title: 'Article A', url: 'https://a.com', created: '2024-01-01T00:00:00Z' },
    { id: '2', title: 'Article B', url: 'https://b.com', created: '2024-01-02T00:00:00Z' },
  ];
  var remote = [
    { id: '1', title: 'Article A (Updated)', url: 'https://a.com', created: '2024-01-01T00:00:00Z' },
    { id: '3', title: 'Article C', url: 'https://c.com', created: '2024-01-03T00:00:00Z' },
  ];
  var merged = GistSync.mergeArticles(local, remote);
  assert.strictEqual(merged.length, 3, '合并后应有 3 篇文章(URL去重), 实际 ' + merged.length);
});

test('无 URL 的文章按标题去重', function () {
  var local = [
    { id: '1', title: 'No URL Article', url: '', created: '2024-01-01T00:00:00Z' },
  ];
  var remote = [
    { id: '2', title: 'No URL Article', url: '', created: '2024-01-02T00:00:00Z' },
    { id: '3', title: 'Different Article', url: '', created: '2024-01-03T00:00:00Z' },
  ];
  var merged = GistSync.mergeArticles(local, remote);
  assert.strictEqual(merged.length, 2, '合并后应有 2 篇文章(标题去重), 实际 ' + merged.length);
});

test('remote 优先于 local(相同 URL 时保留 remote 版本)', function () {
  var local = [
    { id: '1', title: 'Local Version', url: 'https://same.com', created: '2024-01-01T00:00:00Z' },
  ];
  var remote = [
    { id: '2', title: 'Remote Version', url: 'https://same.com', created: '2024-01-01T00:00:00Z' },
  ];
  var merged = GistSync.mergeArticles(local, remote);
  assert.strictEqual(merged.length, 1, '应只剩 1 篇');
  assert.strictEqual(merged[0].title, 'Remote Version',
    '应保留 remote 版本, 实际: ' + merged[0].title);
});

test('按 created 日期降序排序', function () {
  var local = [
    { id: '1', title: 'Old', url: 'https://old.com', created: '2024-01-01T00:00:00Z' },
  ];
  var remote = [
    { id: '2', title: 'New', url: 'https://new.com', created: '2024-06-01T00:00:00Z' },
    { id: '3', title: 'Mid', url: 'https://mid.com', created: '2024-03-01T00:00:00Z' },
  ];
  var merged = GistSync.mergeArticles(local, remote);
  assert.strictEqual(merged[0].title, 'New', '第一条应是最新的');
  assert.strictEqual(merged[2].title, 'Old', '最后一条应是最旧的');
});

// ═════════════════════════════════════════════════════════
// 结果汇总
// ═════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════════');
console.log('  结果: ' + passed + ' 通过, ' + failed + ' 失败');
console.log('════════════════════════════════════════════════');

if (failed > 0) {
  process.exit(1);
}
