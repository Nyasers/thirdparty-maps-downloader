window.addEventListener('load', () => {
    setTimeout(() => {
        // 检查页面中是否存在可点击的下载按钮(a标签)
        // 如果存在，则表示文件可用，执行重定向
        const downloadButton = document.querySelector('#download-link'); // 使用id选择器更精准

        if (downloadButton) {
            // 当页面渲染了成功按钮(a标签)时，执行重定向
            window.location = downloadButton.href; // 动态获取href属性
        }
        // 如果页面渲染的是禁用按钮(button标签)，则不执行任何操作
    }, 500);
});
