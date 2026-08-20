import { describe, it, expect } from 'vitest';
import { shortId, SHORT_ID_ALPHABET, SHORT_ID_LENGTH } from './short-id';

describe('shortId', () => {
  it('默认长度 10', () => {
    expect(shortId()).toHaveLength(SHORT_ID_LENGTH);
  });

  it('可以指定长度', () => {
    expect(shortId(4)).toHaveLength(4);
    expect(shortId(24)).toHaveLength(24);
  });

  it('只用字母表里的字符', () => {
    for (let i = 0; i < 200; i++) {
      for (const ch of shortId()) {
        expect(SHORT_ID_ALPHABET).toContain(ch);
      }
    }
  });

  it('不含形近字 0 1 i l o，也不含 u', () => {
    const banned = new Set(['0', '1', 'i', 'l', 'o', 'u']);
    for (let i = 0; i < 200; i++) {
      for (const ch of shortId()) {
        expect(banned.has(ch)).toBe(false);
      }
    }
  });

  it('两千次不重复', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(shortId());
    expect(seen.size).toBe(2000);
  });

  it('拒绝采样：字符分布没有明显偏斜', () => {
    // 240 是 30 的整数倍，被拒绝的字节不会让前 16 个字符高频
    const counts = new Map<string, number>();
    for (const ch of shortId(30000)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    const expected = 30000 / SHORT_ID_ALPHABET.length;
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(expected * 0.8);
      expect(n).toBeLessThan(expected * 1.2);
    }
  });
});
