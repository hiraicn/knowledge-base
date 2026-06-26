(function () {
  'use strict';

  // ─── 分类颜色映射 ───
  var CAT_COLORS = {
    '人工智能': '#f97316', '编程开发': '#3b82f6', '数据库': '#10b981',
    '云计算': '#06b6d4', '科学': '#8b5cf6', '商业': '#f59e0b',
    '产品': '#ec4899', '设计': '#f43f5e', '科技': '#6366f1',
    '教育': '#14b8a6', '生活': '#84cc16', '文化': '#a855f7',
    '职场': '#ef4444', '安全': '#64748b', '未分类': '#6b7280',
  };

  function getCatColor(cat) {
    if (CAT_COLORS[cat]) return CAT_COLORS[cat];
    // 动态生成颜色(自定义分类)
    var hash = 0;
    for (var i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash);
    var hue = Math.abs(hash % 360);
    return 'hsl(' + hue + ', 65%, 55%)';
  }

  // ─── 从 chrome.storage 加载数据 ───
  function loadArticles(callback) {
    chrome.storage.local.get('kb_articles', function (result) {
      callback(result.kb_articles || []);
    });
  }

  // ─── 构建图数据 ───
  function buildGraph(articles) {
    var nodes = [];
    var links = [];
    var urlToIndex = {};

    // 节点
    articles.forEach(function (a, i) {
      urlToIndex[a.url] = i;
      var inDegree = (a.referencedBy || []).length;
      nodes.push({
        id: a.id,
        index: i,
        title: a.title,
        category: a.category || '未分类',
        tags: a.tags || [],
        domain: a.domain || '',
        url: a.url,
        summary: a.summary || '',
        inDegree: inDegree,
        radius: Math.max(6, Math.min(20, 6 + inDegree * 3)),
      });
    });

    // 边:基于共同标签(≥2)
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var sharedTags = nodes[i].tags.filter(function (t) {
          return nodes[j].tags.indexOf(t) !== -1;
        });
        if (sharedTags.length >= 2) {
          links.push({ source: i, target: j, type: 'tag', strength: sharedTags.length });
        }
      }
    }

    // 边:相同域名
    var domainMap = {};
    nodes.forEach(function (n, i) {
      if (!n.domain) return;
      if (!domainMap[n.domain]) domainMap[n.domain] = [];
      domainMap[n.domain].push(i);
    });
    Object.values(domainMap).forEach(function (indices) {
      if (indices.length < 2) return;
      for (var a = 0; a < indices.length; a++) {
        for (var b = a + 1; b < indices.length; b++) {
          // 避免重复
          var exists = links.some(function (l) {
            return (l.source === indices[a] && l.target === indices[b]) ||
                   (l.source === indices[b] && l.target === indices[a]);
          });
          if (!exists) {
            links.push({ source: indices[a], target: indices[b], type: 'domain', strength: 1 });
          }
        }
      }
    });

    // 边:引用关系
    articles.forEach(function (a, i) {
      (a.references || []).forEach(function (refId) {
        var targetIdx = nodes.findIndex(function (n) { return n.id === refId; });
        if (targetIdx >= 0) {
          var exists = links.some(function (l) {
            return (l.source === i && l.target === targetIdx) ||
                   (l.source === targetIdx && l.target === i);
          });
          if (!exists) {
            links.push({ source: i, target: targetIdx, type: 'ref', strength: 2 });
          }
        }
      });
    });

    return { nodes: nodes, links: links };
  }

  // ─── 渲染图谱 ───
  function renderGraph(graph) {
    document.getElementById('loading').style.display = 'none';

    var container = document.getElementById('graph-container');
    var width = container.clientWidth;
    var height = container.clientHeight;

    var svg = d3.select('#graph-svg');
    svg.selectAll('*').remove();

    // 缩放容器
    var g = svg.append('g');

    var zoom = d3.zoom()
      .scaleExtent([0.1, 5])
      .on('zoom', function (event) {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    // 力导向模拟
    var simulation = d3.forceSimulation(graph.nodes)
      .force('link', d3.forceLink(graph.links).id(function (d) { return d.index; }).distance(80).strength(function (d) { return Math.min(0.5, d.strength * 0.1); }))
      .force('charge', d3.forceManyBody().strength(-120).distanceMax(400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(function (d) { return d.radius + 4; }))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03));

    // 边
    var link = g.append('g')
      .selectAll('line')
      .data(graph.links)
      .join('line')
      .attr('class', 'link')
      .attr('stroke', function (d) {
        if (d.type === 'ref') return '#f97316';
        if (d.type === 'domain') return '#06b6d4';
        return '#58a6ff';
      })
      .attr('stroke-width', function (d) { return Math.min(3, 0.5 + d.strength * 0.5); });

    // 节点组
    var node = g.append('g')
      .selectAll('g')
      .data(graph.nodes)
      .join('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded));

    // 节点圆
    node.append('circle')
      .attr('r', function (d) { return d.radius; })
      .attr('fill', function (d) { return getCatColor(d.category); })
      .attr('opacity', 0.85);

    // 发光效果
    node.append('circle')
      .attr('r', function (d) { return d.radius + 3; })
      .attr('fill', 'none')
      .attr('stroke', function (d) { return getCatColor(d.category); })
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.2);

    // 节点标签(只显示大节点)
    node.append('text')
      .text(function (d) {
        var t = d.title;
        return t.length > 12 ? t.slice(0, 12) + '...' : t;
      })
      .attr('dy', function (d) { return d.radius + 14; })
      .style('font-size', '9px');

    // Tooltip
    var tooltip = document.getElementById('tooltip');

    node.on('mouseover', function (event, d) {
      // 高亮相关节点
      var connected = new Set();
      connected.add(d.index);
      graph.links.forEach(function (l) {
        var si = typeof l.source === 'object' ? l.source.index : l.source;
        var ti = typeof l.target === 'object' ? l.target.index : l.target;
        if (si === d.index) connected.add(ti);
        if (ti === d.index) connected.add(si);
      });

      node.classed('dimmed', function (n) { return !connected.has(n.index); });
      link.classed('dimmed', function (l) {
        var si = typeof l.source === 'object' ? l.source.index : l.source;
        var ti = typeof l.target === 'object' ? l.target.index : l.target;
        return si !== d.index && ti !== d.index;
      });
      link.classed('highlighted', function (l) {
        var si = typeof l.source === 'object' ? l.source.index : l.source;
        var ti = typeof l.target === 'object' ? l.target.index : l.target;
        return si === d.index || ti === d.index;
      });

      // Tooltip 内容
      tooltip.querySelector('.tt-title').textContent = d.title;
      tooltip.querySelector('.tt-meta').textContent = d.category + ' · ' + d.domain + (d.summary ? '' : '');
      var tagsHtml = d.tags.map(function (t) { return '<span class="tt-tag">' + t + '</span>'; }).join('');
      tooltip.querySelector('.tt-tags').innerHTML = tagsHtml;
      tooltip.style.display = 'block';
    })
    .on('mousemove', function (event) {
      tooltip.style.left = (event.clientX + 16) + 'px';
      tooltip.style.top = (event.clientY - 10) + 'px';
    })
    .on('mouseout', function () {
      node.classed('dimmed', false);
      link.classed('dimmed', false);
      link.classed('highlighted', false);
      tooltip.style.display = 'none';
    })
    .on('click', function (event, d) {
      window.open('kb-page.html#' + d.id, '_self');
    });

    // 力模拟 tick
    simulation.on('tick', function () {
      link
        .attr('x1', function (d) { return d.source.x; })
        .attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; })
        .attr('y2', function (d) { return d.target.y; });

      node.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
    });

    // 拖拽函数
    function dragStarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragEnded(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // 统计
    document.getElementById('stat-nodes').textContent = graph.nodes.length;
    document.getElementById('stat-edges').textContent = graph.links.length;

    // 图例
    var cats = {};
    graph.nodes.forEach(function (n) {
      if (!cats[n.category]) cats[n.category] = 0;
      cats[n.category]++;
    });
    var legendHtml = '<h4>分类图例</h4>';
    Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).forEach(function (cat) {
      legendHtml += '<div class="legend-item" data-cat="' + cat + '"><span class="legend-dot" style="background:' + getCatColor(cat) + '"></span>' + cat + ' (' + cats[cat] + ')</div>';
    });
    document.getElementById('legend').innerHTML = legendHtml;

    // 图例点击过滤
    document.getElementById('legend').addEventListener('click', function (e) {
      var item = e.target.closest('.legend-item');
      if (!item) return;
      var cat = item.getAttribute('data-cat');
      document.getElementById('filter-cat').value = cat;
      applyFilter();
    });

    // 存储渲染引用供过滤使用
    window._graphRender = { svg: svg, g: g, node: node, link: link, simulation: simulation, graph: graph };
  }

  // ─── 过滤 ───
  function applyFilter() {
    if (!window._graphRender) return;
    var catFilter = document.getElementById('filter-cat').value;
    var searchFilter = document.getElementById('filter-search').value.trim().toLowerCase();
    var r = window._graphRender;

    r.node.style('display', function (d) {
      var show = true;
      if (catFilter && d.category !== catFilter) show = false;
      if (searchFilter && !d.tags.some(function (t) { return t.toLowerCase().indexOf(searchFilter) !== -1; }) && d.title.toLowerCase().indexOf(searchFilter) === -1) show = false;
      return show ? null : 'none';
    });

    r.link.style('display', function (d) {
      var si = typeof d.source === 'object' ? d.source.index : d.source;
      var ti = typeof d.target === 'object' ? d.target.index : d.target;
      var sNode = r.graph.nodes[si];
      var tNode = r.graph.nodes[ti];
      var sShow = true, tShow = true;
      if (catFilter && sNode.category !== catFilter) sShow = false;
      if (catFilter && tNode.category !== catFilter) tShow = false;
      if (searchFilter) {
        if (!sNode.tags.some(function (t) { return t.toLowerCase().indexOf(searchFilter) !== -1; }) && sNode.title.toLowerCase().indexOf(searchFilter) === -1) sShow = false;
        if (!tNode.tags.some(function (t) { return t.toLowerCase().indexOf(searchFilter) !== -1; }) && tNode.title.toLowerCase().indexOf(searchFilter) === -1) tShow = false;
      }
      return (sShow && tShow) ? null : 'none';
    });
  }

  // ─── 初始化 ───
  loadArticles(function (articles) {
    if (articles.length === 0) {
      document.getElementById('loading').innerHTML = '知识库为空,请先添加文章';
      return;
    }

    var graph = buildGraph(articles);

    // 填充分类过滤器
    var cats = {};
    articles.forEach(function (a) {
      var cat = a.category || '未分类';
      if (!cats[cat]) cats[cat] = 0;
      cats[cat]++;
    });
    var select = document.getElementById('filter-cat');
    Object.keys(cats).sort().forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat + ' (' + cats[cat] + ')';
      select.appendChild(opt);
    });

    document.getElementById('stats-text').textContent = articles.length + ' 篇文章 · ' + graph.links.length + ' 条关联';

    // 延迟渲染让 loading 先显示
    setTimeout(function () { renderGraph(graph); }, 100);
  });

  // 过滤事件
  document.getElementById('filter-cat').addEventListener('change', applyFilter);
  document.getElementById('filter-search').addEventListener('input', applyFilter);

  // 窗口大小变化
  window.addEventListener('resize', function () {
    if (window._graphRender) {
      var container = document.getElementById('graph-container');
      window._graphRender.simulation.force('center', d3.forceCenter(container.clientWidth / 2, container.clientHeight / 2));
      window._graphRender.simulation.alpha(0.3).restart();
    }
  });
})();
