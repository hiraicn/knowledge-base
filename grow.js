#!/usr/bin/env node

/**
 * grow.js — 自生长个人知识库引擎
 *
 * 用法:
 *   node grow.js <url>                    抓取网页/微信公众号文章并归档
 *   node grow.js --bookmarks <file.html>  导入浏览器收藏夹
 *   node grow.js --rebuild                从 vault 重建 knowledge_base.html
 *   node grow.js --list                   列出所有已归档文章
 *   node grow.js --help                   显示帮助
 *
 * 数据全部保存在本地:
 *   vault/*.md    — 每篇文章一个 Markdown 文件(带 YAML frontmatter)
 *   knowledge_base.html — 自动生成的 Wiki 界面(单文件,离线可用)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');
const TurndownService = require('turndown');
const { marked } = require('marked');
const TAXONOMY = require('./extension/lib/taxonomy.js');

// ─── 配置 ────────────────────────────────────────────────
const VAULT_DIR = path.join(__dirname, 'vault');
const TEMPLATE_FILE = path.join(__dirname, 'template.html');
const OUTPUT_FILE = path.join(__dirname, 'knowledge_base.html');
const DATA_PLACEHOLDER = '/*VAULT_DATA*/';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const FETCH_TIMEOUT = 30000; // 30秒超时

// ─── Turndown 配置 ────────────────────────────────────────
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});

// 忽略 script, style, nav 等无关标签
turndown.remove(['script', 'style', 'nav', 'footer', 'header', 'iframe', 'noscript']);

// 保留图片
turndown.addRule('preserveImages', {
  filter: 'img',
  replacement: (content, node) => {
    const alt = node.getAttribute('alt') || '';
    const src = node.getAttribute('data-src') || node.getAttribute('src') || '';
    if (!src) return '';
    // 处理相对路径
    const fullSrc = src.startsWith('http') ? src : src.startsWith('//') ? 'https:' + src : src;
    return `\n\n![${alt}](${fullSrc})\n\n`;
  },
});

// TAXONOMY 从 taxonomy.js 加载(见文件顶部 require)
// ─── 关键词计数(英文用词边界,中文用 indexOf) ───
function countKeyword(text, kw) {
  if (/[\u4e00-\u9fff]/.test(kw)) {
    let count = 0, idx = 0;
    while ((idx = text.indexOf(kw, idx)) !== -1) { count++; idx += kw.length; }
    return count;
  } else {
    const re = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    const m = text.match(re);
    return m ? m.length : 0;
  }
}

// ─── YAML Frontmatter 解析(增强版) ───
function parseFrontmatter(raw) {
  const meta = {};
  let content = raw;
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    content = fmMatch[2].trim();
    const lines = fm.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) { i++; continue; }
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      if (val === '|' || val === '>') {
        const multiLine = [];
        i++;
        while (i < lines.length && (/^\s+/.test(lines[i]) || lines[i].trim() === '')) {
          multiLine.push(lines[i]); i++;
        }
        meta[key] = multiLine.join('\n').trim();
        continue;
      }
      if (val === '' && i + 1 < lines.length && /^\s*-\s/.test(lines[i + 1])) {
        const arr = [];
        i++;
        while (i < lines.length && /^\s*-\s/.test(lines[i])) {
          let item = lines[i].replace(/^\s*-\s*/, '').trim();
          arr.push(stripQuotes(item)); i++;
        }
        meta[key] = arr;
        continue;
      }
      if (val.startsWith('[') && val.endsWith(']')) {
        meta[key] = val.slice(1, -1).split(',').map(s => stripQuotes(s.trim())).filter(Boolean);
        i++; continue;
      }
      meta[key] = stripQuotes(val);
      i++;
    }
  }
  return { meta, content };
}

function stripQuotes(val) {
  if (typeof val !== 'string') return val;
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  return val;
}

// ─── 工具函数 ────────────────────────────────────────────

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
}

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function slugify(title) {
  // 取标题前30字符,去除特殊字符
  return title
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .slice(0, 30)
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function formatDate(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ─── 网页抓取 ────────────────────────────────────────────

async function fetchUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

function detectSource(url) {
  if (url.includes('mp.weixin.qq.com')) return 'wechat';
  return 'web';
}

// ─── 微信公众号文章解析 ────────────────────────────────────

function parseWeChat(html, url) {
  const $ = cheerio.load(html);

  const title = $('#activity-name').text().trim()
    || $('meta[property="og:title"]').attr('content')?.trim()
    || $('title').text().trim();

  const author = $('#js_name').text().trim()
    || $('.profile_nickname').text().trim()
    || $('meta[property="og:description"]').attr('content')?.split(',')[0]?.trim()
    || '';

  // 发布时间
  let publishTime = '';
  const timeText = $('#publish_time').text().trim()
    || $('em#publish_time').text().trim()
    || $('meta[property="article:published_time"]').attr('content');
  if (timeText) publishTime = timeText;

  // 正文内容
  let contentHtml = '';
  const contentEl = $('#js_content');
  if (contentEl.length) {
    contentHtml = contentEl.html();
  } else {
    // 备用:尝试 rich_media_content
    contentHtml = $('.rich_media_content').html() || '';
  }

  // 描述
  const description = $('meta[name="description"]').attr('content')?.trim()
    || $('meta[property="og:description"]').attr('content')?.trim()
    || '';

  return {
    title: title || '未知标题',
    author: author,
    contentHtml: contentHtml,
    publishTime: publishTime,
    description: description,
  };
}

// ─── 通用网页解析 ────────────────────────────────────────

function parseWebPage(html, url) {
  const $ = cheerio.load(html);

  // 标题:优先 og:title,其次 <title>
  const title = $('meta[property="og:title"]').attr('content')?.trim()
    || $('title').text().trim()
    || '';

  // 作者
  const author = $('meta[name="author"]').attr('content')?.trim()
    || $('meta[property="article:author"]').attr('content')?.trim()
    || $('.author').text().trim()
    || $('[rel="author"]').text().trim()
    || '';

  // 描述
  const description = $('meta[name="description"]').attr('content')?.trim()
    || $('meta[property="og:description"]').attr('content')?.trim()
    || '';

  // 正文内容:按优先级尝试多种选择器
  const contentSelectors = [
    'article',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.article-body',
    '.post-body',
    '#article',
    '#content',
    '.content',
    '.markdown-body',
    '.rst-content',
    '.documentation',
  ];

  let contentEl = null;
  let contentHtml = '';

  for (const selector of contentSelectors) {
    const el = $(selector);
    if (el.length && el.text().trim().length > 200) {
      contentEl = el.first();
      contentHtml = el.html();
      break;
    }
  }

  // 如果上面没找到,用文本密度算法找最大文本块
  if (!contentHtml) {
    let maxText = 0;
    $('div, section').each((i, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      // 排除导航、页脚等
      if (text.length > maxText) {
        const tag = $el.attr('class') || '';
        const id = $el.attr('id') || '';
        if (!/nav|footer|header|sidebar|comment|menu/i.test(tag + id)) {
          maxText = text.length;
          contentHtml = $el.html();
        }
      }
    });
  }

  // 如果还是没找到,就用 body
  if (!contentHtml) {
    // 清理 script, style, nav 等
    $('script, style, nav, footer, header, aside, iframe, noscript').remove();
    contentHtml = $('body').html() || '';
  }

  return {
    title: title || '未知标题',
    author: author,
    contentHtml: contentHtml,
    publishTime: '',
    description: description,
  };
}

// ─── HTML → Markdown 转换 ────────────────────────────────

function htmlToMarkdown(html) {
  if (!html || !html.trim()) return '';
  let md = turndown.turndown(html);
  // 清理多余空行
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

// ─── 自动打标签 ──────────────────────────────────────────

function autoTag(title, content, domain) {
  const text = (title + ' ' + content).toLowerCase();
  const scores = {};

  for (const [category, keywords] of Object.entries(TAXONOMY)) {
    let score = 0;
    for (const kw of keywords) {
      score += countKeyword(text, kw);
    }
    if (score > 0) {
      scores[category] = score;
    }
  }

  // 排序取前2个分类
  const sortedCategories = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([cat]) => cat);

  // 如果没有匹配到任何分类,用"未分类"
  if (sortedCategories.length === 0) {
    sortedCategories.push('未分类');
  }

  // 生成标签
  const tags = new Set();

  // 1. 分类作为标签
  sortedCategories.forEach(c => tags.add(c));

  // 2. 域名作为标签
  if (domain) {
    tags.add(domain);
  }

  // 3. 从标题提取关键词作为标签
  const titleWords = title
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);
  titleWords.slice(0, 3).forEach(w => tags.add(w));

  // 4. 找到的高频分类关键词也作为标签
  const topCategory = sortedCategories[0];
  if (TAXONOMY[topCategory]) {
    const matchedKeywords = TAXONOMY[topCategory]
      .filter(kw => countKeyword(text, kw) > 0)
      .slice(0, 3);
    matchedKeywords.forEach(kw => tags.add(kw));
  }

  return {
    category: sortedCategories[0],
    tags: Array.from(tags).slice(0, 8),
  };
}

// ─── 保存文章 ────────────────────────────────────────────

function saveArticle(article) {
  ensureVaultDir();

  const dateStr = formatDate(article.created);
  const slug = slugify(article.title);
  const filename = `${dateStr}_${slug || article.id}.md`;
  const filepath = path.join(VAULT_DIR, filename);

  // YAML frontmatter + Markdown 正文
  const frontmatter = [
    '---',
    `id: "${article.id}"`,
    `title: "${article.title.replace(/"/g, '\\"')}"`,
    `url: "${article.url}"`,
    `source: "${article.source}"`,
    `domain: "${article.domain}"`,
    `author: "${(article.author || '').replace(/"/g, '\\"')}"`,
    `category: "${article.category}"`,
    `tags: [${article.tags.map(t => `"${t}"`).join(', ')}]`,
    `created: "${article.created.toISOString()}"`,
    article.publishTime ? `published: "${article.publishTime}"` : null,
    '---',
    '',
  ].filter(Boolean).join('\n');

  const fullContent = frontmatter + '\n' + article.content;

  fs.writeFileSync(filepath, fullContent, 'utf-8');
  console.log(`  ✓ 已保存: vault/${filename}`);
  return filepath;
}

// ─── 加载 vault 中所有文章 ────────────────────────────────

function loadVault() {
  ensureVaultDir();
  const files = fs.readdirSync(VAULT_DIR).filter(f => f.endsWith('.md'));
  const articles = [];

  for (const file of files) {
    const filepath = path.join(VAULT_DIR, file);
    const raw = fs.readFileSync(filepath, 'utf-8');

    // 使用增强版 YAML frontmatter 解析
    const { meta, content } = parseFrontmatter(raw);

    const article = {
      id: meta.id || '',
      title: meta.title || '',
      url: meta.url || '',
      source: meta.source || '',
      domain: meta.domain || '',
      author: meta.author || '',
      category: meta.category || '',
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      created: meta.created || '',
      published: meta.published || '',
      content: content,
    };

    if (article.id) {
      articles.push(article);
    }
  }

  // 按创建时间倒序
  articles.sort((a, b) => new Date(b.created) - new Date(a.created));
  return articles;
}

// ─── 解析浏览器收藏夹 ────────────────────────────────────

function parseBookmarks(html) {
  const $ = cheerio.load(html);
  const bookmarks = [];

  // Netscape bookmark 格式: <DT><H3>文件夹名</H3> <DL>...<DT><A HREF="url">标题</A>...</DL>
  // 递归解析
  function parseDL(dl, parentFolder) {
    dl.children().each((i, el) => {
      const $el = $(el);
      const tag = el.tagName?.toLowerCase();

      if (tag === 'dt') {
        const h3 = $el.children('h3').first();
        const a = $el.children('a').first();

        if (h3.length) {
          // 文件夹,递归
          const folderName = h3.text().trim();
          const nextDL = $el.next('dl');
          if (nextDL.length) {
            parseDL(nextDL, folderName);
          }
        } else if (a.length) {
          // 书签链接
          bookmarks.push({
            title: a.text().trim(),
            url: a.attr('href') || '',
            folder: parentFolder || '导入收藏',
          });
        }
      }
    });
  }

  // 尝试从顶层 DL 开始
  $('dl').first().each((i, dl) => parseDL($(dl), ''));

  // 备用:直接找所有 <A> 标签
  if (bookmarks.length === 0) {
    $('a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        bookmarks.push({
          title: $el.text().trim() || href,
          url: href,
          folder: '导入收藏',
        });
      }
    });
  }

  return bookmarks;
}

// ─── 生成 knowledge_base.html ────────────────────────────

function buildArticleData(article) {
  // 将 Markdown 转为 HTML
  let htmlContent = '';
  try {
    htmlContent = marked.parse(article.content);
  } catch (e) {
    htmlContent = `<p>${article.content}</p>`;
  }

  return {
    id: article.id,
    title: article.title,
    url: article.url,
    source: article.source,
    domain: article.domain,
    author: article.author,
    category: article.category,
    tags: article.tags,
    created: article.created,
    published: article.published || '',
    contentHtml: htmlContent,
  };
}

function generateHTML() {
  const articles = loadVault();
  const articleData = articles.map(buildArticleData);

  // 构建分类索引
  const categories = {};
  for (const art of articleData) {
    const cat = art.category || '未分类';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(art.id);
  }

  // 构建标签索引
  const tagIndex = {};
  for (const art of articleData) {
    for (const tag of art.tags) {
      if (!tagIndex[tag]) tagIndex[tag] = [];
      tagIndex[tag].push(art.id);
    }
  }

  const data = {
    articles: articleData,
    categories: categories,
    tags: tagIndex,
    generatedAt: new Date().toISOString(),
    stats: {
      total: articleData.length,
      categories: Object.keys(categories).length,
      tags: Object.keys(tagIndex).length,
    },
  };

  // 读取模板并注入数据
  let template = '';
  if (fs.existsSync(TEMPLATE_FILE)) {
    template = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
  } else {
    throw new Error(`模板文件不存在: ${TEMPLATE_FILE}`);
  }

  const html = template.replace(DATA_PLACEHOLDER, JSON.stringify(data));
  fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');

  console.log(`\n  ✓ 知识库已生成: knowledge_base.html`);
  console.log(`    文章数: ${data.stats.total}`);
  console.log(`    分类数: ${data.stats.categories}`);
  console.log(`    标签数: ${data.stats.tags}`);

  return data;
}

// ─── 主流程:抓取 URL ────────────────────────────────────

async function scrapeUrl(url) {
  console.log(`\n🔄 正在抓取: ${url}`);

  const source = detectSource(url);
  console.log(`   来源类型: ${source === 'wechat' ? '微信公众号' : '网页'}`);

  let html;
  try {
    html = await fetchUrl(url);
  } catch (err) {
    console.error(`  ✗ 抓取失败: ${err.message}`);
    console.error(`    提示: 某些网站可能有反爬机制,请检查 URL 是否可访问`);
    return null;
  }

  // 解析内容
  let parsed;
  if (source === 'wechat') {
    parsed = parseWeChat(html, url);
  } else {
    parsed = parseWebPage(html, url);
  }

  if (!parsed.title || parsed.title === '未知标题') {
    console.error('  ✗ 无法提取标题,请检查 URL');
    return null;
  }

  console.log(`   标题: ${parsed.title}`);
  if (parsed.author) console.log(`   作者: ${parsed.author}`);

  // 转为 Markdown
  const markdown = htmlToMarkdown(parsed.contentHtml);
  if (!markdown || markdown.length < 50) {
    console.error('  ✗ 正文内容过少,可能解析失败');
  }
  console.log(`   正文长度: ${markdown.length} 字符`);

  // 自动打标签
  let domain = '';
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    domain = '';
  }

  const { category, tags } = autoTag(parsed.title, markdown, domain);
  console.log(`   分类: ${category}`);
  console.log(`   标签: ${tags.join(', ')}`);

  // 构建文章对象
  const article = {
    id: generateId(),
    title: parsed.title,
    url: url,
    source: source,
    domain: domain,
    author: parsed.author || '',
    category: category,
    tags: tags,
    created: new Date(),
    publishTime: parsed.publishTime || '',
    content: markdown,
  };

  // 保存
  saveArticle(article);

  return article;
}

// ─── 主流程:导入收藏夹 ────────────────────────────────────

async function importBookmarks(filepath) {
  if (!fs.existsSync(filepath)) {
    console.error(`  ✗ 文件不存在: ${filepath}`);
    return;
  }

  console.log(`\n🔄 正在导入收藏夹: ${filepath}`);
  const html = fs.readFileSync(filepath, 'utf-8');
  const bookmarks = parseBookmarks(html);

  console.log(`   找到 ${bookmarks.length} 个书签`);

  let success = 0;
  let failed = 0;

  for (const bm of bookmarks) {
    // 跳过非 HTTP 链接
    if (!bm.url.startsWith('http')) {
      continue;
    }

    process.stdout.write(`   抓取: ${bm.title.slice(0, 30)}... `);

    try {
      const article = await scrapeUrl(bm.url);
      if (article) {
        // 如果有文件夹名,加入标签
        if (bm.folder && !article.tags.includes(bm.folder)) {
          article.tags.push(bm.folder);
        }
        success++;
      } else {
        failed++;
      }
    } catch (err) {
      console.log(`✗ 失败: ${err.message}`);
      failed++;
    }

    // 礼貌延迟,避免被封
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n  导入完成: 成功 ${success}, 失败 ${failed}`);
}

// ─── 主流程:列出现有文章 ────────────────────────────────────

function listArticles() {
  const articles = loadVault();

  if (articles.length === 0) {
    console.log('\n  知识库为空。使用以下命令添加文章:');
    console.log('    node grow.js <url>');
    return;
  }

  console.log(`\n📚 知识库 (${articles.length} 篇文章)\n`);

  // 按分类分组
  const grouped = {};
  for (const art of articles) {
    const cat = art.category || '未分类';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(art);
  }

  for (const [cat, arts] of Object.entries(grouped)) {
    console.log(`  【${cat}】(${arts.length})`);
    for (const art of arts) {
      const date = formatDate(art.created);
      console.log(`    ${date}  ${art.title}`);
    }
    console.log('');
  }
}

// ─── CLI 入口 ────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
  自生长个人知识库 — grow.js

  用法:
    node grow.js <url>                    抓取网页/微信公众号文章
    node grow.js --bookmarks <file.html>  导入浏览器收藏夹
    node grow.js --rebuild                重建 knowledge_base.html
    node grow.js --list                   列出所有文章

  示例:
    node grow.js https://mp.weixin.qq.com/s/xxxxx
    node grow.js --bookmarks "C:\\Users\\me\\bookmarks.html"
    node grow.js --rebuild
    `);
    return;
  }

  ensureVaultDir();

  if (args[0] === '--rebuild') {
    console.log('\n🔄 重建知识库...');
    generateHTML();
    return;
  }

  if (args[0] === '--list') {
    listArticles();
    return;
  }

  if (args[0] === '--bookmarks') {
    const filepath = args[1];
    if (!filepath) {
      console.error('  ✗ 请指定收藏夹文件路径');
      console.error('    用法: node grow.js --bookmarks <file.html>');
      return;
    }
    await importBookmarks(filepath);
    generateHTML();
    return;
  }

  // 默认:抓取 URL
  const url = args[0];
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    console.error('  ✗ URL 必须以 http:// 或 https:// 开头');
    return;
  }

  const article = await scrapeUrl(url);
  if (article) {
    generateHTML();
    console.log(`\n✅ 完成! 打开 knowledge_base.html 查看你的知识库。`);
  }
}

main().catch(err => {
  console.error('\n❌ 发生错误:', err.message);
  process.exit(1);
});
