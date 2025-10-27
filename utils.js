// --- FILE: utils.js (工具函数文件) --------------------------------------------
/**
 * Helper function to format bytes into human-readable strings (KB, MB, GB).
 * @param {number | null | undefined} bytes 字节数
 * @param {number} decimals 小数位数
 * @returns {string} 格式化后的字符串
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return "";
  const num = Number(bytes);
  if (num === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(num) / Math.log(k));

  return parseFloat((num / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
