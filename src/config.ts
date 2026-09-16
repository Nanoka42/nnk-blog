import avatar from '../assets/nanoka_avatar_512.jpg';
import conwayCover from '../assets/conway_checker_cover.png';
import { conwayPath } from '../config/redirects.mjs';

export const profile = {
  name: '微羽笔记本',
  englishName: 'Shinriin Nanoka',
  title: '微羽笔记本',
  description: '真理院七叶的小窝',
  // 可编辑的简介占位；请用自己的介绍替换。
  bio: '好奇让人类走向未知，懒惰让人类寻找捷径。',
  note: '毋待培风九万里，微羽逍遥千林中。',
  avatar,
  github: 'https://github.com/nanoka42',
  bilibili: 'https://space.bilibili.com/3707031020112609',
};

export const projects = [{
  slug: 'conway-soldiers',
  title: '康威跳棋',
  englishTitle: 'Conway’s Soldiers',
  description: '你能跳到第五行吗？（其实没人能做到）',
  tags: ['交互作品', '数学'],
  cover: conwayCover,
  coverAlt: '棋盘上的棋子与标记出的跳跃位置',
  playUrl: conwayPath,
}];
