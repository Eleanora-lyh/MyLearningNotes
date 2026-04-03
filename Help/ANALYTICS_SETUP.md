# 浏览量统计功能配置指南

本文档说明如何为 Hugo 博客配置浏览量统计功能（不蒜子 + Google Analytics）。

---

## 📊 已实现的功能

### 1. **不蒜子（Busuanzi）- 页面浏览量显示**
- ✅ 文章页面显示阅读量
- ✅ 网站底部显示总访问量和访客数
- ✅ 无需配置，开箱即用

### 2. **Google Analytics (GA4) - 详细数据分析**
- ✅ 后台详细分析数据
- ✅ 访客来源、行为分析
- ⚠️ 需要配置 Measurement ID

---

## 🚀 快速开始

### 步骤 1: 配置 Google Analytics（可选但推荐）

#### 1.1 创建 Google Analytics 账号

1. 访问 [Google Analytics](https://analytics.google.com/)
2. 使用 Google 账号登录
3. 点击"开始测量"创建新账号

#### 1.2 创建 GA4 媒体资源

1. 在 Google Analytics 管理界面中：
   - 点击左下角"管理"（齿轮图标）
   - 在"媒体资源"列中点击"创建媒体资源"
   - 填写媒体资源名称（如：MyLearningNotes）
   - 选择时区：`(GMT+08:00) 中国时间 - 北京`
   - 选择货币：`人民币 (CNY ¥)`
   - 点击"下一步"

2. 填写商家信息：
   - 行业类别：选择最相关的（如：参考和知识、技术）
   - 业务规模：选择"小型"
   - 使用 Google Analytics 的目的：选择适合的选项
   - 点击"创建"

3. 接受服务条款

#### 1.3 设置数据流

1. 选择平台：点击"网站"
2. 设置网络数据流：
   - 网站网址：`https://eleanora-lyh.github.io`
   - 数据流名称：`MyLearningNotes`
   - 点击"创建数据流"

3. **获取 Measurement ID**：
   - 创建完成后，会看到"衡量 ID"（格式：`G-XXXXXXXXXX`）
   - **复制这个 ID**，接下来要用到

#### 1.4 配置 Hugo

编辑 [`hugo.toml`](hugo.toml:1) 文件，找到以下部分：

```toml
[params]
  # Google Analytics 配置
  googleAnalytics = ""  # 例如: "G-XXXXXXXXXX"
```

将复制的 Measurement ID 填入：

```toml
[params]
  # Google Analytics 配置
  googleAnalytics = "G-XXXXXXXXXX"  # 替换为你的真实 ID
```

### 步骤 2: 不蒜子配置（已自动配置）

不蒜子已经自动配置完成，无需额外操作。功能包括：

- **文章页面阅读量**：显示在文章元信息区域（日期、阅读时间旁边）
- **页面顶部站点统计**：显示在导航栏下方，展示网站总访问量和访客数

#### 控制显示选项

在 [`hugo.toml`](hugo.toml:1) 中可以控制显示：

```toml
[params]
  ShowPageViews = true   # 文章页面显示阅读量
  ShowSiteStats = true   # 页面顶部显示站点统计
```

设置为 `false` 可关闭相应功能。

---

## 📁 文件说明

本次配置创建/修改了以下文件：

### 1. [`layouts/partials/extend_head.html`](layouts/partials/extend_head.html:1)
**作用**：在页面 `<head>` 部分插入 Google Analytics 代码

**内容**：
- Google Analytics GA4 跟踪代码
- 根据 `hugo.toml` 中的 `googleAnalytics` 参数自动启用

### 2. [`layouts/partials/extend_footer.html`](layouts/partials/extend_footer.html:1)
**作用**：在页面底部添加不蒜子统计信息

**内容**：
- 不蒜子脚本加载
- 网站总访问量（PV）显示
- 网站总访客数（UV）显示

### 3. [`layouts/partials/post_meta.html`](layouts/partials/post_meta.html:1)
**作用**：在文章元信息区域显示阅读量

**内容**：
- 扩展了原主题的 `post_meta.html`
- 添加了单页面浏览量统计（基于 `ShowPageViews` 参数）

### 4. [`hugo.toml`](hugo.toml:1)
**作用**：配置文件

**新增配置**：
```toml
[params]
  googleAnalytics = ""        # Google Analytics Measurement ID
  ShowPageViews = true        # 是否在文章页显示阅读量
```

---

## 🧪 测试功能

### 测试不蒜子

1. **本地测试**：
   ```bash
   hugo server
   ```
   访问 `http://localhost:1313`

2. **查看效果**：
   - 打开任意文章页面
   - 在文章元信息区域查看"次阅读"统计
   - 滚动到页面底部查看"本站总访问量"和"访客数"

3. **注意事项**：
   - ⚠️ 不蒜子在本地测试时可能显示不正常（显示为 0 或不显示）
   - ✅ 部署到 GitHub Pages 后会正常工作
   - 🔄 刷新页面可以看到数字增加

### 测试 Google Analytics

1. **本地测试**（有限）：
   - 打开浏览器开发者工具 (F12)
   - 切换到"网络"(Network) 标签
   - 刷新页面
   - 查找发送到 `google-analytics.com` 或 `googletagmanager.com` 的请求

2. **部署后测试**：
   - 将代码推送到 GitHub
   - 等待 GitHub Pages 部署完成
   - 访问你的网站
   - 登录 [Google Analytics](https://analytics.google.com/)
   - 点击"报告" → "实时"
   - 应该能看到当前的活跃用户

3. **验证数据收集**：
   - 在 GA4 中，数据通常在 24-48 小时后完整显示
   - "实时"报告可以立即查看当前访客
   - "事件"报告可以查看页面浏览事件

---

## 📈 查看统计数据

### 不蒜子统计

**优点**：直接在网站上显示，访客可见  
**位置**：
- 文章页面：标题下方的元信息区域
- 网站底部：所有页面底部

**数据类型**：
- `本文阅读量`：当前文章的浏览次数（PV）
- `本站总访问量`：整个网站的总浏览次数（PV）
- `访客数`：网站的独立访客数（UV）

### Google Analytics 统计

**优点**：专业的分析平台，数据详细  
**访问方式**：
1. 登录 [Google Analytics](https://analytics.google.com/)
2. 选择你的媒体资源

**主要功能**：
- **实时报告**：查看当前活跃用户
- **流量获取**：查看访客来源（搜索引擎、社交媒体等）
- **互动度**：用户在网站上的行为分析
- **网页和屏幕**：最受欢迎的页面排名
- **受众特征**：访客的地理位置、设备类型等

---

## 🎨 自定义样式

### 修改不蒜子显示文字

编辑 [`layouts/partials/extend_footer.html`](layouts/partials/extend_footer.html:1)：

```html
<!-- 修改显示文字 -->
<span id="busuanzi_container_site_pv">
  本站总浏览量 <span id="busuanzi_value_site_pv"></span> 次
</span>

<span id="busuanzi_container_site_uv">
  访客总数 <span id="busuanzi_value_site_uv"></span> 人次
</span>
```

编辑 [`layouts/partials/post_meta.html`](layouts/partials/post_meta.html:1)：

```html
<!-- 修改文章阅读量显示 -->
{{- if (.Param "ShowPageViews") -}}
{{- $scratch.Add "meta" (slice (printf "<span id='busuanzi_container_page_pv'>👁️ <span id='busuanzi_value_page_pv'></span> Views</span>")) }}
{{- end }}
```

### 修改底部统计样式

编辑 [`layouts/partials/extend_footer.html`](layouts/partials/extend_footer.html:1)，修改 `style` 属性：

```html
<div style="text-align: center; padding: 20px 0; color: #999; font-size: 0.85em;">
  <!-- 自定义颜色、大小、间距等 -->
</div>
```

---

## ⚙️ 高级配置

### 单独控制某篇文章的阅读量显示

在文章的 Front Matter 中添加：

```yaml
---
title: "文章标题"
ShowPageViews: false  # 关闭此文章的阅读量显示
---
```

### Google Analytics 增强配置

在 [`layouts/partials/extend_head.html`](layouts/partials/extend_head.html:1) 中可以添加更多 GA4 配置：

```html
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  
  gtag('config', '{{ .Site.Params.googleAnalytics }}', {
    'anonymize_ip': true,           // IP 匿名化
    'cookie_flags': 'SameSite=None;Secure',  // Cookie 设置
    'page_title': '{{ .Title }}',   // 自定义页面标题
  });
</script>
```

---

## 🔧 故障排查

### 不蒜子不显示或显示为 0

**可能原因**：
1. 本地测试环境（`localhost`）
2. 不蒜子服务暂时不可用
3. 浏览器广告拦截插件

**解决方法**：
1. 部署到 GitHub Pages 后再测试
2. 等待几分钟后刷新页面
3. 暂时关闭广告拦截插件
4. 检查浏览器控制台是否有 JavaScript 错误

### Google Analytics 无数据

**可能原因**：
1. Measurement ID 配置错误
2. 数据延迟（需要 24-48 小时）
3. 广告拦截插件阻止了 GA 脚本

**解决方法**：
1. 检查 [`hugo.toml`](hugo.toml:1) 中的 `googleAnalytics` 值
2. 查看"实时"报告（数据即时显示）
3. 使用隐身模式测试
4. 检查浏览器控制台的网络请求

### 页面加载变慢

**可能原因**：
1. 不蒜子服务器响应慢
2. Google Analytics 脚本加载慢

**解决方法**：
1. 脚本已使用 `async` 异步加载，不会阻塞页面
2. 如果仍然影响性能，可以考虑只使用其中一个服务
3. 使用浏览器的性能分析工具诊断

---

## 📚 相关资源

- [不蒜子官方文档](http://ibruce.info/2015/04/04/busuanzi/)
- [Google Analytics 4 帮助中心](https://support.google.com/analytics/answer/10089681)
- [Hugo 文档 - Analytics](https://gohugo.io/about/analytics/)
- [PaperMod 主题文档](https://github.com/adityatelange/hugo-PaperMod)

---

## ✅ 下一步

1. **配置 Google Analytics**：按照上述步骤获取 Measurement ID 并填入 [`hugo.toml`](hugo.toml:1)
2. **部署到 GitHub Pages**：
   ```bash
   git add .
   git commit -m "Add analytics: Busuanzi + Google Analytics"
   git push
   ```
3. **等待 GitHub Pages 部署完成**（通常 1-2 分钟）
4. **访问你的网站**：查看浏览量统计是否正常显示
5. **登录 Google Analytics**：查看实时数据

---

**配置完成！** 🎉

现在你的博客已经拥有完整的浏览量统计功能：
- ✅ 访客可以看到文章阅读量和网站访问统计
- ✅ 你可以在 Google Analytics 后台查看详细的访客分析数据