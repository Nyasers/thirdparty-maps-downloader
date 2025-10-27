// --- FILE: api.js (外部服务交互文件) -----------------------------------------
const CHECK_BASE_URL = "https://maps.nyase.ru/d";

/**
 * Performs the external file availability check and file size check.
 * 步骤: 1. 通过 GET 请求检查文件是否存在并获取重定向终点 (finalRedirectUrl，包含签名)。
 * 2. 如果存在，对 finalRedirectUrl 发送 HEAD 请求以获取文件大小 (最多重试 3 次，带指数退避)。
 * @param {string} mapGroup 地图分组标识
 * @param {string} missionDisplayTitle 地图的完整显示名称 (用于文件名和页面显示)
 * @returns {Promise<{fileExists: boolean, fullCheckUrl: string, filePath: string, externalStatus: number, details: string, fileSize: number | null, finalRedirectUrl: string}>}
 */
export async function checkFileStatus(mapGroup, missionDisplayTitle) {
  // 目标格式: /{mapGroup}/{mapGroup}-${missionDisplayTitle}.7z
  const filePath = `/${mapGroup}/${mapGroup}-${missionDisplayTitle}.7z`;
  const fullCheckUrl = CHECK_BASE_URL + filePath;

  let fileExists = false;
  let externalStatus = 0;
  let details = "文件不可用或发生未知错误。";
  let fileSize = null;
  let finalRedirectUrl = fullCheckUrl;

  // --- 执行 GET 请求进行存在性检查 ---
  try {
    console.log(`尝试 GET 请求检查文件可用性: ${fullCheckUrl}`);

    const externalRequest = new Request(fullCheckUrl, {
      method: "GET",
    });

    // 注意：fetch 会自动跟随重定向，最终响应的 URL 是重定向链的终点
    const externalResponse = await fetch(externalRequest);
    externalStatus = externalResponse.status;
    finalRedirectUrl = externalResponse.url; // 捕获重定向链的最终 URL

    // 严格判断文件存在性，只有 2xx/3xx 状态码才视为成功
    if (externalStatus >= 200 && externalStatus < 400) {
      fileExists = true;
      details = `文件已通过重定向检查，最终状态码 ${externalStatus} (成功)。`;
    } else {
      fileExists = false;
      details = `重定向服务或最终资源返回状态码 ${externalStatus}，文件检查失败。`;
    }
  } catch (e) {
    console.error("外部请求失败 (存在性检查):", e.message);
    details = `Worker 无法连接到外部资源服务器或请求超时: ${e.message}`;
    fileExists = false;
    externalStatus = 503; // 服务不可用
  }

  // --- 如果文件存在，尝试 HEAD 请求获取大小 (最多 3 次，带指数退避) ---
  if (fileExists) {
    const headUrl = finalRedirectUrl;
    const MAX_RETRIES = 3;
    let sizeFound = false;
    let delay = 500; // 初始退避延迟 500ms

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(
        `尝试 HEAD 请求获取文件大小 (尝试 ${attempt}/${MAX_RETRIES}): ${headUrl}`
      );

      try {
        const headResponse = await fetch(headUrl, {
          method: "HEAD",
        });

        if (headResponse.status >= 200 && headResponse.status < 300) {
          const contentLength = headResponse.headers.get("content-length");

          if (contentLength) {
            fileSize = parseInt(contentLength, 10);
            details += ` 文件大小已通过 HEAD 请求在第 ${attempt} 次尝试中获取。`;
            sizeFound = true;
            break; // 成功获取，退出循环
          } else {
            details += ` 文件存在，HEAD 请求 (第 ${attempt} 次) 未返回 Content-Length。`;
          }
        } else {
          details += ` 文件存在，HEAD 请求 (第 ${attempt} 次) 返回状态码 ${headResponse.status}。`;
        }
      } catch (e) {
        console.error(
          `HEAD 请求获取文件大小失败 (尝试 ${attempt}):`,
          e.message
        );
        details += ` HEAD 请求失败 (尝试 ${attempt}): ${e.message}。`;
        // 发生网络错误，需要进行退避和重试
      }

      if (sizeFound) {
        break;
      }

      // 如果不是最后一次尝试，则进行指数退避
      if (attempt < MAX_RETRIES) {
        console.log(`等待 ${delay}ms 后进行下一次尝试...`);
        // 在 Worker 中，使用 await new Promise(r => setTimeout(r, delay)); 实现非阻塞延迟
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2; // 指数增长延迟
      }
    }

    if (!sizeFound) {
      details += ` 经过 ${MAX_RETRIES} 次尝试，仍无法获取文件大小。`;
    }
  }

  return {
    fileExists,
    fullCheckUrl,
    filePath,
    externalStatus,
    details,
    fileSize,
    finalRedirectUrl,
  };
}
