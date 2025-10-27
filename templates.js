// --- FILE: templates.js (HTML 模板文件) --------------------------------------

// --- HTML 模板常量集 ----------------------------------------------------

/**
 * 地图下载结果页面的 HTML 骨架模板。
 * 使用双大括号 `{{...}}` 作为占位符，将在 getHtmlShell 中被替换。
*/
import HTML_SHELL_TEMPLATE from './assets/main/index.html';


/**
 * 地图搜索页面的 HTML 骨架模板。
 * 注意：搜索结果的渲染逻辑和交互脚本仍然嵌入在模板底部。
 */
import SEARCH_SHELL_TEMPLATE from './assets/search/index.html';

import diagnosticBlockTemplate from './assets/main/diagnostic-block.html';
import successButtonTemplate from './assets/main/action-button-success.html';
import disabledButtonTemplate from './assets/main/action-button-disabled.html';

// 导入工具函数
import { replaceTemplatePlaceholders } from './utils.js';

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
        diagnosticBlock
    } = params;

    // 使用对象键值对方式定义所有占位符
    const placeholders = {
      MAP_GROUP: mapGroup,
      MISSION_DISPLAY_TITLE: missionDisplayTitle,
      STATUS_TEXT: statusText,
      THEME_COLOR: themeColor,
      CARD_COLOR: cardColor,
      TEXT_COLOR: textColor,
      ICON: icon,
      FILE_NAME: fileName,
      INLINE_SIZE_TEXT: inlineSizeText,
      ACTION_BUTTON: actionButton,
      DIAGNOSTIC_BLOCK: diagnosticBlock
    };
    
    // 使用通用的占位符替换函数
    const html = replaceTemplatePlaceholders(HTML_SHELL_TEMPLATE, placeholders);

    return html.trim();
}

/**
 * 组装模板数据
 * @param {Object} data 数据对象
 * @returns {Object} 组装后的模板数据
 */
function assembleTemplateData(data) {
    const { filePath, fullCheckUrl, finalRedirectUrl, externalStatus, details, themeColor, fileExists } = data;
    
    // 准备模板参数
    const templateParams = {
        filePath,
        fullCheckUrl,
        finalRedirectUrl,
        externalStatus,
        details,
        themeColor,
        themeColorHover: themeColor.replace("500", "600"),
        disabledText: externalStatus === 503 ? "服务器连接失败，请稍后再试" : "地图不可用，无法下载"
    };
    
    // 替换占位符
    const diagnosticBlock = replaceTemplatePlaceholders(diagnosticBlockTemplate, templateParams);
    const actionButtons = fileExists 
        ? replaceTemplatePlaceholders(successButtonTemplate, templateParams)
        : replaceTemplatePlaceholders(disabledButtonTemplate, templateParams);
    return {
        diagnosticBlock,
        actionButtons
    };
}

/**
 * 搜索页面的 HTML 骨架。
 * @param {string} mapGroupOptions <select> 标签内的选项 HTML
 * @returns {string} 完整的 HTML 字符串
 */
function getSearchShell(mapGroupOptions) {
    // 使用通用的占位符替换函数
    return replaceTemplatePlaceholders(SEARCH_SHELL_TEMPLATE, { MAP_GROUP_OPTIONS: mapGroupOptions }).trim();
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

export { getHtmlShell, getSearchShell, assembleTemplateData };
