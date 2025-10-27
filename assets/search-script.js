import searchResultItemTemplate from './search-result-item.html';
import { replaceTemplatePlaceholders } from '../utils.js';

// 搜索表单提交处理
document.getElementById('search-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const form = e.target;
    const mapGroup = form.mapGroup.value;
    const query = form.query.value;
    const resultsContainer = document.getElementById('results-container');
    const searchButton = document.getElementById('search-button');
    const buttonText = document.getElementById('button-text');
    const spinner = document.getElementById('loading-spinner');

    // 启用加载状态
    searchButton.disabled = true;
    buttonText.textContent = '搜索中...';
    spinner.classList.remove('hidden');
    resultsContainer.innerHTML = `<p class="text-center text-gray-500">正在努力搜索中...</p>`;

    // 目标 API URL
    const apiUrl = 'https://l4d2server.com/l4d2/backend/mapMission/list';

    const payload = {
        mapGroup: mapGroup,
        query: query,
        modes: [],
        current: 1,
        size: 100
    };

    fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // 禁用加载状态
            spinner.classList.add('hidden');
            buttonText.textContent = '搜索三方图';
            searchButton.disabled = false;

            if (data && data.data && data.data.records && data.data.records.length > 0) {
                renderResults(data.data.records);
            } else {
                resultsContainer.innerHTML = `<p class="text-center text-red-500 font-semibold">未找到匹配的地图任务。</p>`;
            }
        })
        .catch(error => {
            // 禁用加载状态
            spinner.classList.add('hidden');
            buttonText.textContent = '搜索文件';
            searchButton.disabled = false;
            console.error('Search failed:', error);
            resultsContainer.innerHTML = `<p class="text-center text-red-500">搜索失败：服务器或网络错误。</p>`;
        });
});



/**
 * 渲染搜索结果列表。
 * @param {Array<Object>} records 
 */
function renderResults(records) {
    const container = document.getElementById('results-container');
    let html = `<p class="text-sm font-semibold text-gray-700 mb-4">找到 ${records.length} 个结果:</p><div class="space-y-3">`;

    records.forEach(record => {
        // 准备模板数据
        const templateData = {
            missionDisplayTitle: record.missionDisplayTitle,
            mapGroup: record.mapGroup,
            mapGroupLabel: record.mapGroup ? `三方${record.mapGroup}` : '官方',
            connectedCount: record.connectedCount,
            score: record.score,
            scoreCount: record.scoreCount,
            disabled: record.mapGroup ? '' : ' disabled',
            buttonBgColor: record.mapGroup ? 'blue-500' : 'gray-400',
            buttonHoverColor: record.mapGroup ? 'blue-600' : 'gray-500',
            cursorType: record.mapGroup ? 'pointer' : 'not-allowed'
        };

        // 使用模板渲染HTML
        html += replaceTemplatePlaceholders(searchResultItemTemplate, templateData);
    });

    html += '</div>';
    container.innerHTML = html;
}