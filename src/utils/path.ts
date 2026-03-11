/**
 * 去除从终端/IDE 粘贴路径时带入的 shell 转义字符
 *
 * 例如: `30.02.00\ 总览与映射.md` → `30.02.00 总览与映射.md`
 */
export function stripShellEscapes(path: string): string {
  return path.replace(/\\(?=[ '"()&!#$`{}[\]])/g, '');
}
