# 自生长个人知识库

所有资料本地保存的 Wiki 式知识库,支持网页/微信公众号自动抓取、智能分类标签、GitHub Gist 跨设备同步。

> GitHub 仓库: https://github.com/hiraicn/knowledge-base
> 隐私政策: [PRIVACY_POLICY.md](PRIVACY_POLICY.md)

## 快速开始

### 方式一:浏览器插件(推荐,零配置)

插件完全在浏览器中运行,无需启动任何服务,数据存储在 `chrome.storage.local` 中。

**安装步骤:**

1. 解压 `knowledge-extension-v2.zip` 到任意目录
2. 打开 Chrome/Edge,地址栏输入 `chrome://extensions`(Edge: `edge://extensions`)
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」,选择解压后的 `extension` 文件夹
5. 插件图标出现在工具栏

**使用方法:**

1. 在任意网页点击插件图标 → 「📖 加入知识库」按钮,自动提取正文、转 Markdown、打标签归档
2. 点击「👁️ 查看知识库」打开 Wiki 界面,浏览所有已收藏的文章
3. 点击「🔄 重建知识库」重新对所有文章进行智能分类和标签
4. 也可以右键页面 → 「📚 加入知识库」,或使用快捷键 `Ctrl+Shift+K`

Wiki 界面支持:分类目录树、全文搜索、暗黑模式、导入/导出 .md 文件、从文件夹批量导入、拖拽导入、键盘快捷键(`/` 搜索,`←→` 切换文章,`ESC` 退出搜索)。

### 导入已有 vault 文章

重装插件后,之前用命令行抓取的 `vault/` 文件夹中的 .md 文件可以通过以下方式导入到插件中:

1. 点击插件「👁️ 查看知识库」打开 Wiki 界面
2. 点击工具栏「📂 从文件夹导入」按钮,选择 `vault` 文件夹
3. 插件自动解析所有 .md 文件的 YAML frontmatter,重新打标签并导入
4. 也可以直接将 .md 文件拖拽到 Wiki 页面,或用「📥 导入 .md」选择多个文件

### 跨设备同步(GitHub Gist)

通过 GitHub Gist 实现跨浏览器/设备同步,无需自建服务器。

**首次配置:**

1. 打开 GitHub Token 创建页面: https://github.com/settings/tokens/new
2. 勾选 `gist` 权限,生成 Token(仅此一项权限即可)
3. 在插件弹窗中点击「☁️ 同步」(首次会提示未配置),或在知识库页面点击工具栏「☁️ 云端同步」
4. 在弹出的设置面板中粘贴 GitHub Token
5. 点击「☁️ 同步到云端」,首次同步会自动创建一个私有 Gist 并记录 Gist ID

**日常使用:**

- 弹窗中「☁️ 同步」— 将本地文章推送到云端(覆盖云端数据)
- 弹窗中「☁️ 恢复」— 从云端拉取文章并合并到本地(按 URL 去重,不丢失本地独有文章)
- 知识库页面「☁️ 云端同步」— 完整的设置面板,可查看 Gist ID 和上次同步时间

**在新设备上恢复:**

1. 安装插件
2. 在设置面板中输入相同的 GitHub Token
3. 点击「☁️ 从云端恢复」,所有文章自动合并到本地

数据以 JSON 格式存储在私有 Gist 中(仅自己可见),同步内容包含文章正文、标签、分类、来源等全部元数据。

### 方式二:命令行抓取(批量导入)

适合批量抓取网页或导入收藏夹:

```bash
# 抓取单个网页
node grow.js https://www.ruanyifeng.com/blog/

# 抓取微信公众号文章
node grow.js https://mp.weixin.qq.com/s/xxxxx

# 导入浏览器收藏夹(先从 Chrome 导出为 HTML)
node grow.js --bookmarks "C:\Users\你的用户名\bookmarks.html"

# 重建知识库 HTML
node grow.js --rebuild

# 查看所有文章
node grow.js --list
```

命令行抓取的文章保存在 `vault/` 目录(Markdown 格式),运行 `node grow.js --rebuild` 后可在 `knowledge_base.html` 中查看,也可以通过插件的「📂 从文件夹导入」功能导入到浏览器存储中。

## 文件结构

```
knowledge-base/
├── grow.js                        # 命令行自生长引擎(抓取、标签、归档、生成)
├── template.html                  # Wiki 界面模板(命令行版)
├── knowledge_base.html            # 生成的知识库(双击打开)
├── knowledge-extension-v2.zip     # 浏览器插件 v2 打包(无服务架构 + Gist 同步)
├── extension/                     # 浏览器插件源码
│   ├── manifest.json              # 插件配置(v2.0 无服务 + GitHub API 权限)
│   ├── popup.html / popup.js      # 弹窗界面(加入/查看/重建/同步/恢复)
│   ├── background.js              # 右键菜单 + 快捷键
│   ├── kb-page.html / kb-page.js  # Wiki 查看器 + 同步设置面板 + 批量导入
│   ├── lib/
│   │   ├── kb-engine.js           # 共享引擎(标签、分类、解析、Gist 同步)
│   │   ├── turndown.js            # HTML → Markdown 转换库
│   │   └── marked.js              # Markdown → HTML 渲染库
│   └── icons/                     # 插件图标
├── package.json                   # 依赖配置
└── vault/                         # 文章存储(Markdown 格式)
    ├── 2026-06-25_deep-learning-essence.md
    ├── 2026-06-24_why-write-tech-blog.md
    └── ...
```

## 功能特性

- **零配置插件**:无需启动服务,装好插件直接用,数据存浏览器本地存储
- **GitHub Gist 同步**:跨浏览器/设备同步,私有 Gist 加密存储,按 URL 智能合并去重
- **一键收藏**:任意网页点击即存,支持右键菜单和快捷键 `Ctrl+Shift+K`
- **批量导入**:从文件夹选择多个 .md 文件一次性导入,自动解析 YAML frontmatter
- **自动抓取**:命令行粘贴 URL 批量抓取网页或微信公众号文章
- **智能标签**:基于关键词频率自动分类和打标签(14个分类领域)
- **Markdown 归档**:每篇文章保存为带 YAML frontmatter 的 Markdown 文件
- **Wiki 界面**:Wikipedia 风格,左侧分类目录树 + 右侧正文
- **全文搜索**:输入关键词即时搜索标题和正文
- **暗黑模式**:点击侧边栏底部按钮切换
- **导入/导出**:Wiki 界面支持导入 .md 文件、导出全部文章、拖拽导入
- **完全离线**:所有数据本地保存,同步为可选功能
- **键盘快捷键**:`/` 聚焦搜索,`←` `→` 切换文章,`ESC` 退出搜索

## 自定义标签分类

编辑 `extension/lib/kb-engine.js` 中的 `TAXONOMY` 对象(插件版),或 `grow.js` 中的 `TAXONOMY`(命令行版):

```javascript
const TAXONOMY = {
  '你的分类': ['keyword1', 'keyword2', '关键词'],
  // ...
};
```

插件版修改后重新加载扩展,然后点击「🔄 重建知识库」即可重新分类。命令行版修改后运行 `node grow.js --rebuild`。
