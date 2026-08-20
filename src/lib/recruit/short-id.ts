/**
 * 短 ID。招聘模块的岗位和候选人 id 都进 URL，
 * 两个 UUID 拼起来地址栏里全是乱码，没法看也没法念。
 *
 * 字母表去掉了 0 1 i l o u：前几个是形近字（0/O、1/l/I），
 * u 是为了避免随机拼出脏字。剩 30 个字符，10 位约 5.9e14 种组合，
 * 单用户量级下碰撞概率可以忽略。
 */
const ALPHABET = '23456789abcdefghjkmnpqrstvwxyz';
const LENGTH = 10;

/** 256 不是 30 的整数倍，直接取模会让前 16 个字符略微高频。拒绝采样避开这个偏差。 */
const LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length; // 240

export function shortId(length = LENGTH): string {
  let out = '';
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte >= LIMIT) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export const SHORT_ID_ALPHABET = ALPHABET;
export const SHORT_ID_LENGTH = LENGTH;
