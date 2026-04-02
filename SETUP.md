# 安装和使用指南

## Hugo 已安装但需要重启终端

Hugo 已成功安装，但由于 Windows 的环境变量更新机制，需要**重启终端**才能使用 `hugo` 命令。

### 方法 1: 重启 VS Code 终端（推荐）

1. 关闭当前 VS Code 中的所有终端
2. 重新打开一个新终端
3. 运行以下命令测试：

```bash
hugo version
```

应该看到类似输出：
```
hugo v0.159.2+extended windows/amd64 ...
```

### 方法 2: 重启 VS Code

如果方法 1 不起作用，完全关闭并重新启动 VS Code。

---

## 本地预览博客

重启终端后，运行以下命令：

```bash
cd C:\Users\v-liuyuhang\source\repos\MyPro\MyLearningNotes
hugo server -D
```

然后在浏览器中访问：`http://localhost:1313`

按 `Ctrl+C` 停止服务器。

---

## 创建新文章

```bash
cd C:\Users\v-liuyuhang\source\repos\MyPro\MyLearningNotes
hugo new posts/my-new-post.md
```

文章将在 `content/posts/` 目录下创建。编辑文章后，确保设置 `draft: false` 才会发布。

---

## 部署到 GitHub Pages

### 步骤 1: 修改配置

1. 编辑 `hugo.toml`，将以下内容中的 `Eleanora-lyh` 替换为你的 GitHub 用户名：

```toml
baseURL = 'https://Eleanora-lyh.github.io/MyLearningNotes/'
```

2. 更新作者信息和社交链接（在 `hugo.toml` 中）

3. 编辑 `content/about.md`，更新你的个人信息

### 步骤 2: 创建 GitHub 仓库

1. 访问 https://github.com/new
2. 仓库名称：`MyLearningNotes`
3. 设置为 Public
4. **不要**初始化 README、.gitignore 或 license
5. 点击 "Create repository"

### 步骤 3: 推送代码到 GitHub

在项目目录中运行：

```bash
cd C:\Users\v-liuyuhang\source\repos\MyPro\MyLearningNotes

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit: Hugo blog setup"

# 设置主分支
git branch -M main

# 添加远程仓库（替换 Eleanora-lyh）
git remote add origin https://github.com/Eleanora-lyh/MyLearningNotes.git

# 推送到 GitHub
git push -u origin main
```

### 步骤 4: 配置 GitHub Pages

1. 访问你的仓库：`https://github.com/Eleanora-lyh/MyLearningNotes`
2. 点击 **Settings** 标签
3. 在左侧菜单中点击 **Pages**
4. 在 **Source** 下拉菜单中，选择 **GitHub Actions**
5. 保存更改

### 步骤 5: 等待部署

1. 访问 **Actions** 标签查看工作流运行状态
2. 等待部署完成（通常需要 1-2 分钟）
3. 部署成功后，访问：`https://Eleanora-lyh.github.io/MyLearningNotes/`

---

## 发布新文章流程

1. 创建新文章：
```bash
hugo new posts/article-title.md
```

2. 编辑文章（使用 Markdown），确保 `draft: false`

3. 本地预览：
```bash
hugo server -D
```

4. 提交并推送到 GitHub：
```bash
git add .
git commit -m "Add new post: 文章标题"
git push
```

GitHub Actions 会自动构建并部署更新！

---

## 故障排除

### Hugo 命令不可用

确保已重启终端。如果仍然不行，尝试：
- 完全重启 VS Code
- 或重启电脑

### 本地预览样式异常

确保已安装 Hugo Extended 版本：
```bash
hugo version
```

### GitHub Pages 未显示

1. 检查 Actions 标签页的部署日志
2. 确认 GitHub Pages 设置为 "GitHub Actions"
3. 确认 `baseURL` 在 `hugo.toml` 中配置正确

---

## 项目文件说明

- `hugo.toml` - Hugo 站点配置
- `content/` - 所有内容文件（文章、页面）
- `themes/PaperMod/` - 博客主题
- `.github/workflows/hugo.yml` - GitHub Actions 自动部署配置
- `static/` - 静态资源（图片、CSS、JS）
- `archetypes/` - 文章模板

更多详情请查看 `README.md`。