/**
 * taxonomy.js — 知识库分类词库（共享模块）
 *
 * UMD 模式：浏览器中作为全局变量 TAXONOMY，Node.js 中通过 require 导入。
 * 浏览器用法：<script src="lib/taxonomy.js"></script> → 全局 TAXONOMY 可用
 * Node.js 用法：const { TAXONOMY } = require('./extension/lib/taxonomy.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TAXONOMY = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return {
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
      'research', 'paper', 'study', 'experiment', 'theory', 'hypothesis',
      '科学', '物理', '生物', '化学', '数学', '研究', '论文', '实验',
      '量子', '基因', '相对论', '神经科学'],

    '商业': ['business', 'startup', 'market', 'finance', 'economic', 'investment',
      'venture', 'capital', 'revenue', 'profit', 'b2b', 'b2c', 'saas',
      '商业模式', '创业', '市场', '金融', '经济', '投资', '融资', '营收',
      '商业计划', '股权', '上市', '并购'],

    '产品': ['product', 'pm', 'product manager', 'product design', 'feature',
      'roadmap', 'user story', 'prd', 'mvp', 'product-led',
      '产品', '产品经理', '产品设计', '功能', '需求', '路线图', '用户研究'],

    '设计': ['design', 'ui', 'ux', 'user experience', 'graphic', 'typography',
      'figma', 'sketch', 'photoshop', 'illustrator', 'color', 'layout',
      '设计', '界面设计', '用户体验', '视觉', '配色', '排版', '交互设计',
      '设计系统', '原型'],

    '科技': ['technology', 'tech', 'gadget', 'device', 'hardware', 'chip',
      'semiconductor', 'smartphone', 'laptop', 'ar', 'vr', 'xr',
      '科技', '技术', '设备', '硬件', '芯片', '半导体', '智能设备'],

    '教育': ['education', 'learning', 'tutorial', 'course', 'teach', 'lecture',
      'university', 'student', 'mooc', 'coursera',
      '教育', '学习', '教程', '课程', '教学', '大学', '学生', '培训'],

    '生活': ['life', 'health', 'food', 'travel', 'lifestyle', 'fitness',
      'cooking', 'recipe', 'nutrition', 'sleep', 'exercise',
      '生活', '健康', '美食', '旅行', '健身', '烹饪', '食谱', '营养',
      '睡眠', '运动', '生活方式'],

    '文化': ['culture', 'art', 'music', 'book', 'film', 'movie', 'literature',
      'poetry', 'painting', 'photography', 'history', 'philosophy',
      '文化', '艺术', '音乐', '书籍', '电影', '文学', '诗歌', '绘画',
      '摄影', '历史', '哲学', '阅读'],

    '职场': ['career', 'job', 'interview', 'resume', 'salary', 'work',
      '职场', '工作', '面试', '简历', '薪资', '职业规划', '跳槽', '升职'],

    '安全': ['security', 'cybersecurity', 'encryption', 'vulnerability',
      'hack', 'privacy', 'malware', 'firewall',
      '安全', '网络安全', '加密', '漏洞', '黑客', '隐私', '防火墙'],
  };
});
