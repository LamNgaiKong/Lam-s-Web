/* ==========================================================================
   NSCA 全局知识图谱 · ECharts 力导向图
   数据来源：
     - window.NSCA_TREE（nsca-tree.js，由 notes/ 目录自动生成，节点层级=文件夹层级）
     - window.NSCA_NOTES.relations（nsca-relations.js，跨章节关联边）
   交互：拖拽平移 / 滚轮缩放 / 拖拽节点 / 悬停提示 / 点击节点跳转到对应 HTML 页
   暗黑模式：读取主站 CSS 变量，data-theme 变化时自动重绘
   ========================================================================== */
(function () {
  'use strict';

  var NOTES = window.NSCA_NOTES || { relations: [] };
  var TREE = window.NSCA_TREE || { nodes: [], links: [] };
  var chart = null;
  var handlersReady = false;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function buildOption() {
    var text = cssVar('--text');
    var muted2 = cssVar('--muted-2');
    var borderStrong = cssVar('--border-strong');
    var surface = cssVar('--surface');
    var accent = cssVar('--accent');
    var accent2 = cssVar('--accent-2');
    var sectionColor = isDark() ? '#2dd4bf' : '#0d9488';

    var colorByDepth = { 0: accent2, 1: accent, 2: sectionColor, 3: muted2 };
    var sizeByDepth = { 0: 62, 1: 46, 2: 28, 3: 16 };

    var nodeIds = new Set(TREE.nodes.map(function (n) { return n.id; }));

    var nodes = TREE.nodes.map(function (n) {
      return {
        id: n.id,
        name: n.name,
        file: n.file,
        depth: n.depth,
        symbolSize: sizeByDepth[n.depth] || 16,
        itemStyle: { color: colorByDepth[n.depth] || muted2, opacity: 1 },
        label: { color: n.depth === 3 ? muted2 : text, fontSize: n.depth === 0 ? 15 : (n.depth === 1 ? 14 : 12) }
      };
    });

    var links = TREE.links.map(function (l) {
      return { source: l.source, target: l.target, kind: 'tree' };
    });

    // 跨章节关联边（只保留两端节点都存在的）
    (NOTES.relations || []).forEach(function (r) {
      if (nodeIds.has(r.from) && nodeIds.has(r.to)) {
        links.push({
          source: r.from,
          target: r.to,
          kind: 'relation',
          label: r.sub ? (r.from + ' → ' + r.to + ' · ' + r.sub) : (r.from + ' → ' + r.to)
        });
      }
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: surface,
        borderColor: borderStrong,
        textStyle: { color: text, fontSize: 13 },
        confine: true,
        formatter: function (p) {
          if (p.dataType === 'edge') return (p.data.kind === 'relation') ? (p.data.label || '') : '';
          var d = p.data;
          var lvl = { 0: '总览', 1: '章节', 2: '小节', 3: '主题' }[d.depth] || '';
          if (d.depth === 0) return '<b>' + d.name + '</b>（' + lvl + '）';
          return '<b>' + d.name + '</b>（' + lvl + '）<br/>点击跳转到页面';
        }
      },
      series: [{
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        data: nodes,
        links: links,
        label: {
          show: true,
          position: 'right',
          formatter: function (p) { return p.data.name; }
        },
        edgeLabel: { show: false },
        lineStyle: { color: 'source', opacity: 0.3, curveness: 0.08, width: 1 },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 2, opacity: 0.7 },
          label: { fontSize: 14, fontWeight: 'bold' }
        },
        force: { repulsion: 200, gravity: 0.06, edgeLength: [45, 120], layoutAnimation: true }
      }]
    };
  }

  function render() {
    var el = document.getElementById('graph');
    if (!el || !window.echarts) return;
    if (!chart) {
      chart = window.echarts.init(el);
      chart.on('click', function (params) {
        if (params.dataType !== 'node') return;
        var d = params.data;
        if (d.file) window.location.href = d.file;
      });
      window.addEventListener('resize', function () { chart.resize(); });
    }
    chart.setOption(buildOption(), true);
  }

  function mount(containerId, focusTitle) {
    render();
    setupHandlers();
  }

  function resize(containerId) {
    if (chart) chart.resize();
  }

  function setupHandlers() {
    if (handlersReady) return;
    handlersReady = true;
    if (window.MutationObserver) {
      new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
  }

  window.NSCAGraph = { mount: mount, resize: resize };
})();
