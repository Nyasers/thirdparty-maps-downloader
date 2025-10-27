// --- FILE: assets/search.js ----------------------------------------
export default `<!DOCTYPE html>
<html lang="zh-CN">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>求生之路2三方图下载</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {
            background-color: #f7f9fb;
            font-family: 'Inter', sans-serif;
        }

        .min-h-screen {
            min-height: 100vh;
        }

        /* 隐藏默认的 HTML5 验证错误提示，让自定义消息更容易实现 */
        input:invalid {
            box-shadow: none;
        }
    </style>
</head>

<body class="p-4 flex items-center justify-center min-h-screen">
    <div class="max-w-3xl w-full mx-auto p-8 bg-white rounded-xl shadow-2xl transition-all duration-300">
        <h1 class="text-3xl font-bold text-gray-900 mb-2 text-center">求生之路2三方图下载</h1>
        <p class="text-sm text-gray-500 mb-6 text-center border-b pb-4">输入关键词，查找可用的三方图。</p>

        <!-- 搜索表单 -->
        <form id="search-form" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <!-- 地图组选择 -->
                <div>
                    <label for="mapGroup" class="block text-sm font-medium text-gray-700 mb-1">地图组 (mapGroup)</label>
                    <select id="mapGroup" name="mapGroup" required
                        class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm">
                        {{MAP_GROUP_OPTIONS}}
                    </select>
                </div>

                <!-- 查询关键词 -->
                <div class="md:col-span-2">
                    <label for="query" class="block text-sm font-medium text-gray-700 mb-1">查询关键词 (query)</label>
                    <input type="text" id="query" name="query" placeholder="输入地图名" value=""
                        class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                </div>
            </div>

            <button type="submit" id="search-button"
                class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150">
                <span id="button-text">搜索三方图</span>
                <svg id="loading-spinner" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white hidden"
                    xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                    </path>
                </svg>
            </button>
        </form>

        <!-- 搜索结果区域 -->
        <div id="results-container" class="mt-8 border-t pt-6">
            <!-- 结果将通过 JavaScript 动态加载到这里 -->
            <p class="text-center text-gray-500" id="initial-message">请在上方输入关键词进行搜索。</p>
        </div>

        <p class="mt-6 text-xs text-gray-400 text-center border-t pt-4">该页面仅显示前 100 条结果，供测试使用，友情链接：<a
                href='https://l4d2server.com/map' style='color:blue'>求生之路2三方图列表</a></p>
    </div>

    <script>
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
            resultsContainer.innerHTML = \`<p class="text-center text-gray-500">正在努力搜索中...</p>\`;

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
                        throw new Error(\`HTTP error! status: \${response.status}\`);
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
                        resultsContainer.innerHTML = \`<p class="text-center text-red-500 font-semibold">未找到匹配的地图任务。</p>\`;
                    }
                })
                .catch(error => {
                    // 禁用加载状态
                    spinner.classList.add('hidden');
                    buttonText.textContent = '搜索文件';
                    searchButton.disabled = false;
                    console.error('Search failed:', error);
                    resultsContainer.innerHTML = \`<p class="text-center text-red-500">搜索失败：服务器或网络错误。</p>\`;
                });
        });

        /**
         * 渲染搜索结果列表。
         * @param {Array<Object>} records 
         */
        function renderResults(records) {
            const container = document.getElementById('results-container');
            let html = \`<p class="text-sm font-semibold text-gray-700 mb-4">找到 \${records.length} 个结果:</p><div class="space-y-3">\`;

            records.forEach(record => {
                // record 结构示例: { mapGroup: "A", missionDisplayTitle: "Dead Center", ... }

                html += \`
            <div class="p-4 bg-gray-50 border border-gray-200 rounded-lg flex justify-between items-center transition duration-150 hover:bg-gray-100">
                <div class="flex-1 min-w-0">
                    <p class="text-lg font-medium text-gray-900 truncate" title="\${record.missionDisplayTitle}">\${record.missionDisplayTitle}</p>
                    <p class="text-sm text-gray-500">
                        <span>地图组: \${record.mapGroup ? "三方" : "官方"}\${record.mapGroup}</span>
                        <span>游玩人次: \${record.connectedCount}</span>
                        <span>评分: \${record.score} (\${record.scoreCount})</span>
                    </p>
                </div>
                <form action="/" method="POST" target="_blank" class="flex-shrink-0 ml-4">
                    <input type="hidden" name="mapGroup" value="\${record.mapGroup}">
                    <input type="hidden" name="missionDisplayTitle" value="\${record.missionDisplayTitle}">
                    <button type="submit"\${record.mapGroup ? "" : "disabled"}
                        class="px-3 py-1 text-sm font-semibold text-white bg-\${record.mapGroup ? "blue-500" : "gray-400"} rounded-md hover:bg-\${record.mapGroup ? "blue-600" : "gray-500"} transition cursor-\${record.mapGroup ? "pointer" : "not-allowed"}">
                            下载
                    </button>
                </form>
            </div>\`;
            });

            html += '</div>';
            container.innerHTML = html;
        }
    </script>
</body>

</html>`
