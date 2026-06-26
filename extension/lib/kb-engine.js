/**
 * kb-engine.js — 知识库共享引擎 (v3 — 智能化)
 * 在 popup、background、kb-page 中均可加载
 * 依赖:先加载 lib/taxonomy.js(提供全局 DEFAULT_TAXONOMY)
 * 包含:TF-IDF 自动标签、自定义分类管理、提取式摘要、双向引用、页面提取、文章捕获
 */

var KBEngine = (function () {
  'use strict';

  // DEFAULT_TAXONOMY 由 taxonomy.js 提供(全局变量)
  var DEFAULT_TAX = (typeof DEFAULT_TAXONOMY !== 'undefined') ? DEFAULT_TAXONOMY
                : (typeof TAXONOMY !== 'undefined') ? TAXONOMY : null;

  // ─── 自定义分类管理 ───
  function getTaxonomy() {
    return new Promise(function (resolve) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve(DEFAULT_TAX || {});
        return;
      }
      chrome.storage.local.get('kb_settings', function (result) {
        var settings = result.kb_settings;
        if (settings && settings.categories && Object.keys(settings.categories).length > 0) {
          resolve(settings.categories);
        } else {
          resolve(DEFAULT_TAX || {});
        }
      });
    });
  }

  function saveTaxonomy(categories) {
    return new Promise(function (resolve) {
      chrome.storage.local.get('kb_settings', function (result) {
        var settings = result.kb_settings || {};
        settings.categories = categories;
        settings.version = (settings.version || 0) + 1;
        chrome.storage.local.set({ kb_settings: settings }, function () { resolve(); });
      });
    });
  }

  function resetTaxonomy() {
    return new Promise(function (resolve) {
      chrome.storage.local.get('kb_settings', function (result) {
        var settings = result.kb_settings || {};
        delete settings.categories;
        chrome.storage.local.set({ kb_settings: settings }, function () { resolve(); });
      });
    });
  }

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

  // ─── TF-IDF 计算 ───

  // 计算关键词在分类体系中的 IDF 值
  // IDF 越高说明该关键词的区分度越强
  function computeIDF(taxonomy) {
    var idf = {};
    var totalCats = Object.keys(taxonomy).length;
    if (totalCats === 0) return idf;

    for (var cat in taxonomy) {
      if (!taxonomy.hasOwnProperty(cat)) continue;
      var keywords = taxonomy[cat];
      for (var i = 0; i < keywords.length; i++) {
        var kw = keywords[i].toLowerCase();
        if (!idf[kw]) idf[kw] = { catCount: 0, cats: [] };
        if (idf[kw].cats.indexOf(cat) === -1) {
          idf[kw].catCount++;
          idf[kw].cats.push(cat);
        }
      }
    }

    for (var kw2 in idf) {
      if (!idf.hasOwnProperty(kw2)) continue;
      idf[kw2] = Math.log(totalCats / idf[kw2].catCount);
    }
    return idf;
  }

  // 简单分词:中文按标点/空格切分 + 2-gram,英文按词边界
  function tokenize(text) {
    return text.toLowerCase()
      .split(/[\s,，。、；;：:!！?？()（）\[\]{}<>《》""''`~@#$%^&*+=|\\/]+/)
      .filter(function (w) { return w.length >= 2; });
  }

  // ─── TF-IDF 自动打标签 ───
  function autoTagWithTaxonomy(title, content, domain, taxonomy) {
    var fullText = (title + ' ' + content).toLowerCase();
    var titleText = title.toLowerCase();
    var tokens = tokenize(fullText);
    var totalWords = Math.max(tokens.length, 1);
    var idf = computeIDF(taxonomy);

    // 对每个分类计算 TF-IDF 得分
    var scores = {};
    for (var cat in taxonomy) {
      if (!taxonomy.hasOwnProperty(cat)) continue;
      var keywords = taxonomy[cat];
      var score = 0;

      for (var i = 0; i < keywords.length; i++) {
        var kw = keywords[i].toLowerCase();
        var kwIdf = idf[kw] || 0;
        if (kwIdf === 0) continue; // 该关键词出现在所有分类中,无区分度

        // TF: 关键词在全文中的频率
        var tf = countKeyword(fullText, kw) / totalWords;

        // 标题加权: 标题中出现的关键词给予 3x 加成
        var titleBoost = countKeyword(titleText, kw) > 0 ? 3 : 1;

        score += tf * kwIdf * titleBoost;
      }

      if (score > 0) scores[cat] = score;
    }

    // 排序取前 2 个分类
    var sorted = Object.keys(scores).sort(function (a, b) {
      return scores[b] - scores[a];
    }).slice(0, 2);

    if (sorted.length === 0) sorted.push('未分类');

    // 构建标签(最多 8 个)
    var tags = [];
    var tagSet = {};

    // 1. 分类名作为标签
    sorted.forEach(function (c) {
      if (!tagSet[c]) { tagSet[c] = true; tags.push(c); }
    });

    // 2. 域名作为标签
    if (domain) {
      if (!tagSet[domain]) { tagSet[domain] = true; tags.push(domain); }
    }

    // 3. 标题关键词(长度 >= 2 的词)
    var titleWords = title.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(function (w) { return w.length >= 2; });
    titleWords.slice(0, 3).forEach(function (w) {
      if (!tagSet[w]) { tagSet[w] = true; tags.push(w); }
    });

    // 4. 匹配到的 top 分类关键词(按 TF-IDF 得分排序)
    var topCat = sorted[0];
    if (taxonomy[topCat]) {
      var kwScores = [];
      taxonomy[topCat].forEach(function (kw) {
        var kwLower = kw.toLowerCase();
        var kwIdf = idf[kwLower] || 0;
        if (kwIdf > 0 && countKeyword(fullText, kwLower) > 0) {
          kwScores.push({ kw: kw, score: kwIdf });
        }
      });
      kwScores.sort(function (a, b) { return b.score - a.score; });
      kwScores.slice(0, 3).forEach(function (item) {
        if (!tagSet[item.kw]) { tagSet[item.kw] = true; tags.push(item.kw); }
      });
    }

    return { category: sorted[0], tags: tags.slice(0, 8) };
  }

  // 异步版本:自动从存储中加载分类体系
  function autoTag(title, content, domain) {
    return getTaxonomy().then(function (taxonomy) {
      return autoTagWithTaxonomy(title, content, domain, taxonomy);
    });
  }

  // ─── 纯提取式自动摘要 ───
  function generateSummary(content, tags) {
    if (!content || content.length < 50) return '';

    // 按句号/问号/感叹号/段落分割为句子
    var sentences = content
      .split(/(?<=[。！？.!?\n])\s*/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length >= 10; });

    if (sentences.length === 0) return '';

    // 提取标签中的关键词(排除分类名和域名)
    var keywords = (tags || []).filter(function (t) {
      return t.length >= 2 && !/\.|com|net|org|cn|io/.test(t);
    });

    // 对每个句子评分
    var scored = sentences.map(function (sentence, index) {
      var score = 0;

      // 位置权重:越靠前越重要
      if (index === 0) score += 3;
      else if (index === 1) score += 2;
      else if (index === 2) score += 1.5;
      else if (index < 6) score += 0.5;

      // 关键词密度:包含标签关键词越多越好
      keywords.forEach(function (kw) {
        if (sentence.toLowerCase().indexOf(kw.toLowerCase()) !== -1) {
          score += 1;
        }
      });

      // 长度惩罚:过短或过长的句子降权
      if (sentence.length < 15) score *= 0.5;
      else if (sentence.length > 200) score *= 0.7;

      return { sentence: sentence, score: score, index: index };
    });

    // 取 top-3 句子,按原文顺序排列
    scored.sort(function (a, b) { return b.score - a.score; });
    var topSentences = scored.slice(0, 3).sort(function (a, b) { return a.index - b.index; });

    var summary = topSentences.map(function (s) { return s.sentence; }).join('');

    // 限制 150 字
    if (summary.length > 150) {
      summary = summary.slice(0, 147) + '...';
    }

    return summary;
  }

  // ─── 双向引用提取 ───
  function extractReferences(content, articleUrl, existingArticles) {
    // 从 Markdown 内容中提取所有链接
    var linkRegex = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
    var htmlLinkRegex = /href=["'](https?:\/\/[^"']+)["']/gi;

    var urls = new Set();
    var match;

    while ((match = linkRegex.exec(content)) !== null) {
      urls.add(match[2]);
    }
    while ((match = htmlLinkRegex.exec(content)) !== null) {
      urls.add(match[1]);
    }

    // 匹配已有文章的 URL
    var references = [];
    var urlToId = {};
    existingArticles.forEach(function (a) {
      if (a.url) urlToId[a.url] = a.id;
    });

    urls.forEach(function (url) {
      // 精确匹配
      if (urlToId[url] && url !== articleUrl) {
        references.push(urlToId[url]);
        return;
      }
      // 模糊匹配(去除末尾斜杠、fragment、query)
      var normalizedUrl = url.replace(/\/$/, '').replace(/[#?].*$/, '');
      existingArticles.forEach(function (a) {
        if (!a.url) return;
        var normalizedAUrl = a.url.replace(/\/$/, '').replace(/[#?].*$/, '');
        if (normalizedUrl === normalizedAUrl && url !== articleUrl) {
          if (references.indexOf(a.id) === -1) references.push(a.id);
        }
      });
    });

    return references;
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
    DEFAULT_TAXONOMY: DEFAULT_TAX || (typeof DEFAULT_TAXONOMY !== 'undefined' ? DEFAULT_TAXONOMY : {}),
    getTaxonomy: getTaxonomy,
    saveTaxonomy: saveTaxonomy,
    resetTaxonomy: resetTaxonomy,
    autoTag: autoTag,
    autoTagWithTaxonomy: autoTagWithTaxonomy,
    countKeyword: countKeyword,
    computeIDF: computeIDF,
    tokenize: tokenize,
    generateSummary: generateSummary,
    extractReferences: extractReferences,
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
  var tagResult = await KBEngine.autoTag(pageData.title, pageData.markdown, domain);

  // 生成摘要
  var summary = KBEngine.generateSummary(pageData.markdown, tagResult.tags);

  var storage = await chrome.storage.local.get('kb_articles');
  var articles = storage.kb_articles || [];

  // 提取双向引用
  var references = KBEngine.extractReferences(pageData.markdown, pageData.url, articles);

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
    summary: summary,
    references: references,
    referencedBy: [],
    created: new Date().toISOString(),
    published: pageData.publishTime || '',
  };

  // 重复检测
  var dup = articles.find(function (a) { return a.url === article.url; });
  if (dup) {
    return { success: true, duplicate: true, article: dup };
  }

  // 更新已有文章的 referencedBy(双向引用)
  var modified = false;
  references.forEach(function (refId) {
    var refArticle = articles.find(function (a) { return a.id === refId; });
    if (refArticle) {
      if (!refArticle.referencedBy) refArticle.referencedBy = [];
      if (refArticle.referencedBy.indexOf(article.id) === -1) {
        refArticle.referencedBy.push(article.id);
        modified = true;
      }
    }
  });

  // 反向查找:已有文章中是否有链接到当前 URL 的
  articles.forEach(function (a) {
    if (a.id === article.id) return;
    if (!a.references) return;
    // 检查该文章的内容是否包含当前文章的 URL
    if (a.content && a.content.indexOf(pageData.url) !== -1) {
      if (a.references.indexOf(article.id) === -1) {
        a.references.push(article.id);
        modified = true;
      }
      if (article.referencedBy.indexOf(a.id) === -1) {
        article.referencedBy.push(a.id);
      }
    }
  });

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

    // 获取自定义分类设置
    var settingsData = null;
    try {
      var settingsResult = await new Promise(function (resolve) {
        chrome.storage.local.get('kb_settings', function (r) { resolve(r); });
      });
      if (settingsResult.kb_settings) {
        settingsData = settingsResult.kb_settings;
      }
    } catch (e) { /* ignore */ }

    var payload = JSON.stringify({
      version: 2,
      exported: new Date().toISOString(),
      count: articles.length,
      articles: articles,
    });

    var files = { 'knowledge-base.json': { content: payload } };

    // 如果有自定义分类,一并同步
    if (settingsData && settingsData.categories) {
      files['kb-settings.json'] = {
        content: JSON.stringify(settingsData),
      };
    }

    var body = {
      description: '知识库同步数据 · ' + articles.length + ' 篇文章',
      public: false,
      files: files,
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
    var gistFiles = data.files || {};

    // 解析文章数据
    var articleFile = gistFiles['knowledge-base.json'];
    if (!articleFile) throw new Error('Gist 中未找到知识库数据文件');

    var parsed = JSON.parse(articleFile.content);

    // 解析自定义分类设置
    var settingsFile = gistFiles['kb-settings.json'];
    if (settingsFile) {
      try {
        var remoteSettings = JSON.parse(settingsFile.content);
        if (remoteSettings.categories) {
          await new Promise(function (resolve) {
            chrome.storage.local.set({ kb_settings: remoteSettings }, function () { resolve(); });
          });
        }
      } catch (e) { /* ignore parse error */ }
    }

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
