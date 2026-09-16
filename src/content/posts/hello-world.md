---
title: "Hello, world!"
description: "你好，世界！"
pubDate: 2026-09-09
tags: [杂谈]
draft: false
---

欢迎来到真理院七叶的小窝！在这里会发布与频道相关的可交互作品和创作记录等。

第一个可交互作品是[康威跳棋](/projects/conway-soldiers/)。试试看，棋子究竟能走到多高？

你也可以通过 [RSS](/rss.xml) 订阅新文章。

## 测试内容

仿射变换可以写成：

$$
\mathbf{y} = \mathbf{W}\mathbf{x} + \mathbf{b}
$$

如果 $\mathbf{x}\in\mathbb{R}^{128}$，而 $\mathbf{W}\in\mathbb{R}^{32\times128}$ 和 $\mathbf{b}\in\mathbb{R}^{32}$，那么 $\mathbf{y}\in\mathbb{R}^{32}$。

符号之外，也可以用代码把形状打印出来：

```python
import torch

x = torch.randn(4, 128)
layer = torch.nn.Linear(128, 32)
y = layer(x)
print(y.shape)  # torch.Size([4, 32])
```

公式旁的复制按钮会复制原始 TeX 文本，代码块上方的按钮则会复制代码文本。

| 符号 | 含义 | 形状 |
| --- | --- | ---: |
| x | 一批输入向量 | 4 × 128 |
| W | 线性层权重 | 32 × 128 |
| y | 输出向量 | 4 × 32 |

> 测试测试测试测试测试测试测试测试测试！！！