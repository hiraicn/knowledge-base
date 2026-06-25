// ─── 全局状态 ───
var VAULT = { articles: [], categories: {}, tags: {}, stats: { total: 0, categories: 0, tags: 0 } };
var currentArticleId = null;

// ─── 搜索倒排索引 ───
var searchIndex = { title: {}, content: {} };
var articleMap = {};

function tokenize(text) {
  return (text || "").toLowerCase().split(/[\s,，。、；;：:!！?？()（）\[\]]+/).filter(function (w) { return w.length >= 2; });
}

function buildSearchIndex(articles) {
  searchIndex = { title: {}, content: {} };
  articleMap = {};
  articles.forEach(function (a) {
    articleMap[a.id] = a;
    tokenize(a.title).forEach(function (w) {
      if (!searchIndex.title[w]) searchIndex.title[w] = [];
      if (searchIndex.title[w].indexOf(a.id) === -1) searchIndex.title[w].push(a.id);
    });
    tokenize(a.content).forEach(function (w) {
      if (!searchIndex.content[w]) searchIndex.content[w] = [];
      if (searchIndex.content[w].indexOf(a.id) === -1) searchIndex.content[w].push(a.id);
    });
  });
}

function searchArticles(query) {
  var words = tokenize(query);
  if (words.length === 0) return [];
  var scores = {};
  words.forEach(function (w) {
    Object.keys(searchIndex.title).forEach(function (idx) {
      if (idx.indexOf(w) !== -1) {
        searchIndex.title[idx].forEach(function (id) { scores[id] = (scores[id] || 0) + 10; });
      }
    });
    Object.keys(searchIndex.content).forEach(function (idx) {
      if (idx.indexOf(w) !== -1) {
        searchIndex.content[idx].forEach(function (id) { scores[id] = (scores[id] || 0) + 1; });
      }
    });
  });
  return Object.keys(scores).sort(function (a, b) { return scores[b] - scores[a]; })
    .map(function (id) { return articleMap[id]; }).filter(Boolean).slice(0, 50);
}

// ─── 从 chrome.storage 加载数据 ───
function loadFromStorage(callback) {
  chrome.storage.local.get("kb_articles", function (result) {
    var articles = result.kb_articles || [];
    articles.sort(function (a, b) { return new Date(b.created) - new Date(a.created); });
    VAULT.articles = articles;

    VAULT.categories = {};
    articles.forEach(function (a) {
      var cat = a.category || "未分类";
      if (!VAULT.categories[cat]) VAULT.categories[cat] = [];
      VAULT.categories[cat].push(a.id);
    });

    VAULT.tags = {};
    articles.forEach(function (a) {
      (a.tags || []).forEach(function (t) {
        if (!VAULT.tags[t]) VAULT.tags[t] = [];
        VAULT.tags[t].push(a.id);
      });
    });

    VAULT.stats = {
      total: articles.length,
      categories: Object.keys(VAULT.categories).length,
      tags: Object.keys(VAULT.tags).length,
    };

    buildSearchIndex(articles);
    callback();
  });
}

// ─── 保存到 chrome.storage ───
function saveToStorage(callback) {
  chrome.storage.local.set({ kb_articles: VAULT.articles }, function () {
    if (callback) callback();
  });
}

// ─── 初始化 ───
function init() {
  loadFromStorage(function () {
    var savedTheme = localStorage.getItem("kb-theme") || "light";
    if (savedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.getElementById("theme-toggle").textContent = "☀️";
    }

    renderSidebar();

    var hash = window.location.hash.slice(1);
    if (hash) {
      showArticle(hash);
    } else if (VAULT.articles.length > 0) {
      showArticle(VAULT.articles[0].id);
    } else {
      showWelcome();
    }
  });

  chrome.storage.onChanged.addListener(function (changes) {
    if (changes.kb_articles) {
      loadFromStorage(function () {
        renderSidebar();
        if (currentArticleId) {
          var stillExists = VAULT.articles.find(function (a) { return a.id === currentArticleId; });
          if (!stillExists) {
            if (VAULT.articles.length > 0) showArticle(VAULT.articles[0].id);
            else showWelcome();
          }
        } else if (VAULT.articles.length === 0) {
          showWelcome();
        }
      });
    }
  });

  window.addEventListener("hashchange", function () {
    var id = window.location.hash.slice(1);
    if (id) showArticle(id);
  });
}

// ─── 渲染侧边栏 ───
function renderSidebar() {
  var tree = document.getElementById("category-tree");
  document.getElementById("article-count").textContent = VAULT.stats.total + " 篇文章";

  if (VAULT.articles.length === 0) {
    tree.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">知识库为空<br>在任意网页点击插件"加入知识库"<br>或将 .md 文件拖入此页面</div>';
    return;
  }

  var html = "";
  var categories = Object.keys(VAULT.categories).sort();

  categories.forEach(function (cat) {
    var ids = VAULT.categories[cat] || [];
    var arts = ids.map(function (id) { return VAULT.articles.find(function (a) { return a.id === id; }); }).filter(Boolean);
    if (arts.length === 0) return;

    html += '<div class="tree-cat">';
    html += '<div class="tree-cat-header">';
    html += '<span class="arrow">▼</span> ' + escapeHtml(cat);
    html += '<span class="count">' + arts.length + '</span>';
    html += '</div>';
    html += '<div class="tree-articles" style="max-height:' + (arts.length * 32) + 'px;">';
    arts.forEach(function (a) {
      html += '<a class="tree-link" href="#' + a.id + '" title="' + escapeHtml(a.title) + '">' + escapeHtml(a.title) + '</a>';
    });
    html += '</div></div>';
  });

  tree.innerHTML = html;
}

function toggleCategory(headerEl) {
  var cat = headerEl.parentElement;
  cat.classList.toggle("collapsed");
  var arts = cat.querySelector(".tree-articles");
  if (!cat.classList.contains("collapsed")) {
    arts.style.maxHeight = arts.querySelectorAll(".tree-link").length * 32 + "px";
  } else {
    arts.style.maxHeight = "0";
  }
}

// ─── 显示文章 ───
function showArticle(articleId) {
  var article = VAULT.articles.find(function (a) { return a.id === articleId; });
  if (!article) { showWelcome(); return; }

  currentArticleId = articleId;
  if (window.location.hash !== "#" + articleId) history.pushState(null, null, "#" + articleId);

  document.querySelectorAll(".tree-link").forEach(function (el) {
    el.classList.toggle("active", el.getAttribute("href") === "#" + articleId);
  });

  var contentHtml = "";
  try { contentHtml = marked.parse(article.content || ""); } catch (e) { contentHtml = "<p>" + escapeHtml(article.content || "") + "</p>"; }

  var html = "";

  // 元信息
  html += '<div class="article-meta">';
  if (article.url) html += '<span class="meta-item">🔗 <a href="' + escapeHtml(article.url) + '" target="_blank">' + escapeHtml(article.domain || "来源") + '</a></span>';
  if (article.author) html += '<span class="meta-item">✍️ ' + escapeHtml(article.author) + '</span>';
  if (article.published) html += '<span class="meta-item">📅 ' + escapeHtml(article.published) + '</span>';
  html += '<span class="meta-item">📂 ' + escapeHtml(article.category) + '</span>';
  html += '<span class="meta-item">📥 ' + (article.source === "wechat" ? "微信公众号" : article.source === "bookmark" ? "收藏夹" : article.source === "import" ? "导入" : "网页") + '</span>';
  html += '<span class="meta-item"><a href="#" data-action="delete" data-id="' + article.id + '" style="color:#d32f2f">🗑️ 删除</a></span>';
  html += '</div>';

  // 标签
  if (article.tags && article.tags.length > 0) {
    html += '<div class="article-tags">';
    article.tags.forEach(function (t) { html += '<span class="tag" data-action="filter-tag" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + '</span>'; });
    html += '</div>';
  }

  // 正文
  html += '<div class="article-content"><h1>' + escapeHtml(article.title) + '</h1>';
  html += contentHtml;
  html += '</div>';

  // 同分类文章
  var related = (VAULT.categories[article.category] || []).filter(function (id) { return id !== articleId; }).slice(0, 5)
    .map(function (id) { return VAULT.articles.find(function (a) { return a.id === id; }); }).filter(Boolean);

  // 上一篇/下一篇
  var idx = VAULT.articles.findIndex(function (a) { return a.id === articleId; });
  var prev = idx > 0 ? VAULT.articles[idx - 1] : null;
  var next = idx >= 0 && idx < VAULT.articles.length - 1 ? VAULT.articles[idx + 1] : null;

  html += '<div class="article-footer">';
  if (related.length > 0) {
    html += '<div class="related"><h4>同分类文章</h4><ul>';
    related.forEach(function (r) { html += '<li><a href="#' + r.id + '">' + escapeHtml(r.title) + '</a></li>'; });
    html += '</ul></div>';
  }
  html += '<div class="nav-buttons">';
  if (prev) {
    html += '<div class="nav-btn" data-action="nav" data-id="' + prev.id + '"><span class="nav-label">← 上一篇</span><span class="nav-title">' + escapeHtml(prev.title) + '</span></div>';
  } else {
    html += '<div></div>';
  }
  if (next) {
    html += '<div class="nav-btn" data-action="nav" data-id="' + next.id + '" style="text-align:right;"><span class="nav-label">下一篇 →</span><span class="nav-title">' + escapeHtml(next.title) + '</span></div>';
  } else {
    html += '<div></div>';
  }
  html += '</div></div>';

  document.getElementById("article-container").innerHTML = html;
  window.scrollTo(0, 0);
  document.getElementById("sidebar").classList.remove("open");
}

// ─── 欢迎页 ───
function showWelcome() {
  currentArticleId = null;
  document.getElementById("article-container").innerHTML =
    '<div class="welcome">' +
    '<h2>📚 个人知识库</h2>' +
    '<p>所有数据保存在浏览器本地存储中,无需服务器。在任意网页点击插件图标加入知识库,或将 .md 文件拖入此页面导入。</p>' +
    '<div class="stats">' +
    '<div class="stat"><div class="stat-num">' + VAULT.stats.total + '</div><div class="stat-label">文章</div></div>' +
    '<div class="stat"><div class="stat-num">' + VAULT.stats.categories + '</div><div class="stat-label">分类</div></div>' +
    '<div class="stat"><div class="stat-num">' + VAULT.stats.tags + '</div><div class="stat-label">标签</div></div>' +
    '</div>' +
    '<div class="guide"><h3>📦 导入已有文章</h3><p>点击工具栏「📂 从文件夹导入」选择 vault 文件夹,或直接将 .md 文件拖入此页面。支持批量导入,自动解析 YAML frontmatter 并重新打标签。</p></div>' +
    '<div class="guide"><h3>☁️ 跨设备同步</h3><p>点击工具栏「☁️ 云端同步」,配置 GitHub Token 后即可在不同浏览器间同步知识库。</p></div>' +
    '</div>';
}

// ─── 删除文章 ───
function deleteArticle(id) {
  if (!confirm("确定删除这篇文章?")) return;
  VAULT.articles = VAULT.articles.filter(function (a) { return a.id !== id; });
  saveToStorage(function () {
    loadFromStorage(function () {
      renderSidebar();
      if (VAULT.articles.length > 0) showArticle(VAULT.articles[0].id);
      else showWelcome();
    });
  });
}

// ─── 搜索(倒排索引,相关性排序) ───
var searchDebounceTimer = null;
function handleSearch(query) {
  var resultsEl = document.getElementById("search-results");
  var treeEl = document.getElementById("category-tree");
  if (!query.trim()) { resultsEl.style.display = "none"; treeEl.style.display = "block"; return; }
  treeEl.style.display = "none";
  resultsEl.style.display = "block";

  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(function () {
    var results = searchArticles(query);
    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="no-results">无匹配结果</div>';
      return;
    }
    var html = "";
    results.slice(0, 20).forEach(function (r) {
      html += '<div class="search-result-item" data-action="search-result" data-id="' + r.id + '">' + escapeHtml(r.title) + '<span class="sr-cat">' + escapeHtml(r.category || "") + '</span></div>';
    });
    if (results.length > 20) html += '<div class="no-results">还有 ' + (results.length - 20) + ' 条结果,输入更多关键词精确搜索</div>';
    resultsEl.innerHTML = html;
  }, 300);
}

function filterByTag(tag) {
  document.getElementById("search-input").value = tag;
  handleSearch(tag);
}

// ─── 主题切换 ───
function toggleTheme() {
  var current = document.documentElement.getAttribute("data-theme");
  if (current === "dark") {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("kb-theme", "light");
    document.getElementById("theme-toggle").textContent = "🌙";
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("kb-theme", "dark");
    document.getElementById("theme-toggle").textContent = "☀️";
  }
}

// ─── Markdown 解析(使用增强版 frontmatter 解析器) ───
function parseMdContent(raw, filename) {
  var article = {
    id: KBEngine.generateId(),
    title: filename.replace(/\.md$/, ""),
    url: "",
    source: "import",
    domain: "",
    author: "",
    category: "",
    tags: [],
    content: "",
    created: new Date().toISOString(),
    published: "",
  };

  var parsed = KBEngine.parseFrontmatter(raw);
  article.content = parsed.content;
  var meta = parsed.meta;

  if (meta.title) article.title = meta.title;
  if (meta.url) article.url = meta.url;
  if (meta.source) article.source = meta.source;
  if (meta.domain) article.domain = meta.domain;
  if (meta.author) article.author = meta.author;
  if (meta.category) article.category = meta.category;
  if (meta.tags && Array.isArray(meta.tags)) article.tags = meta.tags;
  if (meta.created) article.created = meta.created;
  if (meta.published) article.published = meta.published;
  if (meta.id) article.id = meta.id;

  if (!article.category) {
    var r = KBEngine.autoTag(article.title, article.content, article.domain || "");
    article.category = r.category;
    if (article.tags.length === 0) article.tags = r.tags;
  }

  if (article.url && !article.domain) {
    article.domain = KBEngine.getDomain(article.url);
  }

  return article;
}

// ─── 批量导入 .md 文件 ───
function importFiles(files) {
  var mdFiles = [];
  for (var i = 0; i < files.length; i++) {
    if (files[i].name.endsWith(".md")) mdFiles.push(files[i]);
  }

  if (mdFiles.length === 0) { showToast("未选择 .md 文件", "error"); return; }

  loadFromStorage(function () {
    var pending = mdFiles.length;
    var added = 0;
    var skipped = 0;

    mdFiles.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var raw = e.target.result;
        var article = parseMdContent(raw, file.name);

        var dup = VAULT.articles.find(function (a) {
          return (a.url && a.url === article.url) || a.title === article.title;
        });
        if (dup) {
          skipped++;
        } else {
          VAULT.articles.unshift(article);
          added++;
        }

        pending--;
        if (pending === 0) {
          saveToStorage(function () {
            loadFromStorage(function () {
              renderSidebar();
              if (VAULT.articles.length > 0) showArticle(VAULT.articles[0].id);
              showToast("导入完成: 新增 " + added + " 篇, 跳过 " + skipped + " 篇重复", "success");
            });
          });
        }
      };
      reader.onerror = function () { pending--; };
      reader.readAsText(file);
    });
  });
}

// ─── 单文件导入(拖拽用) ───
function importMdFile(file) {
  if (!file.name.endsWith(".md")) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    var article = parseMdContent(e.target.result, file.name);
    var dup = VAULT.articles.find(function (a) {
      return (a.url && a.url === article.url) || a.title === article.title;
    });
    if (dup) { showToast("「" + article.title + "」已存在,跳过", "error"); return; }
    VAULT.articles.unshift(article);
    saveToStorage(function () {
      loadFromStorage(function () {
        renderSidebar();
        showArticle(article.id);
        showToast("已导入: " + article.title, "success");
      });
    });
  };
  reader.readAsText(file);
}

// ─── 导出全部 ───
function exportAll() {
  if (VAULT.articles.length === 0) { showToast("知识库为空", "error"); return; }
  VAULT.articles.forEach(function (a) {
    var md = "---\n";
    md += 'id: "' + a.id + '"\n';
    md += 'title: "' + (a.title || "").replace(/"/g, '\\"') + '"\n';
    md += 'url: "' + (a.url || "") + '"\n';
    md += 'source: "' + (a.source || "") + '"\n';
    md += 'domain: "' + (a.domain || "") + '"\n';
    md += 'author: "' + (a.author || "").replace(/"/g, '\\"') + '"\n';
    md += 'category: "' + (a.category || "") + '"\n';
    md += 'tags: [' + (a.tags || []).map(function (t) { return '"' + t + '"'; }).join(", ") + "]\n";
    md += 'created: "' + (a.created || "") + '"\n';
    md += "---\n\n" + (a.content || "");

    var blob = new Blob([md], { type: "text/markdown" });
    var url = URL.createObjectURL(blob);
    var a2 = document.createElement("a");
    a2.href = url;
    a2.download = (a.created ? a.created.slice(0, 10) : "unknown") + "_" + (a.title || a.id).slice(0, 30).replace(/[^\w\u4e00-\u9fff]/g, "_") + ".md";
    a2.click();
    URL.revokeObjectURL(url);
  });
  showToast("已导出 " + VAULT.articles.length + " 篇文章", "success");
}

// ─── GitHub Gist 同步 ───
function openSyncModal() {
  document.getElementById("sync-modal").style.display = "";
  document.getElementById("sync-status").className = "";
  document.getElementById("sync-status").textContent = "";
  loadSyncConfig();
}

function closeSyncModal() {
  document.getElementById("sync-modal").style.display = "none";
}

async function loadSyncConfig() {
  var config = await GistSync.getConfig();
  document.getElementById("sync-token").value = config.token || "";
  document.getElementById("sync-gistid").value = config.gistId || "";
  if (config.lastSync) {
    var d = new Date(config.lastSync);
    document.getElementById("sync-last").textContent = d.toLocaleString("zh-CN");
  } else {
    document.getElementById("sync-last").textContent = "从未同步";
  }
}

async function saveSyncConfig() {
  var token = document.getElementById("sync-token").value.trim();
  var config = await GistSync.getConfig();
  config.token = token;
  await GistSync.saveConfig(config);
}

async function syncToGist() {
  var statusEl = document.getElementById("sync-status");
  var pushBtn = document.getElementById("syncPushBtn");

  await saveSyncConfig();

  pushBtn.disabled = true;
  pushBtn.textContent = "⏳ 同步中...";
  statusEl.className = "loading";
  statusEl.textContent = "正在上传到 GitHub Gist...";

  try {
    var result = await GistSync.push(VAULT.articles);
    statusEl.className = "success";
    statusEl.innerHTML = "✅ 已同步 " + result.count + " 篇文章到云端<br>Gist: <a href=\"" + result.url + "\" target=\"_blank\">" + result.url + "</a>";

    document.getElementById("sync-gistid").value = result.gistId;
    var d = new Date();
    document.getElementById("sync-last").textContent = d.toLocaleString("zh-CN");

    showToast("☁️ 已同步 " + result.count + " 篇文章到云端", "success");
  } catch (err) {
    statusEl.className = "error";
    statusEl.textContent = "❌ " + err.message;
  } finally {
    pushBtn.disabled = false;
    pushBtn.textContent = "☁️ 同步到云端";
  }
}

async function pullFromGist() {
  var statusEl = document.getElementById("sync-status");
  var pullBtn = document.getElementById("syncPullBtn");

  await saveSyncConfig();

  pullBtn.disabled = true;
  pullBtn.textContent = "⏳ 恢复中...";
  statusEl.className = "loading";
  statusEl.textContent = "正在从 GitHub Gist 下载...";

  try {
    var remoteArticles = await GistSync.pull();
    var before = VAULT.articles.length;

    var merged = GistSync.mergeArticles(VAULT.articles, remoteArticles);
    VAULT.articles = merged;
    saveToStorage(function () {
      loadFromStorage(function () {
        renderSidebar();
        if (VAULT.articles.length > 0) showArticle(VAULT.articles[0].id);
        else showWelcome();

        var after = VAULT.articles.length;
        var newCount = after - before;
        statusEl.className = "success";
        statusEl.innerHTML = "✅ 从云端恢复完成<br>云端: " + remoteArticles.length + " 篇 → 本地: " + after + " 篇 (新增 " + Math.max(0, newCount) + " 篇)";

        var d = new Date();
        document.getElementById("sync-last").textContent = d.toLocaleString("zh-CN");

        showToast("☁️ 从云端恢复完成,共 " + after + " 篇文章", "success");
      });
    });
  } catch (err) {
    statusEl.className = "error";
    statusEl.textContent = "❌ " + err.message;
  } finally {
    pullBtn.disabled = false;
    pullBtn.textContent = "☁️ 从云端恢复";
  }
}

// ─── Toast 通知 ───
var toastTimer = null;
function showToast(msg, type) {
  var toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = type || "";
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 3000);
}

// ─── 拖放导入 ───
document.addEventListener("dragover", function (e) { e.preventDefault(); });
document.addEventListener("drop", function (e) {
  e.preventDefault();
  var files = e.dataTransfer.files;
  if (files.length > 1) {
    importFiles(files);
  } else if (files.length === 1 && files[0].name.endsWith(".md")) {
    importMdFile(files[0]);
  }
});

// ─── 工具 ───
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ═════════════════════════════════════════════════════
// 事件绑定 (CSP 安全:全部用 addEventListener,无 inline handler)
// ═════════════════════════════════════════════════════

// ── 静态元素 ──
document.getElementById("sidebar-toggle").addEventListener("click", function () {
  document.getElementById("sidebar").classList.toggle("open");
});

document.getElementById("search-input").addEventListener("input", function () {
  handleSearch(this.value);
});

document.getElementById("theme-toggle").addEventListener("click", toggleTheme);

document.getElementById("btn-import-md").addEventListener("click", function () {
  document.getElementById("importInput").click();
});

document.getElementById("btn-import-folder").addEventListener("click", function () {
  document.getElementById("folderInput").click();
});

document.getElementById("btn-export").addEventListener("click", exportAll);

document.getElementById("btn-sync").addEventListener("click", openSyncModal);

document.getElementById("importInput").addEventListener("change", function () {
  importFiles(this.files);
  this.value = "";
});

document.getElementById("folderInput").addEventListener("change", function () {
  importFiles(this.files);
  this.value = "";
});

// ── 同步弹窗 ──
document.getElementById("sync-overlay").addEventListener("click", function (e) {
  if (e.target === this) closeSyncModal();
});

document.getElementById("syncPushBtn").addEventListener("click", syncToGist);
document.getElementById("syncPullBtn").addEventListener("click", pullFromGist);
document.getElementById("syncCloseBtn").addEventListener("click", closeSyncModal);

// ── 事件委托:侧边栏分类树 ──
document.getElementById("category-tree").addEventListener("click", function (e) {
  // 点击分类标题 → 折叠/展开
  var header = e.target.closest(".tree-cat-header");
  if (header) {
    toggleCategory(header);
    return;
  }
  // 点击文章链接 → 由 href="#id" 触发 hashchange,无需手动处理
});

// ── 事件委托:文章区域 ──
document.getElementById("article-container").addEventListener("click", function (e) {
  // 删除按钮
  var delEl = e.target.closest('[data-action="delete"]');
  if (delEl) {
    e.preventDefault();
    deleteArticle(delEl.getAttribute("data-id"));
    return;
  }
  // 标签点击 → 过滤
  var tagEl = e.target.closest('[data-action="filter-tag"]');
  if (tagEl) {
    filterByTag(tagEl.getAttribute("data-tag"));
    return;
  }
  // 上/下一篇导航
  var navEl = e.target.closest('[data-action="nav"]');
  if (navEl) {
    showArticle(navEl.getAttribute("data-id"));
    return;
  }
  // 相关文章链接 → 由 href="#id" 触发 hashchange,无需手动处理
});

// ── 事件委托:搜索结果 ──
document.getElementById("search-results").addEventListener("click", function (e) {
  var item = e.target.closest('[data-action="search-result"]');
  if (item) {
    var id = item.getAttribute("data-id");
    showArticle(id);
    document.getElementById("search-input").value = "";
    handleSearch("");
  }
});

// ── 键盘快捷键 ──
document.addEventListener("keydown", function (e) {
  if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
    e.preventDefault();
    document.getElementById("search-input").focus();
  }
  if (e.key === "Escape") {
    var input = document.getElementById("search-input");
    if (document.activeElement === input) { input.value = ""; handleSearch(""); input.blur(); }
    var modal = document.getElementById("sync-modal");
    if (modal.style.display !== "none") { closeSyncModal(); }
  }
  if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
    if (e.key === "ArrowLeft" || e.key === "j") {
      var idx = VAULT.articles.findIndex(function (a) { return a.id === currentArticleId; });
      if (idx > 0) showArticle(VAULT.articles[idx - 1].id);
    }
    if (e.key === "ArrowRight" || e.key === "k") {
      var idx2 = VAULT.articles.findIndex(function (a) { return a.id === currentArticleId; });
      if (idx2 >= 0 && idx2 < VAULT.articles.length - 1) showArticle(VAULT.articles[idx2 + 1].id);
    }
  }
});

init();
