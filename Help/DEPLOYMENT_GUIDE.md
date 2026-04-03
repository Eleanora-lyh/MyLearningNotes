# GitHub Pages 部署指南

本文档说明如何将 Hugo 博客部署到 GitHub Pages。

---

## 🚀 部署步骤

### 步骤 1: 提交并推送代码

1. **查看当前修改**：
   ```bash
   git status
   ```

2. **添加所有修改**：
   ```bash
   git add .
   ```

3. **提交更改**：
   ```bash
   git commit -m "Add analytics features: Busuanzi + Google Analytics"
   ```

4. **推送到 GitHub**：
   ```bash
   git push origin main
   ```

### 步骤 2: 配置 GitHub Pages

1. **访问 GitHub 仓库**：
   打开 https://github.com/Eleanora-lyh/MyLearningNotes

2. **进入 Settings**：
   - 点击仓库顶部的 "Settings" 标签

3. **配置 Pages**：
   - 在左侧菜单中找到 "Pages"
   - 在 "Source" 部分：
     - 选择 "GitHub Actions"（而不是 "Deploy from a branch"）
   
4. **保存设置**：
   - GitHub 会自动检测到 `.github/workflows/hugo.yml` 文件
   - 工作流将自动运行

### 步骤 3: 等待部署完成

1. **查看工作流状态**：
   - 点击仓库顶部的 "Actions" 标签
   - 应该看到 "Deploy Hugo site to GitHub Pages" 工作流正在运行或已完成

2. **检查部署状态**：
   - 绿色 ✅ = 部署成功
   - 红色 ❌ = 部署失败（查看错误日志）
   - 黄色 🟡 = 正在部署中

3. **等待时间**：
   - 首次部署通常需要 1-3 分钟
   - 后续更新通常只需 30-60 秒

### 步骤 4: 访问网站

部署完成后，您的网站地址是：
**https://eleanora-lyh.github.io/MyLearningNotes/**

---

## 🔧 故障排查

### 问题 1: 404 页面找不到

**可能原因**：
1. GitHub Pages 未正确配置
2. 工作流未成功运行
3. 部署尚未完成

**解决方法**：
1. 检查 GitHub Actions 是否成功运行
2. 确认 Settings > Pages > Source 设置为 "GitHub Actions"
3. 等待几分钟后重试

### 问题 2: 工作流失败

**查看错误日志**：
1. 进入 GitHub 仓库的 "Actions" 标签
2. 点击失败的工作流
3. 查看详细错误信息

**常见错误**：
- **Submodule 错误**：主题未正确初始化
  ```bash
  git submodule update --init --recursive
  git add .
  git commit -m "Update submodules"
  git push
  ```

- **权限错误**：检查仓库 Settings > Actions > General > Workflow permissions
  - 确保选择 "Read and write permissions"

### 问题 3: 样式丢失或显示异常

**原因**：baseURL 配置不正确

**检查 hugo.toml**：
```toml
baseURL = 'https://eleanora-lyh.github.io/MyLearningNotes/'
```

确保：
- 使用 HTTPS
- 包含完整路径（包括 `/MyLearningNotes/`）
- 结尾有斜杠 `/`

---

## 📊 验证浏览量统计

### 不蒜子统计验证

部署完成后：

1. **访问网站**：https://eleanora-lyh.github.io/MyLearningNotes/

2. **查看统计数据**：
   - 页面顶部应该显示：👁️ 总访问量 和 👤 访客数
   - 文章页面应该显示：👁️ 次阅读

3. **测试统计**：
   - 刷新页面，数字应该增加
   - 首次部署后，数字会从 0 或很小的值开始
   - **这才是真实的浏览量数据**

4. **注意**：
   - ⚠️ 本地测试（localhost）显示的数据是不准确的
   - ✅ 只有部署到 GitHub Pages 后的数据才是真实的

### Google Analytics 验证

1. **登录 GA**：
   访问 https://analytics.google.com/

2. **查看实时数据**：
   - 点击左侧菜单 "报告" → "实时"
   - 访问您的网站
   - 应该立即看到活跃用户数增加

3. **配置检查**：
   - 确保 [`hugo.toml`](hugo.toml:1) 中已填入 Measurement ID
   - 检查浏览器控制台是否有错误

---

## 🔄 后续更新流程

每次修改博客内容后：

```bash
# 1. 查看修改
git status

# 2. 添加修改
git add .

# 3. 提交
git commit -m "描述你的修改"

# 4. 推送
git push origin main

# 5. 等待自动部署（1-2 分钟）
```

GitHub Actions 会自动：
- 构建 Hugo 网站
- 部署到 GitHub Pages
- 更新线上网站

---

## 📝 当前配置总结

### 网站信息
- **仓库**：https://github.com/Eleanora-lyh/MyLearningNotes
- **网站地址**：https://eleanora-lyh.github.io/MyLearningNotes/
- **主题**：PaperMod
- **Hugo 版本**：0.128.0

### 功能特性
✅ 自动化部署（GitHub Actions）
✅ 评论系统（Giscus）
✅ 浏览量统计（不蒜子）
✅ 数据分析（Google Analytics）
✅ 搜索功能
✅ 暗色模式

### 需要配置的内容

在部署成功后，记得配置：

1. **Google Analytics Measurement ID**
   - 编辑 [`hugo.toml`](hugo.toml:1)
   - 填入您的 GA Measurement ID

2. **检查不蒜子数据**
   - 确认显示的是真实数据（较小的数字）
   - 如有问题，参考 [`ANALYTICS_SETUP.md`](ANALYTICS_SETUP.md:1)

---

## 🎉 完成！

按照以上步骤操作后，您的博客应该就能正常访问了。

**马上开始**：
```bash
git add .
git commit -m "Add analytics and deployment guide"
git push origin main
```

然后访问 https://github.com/Eleanora-lyh/MyLearningNotes/actions 查看部署进度！