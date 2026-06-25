# 商店上架材料 — 知识库助手

## 一、商店基本信息

| 项目 | 内容 |
|------|------|
| 扩展名称 | 知识库助手 |
| 版本 | 2.0.0 |
| Manifest 版本 | V3 |
| 类别 | 生产力工具 (Productivity) |
| 语言 | 中文（简体） |
| 大小 | ~64KB |
| 包文件 | `knowledge-base-store-v2.0.zip` |

## 二、商店描述

### 简短描述（132字符以内）

一键将网页加入本地知识库，自动提取正文、智能分类打标签，支持 GitHub Gist 跨设备同步，数据完全本地存储。

### 详细描述

知识库助手是一款本地优先的个人知识管理工具，帮你把浏览过的网页变成结构化的知识库。

**核心功能：**

一键收藏 — 在任意网页按 Ctrl+Shift+K 或点击插件图标，自动提取正文内容，转换为 Markdown 格式，智能分类并打标签。

智能分类 — 基于 14 个领域的分类体系（科技、编程、设计、商业、教育等），自动为文章匹配最合适的分类和标签。

Wiki 界面 — Wikipedia 风格的浏览体验，左侧分类目录树 + 右侧正文展示，支持全文搜索、暗黑模式、键盘快捷键。

云端同步 — 通过 GitHub Gist 实现跨浏览器/设备同步，数据存储在你自己的 GitHub 私有 Gist 中，不经过任何第三方服务器。

批量导入 — 支持从文件夹批量导入 Markdown 文件，重装插件后可快速恢复知识库。

**隐私优先：**

所有数据存储在浏览器的本地存储中，不依赖任何服务器。不采集用户数据，不包含追踪代码。云端同步是可选功能，需要你手动配置 GitHub Token，数据仅在你自己的 GitHub 账号中流转。

**使用方式：**

1. 安装后，在任意网页点击插件图标或按 Ctrl+Shift+K
2. 点击「加入知识库」，自动提取并保存
3. 点击「查看知识库」浏览所有收藏的文章
4. 可选：点击「云端同步」配置 GitHub Gist 同步

## 三、权限说明（Chrome Web Store 审核）

Chrome Web Store 要求对每个权限进行详细说明，以下是权限清单及用途：

| 权限 | 用途说明 |
|------|----------|
| `activeTab` | 当用户主动点击插件图标或右键菜单时，访问当前标签页以提取网页正文内容。仅在用户主动触发时使用，不持续监听。 |
| `scripting` | 注入 Turndown.js（HTML转Markdown库）和内容提取脚本到用户主动收藏的页面中，将网页正文转为 Markdown 格式保存。不注入任何分析或追踪脚本。 |
| `contextMenus` | 在右键菜单中添加「加入知识库」选项，方便用户快速收藏网页。 |
| `storage` | 将收藏的文章（标题、正文、标签、分类等）保存在浏览器的 chrome.storage.local 中。所有数据存储在用户本地设备，不上传到任何服务器。 |
| `unlimitedStorage` | 允许存储大量文章数据。知识库可能包含数百篇文章，每篇含完整正文，需要较大的存储空间。 |
| `notifications` | 在文章成功加入知识库或出现错误时显示桌面通知，提供操作反馈。 |
| `tabs` | 当用户点击「查看知识库」时打开知识库浏览页面（kb-page.html）。 |
| `host_permissions: https://api.github.com/*` | 仅在用户主动点击「云端同步」功能并配置了 GitHub Token 后，与 GitHub Gist API 通信以同步知识库数据。不会在任何其他场景下访问该域名。 |

## 四、截图指南

Chrome Web Store 要求至少 1 张截图，建议 3-5 张。尺寸要求：1280x800 或 640x400。

建议的截图内容：

1. **弹窗界面** — 展示插件弹窗（统计数字 + 添加/查看/同步按钮）
2. **加入知识库** — 展示成功添加文章后的通知或弹窗状态
3. **Wiki 界面** — 展示知识库浏览页面（分类树 + 文章正文）
4. **暗黑模式** — 展示暗黑模式下的 Wiki 界面
5. **同步设置** — 展示 GitHub Gist 同步配置弹窗

截图方法：安装插件后在浏览器中操作，使用 Windows 截图工具（Win+Shift+S）截图，裁剪到 1280x800。

## 五、Chrome Web Store 上架步骤

### 前置准备

1. 注册 Google 开发者账号（需一次性支付 $5 注册费）
   - 访问 https://chrome.google.com/webstore/devconsole
   - 使用 Google 账号登录，完成开发者注册和付款

2. 准备材料
   - 扩展 ZIP 包：`knowledge-base-store-v2.0.zip`
   - 128x128 图标（已在 ZIP 包内）
   - 至少 1 张截图（1280x800）
   - 隐私政策 URL（GitHub 上的 PRIVACY_POLICY.md 链接）
   - 权限说明（见上方第三部分）

### 提交步骤

1. 访问 Chrome Web Store Developer Dashboard
   - https://chrome.google.com/webstore/devconsole

2. 点击「新增内容」(Add new item)

3. 上传 ZIP 包
   - 点击「上传」选择 `knowledge-base-store-v2.0.zip`
   - 等待自动解析

4. 填写商品信息 (Store Listing)
   - 名称：知识库助手
   - 简短描述：一键将网页加入本地知识库，自动提取正文、智能分类打标签，支持 GitHub Gist 跨设备同步
   - 详细描述：见上方第二部分
   - 类别：生产力工具 (Productivity)
   - 语言：中文（简体）
   - 图形素材：上传截图
   - 隐私政策 URL：填写 GitHub 仓库中 PRIVACY_POLICY.md 的 raw 链接

5. 填写隐私实践 (Privacy Practices)
   - 声明权限用途（逐项填写，参考第三部分）
   - 声明是否出售或传输用户数据：否
   - 声明是否使用远程代码：否

6. 提交审核
   - 点击「提交审核」
   - 审核通常需要 1-3 个工作日
   - 审核结果会通过邮件通知

### 审核注意事项

- 确保 `host_permissions` 在隐私政策中有明确说明
- 审核员可能要求补充权限说明，准备好详细回复
- 如果审核被拒，根据反馈修改后重新提交（不需要再付费）

## 六、Edge Add-ons 上架步骤

### 前置准备

1. 注册 Microsoft 合作伙伴中心账号（免费）
   - 访问 https://partner.microsoft.com/dashboard/microsoftedge/overview
   - 使用 Microsoft 账号登录
   - 完成账号验证（可能需要提供公司信息或个人信息）

2. 准备材料（与 Chrome 版相同）
   - 扩展 ZIP 包：`knowledge-base-store-v2.0.zip`
   - 截图
   - 隐私政策 URL

### 提交步骤

1. 访问 Edge Partner Center
   - https://partner.microsoft.com/dashboard/microsoftedge

2. 点击「Create new extension」（创建新扩展）

3. 上传 ZIP 包
   - 选择 `knowledge-base-store-v2.0.zip`
   - 等待自动解析

4. 填写商店信息
   - 名称：知识库助手
   - 描述：见上方第二部分
   - 类别：Productivity
   - 隐私政策 URL：填写 GitHub 上的链接
   - 网站 URL：GitHub 仓库链接
   - 联系邮箱：填写你的邮箱

5. 提交审核
   - 点击「Publish」（发布）
   - Edge 的审核通常比 Chrome 快，一般 1-2 天
   - 审核结果通过邮件通知

## 七、常见审核被拒原因及对策

| 原因 | 对策 |
|------|------|
| 权限过多 | 审核员可能认为某些权限不必要。确保每个权限都有明确用途说明。`tabs` 权限可考虑用 `chrome.tabs.create` 替代说明。 |
| 隐私政策不完整 | 确保隐私政策涵盖所有数据收集和使用情况，特别是 GitHub Gist 同步部分。 |
| host_permissions 质疑 | 明确说明 `api.github.com` 仅在用户主动配置同步时使用，不是默认行为。 |
| 描述与功能不符 | 确保商店描述与实际功能一致，不要夸大或遗漏功能。 |
| 缺少截图 | 提供足够的截图展示核心功能。 |

## 八、上架后维护

- 版本更新：修改 `manifest.json` 中的 version，重新打包 ZIP，在开发者后台提交新版本
- 用户反馈：通过商店的评论区域或 GitHub Issues 回应用户
- 隐私政策更新：如功能变更涉及数据收集，需同步更新隐私政策
