/**
 * kb-engine.js — 知识库共享引擎
 * 在 popup、background、kb-page 中均可加载
 * 包含:分类法、自动标签、页面提取函数
 */

var KBEngine = (function () {
  'use strict';

  // ─── 自动标签分类法 ───
  var TAXONOMY = {
    '人工智能': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning',
      'neural network', 'gpt', 'llm', 'transformer', 'chatgpt', 'openai', 'claude',
      'diffusion', 'stable diffusion', 'midjourney', 'embedding', 'rag',
      '大模型', '人工智能', '机器学习', '深度学习', '神经网络', '自然语言处理', 'nlp',
      '计算机视觉', '大语言模型', '微调', 'fine-tune', 'prompt', 'token',
      'hugging face', 'langchain', 'vector database', '向量数据库'],
    '编程开发': ['programming', 'code', 'coding', 'software', 'developer', 'software engineer',
      'javascript', 'python', 'rust', 'golang', 'java', 'c++', 'c#', 'typescript',
      'react', 'vue', 'angular', 'svelte', 'node', 'node.js', 'deno', 'bun',
      'api', 'rest', 'graphql', 'grpc', 'git', 'github', 'gitlab',
      'docker', 'kubernetes', 'k8s', 'ci/cd', 'devops', 'linux', 'shell', 'bash',
      '编程', '代码', '开发', '程序员', '前端', '后端', '全栈', '框架',
      '编译', '调试', '重构', '设计模式', '开源', '敏捷开发'],
    '数据库': ['sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
      'database', 'dbms', 'sqlite', 'supabase', 'prisma', '数据库', '索引', '事务'],
    '云计算': ['aws', 'azure', 'gcp', 'cloud', 'serverless', 'lambda', 'edge',
      'cdn', 'saas', 'paas', 'iaas', 'vercel', 'cloudflare', 'netlify',
      '云', '云计算', '云服务', '容器', '微服务'],
    '科学': ['science', 'physics', 'biology', 'chemistry', 'mathematics', 'math',
      'research', 'paper', 'study', 'experiment', 'theory',
      '科学', '物理', '生物', '化学', '数学', '研究', '论文', '实验',
      '量子', '基因', '相对论', '神经科学'],
    '商业': ['business', 'startup', 'market', 'finance', 'economic', 'investment',
      'venture', 'capital', 'revenue', 'profit', 'b2b', 'b2c',
      '商业模式', '创业', '市场', '金融', '经济', '投资', '融资', '营收', '上市', '并购'],
    '产品': ['product', 'pm', 'product manager', 'product design', 'feature',
      'roadmap', 'user story', 'prd', 'mvp',
      '产品', '产品经理', '产品设计', '功能', '需求', '路线图', '用户研究'],
    '设计': ['design', 'ui', 'ux', 'user experience', 'graphic', 'typography',
      'figma', 'sketch', 'photoshop', 'illustrator', 'color', 'layout',
      '设计', '界面设计', '用户体验', '视觉', '配色', '排版', '交互设计', '设计系统', '原型'],
    '科技': ['technology', 'tech', 'gadget', 'device', 'hardware', 'chip',
      'semiconductor', 'smartphone', 'ar', 'vr', 'xr',
      '科技', '技术', '设备', '硬件', '芯片', '半导体', '智能设备'],
    '教育': ['education', 'learning', 'tutorial', 'course', 'teach', 'lecture',
      'university', 'student', 'mooc', 'coursera',
      '教育', '学习', '教程', '课程', '教学', '大学', '学生', '培训'],
    '生活': ['life', 'health', 'food', 'travel', 'lifestyle', 'fitness',
      'cooking', 'recipe', 'nutrition', 'sleep', 'exercise',
      '生活', '健康', '美食', '旅行', '健身', '烹饪', '食谱', '营养', '睡眠', '运动'],
    '文化': ['culture', 'art', 'music', 'book', 'film', 'movie', 'literature',
      'poetry', 'painting', 'photography', 'history', 'philosophy',
      '文化', '艺术', '音乐', '书籍', '电影', '文学', '诗歌', '绘画', '摄影', '历史', '哲学', '阅读'],
    '职场': ['career', 'job', 'interview', 'resume', 'salary', 'work',
      '职场', '工作', '面试', '简历', '薪资', '职业规划', '跳槽', '升职'],
    '安全': ['security', 'cybersecurity', 'encryption', 'vulnerability',
      'hack', 'privacy', 'malware', 'firewall',
      '安全', '网络安全', '加密', '漏洞', '黑客', '隐私', '防火墙'],
  };

  // ─── 自动打标签 ───
  function autoTag(title, content, domain) {
    var text = (title + ' ' + content).toLowerCase();
    var scores = {};

    for (var cat in TAXONOMY) {
      if (!TAXONOMY.hasOwnProperty(cat)) continue;
      var keywords = TAXONOMY[cat];
      var score = 0;
      for (var i = 0; i < keywords.length; i++) {
        var kw = keywords[i].toLowerCase();
        var idx = 0;
        while ((idx = text.indexOf(kw, idx)) !== -1) {
          score++;
          idx += kw.length;
        }
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
    if (TAXONOMY[topCat]) {
      TAXONOMY[topCat].filter(function (kw) {
        return text.indexOf(kw.toLowerCase()) !== -1;
      }).slice(0, 3).forEach(function (kw) {
        if (!tagSet[kw]) { tagSet[kw] = true; tags.push(kw); }
      });
    }

    return { category: sorted[0], tags: tags.slice(0, 8) };
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
    TAXONOMY: TAXONOMY,
    autoTag: autoTag,
    detectSource: detectSource,
    getDomain: getDomain,
    generateId: generateId,
  };
})();

// ─── 页面内容提取函数(注入到页面执行) ───
// 此函数通过 chrome.scripting.executeScript({ func: extractPageContent }) 注入
// 依赖:先注入 lib/turndown.js,使 TurndownService 可用
function extractPageContent() {
  var url = window.location.href;
  var isWeChat = url.indexOf('mp.weixin.qq.com') !== -1;

  var pageTitle = document.title;
  var author = '';
  var publishTime = '';
  var contentHtml = '';

  if (isWeChat) {
    // 微信公众号
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
    // 通用网页
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

  // HTML → Markdown
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

  // 推送:将本地文章上传到 Gist
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

  // 拉取:从 Gist 下载文章
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

  // 合并:本地 + 远程,按 URL 去重
  function mergeArticles(local, remote) {
    var merged = [];
    var seen = {};

    // 先加远程(云端数据优先)
    remote.forEach(function (a) {
      var key = (a.url && a.url.length > 0) ? a.url : ('title::' + a.title);
      if (!seen[key]) { seen[key] = true; merged.push(a); }
    });

    // 再加本地中远程没有的
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
