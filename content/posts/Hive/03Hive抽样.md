---
title: "【三】Hive 抽样"
date: 2026-05-15T23:10:00+08:00
draft: false
tags: ["Hive", "抽样", "TABLESAMPLE", "分桶"]
categories: ["Hive"]
description: "讲解 Hive 三大抽样方式：分桶抽样、块抽样、随机抽样的原理、语法、性能对比与实战案例"
---

在 Hive 场景中：

- 数据量：TB / PB 级
- 查询方式：MapReduce / Spark（高延迟）
- 全表扫描成本极高

👉 所以抽样的本质是：

> **用小数据近似大数据特征（加速分析/调试）**

---

# 二、Hive 抽样的三大类型

Hive 一共有 3 种主流抽样方式：


| 类型                           | 关键语法                | 随机性    | 性能      | 是否需要分桶 |
| ------------------------------ | ----------------------- | --------- | --------- | ------------ |
| ✅ 分桶抽样（Bucket Sampling） | TABLESAMPLE(BUCKET ...) | ✅ 好     | ✅ 高     | ✅ 必须      |
| ✅ 块抽样（Block Sampling）    | TABLESAMPLE(...)        | ❌ 差     | ✅ 非常高 | ❌           |
| ✅ 随机抽样（Random Sampling） | rand() + limit          | ✅ 真随机 | ❌ 较差   | ❌           |

---

# 三、分桶抽样（TABLESAMPLE+BUCKET 最推荐）

**最推荐的高性能抽样方式**，利用Hive分桶机制直接定位数据块，速度最快。

## 1. 分桶表的核心设计

通过建表的分桶设计，在物理层面上按照`bucket_id = hash(user_id) % 32`让**数据均匀分布到32个桶中**，之前学到的分桶可以优化两个分桶表的JOIN操作，使得JOIN时`user_id` 相同的一定落在同一个桶中（一个节点内），避免了不同node节点之间的shuffle（无需将同一个键值的记录汇总到一起，分桶建表时就已经放入同一个桶中了）。

```sql
传统HDFS存储：
data_2023-10-01.txt  (包含所有user_id的记录)
data_2023-10-02.txt

分桶表存储结构：/user/hive/warehouse/user_bucketed/dt=2023-10-01/
  ├── 000000_0  (bucket-00000) - user_id哈希值%32=0的记录
  ├── 000001_0  (bucket-00001) - user_id哈希值%32=1的记录
  ├── ...
  └── 000031_0  (bucket-00031) - user_id哈希值%32=31的记录

分桶文件命名规则
分桶文件名格式：
bucket文件: 00000N_0
- 前6位: 桶编号（5位数字，从00000开始）
- 下划线: 分隔符
- 最后数字: 桶内文件编号（分桶文件可再分小文件）

示例：000025_0
- 桶编号: 25
- 文件编号: 0(第一个文件)
```

我们可以理解为分桶优化了表的存储方式，使得在查找时无需进行复杂的数据交换。

**分桶抽样**之所以成立，是因为 hash(user_id) **近似均匀分布** → 随机选一个 bucket ≈ 全局数据的一个“随机子集”。

## 2. 分桶抽样执行流程

相信现在你已经明白为什么会有分桶抽样了，通过分桶建表，我们将数据随机分布在桶中，所以通过抽取桶就可以等价于随机抽样。可以理解为空间换时间，事先将数据准备好了，这样随机抽样时无需遍历所有的行来达到随机的效果。

```sql
-- 1. 创建分桶表
CREATE TABLE user_bucketed (
    user_id BIGINT,
    user_name STRING,
) CLUSTERED BY (user_id) INTO 32 BUCKETS
STORED AS ORC;

-- 2. 查询示例 基于分桶列的抽样（需已创建分桶表）
SELECT * FROM user_bucketed 
TABLESAMPLE(BUCKET 3 OUT OF 8 ON user_id);
-- 注意：Hive中的桶编号是0-based（从0开始）但在TABLESAMPLE语法中，x是1-based（从1开始）
-- 执行过程分解：
1. 计算抽样桶号：桶数=32, 抽样组数=32/8=4（最后会取出4个桶，相当于抽取了4/32=1/8的数据）
2. 目标桶：
    k=0: 2 + 0×8 = 2
    k=1: 2 + 1×8 = 10
    k=2: 2 + 2×8 = 18
    k=3: 2 + 3×8 = 26
    k=4: 2 + 4×8 = 34 ≥ 32，停止
得到 3, 3+8=11, 3+16=19, 3+24=27

3. 直接读取4个对应的HDFS文件：000002_0, 000010_0, 000018_0, 000026_0
4. 无需全表扫描，直接定位物理文件，返回结果
```

**参数说明**：`BUCKET x OUT OF y ON col`

- `y`：总桶数（必须是分桶数的约数）
- `x`：抽取的桶编号（从1开始）
- 抽样比例 = `1/y`

如果表不是分桶表，但是仍使用分桶抽样，如下

```sql
-- 随机分桶抽样（无需分桶列）
SELECT * FROM user_bucketed 
TABLESAMPLE(BUCKET 3 OUT OF 8 ON RAND()) s;
```

则具体执行过程：

- 1️⃣ 启动MapReduce任务，全表扫描每一行（因为没有预分桶）
- 2️⃣ 对每一行执行

  - 调用RAND()生成随机数
  - 计算RAND()值的哈希：`hash(rand())`
  - 哈希值对8取模，得到桶号(0-7)：`bucket_id = hash(rand()) % 32` (虚拟bucket)
- 3️⃣ 过滤出桶号=2的行
- 4️⃣ 输出数据

👉 本质 = 全表 scan + 行级 hash + 过滤

---

# 四、块抽样（TABLESAMPLE）

本质是直接在 HDFS 数据块（block）（默认128MB/256MB）层面做抽样，而不是逐行随机抽

步骤：

- 1️⃣ 获取文件列表（Partition / Directory）
- 2️⃣ 生成 InputSplit（HDFS block）
- 3️⃣ 按比例选部分 InputSplit ✅（关键，1-3步多是发生在scan之前）
- 4️⃣ Map任务只读取这些 block（scan）
- 5️⃣ 输出数据

举例：已知表  = 1TB，block = 128MB。执行快抽取10%的步骤如下

总共 1T/128M ≈ 8000 个 block，执行`TABLESAMPLE(10 PERCENT)` 时，Hive从8000个block中随机选800个，只启动对应的 map task（只启动对应的 map task）

👉 因此：

✅ **speed非常快**（减少IO）
❌ **不严格随机**（受数据分布影响，比如按日期分区写入， block 抽样可能只抽到某几天的数据，抽的是文件块，而不是打散后的数据）

## 1、按数据大小百分比抽样

抽取原hive表中10%的数据，并保存到新表中

```sql
SELECT * FROM logs TABLESAMPLE(0.1 PERCENT) 
```

## 2、按固定大小抽样

```sql
抽样
SELECT * FROM logs TABLESAMPLE(100M)
```

## 3、按行数抽样

按行数抽样（可能不准确，因Hive不严格维格维护行数）

```sql
SELECT * FROM logs TABLESAMPLE(1000 ROWS);
```

✅ 适合场景

✔ 快速预览数据
✔ 调试 pipeline
❌ 不适合统计分析（不随机）

## 4、❌TABLESAMPLE + WHERE

### 4.1、一起使用导致的问题

❌**无法和where一起使用**：根据块抽样的执行步骤可知，`TABLESAMPLE`发生在scan读取之前 ，`WHERE`发生在数据读取后，所以二者同时出现就会导致结果比例不确定、抽样失去意义、Hive 难以保证正确性的问题，具体如下：

**1）结果比例不确定**

举个例子：`10% 的 gender='F'` 意思是先找到`gender='F'`的所有记录，再从中抽取10%

但是如果使用`TABLESAMPLE` 和 `WHERE` => 先选取10% block → 再筛选 gender='F'。👉 最终可能 <10%

**2）抽样失去意义**

`gender='F'` 本来只有 5%。 先抽block，可能抽不到任何 female 记录

**3）Hive 难以保证正确性的问题**

Hive设计原则：抽样应该严格作用在表级别，而不是过滤后数据

### 4.2、替代方案

#### WHERE + RAND

先过滤，再抽样的逻辑正确

```sql
SELECT *
FROM table
WHERE gender = 'F'
  AND RAND() <= 0.1;
```

#### 子查询包装

```sql
-- 先抽样，后过滤
SELECT * FROM (
  SELECT * FROM user_behavior 
  TABLESAMPLE(1 PERCENT)  -- 全表1%的块
) sampled_data
WHERE event_type = 'click';  -- 在抽样结果中过滤

-- 先过滤，后抽样
SELECT * FROM (
  SELECT * FROM user_behavior 
  WHERE dt = '2023-10-01'  -- 先按条件筛选
) filtered_data
TABLESAMPLE(10 PERCENT);  -- 在筛选结果上抽样= 0.1;
```

#### CTE表达式

```sql
WITH sampled_orders AS (
  SELECT * FROM orders TABLESAMPLE(100M)
)
SELECT * FROM sampled_orders
WHERE amount > 1000
AND status = 'COMPLETED';
```

#### 临时表存储

```sql
-- 1. 创建抽样临时表
CREATE TEMPORARY TABLE temp_sample AS
SELECT * FROM large_table TABLESAMPLE(0.5 PERCENT);

-- 2. 在临时表上执行复杂查询
SELECT user_id, COUNT(*) as cnt
FROM temp_sample
WHERE event_time >= '2023-10-01'
GROUP BY user_id
HAVING cnt > 5;
```

#### 精确行数抽样

```sql
SELECT *
FROM (
    SELECT *
    FROM table
    WHERE gender = 'F'
    DISTRIBUTE BY rand()
    SORT BY rand()
) t
LIMIT 1000;
```

---

# 五、随机抽样（RAND）

**最灵活的抽样方式**，但需要全表扫描，性能较差。

limit关键字限制抽样返回的数据，其中rand函数前的distribute和sort关键字可以保证数据在mapper和reducer阶段是随机分布的。

## 5.1、概率过滤

步骤：

- Map scan
- 过滤：每一行执行 `rand(123) -> 0~1` 满足条件`<= 0.1`的保留。（没有固定种子，每次就可以得到不同的随机序列）
- 输出

👉 本质：每行独立 Bernoulli 抽样（概率采样）

所以没有Reduce阶段、全局排序、网络shuffle

```sql
-- 随机抽取10%的数据
SELECT * FROM orders WHERE RAND() <= 0.1;
```

适合场景

- ✔ 大数据快速抽样
- ✔ SQL调试
- ✔ 统计分析近似

结果行数 ≠ 精确10% （因为`WHERE RAND() <= 0.1`的概率抽样是波动的）

## 5.2、可复现随机样本

步骤：

- Map scan
- 过滤：每一行执行 `rand(123) -> 0~1` 满足条件`<= 0.05`的保留。（固定种子为123，每次就可以得到相同的随机序列）
- shuffle：`DISTRIBUTE BY RAND(123)` 把数据随机打散到 reducer
- 局部排序：`SORT BY RAND(123)` 每个reducer内部排序

```sql
-- 可重现的随机抽样（设置随机种子）
SELECT * FROM orders 
WHERE RAND(123) <= 0.05  -- 固定种子，结果可重现
DISTRIBUTE BY RAND(123) SORT BY RAND(123)
LIMIT 1000;
```

适合场景

- ✔ 实验可复现（A/B Test）
- ✔ 调试稳定样本
- ✔ 模型训练数据抽样

## 5.3、局部随机

步骤：

- Map scan
- shuffle：`DISTRIBUTE BY RAND()` 把数据随机打散到 reducer
- 局部排序：`SORT BY RAND()` 每个reducer内部排序

```sql
SELECT * FROM orders 
WHERE col = 'xxx'
DISTRIBUTE BY RAND() SORT BY RAND()
LIMIT 1000;
```

- 比 `ORDER BY RAND()` 快
- 比 `WHERE RAND()` 更随机

但是它不是全局随机！（因为多个 reducer 各自排序）👉 偏随机（但不是严格均匀）

## 5.4、全局随机

步骤：

- Map scan
- shuffle：所有数据 shuffle 到一个reducer节点
- 全局排序：`ORDER BY RAND()` 1个reducer内部全局排序

```sql
SELECT *
FROM orders 
ORDER BY rand()
LIMIT 1000;
```

完全随机，但是单reducer和全shuffle会导致整个过程很慢

适合场景

✔ 少量数据
✔ 强随机要求

❌ 不适合大表


| 写法                                  | 抽样方式      | 是否全表扫描 | 是否Shuffle | 随机性    | 性能    |
| ------------------------------------- | ------------- | ------------ | ----------- | --------- | ------- |
| `WHERE RAND() <= p`                   | ✅ 概率过滤   | ✅ 是        | ❌ 否       | ✅ 好     | ✅ 高   |
| `RAND(seed)` + distribute/sort        | ✅ 可复现随机 | ✅ 是        | ✅ 有       | ✅ 很好   | ⚠️ 中 |
| `distribute by rand() sort by rand()` | ✅ 局部随机   | ✅ 是        | ✅ 有       | ⚠️ 一般 | ⚠️ 中 |
| `order by rand()`                     | ✅ 全局随机   | ✅ 是        | ✅ 超大     | ✅ 最好   | ❌ 慢   |

## ×分层抽样（按分组比例）

```sql
-- 每个城市抽取5%的用户
SELECT * FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY city ORDER BY RAND()) as rn,
    COUNT(*) OVER (PARTITION BY city) as total
  FROM users
) t
WHERE rn <= total * 0.05;
```

## 五、实战案例：用户行为分析抽样

### 场景：分析国庆期间高活跃用户

```sql
-- 错误做法（可能漏掉目标用户）
SELECT user_id, COUNT(*) as login_count
FROM user_logs 
TABLESAMPLE(100M)  -- 随机块，可能不包含国庆数据
WHERE login_date BETWEEN '2023-10-01' AND '2023-10-07'
GROUP BY user_id
HAVING login_count > 10;

-- 正确做法1：先过滤后抽样
SELECT * FROM (
  SELECT user_id, COUNT(*) as login_count
  FROM user_logs 
  WHERE login_date BETWEEN '2023-10-01' AND '2023-10-07'
  GROUP BY user_id
  HAVING login_count > 10
) active_users
TABLESAMPLE(20 PERCENT);  -- 在结果集上抽样

-- 正确做法2：分桶表高效查询
CREATE TABLE user_logs_bucketed (
  user_id BIGINT,
  login_date STRING
) CLUSTERED BY (user_id) INTO 100 BUCKETS
PARTITIONED BY (dt STRING)
STORED AS ORC;

-- 分区剪枝 + 分桶抽样
SELECT user_id, COUNT(*) as login_count
FROM user_logs_bucketed
TABLESAMPLE(BUCKET 1 OUT OF 20 ON user_id)
WHERE dt BETWEEN '2023-10-01' AND '2023-10-07'
GROUP BY user_id;
```
