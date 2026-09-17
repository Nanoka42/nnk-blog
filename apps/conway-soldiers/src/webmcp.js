// Progressive enhancement; standard Chrome/Edge/Safari need no agent API.
export function registerGameTools(actions) {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const point = { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 };
  const result = () => new Promise(resolve => requestAnimationFrame(() => resolve(actions.snapshot())));
  const tools = [
    { name: 'read_conway_game', description: '读取当前康威跳棋的模式、基准状态、有限差异坐标集合及统计。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => actions.snapshot() },
    { name: 'toggle_blueprint_cells', description: '在蓝图中批量切换 y≤0 的格子，改变当前布局。', inputSchema: { type: 'object', properties: { cells: { type: 'array', items: point, maxItems: 1000 } }, required: ['cells'], additionalProperties: false }, execute: async input => { actions.edit(input?.cells); return result(); } },
    { name: 'start_conway_game', description: '保存当前蓝图为开局快照并开始跳棋。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, execute: async () => { actions.start(); return result(); } },
    { name: 'move_conway_piece', description: '在游玩模式执行一次合法的四向跳吃，移除被跳过的棋子。', inputSchema: { type: 'object', properties: { from: point, to: point }, required: ['from', 'to'], additionalProperties: false }, execute: async input => { actions.move(input?.from, input?.to); return result(); } },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(context.registerTool({ ...tool, annotations: { readOnlyHint: false, untrustedContentHint: false, ...tool.annotations } }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Optional experimental API must not affect normal play. */ }
  }
  window.addEventListener('pagehide', event => { if (!event.persisted) lifecycle.abort(); });
}
