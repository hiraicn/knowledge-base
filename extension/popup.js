var statusEl = document.getElementById("status");
var addBtn = document.getElementById("addBtn");
var rebuildBtn = document.getElementById("rebuildBtn");
var syncPushBtn = document.getElementById("syncPushBtn");
var syncPullBtn = document.getElementById("syncPullBtn");

// ─── 加载统计 ───
function loadStats() {
  chrome.storage.local.get("kb_articles", function (result) {
    var articles = result.kb_articles || [];
    var cats = {}, tags = {};
    articles.forEach(function (a) {
      cats[a.category] = (cats[a.category] || 0) + 1;
      (a.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; });
    });
    document.getElementById("statArticles").textContent = articles.length;
    document.getElementById("statCats").textContent = Object.keys(cats).length;
    document.getElementById("statTags").textContent = Object.keys(tags).length;
  });
}

// ─── 加载同步状态 ───
async function loadSyncStatus() {
  var config = await GistSync.getConfig();
  var dotEl = document.querySelector(".sync-dot");
  var textEl = document.getElementById("syncStatusText");

  if (!config.token) {
    dotEl.className = "sync-dot not-configured";
    textEl.innerHTML = '未配置 · 在<a href="#" id="openSyncHint">知识库页面</a>设置';
    document.getElementById("openSyncHint").addEventListener("click", function (e) {
      e.preventDefault();
      chrome.tabs.create({ url: "kb-page.html" });
    });
    syncPushBtn.disabled = true;
    syncPullBtn.disabled = true;
  } else if (!config.gistId) {
    dotEl.className = "sync-dot not-configured";
    textEl.textContent = "已配置 Token · 尚未同步";
    syncPushBtn.disabled = false;
    syncPullBtn.disabled = true;
  } else {
    dotEl.className = "sync-dot configured";
    var d = new Date(config.lastSync);
    textEl.textContent = "上次同步: " + d.toLocaleString("zh-CN");
    syncPushBtn.disabled = false;
    syncPullBtn.disabled = false;
  }
}

// ─── 加入知识库(调用共享函数) ───
async function addToKnowledgeBase() {
  addBtn.disabled = true;
  addBtn.textContent = "⏳ 正在提取...";
  statusEl.className = "status loading";
  statusEl.textContent = "正在提取页面内容...";

  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (!tab) throw new Error("无法获取当前标签页");

    statusEl.textContent = "正在保存到知识库...";

    var result = await extractAndCreateArticle(tab.id);

    if (result.duplicate) {
      statusEl.className = "status success";
      statusEl.innerHTML = 'ℹ️ 该文章已在知识库中<div class="article-title">' + escapeHtml(result.article.title) + '</div><div class="meta-line">分类: ' + escapeHtml(result.article.category) + "</div>";
    } else {
      var article = result.article;
      statusEl.className = "status success";
      var html = '✅ 添加成功!<div class="article-title">' + escapeHtml(article.title) + "</div>";
      html += '<div class="meta-line">分类: ' + escapeHtml(article.category) + "</div>";
      if (article.summary) {
        html += '<div class="meta-line" style="font-size:11px;color:#888;margin-top:4px;">' + escapeHtml(article.summary.slice(0, 80)) + '</div>';
      }
      html += '<div class="tags">';
      article.tags.forEach(function (t) { html += '<span class="tag">' + escapeHtml(t) + "</span>"; });
      html += "</div>";
      statusEl.innerHTML = html;
    }
    loadStats();
  } catch (err) {
    statusEl.className = "status error";
    statusEl.textContent = "❌ " + err.message;
  } finally {
    addBtn.disabled = false;
    addBtn.textContent = "📖 加入知识库";
  }
}

// ─── 重建知识库(重新打标签,使用当前分类体系 + TF-IDF) ───
async function rebuildKnowledgeBase() {
  rebuildBtn.disabled = true;
  rebuildBtn.textContent = "⏳ 重建中...";
  try {
    var storage = await chrome.storage.local.get("kb_articles");
    var articles = storage.kb_articles || [];

    // 获取当前分类体系(支持自定义分类)
    var taxonomy = await KBEngine.getTaxonomy();

    articles.forEach(function (a) {
      var domain = a.domain || KBEngine.getDomain(a.url);
      // 使用 TF-IDF 评分 + 当前分类体系
      var r = KBEngine.autoTagWithTaxonomy(a.title, a.content, domain, taxonomy);
      a.category = r.category;
      a.tags = r.tags;
      // 重新生成摘要
      a.summary = KBEngine.generateSummary(a.content, r.tags);
    });

    await chrome.storage.local.set({ kb_articles: articles });
    statusEl.className = "status success";
    statusEl.textContent = "✅ 知识库已重建! 使用 TF-IDF 重新分类了 " + articles.length + " 篇文章。";
    loadStats();
  } catch (err) {
    statusEl.className = "status error";
    statusEl.textContent = "❌ 重建失败: " + err.message;
  } finally {
    rebuildBtn.disabled = false;
    rebuildBtn.textContent = "🔄 重建知识库";
  }
}

// ─── 同步到云端 ───
async function syncToGist() {
  syncPushBtn.disabled = true;
  syncPushBtn.textContent = "⏳ 同步中...";
  statusEl.className = "status loading";
  statusEl.textContent = "正在上传到 GitHub Gist...";

  try {
    var storage = await chrome.storage.local.get("kb_articles");
    var articles = storage.kb_articles || [];
    var result = await GistSync.push(articles);
    statusEl.className = "status success";
    statusEl.innerHTML = "☁️ 已同步 " + result.count + " 篇文章到云端";
    loadSyncStatus();
  } catch (err) {
    statusEl.className = "status error";
    statusEl.textContent = "❌ " + err.message;
    if (err.message.indexOf("Token") !== -1) {
      statusEl.innerHTML += '<br><span style="font-size:11px">请在知识库页面点击「☁️ 云端同步」配置 Token</span>';
    }
  } finally {
    syncPushBtn.disabled = false;
    syncPushBtn.textContent = "☁️ 同步";
  }
}

// ─── 从云端恢复 ───
async function pullFromGist() {
  syncPullBtn.disabled = true;
  syncPullBtn.textContent = "⏳ 恢复中...";
  statusEl.className = "status loading";
  statusEl.textContent = "正在从 GitHub Gist 下载...";

  try {
    var remoteArticles = await GistSync.pull();
    var storage = await chrome.storage.local.get("kb_articles");
    var localArticles = storage.kb_articles || [];
    var merged = GistSync.mergeArticles(localArticles, remoteArticles);
    await chrome.storage.local.set({ kb_articles: merged });
    statusEl.className = "status success";
    statusEl.innerHTML = "☁️ 从云端恢复完成: 共 " + merged.length + " 篇文章";
    loadStats();
    loadSyncStatus();
  } catch (err) {
    statusEl.className = "status error";
    statusEl.textContent = "❌ " + err.message;
  } finally {
    syncPullBtn.disabled = false;
    syncPullBtn.textContent = "☁️ 恢复";
  }
}

function viewKnowledgeBase() {
  chrome.tabs.create({ url: "kb-page.html" });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

addBtn.addEventListener("click", addToKnowledgeBase);
document.getElementById("viewBtn").addEventListener("click", viewKnowledgeBase);
rebuildBtn.addEventListener("click", rebuildKnowledgeBase);
syncPushBtn.addEventListener("click", syncToGist);
syncPullBtn.addEventListener("click", pullFromGist);
loadStats();
loadSyncStatus();
