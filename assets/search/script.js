import searchResultItemTemplate from './result-item.html';
import { replaceTemplatePlaceholders } from '../../utils.js';

// 保存搜索参数和分页信息
let currentSearchParams = null;
let paginationInfo = {
    total: 0,
    current: 1,
    size: 30 // 默认每页30条，支持30/60/100
};

// 初始化分页控件事件监听
function initPaginationControls() {
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');
    const currentPageInput = document.getElementById('current-page');
    const pageSizeSelect = document.getElementById('page-size-select');

    // 设置默认选中的页面大小
    pageSizeSelect.value = paginationInfo.size;

    prevButton.addEventListener('click', () => {
        if (paginationInfo.current > 1) {
            paginationInfo.current--;
            performSearch(currentSearchParams, paginationInfo.current);
        }
    });

    nextButton.addEventListener('click', () => {
        const totalPages = Math.ceil(paginationInfo.total / paginationInfo.size);
        if (paginationInfo.current < totalPages) {
            paginationInfo.current++;
            performSearch(currentSearchParams, paginationInfo.current);
        }
    });

    currentPageInput.addEventListener('change', () => {
        let page = parseInt(currentPageInput.value, 10);
        const totalPages = Math.ceil(paginationInfo.total / paginationInfo.size);

        if (isNaN(page) || page < 1) {
            page = 1;
        } else if (page > totalPages && totalPages > 0) {
            page = totalPages;
        }

        paginationInfo.current = page;
        currentPageInput.value = page;
        performSearch(currentSearchParams, page);
    });

    // 页面大小选择器事件监听
    pageSizeSelect.addEventListener('change', () => {
        const newSize = parseInt(pageSizeSelect.value, 10);
        if ([30, 60, 100].includes(newSize)) {
            paginationInfo.size = newSize;
            paginationInfo.current = 1; // 重置到第一页
            performSearch(currentSearchParams, 1);
        }
    });
}

// 更新分页控件状态
function updatePaginationControls() {
    const totalPages = Math.ceil(paginationInfo.total / paginationInfo.size);
    const paginationContainer = document.getElementById('pagination-container');
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');
    const currentPageInput = document.getElementById('current-page');
    const pageSizeSelect = document.getElementById('page-size-select');

    // 更新显示信息
    document.getElementById('total-records').textContent = paginationInfo.total;
    document.getElementById('total-pages').textContent = totalPages;
    document.getElementById('total-pages-display').textContent = totalPages;
    currentPageInput.value = paginationInfo.current;

    // 更新页面大小选择器
    pageSizeSelect.value = paginationInfo.size;

    // 更新按钮状态
    prevButton.disabled = paginationInfo.current <= 1;
    nextButton.disabled = paginationInfo.current >= totalPages || totalPages === 0;

    // 始终显示分页控件，即使总记录数为0
    paginationContainer.classList.remove('hidden');
}

// 执行搜索
function performSearch(params, page = 1) {
    const resultsContainer = document.getElementById('results-container');
    const searchButton = document.getElementById('search-button');
    const buttonText = document.getElementById('button-text');
    const spinner = document.getElementById('loading-spinner');

    // 启用加载状态
    searchButton.disabled = true;
    buttonText.textContent = '搜索中...';
    spinner.classList.remove('hidden');
    resultsContainer.innerHTML = `<p class="text-center text-gray-500">正在努力搜索中...</p>`;

    // 使用本地代理API端点来规避CORS问题
    const apiUrl = '/api/map/search';

    const payload = {
        mapGroup: params.mapGroup,
        query: params.query,
        modes: [],
        current: page,
        size: paginationInfo.size
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

            if (data && data.data) {
                // 更新分页信息
                paginationInfo.total = data.data.total || 0;
                paginationInfo.current = data.data.current || 1;

                if (data.data.records && data.data.records.length > 0) {
                    renderResults(data.data.records, paginationInfo.current, paginationInfo.total);
                    updatePaginationControls();
                } else {
                    // 未找到匹配的地图
                    resultsContainer.innerHTML = `<p class="text-center text-red-500 font-semibold">未找到匹配的地图。</p>`;
                    document.getElementById('pagination-container').classList.add('hidden');
                }
            } else {
                // 数据格式不正确或API返回异常
                resultsContainer.innerHTML = `<p class="text-center text-red-500 font-semibold">获取数据失败，请稍后重试。</p>`;
                document.getElementById('pagination-container').classList.add('hidden');
            }
        })
        .catch(error => {
            // 禁用加载状态
            spinner.classList.add('hidden');
            buttonText.textContent = '搜索文件';
            searchButton.disabled = false;
            console.error('Search failed:', error);
            resultsContainer.innerHTML = `<p class="text-center text-red-500">搜索失败：服务器或网络错误。</p>`;
            document.getElementById('pagination-container').classList.add('hidden');
        });
}

// 搜索表单提交处理
document.getElementById('search-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const form = e.target;
    const mapGroup = form.mapGroup.value;
    const query = form.query.value;

    // 保存搜索参数
    currentSearchParams = {
        mapGroup,
        query
    };

    // 重置到第一页
    paginationInfo.current = 1;

    // 执行搜索
    performSearch(currentSearchParams, 1);
});

/**
 * 渲染搜索结果列表。
 * @param {Array<Object>} records 
 * @param {number} currentPage 
 * @param {number} totalRecords 
 */
function renderResults(records, currentPage, totalRecords) {
    const container = document.getElementById('results-container');
    const startIndex = (currentPage - 1) * paginationInfo.size + 1;
    const endIndex = Math.min(startIndex + records.length - 1, totalRecords);

    let html = `<p class="text-sm font-semibold text-gray-700 mb-4">找到 ${totalRecords} 个结果 (显示 ${startIndex}-${endIndex}):</p><div class="space-y-3">`;

    records.forEach(record => {
        // 准备模板数据
        const templateData = {
            missionDisplayTitle: record.missionDisplayTitle,
            mapGroup: record.mapGroup,
            mapGroupLabel: `三方${record.mapGroup}`,
            connectedCount: record.connectedCount,
            score: record.score,
            scoreCount: record.scoreCount
        };

        // 使用模板渲染HTML
        html += replaceTemplatePlaceholders(searchResultItemTemplate, templateData);
    });

    html += '</div>';
    container.innerHTML = html;
}

// 页面加载完成后初始化
window.onload += initPaginationControls;
