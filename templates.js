// --- FILE: templates.js (HTML 模板文件) --------------------------------------

// --- HTML 模板常量集 ----------------------------------------------------

/**
 * 地图下载结果页面的 HTML 骨架模板。
 * 使用双大括号 `{{...}}` 作为占位符，将在 getHtmlShell 中被替换。
*/
import HTML_SHELL_TEMPLATE from 'assets/main.js';


/**
 * 地图搜索页面的 HTML 骨架模板。
 * 注意：搜索结果的渲染逻辑和交互脚本仍然嵌入在模板底部。
 */
import SEARCH_SHELL_TEMPLATE from 'assets/search.js';

// --- 函数实现 -----------------------------------------------------------

/**
 * 提取的 HTML 模板：返回完整的 HTML 页面字符串，接受所有动态数据作为参数。
 * @param {object} params 所有需要填充到模板中的动态变量
 * @returns {string} 完整的 HTML 字符串
 */
function getHtmlShell(params) {
    const {
        mapGroup,
        missionDisplayTitle,
        statusText,
        themeColor,
        cardColor,
        textColor,
        icon,
        fileName,
        inlineSizeText,
        actionButton,
        diagnosticBlock,
        autoDownloadScript,
    } = params;

    let html = HTML_SHELL_TEMPLATE;

    // 使用 replace 方法替换所有占位符
    html = html.replace(/{{MAP_GROUP}}/g, mapGroup);
    html = html.replace(/{{MISSION_DISPLAY_TITLE}}/g, missionDisplayTitle);
    html = html.replace(/{{STATUS_TEXT}}/g, statusText);
    html = html.replace(/{{THEME_COLOR}}/g, themeColor);
    html = html.replace(/{{CARD_COLOR}}/g, cardColor);
    html = html.replace(/{{TEXT_COLOR}}/g, textColor);
    html = html.replace(/{{ICON}}/g, icon);
    html = html.replace(/{{FILE_NAME}}/g, fileName);
    html = html.replace(/{{INLINE_SIZE_TEXT}}/g, inlineSizeText);
    html = html.replace(/{{ACTION_BUTTON}}/g, actionButton);
    html = html.replace(/{{DIAGNOSTIC_BLOCK}}/g, diagnosticBlock);
    html = html.replace(/{{AUTO_DOWNLOAD_SCRIPT}}/g, autoDownloadScript);

    return html.trim();
}

/**
 * 生成详细诊断信息块的 HTML。
 * @param {{filePath: string, fullCheckUrl: string, externalStatus: number, details: string, finalRedirectUrl: string}} checkResult 检查结果对象
 * @returns {string} 诊断信息 HTML 字符串
 */
function getDiagnosticBlock(checkResult) {
    const { filePath, fullCheckUrl, finalRedirectUrl, externalStatus, details } =
        checkResult;

    // 内部片段仍然使用模板字符串，因为它们只处理自身的小部分变量
    return `<details class="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-100 cursor-pointer">
      <summary class="text-sm font-semibold text-gray-700">详细诊断信息</summary>
      <div class="pt-2 text-xs space-y-1">
          <p class="break-words"><strong>文件路径:</strong> <code class="bg-gray-200 p-1 rounded text-xs text-gray-700">${filePath}</code></p>
          <p class="break-words"><strong>查询链接:</strong> <code class="bg-gray-200 p-1 rounded text-xs text-gray-700">${fullCheckUrl}</code></p>
          <p class="break-words"><strong>下载链接:</strong> 
              <code class="bg-gray-200 p-1 rounded text-xs text-gray-700">${finalRedirectUrl}</code>
          </p>
          <p><strong>HTTP 状态码:</strong> ${externalStatus}</p>
          <p><strong>Worker 备注:</strong> ${details}</p>
      </div>
  </details>`;
}

/**
 * 生成操作按钮（下载链接或禁用按钮）的 HTML。
 * @param {{fileExists: boolean, externalStatus: number, finalRedirectUrl: string, themeColor: string}} params
 * @returns {string} 按钮 HTML 字符串
 */
function getActionButtons(params) {
    const { fileExists, externalStatus, finalRedirectUrl, themeColor } = params;

    if (fileExists) {
        // Successful download button
        return `<a href="${finalRedirectUrl}" target="_blank" class="block w-full px-8 py-3 mt-6 text-lg font-medium text-white ${themeColor} hover:${themeColor.replace(
            "500",
            "600"
        )} rounded-lg shadow-xl transition duration-150 ease-in-out text-center">若下载未自动开始，请点击此处</a>`;
    } else {
        // Disabled button
        const disabledText =
            externalStatus === 503
                ? "服务器连接失败，请稍后再试"
                : "地图不可用，无法下载";
        return `<button disabled class="w-full px-8 py-3 mt-6 text-lg font-medium text-white bg-gray-400 rounded-lg shadow-md cursor-not-allowed">${disabledText}</button>`;
    }
}

/**
 * 生成自动下载的 JavaScript 脚本。
 * @param {{fileExists: boolean, finalRedirectUrl: string}} params
 * @returns {string} 脚本 HTML 字符串
 */
function getAutoDownloadScript(params) {
    const { fileExists, finalRedirectUrl } = params;

    if (fileExists) {
        return `
            <script>
                // Auto-start download for modern browsers
                window.onload = () => {
                    // 等待一小段时间，确保页面渲染完成，再触发下载
                    setTimeout(() => {
                        window.location.href = '${finalRedirectUrl}';
                    }, 500); 
                };
            </script>
            `;
    }
    return "";
}

/**
 * 整合所有动态数据、样式和状态，准备用于 getHtmlShell。
 * 将所有数据组装逻辑从 worker.js 迁移到 templates.js，简化 worker.js。
 * @param {string} mapGroup
 * @param {string} missionDisplayTitle
 * @param {{fileExists: boolean, externalStatus: number, details: string, fileSize: number|null, finalRedirectUrl: string, filePath: string, fullCheckUrl: string}} checkResult
 * @param {function(number|null): string} formatBytesFn 用于格式化文件大小的工具函数 (formatBytes)
 * @returns {{workerStatus: number, htmlContent: string}} 包含最终状态码和 HTML 内容的对象
 */
export function assembleTemplateData(
    mapGroup,
    missionDisplayTitle,
    checkResult,
    formatBytesFn
) {
    const { fileExists, externalStatus, fileSize, finalRedirectUrl } =
        checkResult;

    // 1. 确定样式和状态
    let themeColor, cardColor, textColor, icon, statusText;

    // 内联 getDerivedStatus 逻辑
    if (fileExists) {
        themeColor = "bg-green-500";
        cardColor = "bg-white";
        textColor = "text-green-800";
        icon = "&#x2714;"; // Checkmark
        statusText = "下载即将开始…"; // 状态文本
    } else {
        if (externalStatus === 503) {
            themeColor = "bg-yellow-500";
            cardColor = "bg-white";
            textColor = "text-yellow-800";
            icon = "&#x26A0;"; // Warning sign
            statusText = "服务连接异常"; // 状态文本
        } else {
            themeColor = "bg-red-500";
            cardColor = "bg-white";
            textColor = "text-red-800";
            icon = "&#x2716;"; // X mark
            statusText = "未找到请求的地图"; // 状态文本
        }
    }

    // 2. 准备动态内容片段
    const fileName = `${mapGroup}-${missionDisplayTitle}.7z`;
    const formattedSize = formatBytesFn(fileSize);
    const inlineSizeText =
        fileSize !== null && fileExists ? ` (${formattedSize})` : "";

    // 3. 调用函数来生成子块
    const actionButton = getActionButtons({
        fileExists,
        externalStatus,
        finalRedirectUrl,
        themeColor,
    });

    const diagnosticBlock = getDiagnosticBlock(checkResult);

    const autoDownloadScript = getAutoDownloadScript({
        fileExists,
        finalRedirectUrl,
    });

    // 4. 计算 worker 状态
    const workerStatus = fileExists ? 200 : externalStatus === 503 ? 503 : 404;

    // 5. 调用模板函数
    const htmlContent = getHtmlShell({
        mapGroup,
        missionDisplayTitle,
        statusText,
        themeColor,
        cardColor,
        textColor,
        icon,
        fileName,
        inlineSizeText,
        actionButton,
        diagnosticBlock,
        autoDownloadScript,
    });

    return { workerStatus, htmlContent };
}

// --- 搜索页面模板逻辑 ---

/**
 * 搜索页面的 HTML 骨架。
 * @param {string} mapGroupOptions <select> 标签内的选项 HTML
 * @returns {string} 完整的 HTML 字符串
 */
function getSearchShell(mapGroupOptions) {
    // 模板使用 replace 方法替换 MAP_GROUP_OPTIONS 占位符
    let html = SEARCH_SHELL_TEMPLATE;
    html = html.replace('{{MAP_GROUP_OPTIONS}}', mapGroupOptions);
    return html.trim();
}

/**
 * 导出函数：生成完整的地图搜索页面的 HTML。
 * @returns {string} 完整的搜索页面 HTML
 */
export function getSearchPageHtml() {
    // 模板使用的地图组列表，根据用户提供的 API 结构，使用 A 和 B
    const defaultMapGroups = [
        { value: "A", label: "三方A" },
        { value: "B", label: "三方B" },
        { value: "", label: "全部" },
    ];

    const optionsHtml = defaultMapGroups
        .map(
            (group, index) =>
                `<option value="${group.value}" ${index === 0 ? "selected" : ""}>${group.label}</option>`
        )
        .join("");

    return getSearchShell(optionsHtml);
}
