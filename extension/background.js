importScripts("lib/taxonomy.js");
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

// ─── 核心逻辑(调用共享函数) ───
async function addCurrentTabToKB(tab) {
  try {
    var result = await extractAndCreateArticle(tab.id);
    if (result.duplicate) {
      notify("ℹ️ 已在知识库中", result.article.title);
    } else {
      notify("✅ 已加入知识库", result.article.title + "\n分类: " + result.article.category);
    }
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
