/**
 * kb-engine.js — 知识库共享引擎
 * 在 popup、background、kb-page 中均可加载
 * 依赖:先加载 lib/taxonomy.js(提供全局 TAXONOMY)
 * 包含:自动标签、页面提取函数、YAML解析、文章捕获
 */

var KBEngine = (function () {
  'use strict';

  // TAXONOMY 由 taxonomy.js 提供(全局变量)
  var TAX = (typeof TAXONOMY !== 'undefined') ? TAXONOMY : null;

  // ─── 关键词计数(英文用词边界,中文用 indexOf) ───
  function countKeyword(text, kw) {
    if (/[\u4e00-\u9fff]/.test(kw)) {
      var count = 0, idx = 0;
      while ((idx = text.indexOf(kw, idx)) !== -1) { count++; idx += kw.length; }
      return count;
    } else {
      var re = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      var m = text.match(re);
      return m ? m.length : 0;
    }
  }

  // ─── 自动打标签 ───
  function autoTag(title, content, domain) {
    var text = (title + ' ' + content).toLowerCase();
    var scores = {};

    var tax = TAX || TAXONOMY;
    for (var cat in tax) {
      if (!tax.hasOwnProperty(cat)) continue;
      var keywords = tax[cat];
      var score = 0;
      for (var i = 0; i < keywords.length; i++) {
        score += countKeyword(text, keywords[i].toLowerCase());
      }
      if (score > 0) scores[cat] = score;
    }

    var sorted = Object.keys(scores).sort(function (a, b) {
      return scores[b] - scores[a];
    }).slice(0, 2);

    if (sorted.length === 0) sorted.push('未分类');

    var tags = [];
    var tagSet = {};

    sorted.forEach(function (c) {
      if (!tagSet[c]) { tagSet[c] = true; tags.push(c); }
    });
    if (domain) {
      if (!tagSet[domain]) { tagSet[domain] = true; tags.push(domain); }
    }

    // 标题关键词
    var titleWords = title.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(function (w) { return w.length >= 2; });
    titleWords.slice(0, 3).forEach(function (w) {
      if (!tagSet[w]) { tagSet[w] = true; tags.push(w); }
    });

    // 高频分类关键词
    var topCat = sorted[0];
    if (tax[topCat]) {
      tax[topCat].filter(function (kw) {
        return countKeyword(text, kw.toLowerCase()) > 0;
      }).slice(0, 3).forEach(function (kw) {
        if (!tagSet[kw]) { tagSet[kw] = true; tags.push(kw); }
      });
    }

    return { category: sorted[0], tags: tags.slice(0, 8) };
  }

  // ─── YAML Frontmatter 解析(增强版) ───
  function parseFrontmatter(raw) {
    var meta = {};
    var content = raw;

    var fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (fmMatch) {
      var fm = fmMatch[1];
      content = fmMatch[2].trim();
      var lines = fm.split('\n');
      var i = 0;
      while (i < lines.length) {
        var line = lines[i];
        if (!line.trim() || line.trim().indexOf('#') === 0) { i++; continue; }

        var colonIdx = line.indexOf(':');
        if (colonIdx === -1) { i++; continue; }

        var key = line.slice(0, colonIdx).trim();
        var val = line.slice(colonIdx + 1).trim();

        // 多行字符串 (| 或 >)
        if (val === '|' || val === '>') {
          var multiLine = [];
          i++;
          while (i < lines.length && (/^\s+/.test(lines[i]) || lines[i].trim() === '')) {
            multiLine.push(lines[i]);
            i++;
          }
          meta[key] = multiLine.join('\n').trim();
          continue;
        }

        // 多行数组 (- item 格式)
        if (val === '' && i + 1 < lines.length && /^\s*-\s/.test(lines[i + 1])) {
          var arr = [];
          i++;
          while (i < lines.length && /^\s*-\s/.test(lines[i])) {
            var item = lines[i].replace(/^\s*-\s*/, '').trim();
            arr.push(stripQuotes(item));
            i++;
          }
          meta[key] = arr;
          continue;
        }

        // 行内数组 [a, b, c]
        if (val.charAt(0) === '[' && val.charAt(val.length - 1) === ']') {
          var inner = val.slice(1, -1);
          meta[key] = inner.split(',').map(function (s) {
            return stripQuotes(s.trim());
          }).filter(Boolean);
          i++;
          continue;
        }

        // 普通值
        meta[key] = stripQuotes(val);
        i++;
      }
    }

    return { meta: meta, content: content };
  }

  function stripQuotes(val) {
    if (typeof val !== 'string') return val;
    if ((val.charAt(0) === '"' && val.charAt(val.length - 1) === '"') ||
        (val.charAt(0) === "'" && val.charAt(val.length - 1) === "'")) {
      return val.slice(1, -1);
    }
    return val;
  }

  // ─── 工具函数 ───
  function detectSource(url) {
    if (url.indexOf('mp.weixin.qq.com') !== -1) return 'wechat';
    return 'web';
  }

  function getDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      return '';
    }
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    TAXONOMY: TAX || (typeof TAXONOMY !== 'undefined' ? TAXONOMY : {}),
    autoTag: autoTag,
    countKeyword: countKeyword,
    parseFrontmatter: parseFrontmatter,
    detectSource: detectSource,
    getDomain: getDomain,
    generateId: generateId,
  };
})();

// ─── 页面内容提取函数(注入到页面执行) ───
function extractPageContent() {
  var url = window.location.href;
  var isWeChat = url.indexOf('mp.weixin.qq.com') !== -1;

  var pageTitle = document.title;
  var author = '';
  var publishTime = '';
  var contentHtml = '';

  if (isWeChat) {
    var nameEl = document.querySelector('#activity-name');
    if (nameEl) pageTitle = nameEl.textContent.trim();
    var accEl = document.querySelector('#js_name');
    if (accEl) author = accEl.textContent.trim();
    var timeEl = document.querySelector('#publish_time');
    if (timeEl) publishTime = timeEl.textContent.trim();
    var cEl = document.querySelector('#js_content') || document.querySelector('.rich_media_content');
    if (cEl) {
      var c = cEl.cloneNode(true);
      c.querySelectorAll('script, style, nav, iframe').forEach(function (e) { e.remove(); });
      contentHtml = c.innerHTML;
    }
  } else {
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) pageTitle = ogTitle.content.trim();
    var metaAuthor = document.querySelector('meta[name="author"]') || document.querySelector('meta[property="article:author"]');
    if (metaAuthor && metaAuthor.content) author = metaAuthor.content.trim();

    var selectors = ['article', 'main', '.post-content', '.article-content', '.entry-content',
      '.article-body', '.post-body', '#article', '#content', '.content', '.markdown-body', '.rst-content'];
    var found = null;
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.innerText.trim().length > 200) { found = el; break; }
    }

    if (!found) {
      var maxText = 0;
      var divs = document.querySelectorAll('div, section');
      for (var j = 0; j < divs.length; j++) {
        var d = divs[j];
        var t = d.innerText.trim();
        if (t.length > maxText) {
          var cls = (d.className || '') + ' ' + (d.id || '');
          if (!/nav|footer|header|sidebar|comment|menu/i.test(cls)) {
            maxText = t.length;
            found = d;
          }
        }
      }
    }

    if (!found) found = document.body;
    var clone = found.cloneNode(true);
    clone.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript').forEach(function (e) { e.remove(); });
    contentHtml = clone.innerHTML;
  }

  var markdown = contentHtml;
  if (typeof TurndownService !== 'undefined' && contentHtml) {
    var td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
    td.remove(['script', 'style', 'nav', 'footer', 'header', 'iframe', 'noscript']);
    td.addRule('preserveImages', {
      filter: 'img',
      replacement: function (content, node) {
        var alt = node.getAttribute('alt') || '';
        var src = node.getAttribute('data-src') || node.getAttribute('src') || '';
        if (!src) return '';
        if (src.indexOf('http') !== 0 && src.indexOf('//') === 0) src = 'https:' + src;
        return '\n\n![' + alt + '](' + src + ')\n\n';
      }
    });
    markdown = td.turndown(contentHtml);
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
  }

  return { url: url, title: pageTitle, author: author, publishTime: publishTime, markdown: markdown };
}

// ─── 文章捕获(共享:popup + background 调用) ───
async function extractAndCreateArticle(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['lib/turndown.js'],
  });

  var results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: extractPageContent,
  });

  var pageData = results[0].result;
  if (!pageData || !pageData.markdown) throw new Error('无法提取页面内容');

  var domain = KBEngine.getDomain(pageData.url);
  var source = KBEngine.detectSource(pageData.url);
  var tagResult = KBEngine.autoTag(pageData.title, pageData.markdown, domain);

  var article = {
    id: KBEngine.generateId(),
    title: pageData.title,
    url: pageData.url,
    source: source,
    domain: domain,
    author: pageData.author || '',
    category: tagResult.category,
    tags: tagResult.tags,
    content: pageData.markdown,
    created: new Date().toISOString(),
    published: pageData.publishTime || '',
  };

  var storage = await chrome.storage.local.get('kb_articles');
  var articles = storage.kb_articles || [];

  var dup = articles.find(function (a) { return a.url === article.url; });
  if (dup) {
    return { success: true, duplicate: true, article: dup };
  }

  articles.unshift(article);
  await chrome.storage.local.set({ kb_articles: articles });
  return { success: true, duplicate: false, article: article };
}

// ─── GitHub Gist 同步模块 ───
var GistSync = (function () {
  'use strict';
  var API = 'https://api.github.com/gists';

  function getConfig() {
    return new Promise(function (resolve) {
      chrome.storage.local.get('kb_sync_config', function (result) {
        resolve(result.kb_sync_config || { token: '', gistId: '', lastSync: '' });
      });
    });
  }

  function saveConfig(config) {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ kb_sync_config: config }, function () { resolve(); });
    });
  }

  async function push(articles) {
    var config = await getConfig();
    if (!config.token) throw new Error('未配置 GitHub Token,请在设置中添加');

    var payload = JSON.stringify({
      version: 1,
      exported: new Date().toISOString(),
      count: articles.length,
      articles: articles,
    });

    var body = {
      description: '知识库同步数据 · ' + articles.length + ' 篇文章',
      public: false,
      files: { 'knowledge-base.json': { content: payload } },
    };

    var url = config.gistId ? API + '/' + config.gistId : API;
    var method = config.gistId ? 'PATCH' : 'POST';

    var res = await fetch(url, {
      method: method,
      headers: { 'Authorization': 'Bearer ' + config.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      var err = {};
      try { err = await res.json(); } catch (e) {}
      throw new Error('GitHub API 错误 (' + res.status + '): ' + (err.message || '请求失败'));
    }

    var data = await res.json();
    config.gistId = data.id;
    config.lastSync = new Date().toISOString();
    await saveConfig(config);

    return { gistId: config.gistId, count: articles.length, url: data.html_url };
  }

  async function pull() {
    var config = await getConfig();
    if (!config.token) throw new Error('未配置 GitHub Token,请在设置中添加');
    if (!config.gistId) throw new Error('尚未同步过,请先点击「同步到云端」');

    var res = await fetch(API + '/' + config.gistId, {
      headers: { 'Authorization': 'Bearer ' + config.token },
    });

    if (!res.ok) throw new Error('GitHub API 错误 (' + res.status + '): 无法获取 Gist');

    var data = await res.json();
    var file = data.files && data.files['knowledge-base.json'];
    if (!file) throw new Error('Gist 中未找到知识库数据文件');

    var parsed = JSON.parse(file.content);
    config.lastSync = new Date().toISOString();
    await saveConfig(config);

    return parsed.articles || [];
  }

  function mergeArticles(local, remote) {
    var merged = [];
    var seen = {};

    remote.forEach(function (a) {
      var key = (a.url && a.url.length > 0) ? a.url : ('title::' + a.title);
      if (!seen[key]) { seen[key] = true; merged.push(a); }
    });

    local.forEach(function (a) {
      var key = (a.url && a.url.length > 0) ? a.url : ('title::' + a.title);
      if (!seen[key]) { seen[key] = true; merged.push(a); }
    });

    merged.sort(function (a, b) { return new Date(b.created) - new Date(a.created); });
    return merged;
  }

  return {
    getConfig: getConfig,
    saveConfig: saveConfig,
    push: push,
    pull: pull,
    mergeArticles: mergeArticles,
  };
})();
