# My Learning Notes

个人学习笔记博客，使用 Hugo + GitHub Actions 构建并部署到 GitHub Pages。

## 🚀 快速开始

### 前置要求

- [Hugo](https://gohugo.io/installation/) (Extended 版本)
- [Git](https://git-scm.com/)
- GitHub 账号

### 本地运行

1. **克隆仓库**

```bash
git clone https://github.com/YOUR_USERNAME/MyLearningNotes.git
cd MyLearningNotes
```

2. **初始化主题子模块**

```bash
git submodule update --init --recursive
```

3. **本地预览**

```bash
hugo server -D
```

然后在浏览器中访问 `http://localhost:1313`

## 📝 创建新文章

使用 Hugo 命令创建新文章：

```bash
hugo new posts/my-new-post.md
```

文章将在 `content/posts/` 目录下创建。

## 📂 项目结构

```
MyLearningNotes/
├── .github/
│   └── workflows/
│       └── hugo.yml          # GitHub Actions 工作流
├── archetypes/
│   └── default.md            # 文章模板
├── content/
│   ├── posts/                # 博客文章目录
│   │   └── first-post.md
│   └── about.md              # 关于页面
├── themes/
│   └── PaperMod/             # Hugo 主题（子模块）
├── .gitignore
├── .gitmodules
├── hugo.toml                 # Hugo 配置文件
└── README.md
```

## 🔧 配置

### 修改站点信息

编辑 [`hugo.toml`](hugo.toml:1) 文件：

```toml
baseURL = 'https://YOUR_USERNAME.github.io/MyLearningNotes/'
title = 'My Learning Notes'
```

将 `YOUR_USERNAME` 替换为你的 GitHub 用户名。

### 修改作者信息

在 [`hugo.toml`](hugo.toml:6) 中修改：

```toml
[params]
  author = "Your Name"
```

在 [`content/about.md`](content/about.md:1) 中更新联系方式。

## 🌐 部署到 GitHub Pages

### 步骤 1: 创建 GitHub 仓库

1. 在 GitHub 上创建新仓库，命名为 `MyLearningNotes`
2. 不要初始化 README、.gitignore 或 license

### 步骤 2: 推送代码

```bash
cd C:\Users\v-liuyuhang\source\repos\MyPro\MyLearningNotes
git init
git add .
git commit -m "Initial commit: Hugo blog setup"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/MyLearningNotes.git
git push -u origin main
```

### 步骤 3: 配置 GitHub Pages

1. 进入仓库的 **Settings** → **Pages**
2. 在 **Source** 中选择 **GitHub Actions**
3. 保存设置

### 步骤 4: 触发部署

推送代码后，GitHub Actions 会自动运行并部署博客。你可以在 **Actions** 标签页查看部署进度。

部署完成后，访问：`https://YOUR_USERNAME.github.io/MyLearningNotes/`

## ✍️ 写文章

### 文章格式

文章使用 Markdown 格式，支持以下 Front Matter：

```markdown
---
title: "文章标题"
date: 2024-01-01T10:00:00+08:00
draft: false
tags: ["标签1", "标签2"]
categories: ["分类"]
description: "文章简介"
---

文章内容...
```

### 发布文章

1. 在 `content/posts/` 创建或编辑文章
2. 确保 `draft: false`
3. 提交并推送到 GitHub

```bash
git add .
git commit -m "Add new post: 文章标题"
git push
```

GitHub Actions 会自动构建并部署更新。

## 🎨 主题定制

本博客使用 [PaperMod](https://github.com/adityatelange/hugo-PaperMod) 主题。

要更新主题：

```bash
git submodule update --remote --merge
```

更多主题配置选项，请参考 [PaperMod 文档](https://github.com/adityatelange/hugo-PaperMod/wiki)。

## 📚 Hugo 常用命令

- `hugo server -D` - 启动本地开发服务器（包含草稿）
- `hugo new posts/title.md` - 创建新文章
- `hugo` - 构建静态网站到 `public/` 目录
- `hugo --gc --minify` - 构建并优化

## 🛠️ 故障排除

### 主题未加载

确保已初始化子模块：

```bash
git submodule update --init --recursive
```

### GitHub Actions 部署失败

1. 检查 Actions 标签页的错误日志
2. 确认 GitHub Pages 设置为 "GitHub Actions"
3. 确保 [`hugo.toml`](hugo.toml:1) 中的 `baseURL` 正确

### 本地预览样式异常

确保使用 Hugo Extended 版本：

```bash
hugo version
```

## 📄 许可证

本项目采用 MIT 许可证。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**Made with ❤️ using Hugo and GitHub Actions**