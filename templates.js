// --- FILE: templates.js (HTML 模板文件) --------------------------------------

// --- HTML 模板常量集 ----------------------------------------------------
import htmlShellTemplate from './assets/main/index.html';
import searchShellTemplate from './assets/search/index.html';
import successButtonTemplate from './assets/main/action-button-success.html';
import disabledButtonTemplate from './assets/main/action-button-disabled.html';
import diagnosticBlockTemplate from './assets/main/diagnostic-block.html';

// 导入工具函数
import { replaceTemplatePlaceholders, formatBytes } from './utils.js';

// --- 函数实现 -----------------------------------------------------------

/**
 * 提取的 HTML 模板：返回完整的 HTML 页面字符串，接受所有动态数据作为参数。
 * @param {object} params 所有需要填充到模板中的动态变量
 * @returns {string} 完整的 HTML 字符串
 */
export function getHtmlShell(params) {
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
        finalRedirectUrl = '' // 添加finalRedirectUrl参数，用于JavaScript替换
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
        DIAGNOSTIC_BLOCK: diagnosticBlock,
        finalRedirectUrl: finalRedirectUrl // 添加finalRedirectUrl到占位符中
    };

    // 使用通用的占位符替换函数
    const html = replaceTemplatePlaceholders(htmlShellTemplate, placeholders);

    return html.trim();
}

/**
 * 组装模板数据
 * @param {Object} data 数据对象
 * @returns {Object} 组装后的模板数据
 */
export function assembleTemplateData(data) {
    const { filePath, fullCheckUrl, finalRedirectUrl, externalStatus, details, themeColor, fileExists } = data;

    // 确保themeColor是正确的Tailwind类名格式，而不是直接的颜色值
    const formattedThemeColor = themeColor.startsWith('bg-') ? themeColor : 'bg-green-500';
    const formattedThemeColorHover = formattedThemeColor.replace("500", "600");

    // 准备模板参数
    const templateParams = {
        filePath,
        fullCheckUrl,
        finalRedirectUrl,
        externalStatus,
        details,
        themeColor: formattedThemeColor,
        themeColorHover: formattedThemeColorHover,
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
    return replaceTemplatePlaceholders(searchShellTemplate, { MAP_GROUP_OPTIONS: mapGroupOptions }).trim();
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
    ];

    const optionsHtml = defaultMapGroups
        .map(
            (group, index) =>
                `<option value="${group.value}" ${index === 0 ? "selected" : ""}>${group.label}</option>`
        )
        .join("");

    return getSearchShell(optionsHtml);
}

/**
 * 根据文件检查结果生成一个用户友好的 HTML 响应页面。
 * 负责收集所有动态数据并调用模板。
 */
export function generateHtmlResponse(mapGroup, missionDisplayTitle, checkResult) {
    // 使用新的 assembleTemplateData 函数一次性完成所有数据组装和 HTML 生成
    // checkResult 包含了 { fileExists, fullCheckUrl, externalStatus, details, fileSize, finalRedirectUrl }

    // 根据检查结果设置主题颜色和状态文本
    // 使用正确的Tailwind CSS类名格式，而不是直接的颜色值
    // 将未找到地图的状态从灰色改为橙色，提供更好的视觉区分
    const themeColor = checkResult.fileExists ? "bg-green-500" : (checkResult.externalStatus === 503 ? "bg-red-500" : "bg-orange-500");
    const statusText = checkResult.fileExists ? "地图可用" : (checkResult.externalStatus === 503 ? "服务器连接失败" : "地图不可用");
    const cardColor = "bg-white";
    const textColor = "text-gray-900";
    const icon = checkResult.fileExists ? "✓" : "✗";
    const fileName = `${mapGroup}-${missionDisplayTitle}.7z`;
    const inlineSizeText = checkResult.fileSize ? formatBytes(checkResult.fileSize) : "未知大小";

    // 组装模板数据
    const templateData = assembleTemplateData({
        ...checkResult,
        themeColor
    });

    // 准备完整的参数对象
    const params = {
        mapGroup,
        missionDisplayTitle,
        statusText,
        themeColor,
        cardColor,
        textColor,
        icon,
        fileName,
        inlineSizeText,
        actionButton: templateData.actionButtons,
        diagnosticBlock: templateData.diagnosticBlock,
        finalRedirectUrl: checkResult.finalRedirectUrl // 确保finalRedirectUrl被传递给getHtmlShell
    };

    // 获取HTML内容
    const htmlContent = getHtmlShell(params);

    // 设置适当的状态码
    const workerStatus = checkResult.fileExists ? 200 : (checkResult.externalStatus === 503 ? 503 : 404);

    return new Response(htmlContent, {
        headers: { "content-type": "text/html;charset=UTF-8" },
        status: workerStatus,
    });
}

/**
 * 生成搜索页面响应
 */
export function generateSearchResponse() {
    const htmlContent = getSearchPageHtml();
    return new Response(htmlContent, {
        headers: { "content-type": "text/html;charset=UTF-8" },
        status: 200,
    });
}
