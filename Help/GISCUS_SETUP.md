# Giscus 评论系统配置指南

## 步骤 1: 准备 GitHub 仓库

### 1.1 启用 Discussions 功能

1. 进入你的 GitHub 仓库：https://github.com/Eleanora-lyh/LearningNotes
2. 点击 **Settings** (设置)
3. 在 **Features** 部分，勾选 **Discussions**
4. 点击 **Set up discussions** 按钮

### 1.2 确保仓库是公开的

- Giscus 需要仓库是 **Public**（公开）状态
- 在仓库 Settings → General 中检查仓库可见性

## 步骤 2: 安装 Giscus App

1. 访问：https://github.com/apps/giscus
2. 点击 **Install** 或 **Configure**
3. 选择 **Only select repositories**
4. 选择你的仓库：`Eleanora-lyh/LearningNotes`
5. 点击 **Install** 完成安装

## 步骤 3: 获取配置参数

1. 访问 Giscus 配置页面：https://giscus.app/zh-CN
2. 填写以下信息：

### 仓库信息
```
仓库: Eleanora-lyh/LearningNotes
```

### Discussion 分类
- 在 **页面 ↔️ Discussions 映射关系** 选择：`Discussion 的标题包含页面的 pathname`
- 在 **Discussion 分类** 选择：推荐选择 `Announcements` 或 `General`

### 特性
- ✅ 启用主评论区的反应
- ✅ 将评论框放在评论上面（可选）
- ✅ 懒加载评论（推荐）

### 主题
- 选择 `preferred_color_scheme`（跟随系统）或其他主题

3. 在页面底部，你会看到一个脚本。从中提取以下参数：
   - `data-repo-id`
   - `data-category-id`

## 步骤 4: 配置 Hugo

已在 `hugo.toml` 中添加配置，你需要：

1. 替换 `YOUR_REPO_ID` 为从 giscus.app 获取的 `data-repo-id`
2. 替换 `YOUR_CATEGORY_ID` 为从 giscus.app 获取的 `data-category-id`

示例：
```toml
[params.comments]
  enabled = true

[params.giscus]
  repo = "Eleanora-lyh/LearningNotes"
  repoId = "R_kgDOK1234567"  # 替换为你的实际值
  category = "Announcements"
  categoryId = "DIC_kwDOK1234567890"  # 替换为你的实际值
  mapping = "pathname"
  theme = "preferred_color_scheme"
  lang = "zh-CN"
  crossorigin = "anonymous"
  reactionsEnabled = "1"
  emitMetadata = "0"
  inputPosition = "top"
  loading = "lazy"
```

## 步骤 5: 在文章中启用评论

在文章的 front matter 中添加：

```yaml
---
title: "文章标题"
date: 2024-01-01
comments: true  # 启用评论
---
```

或者在 `hugo.toml` 中设置全局默认启用：

```toml
[params]
  comments = true  # 全局启用评论
```

## 步骤 6: 测试

1. 运行本地服务器：
   ```bash
   hugo server -D
   ```

2. 访问任意文章页面，查看底部是否显示评论框

3. 使用 GitHub 账号登录并测试评论功能

## 常见问题

### Q1: 评论框不显示？
- 检查仓库是否公开
- 检查是否安装了 Giscus App
- 检查是否启用了 Discussions
- 检查配置参数是否正确

### Q2: 无法登录？
- 确保已安装 Giscus App
- 检查浏览器是否阻止了第三方 Cookie

### Q3: 评论数据在哪里？
- 所有评论存储在你的 GitHub 仓库的 Discussions 中
- 你可以在 GitHub 仓库的 Discussions 标签中查看和管理

## 优势

✅ 完全免费开源  
✅ 数据完全由你控制  
✅ 无广告、隐私友好  
✅ 支持 Markdown、代码高亮  
✅ 支持反应表情、嵌套回复  
✅ 支持多语言  
✅ 加载速度快

## 参考资源

- Giscus 官网：https://giscus.app/zh-CN
- Giscus GitHub：https://github.com/giscus/giscus
- Hugo 评论文档：https://gohugo.io/content-management/comments/