// Optional progressive enhancement; browsers without WebMCP remain fully playable.
export function registerGameTools(actions) {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const point = {type:'array',items:{type:'integer'},minItems:3,maxItems:3};
  const result = () => new Promise(resolve => requestAnimationFrame(() => resolve(actions.snapshot())));
  const list = [
    {name:'read_conway_game',description:'读取三维康威跳棋的模式、完整有限差异集合、统计及工作切片视图。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>actions.snapshot()},
    {name:'toggle_blueprint_cells',description:'在蓝图模式切换 Z≤0 的三维格点，所有坐标为 [X,Y,Z]。',inputSchema:{type:'object',properties:{cells:{type:'array',items:point,maxItems:1000}},required:['cells'],additionalProperties:false},execute:async input=>{actions.edit(input?.cells);return result();}},
    {name:'start_conway_game',description:'保存开局布局，开始三维跳棋。',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:async()=>{actions.start();return result();}},
    {name:'move_conway_piece',description:'执行三维康威跳棋的一次六轴正交跳吃，坐标为 [X,Y,Z]；视图遵循自动跟随开关。',inputSchema:{type:'object',properties:{from:point,to:point},required:['from','to'],additionalProperties:false},execute:async input=>{actions.move(input?.from,input?.to);return result();}},
  ];
  for (const tool of list) {
    try { Promise.resolve(context.registerTool({...tool,annotations:{readOnlyHint:false,untrustedContentHint:false,...tool.annotations}},{signal:lifecycle.signal})).catch(()=>{}); }
    catch { /* Experimental APIs must never block ordinary gameplay. */ }
  }
  window.addEventListener('pagehide',event=>{if(!event.persisted)lifecycle.abort();});
}
