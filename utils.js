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

/**
 * 通用模板占位符替换函数
 * @param {string} template HTML模板字符串
 * @param {Object} placeholders 占位符键值对对象
 * @returns {string} 替换后的HTML字符串
 */
export function replaceTemplatePlaceholders(template, placeholders) {
  return Object.entries(placeholders).reduce((acc, [key, value]) => {
    const pattern = new RegExp(`{{${key}}}`, 'g');
    return acc.replace(pattern, value);
  }, template);
}
