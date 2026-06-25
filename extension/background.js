importScripts("lib/kb-engine.js");

// ─── 右键菜单 ───
chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({ id: "add-to-kb", title: "📚 加入知识库", contexts: ["page"] });
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === "add-to-kb" && tab) addCurrentTabToKB(tab);
});

chrome.commands.onCommand.addListener(function (command) {
  if (command === "add-to-kb") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) addCurrentTabToKB(tabs[0]);
    });
  }
});

// ─── 核心逻辑 ───
async function addCurrentTabToKB(tab) {
  try {
    // 注入 turndown 库
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/turndown.js"],
    });

    // 注入提取函数
    var results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContent,
    });

    var pageData = results[0].result;
    if (!pageData || !pageData.markdown) throw new Error("无法提取页面内容");

    var domain = KBEngine.getDomain(pageData.url);
    var source = KBEngine.detectSource(pageData.url);
    var tagResult = KBEngine.autoTag(pageData.title, pageData.markdown, domain);

    var article = {
      id: KBEngine.generateId(),
      title: pageData.title,
      url: pageData.url,
      source: source,
      domain: domain,
      author: pageData.author || "",
      category: tagResult.category,
      tags: tagResult.tags,
      content: pageData.markdown,
      created: new Date().toISOString(),
      published: pageData.publishTime || "",
    };

    var storage = await chrome.storage.local.get("kb_articles");
    var articles = storage.kb_articles || [];

    var dup = articles.find(function (a) { return a.url === article.url; });
    if (dup) {
      notify("ℹ️ 已在知识库中", dup.title);
      return;
    }

    articles.unshift(article);
    await chrome.storage.local.set({ kb_articles: articles });
    notify("✅ 已加入知识库", article.title + "\n分类: " + article.category);
  } catch (err) {
    notify("❌ 添加失败", err.message);
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: title,
    message: message,
    priority: 2,
  });
}
