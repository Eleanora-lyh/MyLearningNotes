---
title: "【十】Hive 聚合函数：聚合 / 统计 / 分位数 / 集合 / 高级分组"
date: 2026-05-29T23:12:33+08:00
draft: false
tags: ["Hive", "聚合函数", "统计函数", "分位数", "GROUPING SETS"]
categories: ["Hive"]
description: "系统讲解 Hive 聚合函数（count/sum/avg/max/min）、统计学函数（方差/标准差/协方差/相关系数）、分位数（percentile / percentile_approx）、集合聚合（collect_list/collect_set/map_agg）以及 GROUPING SETS / CUBE / ROLLUP 多维分析"
---

聚合函数（Aggregate Functions）是 Hive 中用于对**一组行**进行计算并返回**单个结果**的函数，通常配合 `GROUP BY` 使用，是数仓查询、报表统计的核心工具。

| 聚合函数注意 NULL 值            | 说明             |
| ------------------------ | -------------- |
| `count(*)` 包含 NULL 值     | 统计行数，不看列值      |
| `count(id)` 不包含 NULL 值   | 只统计该列非 NULL 的行 |
| `min/max/avg` 忽略 NULL    | NULL 不参与计算     |
| 全部是 NULL 时，结果为 NULL      | 不是 0，是 NULL    |
| `avg` 不包含 NULL = 分母不算那一行 | 分子分母同时排除 NULL  |

---

# 一、聚合函数总览

| 类别       | 常见函数                                                                                              | 作用                                       | 是否支持 DISTINCT      |
| -------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------ |
| **基础聚合** | `count`, `sum`, `avg`, `max`, `min`                                                               | 计数 / 求和 / 平均 / 最值                        | ✅                  |
| **统计学**  | `variance`, `var_pop`, `var_samp`, `stddev_pop`, `stddev_samp`, `covar_pop`, `covar_samp`, `corr` | 方差、标准差、协方差、相关系数                          | ❌                  |
| **分位数**  | `percentile(col, p)`, `percentile_approx(col, p)`                                                 | 精确 / 近似分位数                               | ❌                  |
| **集合聚合** | `collect_list`, `collect_set`, `histogram_numeric(col, b)`, `map_agg`,`map_from_arrays`           | 把多行合并成数组                                 | `collect_set` 自动去重 |
| **直方图**  | `histogram_numeric(col, b)`, `ngrams`                                                             | 近似直方图                                    | ❌                  |
| **高级分组** | `grouping`, `grouping__id`                                                                        | 配合`GROUPING SETS / CUBE / ROLLUP` 标识聚合维度 | —                  |

---

# 二、基础聚合函数（最常用）

## 1. count

```sql
-- 统计所有行（包括 NULL）
SELECT count(*) FROM orders;

-- 统计指定列非 NULL 的行数
SELECT count(user_id) FROM orders;

-- 去重统计（注意性能：会强制走一个 Reducer）
SELECT count(DISTINCT user_id) FROM orders;
```

`count(DISTINCT user_id)` 为什么会强制走一个Reducer？

- COUNT本身是可合并的，每个部分计数，最后加总即可。

- DISTINCT去重操作是不可合并的。假设数据被分散到10个Mapper处理，每个Mapper都能得到自己局部的去重结果，但这10个局部结果之间很可能有重复。为了得到全局唯一的去重结果，必须将可能重复的键（user_id）全部集中到一起处理。
  
  假设有3个user_id：A, A, B, B, C, C
  
  - **Map阶段**： 读取`orders`表，以`user_id`为`key`输出
    
    `(A), (A), (B), (B), (C), (C)`
  
  - **Shuffle阶段**： 这是关键！由于需要对`user_id`进行**全局去重**，Hive默认会设置 **`mapred.reduce.tasks = 1`**，或者通过一个特殊的、强制所有数据流向一个Reducer的分区器。这导致所有数据在网络上传输后，都会堆积到**唯一的一个Reducer节点**上。
    
    `[(A), (A), (B), (B), (C), (C)]→Reducer 0`
  
  - **Reduce阶段**： 这个唯一的Reducer节点接收全量数据，在内存中维护一个`HashSet`结构来去重，然后计数。
    
    `HashSet{A, B, C} → count=3`

瓶颈：

- **单点计算与网络瓶颈**： 所有数据都流向一个Reducer，该节点的CPU、内存、网络IO成为瓶颈，而集群其他节点闲置，资源利用率极低。
- **内存压力巨大**： Reducer需要在内存中存储所有**不重复的`user_id`** 用于去重。如果去重后的基数（cardinality）很大，比如有上亿个不同的用户，极易导致`Java Heap Space`内存溢出（OOM）。
- **数据倾斜的极端情况**： 这本质上是100%的数据倾斜，所有数据都“倾斜”到了那一个Reducer上。

⚠️ **性能坑点**：`count(distinct)` 在 Hive 中默认只用 **1 个 Reducer**，数据量大时极慢。 **优化方案**：

### count(distinct)优化

#### 使用 `GROUP BY`改写（最推荐，处理精确去重）

这是标准优化手段，将计算拆分成“局部去重”和“全局汇总”两步。

```sql
-- 优化后的写法
SELECT count(1)
FROM (
    SELECT user_id
    FROM orders
    GROUP BY user_id
) t;
```

假设有3个user_id：A, A, B, B, C, C
**执行过程解析**：

1. **第一个Job**（`GROUP BY`）:
   
   - Map阶段： 以`user_id`为Key输出：` (A), (A), (B), (B), (C), (C)`
   
   - Shuffle阶段： 相同的`user_id`会被发送到**同一个**Reducer，但不同的`user_id`可以分散到**多个**Reducer上。通过设置 `set mapred.reduce.tasks = N;`来控制并行度。
     
     ```sql
     A的hash→Reducer 0: (A), (A)
     B的hash→Reducer 1: (B), (B)
     C的hash→Reducer 0: (C), (C) // 假设A和C的hash模2相同
     ```
   
   - Reduce阶段： 每个Reducer对自己接收到的`user_id`做局部去重（因为相同`user_id`已在一起，去重很快），每个`user_id`输出一行。
     
     ```sql
     Reduce0: 去重后输出 (A), (C)
     Reduce1: 去重后输出 (B)
     ```

2. **第二个Job**（`count(1)`）这个Job数据量很小，执行飞快:
   
   - Map阶段： 以`user_id`为Key输出：`(A), (C), (B)`
   - Shuffle阶段：`所有→Reducer 0`
   - Reduce阶段：`Reduce0: count=3`

**优点**： 完美利用集群并行能力，解决了单点瓶颈和内存溢出问题。

#### 使用近似计算（处理超大基数去重）

如果业务可以接受微小误差（误差率通常在1%以内），使用近似聚合函数速度极快，因为它使用了`HyperLogLog`等概率算法，内存占用恒定且极小。

```sql
-- 使用近似计算，性能极高
SELECT count(DISTINCT user_id) as exact_cnt, -- 精确值（慢）
       approx_count_distinct(user_id) as approx_cnt -- 近似值（快）
FROM orders;
```

**适用场景**： 浏览UV、独立访客等超大基数统计，对绝对精确性要求不高的场景。

## 2. sum / avg / max / min

```sql
SELECT
dept_id,
sum(salary) AS total_salary,
avg(salary) AS avg_salary,
max(salary) AS max_salary,
min(salary) AS min_salary
FROM employee
GROUP BY dept_id;
```

📝 **NULL 处理规则**：除 `count(*)` 外，所有聚合函数**自动忽略 NULL**。

避坑指南

| 坑                   | 描述                     | 解决方案                        |
| ------------------- | ---------------------- | --------------------------- |
| `count(distinct)` 慢 | 只用 1 个 Reducer         | 用`group by` 子查询替代           |
| 聚合后 select 非聚合列     | Hive 会报错或返回非预期值        | 所有非聚合列必须放进`group by`        |
| NULL 影响统计           | `count(col)` 不统计 NULL  | 改用`count(*)` 或 `nvl(col,0)` |
| `collect_list` 数据膨胀 | 大 group 下数组超大 OOM      | 加`LIMIT` 或预先过滤              |
| 分位数选错函数             | `percentile` 慢且只支持 int | 用`percentile_approx`        |
| group by 倾斜         | 单 Reducer 跑爆           | 开启`hive.groupby.skewindata` |

---

# 三、统计学聚合函数

| 函数                              | 英文全称                            | 含义      | 公式（可复制）                      | 使用场景说明           |
| ------------------------------- | ------------------------------- | ------- | ---------------------------- | ---------------- |
| `variance(col)`/ `var_pop(col)` | Variance (Population)           | 总体方差    | `∑(xᵢ - μ)² / N`             | 已知全体数据时使用        |
| `var_samp(col)`                 | Variance (Sample)               | 样本方差    | `∑(xᵢ - x̄)² / (N-1)`        | 从样本推断总体时使用（无偏估计） |
| `stddev_pop(col)`               | Standard Deviation (Population) | 总体标准差   | `√(var_pop)`                 | 与总体方差配套使用        |
| `stddev_samp(col)`              | Standard Deviation (Sample)     | 样本标准差   | `√(var_samp)`                | 与样本方差配套使用        |
| `covar_pop(c1, c2)`             | Covariance (Population)         | 总体协方差   | `∑(xᵢ - μₓ)(yᵢ - μᵧ) / N`    | 两变量总体线性关系度量      |
| `covar_samp(c1, c2)`            | Covariance (Sample)             | 样本协方差   | `∑(xᵢ - x̄)(yᵢ - ȳ) / (N-1)` | 样本数据的协方差估计       |
| `corr(c1, c2)`                  | Correlation Coefficient         | 皮尔逊相关系数 | `cov(x,y) / (σₓ × σᵧ)`       | 标准化协方差，范围[-1, 1] |

公式符号说明

| 符号      | 含义       | 代码表示                  |
| ------- | -------- | --------------------- |
| **∑**   | 求和       | `\sum`或 `SUM()`       |
| **xᵢ**  | 第 i 个数据点 | `x_i`                 |
| **μ**   | 总体均值     | `\mu`或 `avg_pop`      |
| **x̄**  | 样本均值     | `\bar{x}`或 `avg_samp` |
| **N**   | 总体数据个数   | `N`                   |
| **n**   | 样本数据个数   | `n`                   |
| **σ**   | 总体标准差    | `\sigma`              |
| **s**   | 样本标准差    | `s`                   |
| **cov** | 协方差      | `\text{cov}`          |

## 1、总体方差/样本方差

```sql
总体方差: var_pop(col)
样本方差: var_samp(col)
```

**方差**是衡量一组数据离散程度（波动大小）的核心统计指标。它计算的是每个数据点与平均值之间距离的平方的平均值。

方差越大，数据越分散、波动越大；方差越小，数据越集中、越稳定。

$$
\begin{align}
\text{总体方差(Population Variance)} = \frac{\sum_{i=1}^{N}(x_i - \mu)^2}{N}\text{    N为总体数据个数}\\
\text{样本方差(Sample Variance)} = \frac{\sum_{i=1}^{n}(x_i - \bar{x})^2}{n-1}\text{    n为样本数据个数}
\end{align}
$$

**关键区别**：样本方差的分母用 `n-1`（贝塞尔校正），这是为了得到对总体方差更准确的无偏估计。大数据分析中，我们通常处理的是样本数据，所以**更常用 `var_samp()`**。

### 场景：分析用户日活跃时长

```sql
-- 计算用户每日使用时长的波动情况
SELECT 
  AVG(duration_minutes) AS avg_duration,  -- 平均时长
  VAR_SAMP(duration_minutes) AS variance_duration,  -- 时长方差
  STDDEV_SAMP(duration_minutes) AS stddev_duration  -- 时长标准差
FROM user_behavior
WHERE dt BETWEEN '2023-10-01' AND '2023-10-31';
```

**解读结果**：

- 如果 `variance_duration`值很大 → 用户使用习惯不稳定，有的天用很久，有的天几乎不用

- 如果值很小 → 用户使用习惯很规律，每天时长差不多

**计算方差时为什么要平方？**

①避免正负偏差相互抵消；②放大较大偏差的影响，使方差对异常值更敏感。

## 2、总体标准差/样本标准差

```sql
总体标准差: stddev_pop(col)
样本标准差: stddev_samp(col)
```

**标准差**是方差的平方根，它衡量数据点相对于平均值的平均离散程度。与方差相比，标准差的单位与原数据一致，因此更直观、更易于业务解释。

**标准差是数据波动大小的“标尺”——标准差越大，数据越分散；标准差越小，数据越集中。**

$$
\begin{align}
\text{总体标准差 ( Population Standard Deviation ) σ} = \sqrt{\frac{\sum_{i=1}^{N}(x_i - \mu)^2}{N}}\text{    N为总体数据个数}\\
\text{样本标准差 ( Sample Standard Deviation ) s} = \sqrt{\frac{\sum_{i=1}^{n}(x_i - \bar{x})^2}{n-1}}\text{    n为样本数据个数}
\end{align}
$$

📊 标准差 vs 方差（关键区别）

| 指标       | 计算公式        | 单位                   | 直观性              | 大数据函数           |
| -------- | ----------- | -------------------- | ---------------- | --------------- |
| **方差**​  | N∑(xi​−μ)2​ | 原单位的平方<br>（如：元²、分钟²） | 较差，难以直接解释        | `VAR_SAMP()`    |
| **标准差**​ | 方差​         | 与原数据一致<br>（如：元、分钟）   | **极好**，可直接用于业务分析 | `STDDEV_SAMP()` |

**简单比喻**：

- 方差 = 衡量“波动能量”（平方后放大）

- 标准差 = 衡量“波动幅度”（恢复原单位，可直接感知）

### 经验法则（68-95-99.7规则）

对于**正态分布**数据：

- <mark>68%</mark> 的数据落在均值 ± 1个标准差内

- <mark>95%</mark>​ 的数据落在均值 ± 2个标准差内

- <mark>99.7%</mark>​ 的数据落在均值 ± 3个标准差内

### 应用

#### 场景1：分析电商用户订单金额波动

```sql
-- 计算用户订单金额的标准差，了解消费稳定性
SELECT 
  user_id,
  AVG(order_amount) AS avg_amount,           -- 平均订单金额
  STDDEV_SAMP(order_amount) AS std_amount    -- 订单金额标准差
FROM order_table
WHERE dt >= '2023-10-01'
GROUP BY user_id
LIMIT 10;
```

**结果解读示例**：

```
用户A：avg_amount=200元, std_amount=20元  → 消费很稳定（200±20元）
用户B：avg_amount=200元, std_amount=80元  → 消费波动大（有时几十，有时几百）
```

#### 场景2：监控系统接口响应时间

```sql
-- 监控API响应时间的稳定性
SELECT 
  api_name,
  AVG(response_time_ms) AS avg_time,
  STDDEV_SAMP(response_time_ms) AS std_time,
  -- 计算波动系数：标准差/平均值，衡量相对波动
  STDDEV_SAMP(response_time_ms) / AVG(response_time_ms) AS cv
FROM api_monitor
WHERE hour = '2023-10-22 10:00:00'
GROUP BY api_name;
```

#### 场景3：异常检测与监控

```sql
-- 识别响应时间异常的服务
SELECT *
FROM api_monitor
WHERE response_time_ms > 
  (SELECT AVG(response_time_ms) + 3 * STDDEV_SAMP(response_time_ms) 
   FROM api_monitor WHERE dt = '2023-10-22')
```

**3σ原则**：在正态分布中，99.7%的数据落在均值±3个标准差内。超出此范围可视为异常。

**1. 用户分群与画像**

- **低标准差用户**：行为稳定，适合标准化服务

- **高标准差用户**：行为多变，需个性化策略

**2. 风险评估（金融领域）**

- 股票收益率的标准差 = 波动率 = 风险指标

- 标准差越大，投资风险越高

**3. 质量控制（生产领域）**

- 产品尺寸的标准差衡量生产一致性

- 六西格玛管理：要求标准差极低

---

## 3、总体协方差/样本协方差

```sql
总体协方差: covar_pop(col1, col2)
样本协方差: covar_samp(col1, col2)
```

**协方差**衡量两个变量之间的**协同变化关系**。它告诉你：当一个变量变化时，另一个变量是倾向于同向变化还是反向变化。

协方差的正负表示变化方向，绝对值大小表示变化关系的强弱（但受数据尺度影响）。

$$
\begin{align}
\text{总体标准差 ( Population Covariance ) cov(x,y)} = \frac{\sum_{i=1}^{N}(x_i - \mu_x)(y_i - \mu_y)}{N}\text{    N为总体数据个数}\\
\text{样本标准差 ( Sample Covariancen ) cov(x,y)} = \frac{\sum_{i=1}^{n}(x_i - \bar{x})(y_i - \bar{y})}{n-1}\text{    n为样本数据个数}
\end{align}
$$

📈 协方差的三种情况

| 协方差值     | 变化关系                 | 图形表现      | 业务示例        |
| -------- | -------------------- | --------- | ----------- |
| **正值**​  | **正相关**<br>一个↑，另一个也↑ | 点从左下到右上分布 | 广告曝光量↑，点击量↑ |
| **负值**​  | **负相关**<br>一个↑，另一个↓  | 点从左上到右下分布 | 商品价格↑，销量↓   |
| **接近0**​ | **无线性关系**​           | 点随机分布，无趋势 | 用户身高与购物金额   |

### 协方差的局限性

**2. 量纲敏感问题**

```sql
-- 同一关系，不同单位导致协方差值完全不同
SELECT 
  COVAR_SAMP(price_yuan, sales) AS covar_yuan,    -- 价格(元)与销量
  COVAR_SAMP(price_cent, sales) AS covar_cent     -- 价格(分)与销量
FROM product_data;
-- covar_cent 会是 covar_yuan 的100倍，但实际关系相同！
```

**2. 无法比较不同变量对**

- 协方差A=1000，协方差B=50 → **不能**说A的关系比B强1000/50=20倍

- 因为量纲不同，绝对值大小无直接可比性

**这正是需要“相关系数”的原因**：相关系数=标准化协方差，消除了量纲影响。

### 应用

#### 场景1：分析广告效果

```sql
-- 分析广告曝光量与点击量的关系
SELECT 
  COVAR_SAMP(impressions, clicks) AS covar_imp_clk,
  -- 业务解读：正值表示曝光增加时点击也倾向于增加
  AVG(impressions) AS avg_impressions,
  AVG(clicks) AS avg_clicks
FROM ad_performance
WHERE dt = '2023-10-22';
```

#### 场景2：用户行为分析

```sql
-- 分析用户浏览时长与购买金额的关系
SELECT 
  user_id,
  COVAR_SAMP(session_duration, purchase_amount) AS covar_duration_amount
FROM user_sessions
GROUP BY user_id
HAVING COVAR_SAMP(session_duration, purchase_amount) > 0
-- 只筛选正相关用户：浏览越久，买得越多
LIMIT 10;
```

#### 场景3：特征选择（机器学习）

```sql
-- 选择与目标变量相关性强的特征
SELECT 
  feature_name,
  COVAR_SAMP(feature_value, target_value) AS covar_with_target
FROM training_data
GROUP BY feature_name
ORDER BY ABS(COVAR_SAMP(feature_value, target_value)) DESC;
-- 协方差绝对值越大，特征与目标变量关系越强
```

## 4、皮尔逊相关系数

```sql
皮尔逊相关系数: corr(c1, c2)
```

**皮尔逊相关系数**是协方差的标准化版本，它衡量两个变量之间**线性关系**的强度和方向，取值范围固定为[-1, 1]，消除了量纲影响，可直接比较不同变量对的相关性强弱。

**相关系数 = 标准化的协方差。值越接近±1，线性关系越强；值越接近0，线性关系越弱。**

$$
\begin{align}
\text{皮尔逊相关系数 ( Correlation Coefficient ): } r(X,Y)
= \frac{\text{cov}(x,y)}{\sigma_x \sigma_y}
\quad \text{ 其中：cov(x,y)为协方差，σ为总体标准}\\
=
\frac{\sum_{i=1}^{n}(x_i - \bar{x})(y_i - \bar{y})}
     {\sqrt{\sum_{i=1}^{n}(x_i - \bar{x})^2} \cdot 
      \sqrt{\sum_{i=1}^{n}(y_i - \bar{y})^2}}
\quad \text{其中: } -1 \leq r \leq 1

\end{align}
$$

### 相关系数 vs 协方差（关键升级）

| 特性         | 协方差            | 皮尔逊相关系数           |
| ---------- | -------------- | ----------------- |
| **取值范围**​  | (-∞, +∞)       | **[-1, 1]**（固定范围） |
| **量纲影响**​  | 受数据单位影响        | **无量纲**，消除单位影响    |
| **可比性**​   | 不同变量对无法直接比较    | **可直接比较**不同变量对    |
| **直观性**​   | 数值大小难以解释       | **绝对值越接近1，关系越强**​ |
| **大数据函数**​ | `COVAR_SAMP()` | `CORR()`          |

📈 相关系数值的直观解释

| r 值范围            | 关系强度          | 方向  | 业务意义              |
| ---------------- | ------------- | --- | ----------------- |
| **0.8 ~ 1.0**​   | **极强相关**​     | 正   | 一个变量可高度预测另一个      |
| **0.6 ~ 0.8**​   | **强相关**​      | 正   | 明显协同变化关系          |
| **0.4 ~ 0.6**​   | **中等相关**​     | 正   | 有一定关联性            |
| **0.2 ~ 0.4**​   | **弱相关**​      | 正   | 轻微关联，需谨慎解读        |
| **-0.2 ~ 0.2**​  | **极弱/无线性相关**​ | -   | 无明显线性关系（可能有非线性关系） |
| **-0.4 ~ -0.2**​ | **弱相关**​      | 负   | 轻微反向变化            |
| **-0.6 ~ -0.4**​ | **中等相关**​     | 负   | 明显反向变化            |
| **-0.8 ~ -0.6**​ | **强相关**​      | 负   | 强烈反向变化            |
| **-1.0 ~ -0.8**​ | **极强相关**​     | 负   | 高度反向预测关系          |

**重要提示**：相关系数只衡量**线性关系**。r=0不代表没有关系，可能存**非线性关系**（如U型、抛物线型）。

### 应用

#### 场景1：特征工程（机器学习）

```sql
-- 筛选与目标变量相关性强的特征
SELECT 
  feature_name,
  ABS(CORR(feature, target)) AS abs_correlation
FROM model_features
GROUP BY feature_name
ORDER BY abs_correlation DESC;
-- 通常保留|r|>0.3的特征，剔除|r|<0.1的特征
```

#### 场景2：业务指标监控

```sql
-- 监控关键指标对的相关性是否稳定
SELECT 
  dt,
  CORR(active_users, revenue) AS dau_revenue_corr
FROM daily_business_metrics
GROUP BY dt
ORDER BY dt;
-- 如果某天相关性突然下降，需要排查原因
```

#### 场景3：用户分群与推荐

```sql
-- 基于行为相关性进行用户分群
SELECT 
  user_id,
  CASE 
    WHEN CORR(browse_time, purchase_amount) > 0.6 THEN '高价值探索型'
    WHEN CORR(browse_time, purchase_amount) < -0.3 THEN '快速决策型'
    ELSE '普通型'
  END AS user_segment
FROM user_behavior
GROUP BY user_id;
```

# 四、分位数函数（数仓常用）

1. **分位数定义**

将数据从小到大排序后，分成若干等份的切分点值。常用分位数：

| 分位数       | 别名                | 含义                   | 数据位置  |
| --------- | ----------------- | -------------------- | ----- |
| **中位数**​  | 二分位数              | 50%分位点               | 正中间的值 |
| **四分位数**​ | Q1, Q2, Q3        | 25%, 50%, 75%分位点     | 四等分点  |
| **百分位数**​ | P1, P10, P90, P99 | 1%, 10%, 90%, 99%分位点 | 百等分点  |

2. **分位数 vs 平均值**

```sql
-- 平均值受异常值影响大，分位数更稳健
数据: [1, 2, 3, 4, 1000]
平均值: 202 (被1000拉高)
中位数: 3 (不受极端值影响)
```

## 1、PERCENTILE() - 精确分位数

```sql
-- 语法：PERCENTILE(col, p) OVER()
-- 计算精确分位数，但性能较差，适合小数据集
SELECT 
  PERCENTILE(CAST(salary AS BIGINT), 0.5) AS median_salary,
  PERCENTILE(CAST(salary AS BIGINT), 0.25) AS q1_salary,
  PERCENTILE(CAST(salary AS BIGINT), 0.75) AS q3_salary
FROM employee_table;
```

**注意**：`PERCENTILE()`要求列为 `BIGINT`或 `DOUBLE`类型，需要显式转换。

## 2、PERCENTILE_APPROX() - 近似分位数（推荐）

使用 `T-Digest`算法，内存效率高，适合大数据集。

```sql
-- 计算单个百分位数
PERCENTILE_APPROX(col, p [, B])

-- 计算多个百分位数（返回数组）
PERCENTILE_APPROX(col, array(p1, p2, ...) [, B])
```

**参数说明表**

| 参数       | 数据类型                       | 必选/可选 | 说明                  | 示例值                                     |
| -------- | -------------------------- | ----- | ------------------- | --------------------------------------- |
| **col**​ | DOUBLE, DECIMAL, INT 等数值类型 | 必选    | 要计算百分位数的数值列         | `response_time`, `amount`               |
| **p**​   | DOUBLE 或 ARRAY<DOUBLE>     | 必选    | 百分位数值，范围 [0, 1]     | `0.95`（P95）<br>`array(0.5, 0.95, 0.99)` |
| **B**​   | INT                        | 可选    | **精度控制参数**，默认 10000 | `10000`, `20000`, `9999`                |

**B 参数的作用机制**

- **内存控制**：B 代表算法保留的**数据压缩点数量**，B 越大，近似精度越高

- **精确条件**：当列中不同值（distinct values）的数量 ≤ B 时，返回**精确百分位数**

- **性能权衡**：B 值增加会提升计算成本和内存消耗

快速估算，性能优先（大数据集）B=5000

平衡精度与性能（默认推荐）B=10000

高精度需求（小数据集或关键指标）B=50000

```sql
-- 语法：PERCENTILE_APPROX(col, p [, B])
-- B: 精度参数，默认10000，越大越精确但越慢
SELECT 
  PERCENTILE_APPROX(salary, 0.5) AS median_salary,      -- 中位数
  PERCENTILE_APPROX(salary, 0.95) AS p95_salary,        -- 95分位
  PERCENTILE_APPROX(salary, 0.99, 100000) AS p99_salary -- 高精度99分位
FROM employee_table;
```

### 与 PERCENTILE 函数的区别

| 函数                     | 输入类型            | 计算方式        | 性能          | 适用场景           |
| ---------------------- | --------------- | ----------- | ----------- | -------------- |
| **PERCENTILE**​        | 仅限 **INT**​ 类型  | 精确计算        | 较慢，需全排序     | 小数据集，整数列，要求精确  |
| **PERCENTILE_APPROX**​ | 所有数值类型（DOUBLE等） | 近似计算，精度由B控制 | **快**，适合大数据 | 海量数据，浮点数列，允许近似 |

```sql
-- 错误示例：PERCENTILE 不能用于浮点数
SELECT PERCENTILE(response_time, 0.95) FROM logs; -- 可能报错

-- 正确做法：使用 PERCENTILE_APPROX 或先转换
SELECT PERCENTILE_APPROX(response_time, 0.95) FROM logs;
SELECT PERCENTILE(CAST(response_time AS INT), 0.95) FROM logs; -- 精度丢失
```

### 应用

#### 场景1：多个分位数一次性计算

```sql
-- 使用数组一次计算多个分位数
SELECT 
  PERCENTILE_APPROX(salary, ARRAY(0.25, 0.5, 0.75, 0.9, 0.95, 0.99)) AS percentiles
FROM employee_table;

-- 结果：数组形式 [q1, median, q3, p90, p95, p99]
-- 提取特定分位值：
SELECT 
  percentiles[0] AS q1,      -- 25%分位（数组索引从0开始）
  percentiles[1] AS median,  -- 中位数
  percentiles[5] AS p99      -- 99%分位
FROM (
  SELECT PERCENTILE_APPROX(salary, ARRAY(0.25, 0.5, 0.75, 0.9, 0.95, 0.99)) AS percentiles
  FROM employee_table
) t;
```

#### 场景2：系统性能监控（P99延迟）

P99表示在一组数据中，有99%的数据点小于或等于该值，只有1%的数据点大于该值。例如，如果API响应时间的P99是200ms，意味着99%的请求响应时间≤200ms，只有1%的请求超过200ms。

| 指标           | 特点                | 适用场景                                  |
| ------------ | ----------------- | ------------------------------------- |
| **平均值**​     | 易受极端值影响，掩盖长尾问题    | 整体趋势分析                                |
| **P50 中位数**​ | 50%数据低于此值，反映典型情况  | 普通用户体验                                |
| **P95**​     | 95%数据低于此值，关注大多数用户 | 一般性能要求                                |
| **P99**​     | 99%数据低于此值，关注最差情况  | **关键业务、SLA保障**<br/>P99突增通常表示系统存在性能瓶颈​ |
| **P999**​    | 99.9%数据低于此值       | 极端场景、金融交易                             |

```sql
-- 监控API响应时间的P99，用于SLA评估
SELECT 
  api_name,
  COUNT(*) AS request_count,
  AVG(response_time_ms) AS avg_time,
  MIN(response_time_ms) AS min_time,
  MAX(response_time_ms) AS max_time,
  PERCENTILE_APPROX(response_time_ms, 0.99) AS p99_time,  -- 关键指标
  PERCENTILE_APPROX(response_time_ms, 0.95) AS p95_time
FROM api_monitor
WHERE dt = '2023-10-22' AND hour = '10'
GROUP BY api_name
HAVING p99_time > 1000  -- 筛选P99超过1秒的API
ORDER BY p99_time DESC;
```

#### 场景3： IQR 方法

- **IQR**​ = Q3（第三四分位数，75%分位点） - Q1（第一四分位数，25%分位点）

- 反映了数据中间50%的离散程度，对极端值不敏感

计算步骤

```sql
1. 将数据从小到大排序
2. 计算 Q1（第25百分位数）和 Q3（第75百分位数）
3. IQR = Q3 - Q1
4. 异常值边界：
   - 下界 = Q1 - 1.5 × IQR
   - 上界 = Q3 + 1.5 × IQR
5. 任何低于下界或高于上界的数据点视为异常值
```

```sql
-- 计算订单金额的IQR并识别异常订单
WITH order_stats AS (
  SELECT 
    PERCENTILE_APPROX(order_amount, 0.25) as q1,
    PERCENTILE_APPROX(order_amount, 0.75) as q3,
    PERCENTILE_APPROX(order_amount, 0.75) - PERCENTILE_APPROX(order_amount, 0.25) as iqr
  FROM orders
  WHERE dt = '2024-01-01'
)
SELECT 
  o.order_id,
  o.order_amount,
  CASE 
    WHEN o.order_amount < (s.q1 - 1.5 * s.iqr) THEN '过低异常'
    WHEN o.order_amount > (s.q3 + 1.5 * s.iqr) THEN '过高异常'
    ELSE '正常'
  END as outlier_type,
  s.q1 - 1.5 * s.iqr as lower_bound,
  s.q3 + 1.5 * s.iqr as upper_bound
FROM orders o
CROSS JOIN order_stats s
WHERE o.dt = '2024-01-01'
  AND (o.order_amount < (s.q1 - 1.5 * s.iqr) 
       OR o.order_amount > (s.q3 + 1.5 * s.iqr));
```

## 3、PERCENTILE_CONT() - 连续分位数（Hive 2.2.0+）

```sql
-- 语法：PERCENTILE_CONT(p) WITHIN GROUP (ORDER BY col)
-- 返回插值结果（如果分位点不在具体数据点上）
SELECT 
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time) AS median_time,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY response_time) AS p90_time
FROM api_logs;
```

```sql
-- 精确分位数（只支持 int 类型，数据量大时慢）
SELECT percentile(age, 0.5) AS median_age FROM employee;

-- 近似分位数（支持 double，性能好，推荐）
SELECT percentile_approx(salary, 0.95) AS p95_salary FROM employee;

-- 一次算多个分位数（传数组）
SELECT percentile_approx(salary, array(0.5, 0.9, 0.95, 0.99))
FROM employee;
```

💡 **使用建议**：生产环境优先用 `percentile_approx`，效率高、支持任意数值类型。

---

# 五、集合聚合（行转列利器）

**集合聚合函数概览**

| 函数                   | 返回值类型      | 功能描述         | 是否去重          | 保留顺序     |
| -------------------- | ---------- | ------------ | ------------- | -------- |
| **COLLECT_LIST**​    | `ARRAY<T>` | 将多行值收集到数组中   | ❌ 不去重         | ✅ 保留输入顺序 |
| **COLLECT_SET**​     | `ARRAY<T>` | 将多行值收集到集合中   | ✅ 去重          | ❌ 不保证顺序  |
| **MAP_AGG**​         | `MAP<K,V>` | 将多行键值对收集为Map | ✅ Key去重，最新值覆盖 |          |
| **MAP_FROM_ARRAYS**​ | `MAP<K,V>` | 从两个数组创建Map   |               |          |

## 1. COLLECT_LIST - 收集为数组（保留重复）

```sql
-- 语法：COLLECT_LIST(expr)
-- 收集所有值，保留重复项，按照输入顺序排列

-- 示例：收集每个部门的员工姓名
SELECT 
  department,
  COLLECT_LIST(employee_name) AS all_employees,
  COUNT(*) AS employee_count
FROM employees
GROUP BY department;

-- 结果示例：
-- IT → ['张三', '李四', '张三', '王五']  -- 张三出现两次
-- HR → ['赵六', '钱七']
```

### ⚡ 性能优化与最佳实践

#### 1、 控制数组大小，避免OOM

```sql
-- 使用LIMIT限制收集的元素数量
SELECT 
  user_id,
  SLICE(
    COLLECT_LIST(event_time ORDER BY event_time DESC),
    1, 10  -- 只取最近的10个事件
  ) AS recent_events
FROM user_events
GROUP BY user_id;

-- 或者过滤后再收集
SELECT 
  user_id,
  COLLECT_LIST(event_time) AS filtered_events
FROM (
  SELECT user_id, event_time
  FROM user_events
  WHERE event_time >= DATE_SUB(CURRENT_DATE, 7)  -- 只收集最近7天的
) t
GROUP BY user_id;
```

#### 2、 使用DISTRIBUTE BY + SORT BY保证顺序

```sql
-- 确保COLLECT_LIST的顺序
SELECT 
  user_id,
  COLLECT_LIST(
    STRUCT(event_time, event_type)
  ) AS event_sequence
FROM (
  SELECT user_id, event_time, event_type
  FROM user_events
  DISTRIBUTE BY user_id      -- 相同user_id发到同一个reducer
  SORT BY user_id, event_time  -- 在每个reducer内排序
) t
GROUP BY user_id;
```

#### 3、 避免大Map的Shuffle

```sql
-- 大Map在Shuffle时效率低，考虑分阶段聚合
-- 第一阶段：局部聚合
CREATE TEMPORARY TABLE tmp_user_tags AS
SELECT 
  user_id,
  MAP_AGG(tag_category, tag_value) AS local_tags
FROM user_tags
WHERE dt = '2023-10-22'
GROUP BY user_id;

-- 第二阶段：全局聚合
SELECT 
  user_id,
  MAP_CONCAT(local_tags, additional_tags) AS all_tags
FROM tmp_user_tags
LEFT JOIN additional_tags USING (user_id);
```

#### 4、 处理NULL值

```sql
-- COLLECT_LIST会包含NULL，COLLECT_SET会排除NULL
SELECT 
  user_id,
  COLLECT_LIST(
    IF(product_id IS NULL, 'unknown', product_id)
  ) AS products_without_null,
  COLLECT_SET(
    IFNULL(product_id, 'unknown')
  ) AS unique_products
FROM user_products
GROUP BY user_id;
```

### 应用：

#### 场景1：数据透视（行转列）

```sql
-- 将多行数据转为宽表格式
SELECT 
  user_id,
  MAP_AGG(metric_name, metric_value) AS metrics_map
FROM user_metrics
WHERE dt = '2023-10-22'
GROUP BY user_id;

-- 展开为列
SELECT 
  user_id,
  metrics_map['pv'] AS page_views,
  metrics_map['uv'] AS unique_visitors,
  metrics_map['avg_duration'] AS avg_duration
FROM (
  SELECT 
    user_id,
    MAP_AGG(metric_name, metric_value) AS metrics_map
  FROM user_metrics
  WHERE dt = '2023-10-22'
  GROUP BY user_id
) t;
```

- 收集用户行为序列

- 生成特征数组用于机器学习

- 数据透视（行转列）

#### 场景2：订单商品聚合

```sql
-- 将订单中的所有商品聚合
SELECT 
  order_id,
  COLLECT_LIST(
    NAMED_STRUCT(
      'product_id', product_id,
      'product_name', product_name,
      'quantity', quantity,
      'price', price
    )
  ) AS order_items,
  SUM(quantity * price) AS order_total,
  COUNT(DISTINCT product_id) AS distinct_products
FROM order_items
GROUP BY order_id
HAVING order_total > 1000
ORDER BY order_total DESC;
```

#### 场景3：用户标签聚合

```sql
-- 将用户的多个标签聚合为Map
SELECT 
  user_id,
  MAP_AGG(tag_category, tag_value) AS user_tags
FROM user_tags
WHERE tag_weight > 0.5
GROUP BY user_id;

-- 结果示例：用户标签Map
-- 用户1 → {'兴趣': '科技', '年龄段': '25-30', '消费水平': '高'}
-- 用户2 → {'兴趣': '美食', '年龄段': '30-35', '城市': '成都'}
```

# （待补充）

## 2. COLLECT_SET - 收集为集合（去重）

```sql
-- 语法：COLLECT_SET(expr)
-- 收集唯一值，不保证顺序

-- 示例：收集每个部门的唯一员工姓名
SELECT 
  department,
  COLLECT_SET(employee_name) AS unique_employees,
  SIZE(COLLECT_SET(employee_name)) AS unique_count
FROM employees
GROUP BY department;

-- 结果示例：
-- IT → ['张三', '李四', '王五']  -- 张三只出现一次
-- HR → ['赵六', '钱七']
```

**注意**：`COLLECT_SET`不保证顺序，如需有序去重，可以这样：

```sql
-- 有序去重：先排序，再去重
SELECT 
  department,
  COLLECT_LIST(employee_name) AS all_ordered,  -- 先收集有序列表
  ARRAY_DISTINCT(COLLECT_LIST(employee_name)) AS unique_ordered  -- 再去重
FROM (
  SELECT department, employee_name
  FROM employees
  DISTRIBUTE BY department
  SORT BY department, employee_name
) t
GROUP BY department;
```

## 3. MAP_AGG - 创建键值对Map

```sql
-- 语法：MAP_AGG(key_expr, value_expr)
-- 将多行键值对收集为Map，重复key会取最后一个value

-- 示例：收集员工ID到姓名的映射
SELECT 
  department,
  MAP_AGG(employee_id, employee_name) AS id_name_map
FROM employees
GROUP BY department;

-- 结果示例：
-- IT → {1001: '张三', 1002: '李四', 1003: '王五'}
-- HR → {2001: '赵六', 2002: '钱七'}

-- 提取Map中的值
SELECT 
  department,
  id_name_map[1001] AS employee_1001,  -- 获取key为1001的值
  MAP_KEYS(id_name_map) AS all_ids,   -- 获取所有key
  MAP_VALUES(id_name_map) AS all_names -- 获取所有value
FROM (
  SELECT department, MAP_AGG(employee_id, employee_name) AS id_name_map
  FROM employees
  GROUP BY department
) t;
```

## 4. MAP_FROM_ARRAYS - 从两个数组创建Map

从两个数组创建Map，要求两个数组长度相同

```sql
-- 语法：MAP_FROM_ARRAYS(keys_array, values_array)
-- 示例：从两列创建Map
SELECT 
  user_id,
  MAP_FROM_ARRAYS(
    COLLECT_LIST(behavior_type),  -- 行为类型数组
    COLLECT_LIST(behavior_count)   -- 行为次数数组
  ) AS behavior_map
FROM user_behavior
GROUP BY user_id;

-- 结果示例：
-- 用户1 → {'view': 10, 'click': 5, 'purchase': 2}
-- 用户2 → {'view': 15, 'click': 3}
```

# 六、直方图（待补充）

## 1. HISTOGRAM_NUMERIC - 数值直方图

```sql
-- 语法：HISTOGRAM_NUMERIC(expr, nbuckets)
-- 生成数值分布的直方图，nbuckets指定分桶数量

-- 示例：分析工资分布（分10个桶）
SELECT 
  department,
  HISTOGRAM_NUMERIC(salary, 10) AS salary_histogram
FROM employees
GROUP BY department;

-- 结果示例：Map<桶的上界, 频数>
-- IT → {5000.0: 5, 10000.0: 12, 15000.0: 8, ...}
-- 表示：5000以下5人，5000-10000之间12人，以此类推
```

## 2. NGRAMS - N-gram分析

```sql
-- 语法：NGRAMS(array<T>, n, k)
-- 从数组中提取最常见的n-gram序列，返回前k个

-- 示例：分析搜索词的最常见二元组
SELECT 
  NGRAMS(SPLIT(search_query, ' '), 2, 5) AS top_bigrams
FROM search_logs
WHERE dt = '2023-10-22';

-- 结果示例：
-- [{'ngram': ['大数据', '学习'], 'estfrequency': 100},
--  {'ngram': ['Hive', '教程'], 'estfrequency': 85}]
```

---

## 💻 实战应用场景

### 场景1：用户行为序列分析

```sql
-- 收集用户按时间排序的行为序列
SELECT 
  user_id,
  COLLECT_LIST(
    STRUCT(
      event_time,
      event_type,
      page_id
    )
  ) AS behavior_sequence
FROM (
  SELECT 
    user_id,
    event_time,
    event_type,
    page_id
  FROM user_events
  WHERE dt = '2023-10-22'
  DISTRIBUTE BY user_id
  SORT BY user_id, event_time  -- 保证按用户和时间排序
) t
GROUP BY user_id
LIMIT 10;

-- 结果：每个用户的行为轨迹数组
-- 用于后续的序列分析、路径分析、用户画像
```

### 场景2：订单商品聚合

```sql
-- 将订单中的所有商品聚合
SELECT 
  order_id,
  COLLECT_LIST(
    NAMED_STRUCT(
      'product_id', product_id,
      'product_name', product_name,
      'quantity', quantity,
      'price', price
    )
  ) AS order_items,
  SUM(quantity * price) AS order_total,
  COUNT(DISTINCT product_id) AS distinct_products
FROM order_items
GROUP BY order_id
HAVING order_total > 1000
ORDER BY order_total DESC;
```

### 场景3：用户标签聚合

```sql
-- 将用户的多个标签聚合为Map
SELECT 
  user_id,
  MAP_AGG(tag_category, tag_value) AS user_tags
FROM user_tags
WHERE tag_weight > 0.5
GROUP BY user_id;

-- 结果示例：用户标签Map
-- 用户1 → {'兴趣': '科技', '年龄段': '25-30', '消费水平': '高'}
-- 用户2 → {'兴趣': '美食', '年龄段': '30-35', '城市': '成都'}
```

### 场景4：数据透视（行转列）

```sql
-- 将多行数据转为宽表格式
SELECT 
  user_id,
  MAP_AGG(metric_name, metric_value) AS metrics_map
FROM user_metrics
WHERE dt = '2023-10-22'
GROUP BY user_id;

-- 展开为列
SELECT 
  user_id,
  metrics_map['pv'] AS page_views,
  metrics_map['uv'] AS unique_visitors,
  metrics_map['avg_duration'] AS avg_duration
FROM (
  SELECT 
    user_id,
    MAP_AGG(metric_name, metric_value) AS metrics_map
  FROM user_metrics
  WHERE dt = '2023-10-22'
  GROUP BY user_id
) t;
```

### 场景5：用户相似度计算（基于共同行为）

```sql
-- 计算用户间的共同行为数量
WITH user_behavior_set AS (
  SELECT 
    user_id,
    COLLECT_SET(page_id) AS viewed_pages
  FROM page_views
  WHERE dt = '2023-10-22'
  GROUP BY user_id
)
SELECT 
  a.user_id AS user1,
  b.user_id AS user2,
  SIZE(ARRAY_INTERSECTION(a.viewed_pages, b.viewed_pages)) AS common_pages_count,
  -- 计算Jaccard相似度
  SIZE(ARRAY_INTERSECTION(a.viewed_pages, b.viewed_pages)) * 1.0 /
  SIZE(ARRAY_UNION(a.viewed_pages, b.viewed_pages)) AS jaccard_similarity
FROM user_behavior_set a
JOIN user_behavior_set b
WHERE a.user_id < b.user_id
  AND SIZE(ARRAY_INTERSECTION(a.viewed_pages, b.viewed_pages)) > 5
ORDER BY common_pages_count DESC
LIMIT 100;
```

### `collect_list` vs `collect_set`

```sql
-- collect_list：保留重复值，保留顺序（不严格保证）
SELECT user_id, collect_list(product_id) AS bought_items
FROM orders
GROUP BY user_id;

-- collect_set：自动去重，无序
SELECT user_id, collect_set(product_id) AS unique_items
FROM orders
GROUP BY user_id;
```

**配合 `concat_ws` 实现字符串拼接**（经典面试题）：

```sql
SELECT
user_id,
concat_ws(',', collect_list(cast(product_id AS string))) AS items_str
FROM orders
GROUP BY user_id;
```

---

# 七、高级分组聚合：（待补充）

`GROUPING SETS / CUBE / ROLLUP`

这是数仓**多维分析**的核心能力，相当于一次 SQL 跑出多种粒度的聚合结果。

**示例数据**

假设有订单表：`orders(year, month, region, sales)`

### 1. GROUPING SETS：指定哪些维度组合

```sql
SELECT year, month, region, sum(sales)
FROM orders
GROUP BY year, month, region
GROUPING SETS (
    (year, month, region), -- 最细粒度
    (year, month), -- 按年月
    (year), -- 按年
    () -- 总计
);
```

等价于 4 条 SQL 的 `union all`，但只扫一次表。

### 2. ROLLUP：层级递进（小计 + 总计）

```sql
SELECT year, month, region, sum(sales)
FROM orders
GROUP BY year, month, region WITH ROLLUP;
```

等价于：

```sql
GROUPING SETS (
  (year, month, region),
  (year, month),
  (year),
  ()
)
```

### 3. CUBE：所有维度组合

```sql
SELECT year, month, region, sum(sales)
FROM orders
GROUP BY year, month, region WITH CUBE;
```

等价于 2³ = 8 种组合：

```sql
(year,month,region), (year,month), (year,region), (month,region),
(year), (month), (region), ()
```

### 4. grouping__id 区分聚合层级

```sql
SELECT
year, month, region,
sum(sales) AS total,
grouping__id AS gid
FROM orders
GROUP BY year, month, region WITH CUBE;
```

`grouping__id` 可标识当前行是哪一个维度组合的小计，方便下游处理。
