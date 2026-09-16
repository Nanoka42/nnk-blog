---
title: "Markdown 排版与交互回归测试"
description: "开发专用 fixture：GFM、数学原始源码、Shiki、复制和移动端溢出。"
pubDate: 2026-09-09
tags: [Regression Only]
draft: true
---

# H1 / 一级标题

中文段落：此页仅供本地回归验证，不会生成到生产站点。English paragraph: a useful fixture must exercise real rendering and interactions, including punctuation, **strong text**, *emphasis* and ~~strikethrough~~.

## H2 / 数学公式

Inline math: $E = mc^2$，以及带尖括号和引号的 $x < y \quad \text{a\&b}$。

$$
\mathbf{y} = \mathbf{W}\mathbf{x} + \mathbf{b}
$$

$$
\begin{aligned}
L(\theta) &= \sum_{i=1}^{N} \left\| f_\theta(\mathbf{x}_i)-\mathbf{y}_i \right\|_2^2 \\
\nabla_\theta L &= 2\sum_{i=1}^{N} J_\theta(\mathbf{x}_i)^\top(f_\theta(\mathbf{x}_i)-\mathbf{y}_i)
\end{aligned}
$$

### H3 / 宽公式

$$
\underbrace{a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9+a_{10}+a_{11}+a_{12}+a_{13}+a_{14}+a_{15}+a_{16}+a_{17}+a_{18}}_{\text{a deliberately wide expression}} = \sum_{i=1}^{18}a_i
$$

#### H4 / 行内复制

用 Tab 聚焦公式旁的 ⧉ 按钮，按 Enter 复制原始 TeX。复制不包含 `$` 或 `$$`。长行内公式也应在自己的区域滚动：$a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9+a_{10}+a_{11}+a_{12}+a_{13}+a_{14}+a_{15}+a_{16}+a_{17}+a_{18}$。

## 表格 / Table

| Model | Accuracy |
| --- | ---: |
| A | 91.2% |
| B | 94.8% |

| Model with a deliberately long name | Dataset and evaluation protocol | Number of parameters | Accuracy | Notes |
| --- | --- | ---: | ---: | --- |
| A very wide experimental baseline | A deliberately wide column that should not wrap | 100,000,000 | 91.2% | Mobile horizontal scrolling |
| Another model | A held-out dataset | 24,000,000 | 94.8% | Keyboard focusable region |

## 代码 / Code

Inline code: `npm run build`。

```python
import torch

x = torch.randn(4, 128)
print(x.shape)
```

```python
print("a single fenced line still has a copy button")
```

```javascript
const message = '<button data-value="a&b">这不是 HTML</button>';
console.log(message);
```

```typescript
const notes: Array<{ title: string; draft: boolean }> = [{ title: 'A deliberately long code line that should scroll independently instead of widening the whole mobile document', draft: false }];
```

```bash
npm ci
npm run build
```

```json
{ "title": "Nanoka", "draft": false }
```

```yaml
title: "七叶的笔记"
draft: false
```

```html
<a href="/posts/" aria-label="文章">阅读文章</a>
```

```css
.article { max-width: 760px; }
```

```c
int main(void) { return 0; }
```

```cpp
#include <iostream>
int main() { std::cout << "Hello"; }
```

## 图片与链接

![康威跳棋测试封面，绿色棋子位于棋盘上](../../../assets/conway_checker_cover.png)

[GitHub](https://github.com/nanoka42)，[返回文章列表](/posts/)。这是一个脚注引用。[^note]

## 引用与列表

> 一个中文引用。
>
> A second paragraph with **emphasis**.

- 无序列表第一项
- 第二项含 `inline code`

1. 有序列表第一项
2. 第二项

- [x] 完成项
- [ ] 未完成项

---

[^note]: 回归测试脚注，用于验证 GFM 的脚注锚点。
