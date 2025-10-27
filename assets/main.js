// --- FILE: assets/main.js ----------------------------------------
export default `<!DOCTYPE html>
<html lang="zh-CN">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[三方{{MAP_GROUP}}] {{MISSION_DISPLAY_TITLE}} - {{STATUS_TEXT}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {
            background-color: #f7f9fb;
            font-family: 'Inter', sans-serif;
        }

        /* 确保背景色能够完全覆盖 */
        .min-h-screen {
            min-height: 100vh;
        }
    </style>
</head>

<body class="p-4 flex items-center justify-center min-h-screen">
    <div
        class="max-w-xl w-full mx-auto p-6 md:p-10 {{THEME_COLOR}} rounded-xl shadow-2xl transition-all duration-300 transform scale-100">
        <div class="{{CARD_COLOR}} p-6 md:p-8 rounded-xl shadow-inner">
            <div class="flex items-center space-x-4 mb-4">
                <div class="text-4xl {{TEXT_COLOR}}">
                    {{ICON}}
                </div>
                <h1 class="text-3xl font-bold text-gray-900">{{STATUS_TEXT}}</h1>
            </div>

            <div class="mt-4 pt-4 border-t border-gray-200">
                <!-- 标签：地图 -->
                <p class="text-sm text-gray-500 mb-1">地图:</p>
                <!-- 地图的完整显示名称 -->
                <p class="text-xl font-extrabold text-gray-800 break-words">[三方{{MAP_GROUP}}] {{MISSION_DISPLAY_TITLE}}
                </p>

                <!-- 组合文件名和文件大小 -->
                <div class="mt-4">
                    <p class="text-sm text-gray-500 flex items-center">
                        文件: <code class="bg-gray-100 p-1 rounded text-xs text-gray-600">{{FILE_NAME}}</code>
                        {{INLINE_SIZE_TEXT}}
                    </p>
                </div>
            </div>

            {{ACTION_BUTTON}}

            {{DIAGNOSTIC_BLOCK}}
        </div>
    </div>
    {{AUTO_DOWNLOAD_SCRIPT}}
</body>

</html>`
