import katex from 'katex';
import { visit } from 'unist-util-visit';

const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#39;');

/** Read TeX directly from the remark math AST, before any HTML is generated. */
export function remarkMathSource() {
  return (tree) => {
    const headingMath = new WeakSet();
    visit(tree, 'heading', (heading) => visit(heading, 'inlineMath', (math) => { headingMath.add(math); }));
    visit(tree, 'code', (node) => {
      node.data ||= {};
      node.data.hProperties ||= {};
      node.data.hProperties.dataCodeSource = node.value;
    });
    visit(tree, (node) => node.type === 'math' || node.type === 'inlineMath', (node, index, parent) => {
      const display = node.type === 'math';
      const source = escape(node.value);
      const rendered = katex.renderToString(node.value, { displayMode: display, output: 'htmlAndMathml', throwOnError: true, trust: false });
      const tag = display ? 'div' : 'span';
      const html = {
        type: 'html',
        value: `<${tag} class="math-copy ${display ? 'math-block' : 'math-inline'}" data-math-source="${source}"><${tag} class="math-scroll">${rendered}</${tag}><button type="button" class="copy-button math-copy-button" data-copy-source="${source}" aria-label="复制${display ? '独立' : '行内'}公式的 TeX" title="复制原始 TeX"><span aria-hidden="true">${display ? '复制公式' : '⧉'}</span></button></${tag}>`,
      };
      if (headingMath.has(node)) {
        // Heading collectors ignore raw HTML. Keep one hidden text node for their slug/TOC.
        parent.children.splice(index, 1, {
          type: 'emphasis', children: [{ type: 'text', value: node.value }],
          data: { hName: 'span', hProperties: { className: ['math-heading-source'], ariaHidden: 'true' } },
        }, html);
        return index + 2;
      }
      parent.children[index] = html;
    });
  };
}

const textContent = (node) => node.type === 'text' ? node.value : (node.children || []).map(textContent).join('');
const element = (tagName, properties, children) => ({ type: 'element', tagName, properties, children });
const text = (value) => ({ type: 'text', value });

/** Shiki's transformer retains its raw input; never reconstruct source from highlighted tokens. */
export function rehypeReading() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (!parent || index == null) return;
      if (node.tagName === 'pre' && parent.properties?.className?.includes('code-block') !== true) {
        const code = node.children.find((child) => child.tagName === 'code');
        if (!code) return;
        const source = node.properties['data-code-source'] ?? code.properties?.dataCodeSource;
        if (typeof source !== 'string') throw new Error('Code block is missing its original Shiki source.');
        const language = node.properties['data-code-language'] || 'text';
        node.properties.tabIndex = 0;
        node.properties.role = 'region';
        node.properties.ariaLabel = `${language} 代码，可横向滚动`;
        parent.children[index] = element('div', { className: ['code-block'] }, [
          element('div', { className: ['code-toolbar'] }, [
            element('span', {}, [text(language)]),
            element('button', { type: 'button', className: ['copy-button'], dataCopySource: source, ariaLabel: '复制代码' }, [text('复制代码')]),
          ]), node,
        ]);
      } else if (node.tagName === 'table' && !parent.properties?.className?.includes('table-scroll')) {
        parent.children[index] = element('div', { className: ['table-scroll'], tabIndex: 0, role: 'region', ariaLabel: '表格，可横向滚动' }, [node]);
      } else if (/^h[1-6]$/.test(node.tagName) && node.properties?.id) {
        const label = textContent(node);
        node.children.push(element('a', { className: ['heading-anchor'], href: `#${node.properties.id}`, ariaLabel: `链接到：${label}`, dataAnchor: '' }, []));
      }
    });
  };
}
