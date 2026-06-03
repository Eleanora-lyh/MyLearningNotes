---
title: "【十】Hive 窗口函数：OVER / PARTITION BY / ORDER BY 与 OLAP 分析"
date: 2026-06-03T22:37:14+08:00
draft: false
tags: ["Hive", "窗口函数", "OLAP", "OVER", "PARTITION BY", "ORDER BY", "RANK", "LAG", "LEAD"]
categories: ["Hive"]
description: "系统讲解 Hive 窗口函数的核心概念、OVER 子句、PARTITION BY 与 ORDER BY 的窗口定义方式，并结合排名、累计计算、移动平均、前后行比较等 OLAP 分析场景说明常见函数用法。"
---

# Hive 窗口函数

窗口函数（Window Function，也叫 **Analytic Function**）用于**在不改变查询结果行数的情况下，对某一“窗口范围”的数据进行计算**。  
与 `GROUP BY` 不同：

- `GROUP BY`：会**聚合并减少行数**
- 窗口函数：**在每一行上计算一个结果，但计算基于当前行周围的一组行（窗口）**

窗口函数是实现SQL层面OLAP分析的利器，OLAP 是OnLine Analytical Processing 的简称，意思是对数据库数据进行实时分析处理。例如，市场分析、创建财务报表、创建计划等日常性商务工作。窗口函数就是为了实现OLAP 而添加的标准SQL 功能。

---

# 一、OLAP 和 窗口函数

## 1.1 为什么窗口函数和 OLAP 相关

传统 SQL（早期 SQL）只有：

```sql
GROUP BY
SUM / AVG / COUNT
```

比如如下代码只能得到 `每个部门的总sales值`：

```sql
SELECT dept, SUM(sales)
FROM sales
GROUP BY dept;
```

但分析场景往往需要 **更复杂的结果，例如：**：

**① 每个部门内部销售排名**

```
A 部门
1 Jerry
2 Lucy
3 Tom
```

**② 每天的累计销售**

```
day  sales  cumulative_sales
1    100    100
2    200    300
3    150    450
```

**③ 每条记录和上一条比较**

```
day  sales  yesterday_sales
```

这些 **都不能用普通 GROUP BY 实现**。

于是 2003的SQL 标准就增加了一类函数 窗口函数 (Window Function)，专门用于 **OLAP分析计算**，所以窗口函数又名`Analytic Function`。

OLAP 经常需要这些分析能力：

| 分析需求  | SQL实现                     |
| ----- | ------------------------- |
| 排名    | `RANK()`                  |
| TopN  | `ROW_NUMBER()`            |
| 累计值   | `SUM() OVER()`            |
| 移动平均  | `AVG() OVER ROWS BETWEEN` |
| 前后行比较 | `LAG()` / `LEAD()`        |
| 每组第一条 | `FIRST_VALUE()`           |

这些操作都有一个共同点：

> **计算某一行时，需要访问"当前行附近的一组数据"**

例如：

```
day   revenue
1     100
2     200
3     50
```

累计：

```
day1 → 100
day2 → 100 + 200
day3 → 100 + 200 + 50
```

显然：第3行计算需要看到前2行，因此 SQL 需要一个概念定义：

```
当前行 + 周围数据
```

这就是 **Window Function**。

> **OLAP = 业务数据分析需求**  
> **窗口函数 = SQL 为了实现这些分析需求而提供的工具**

## 1.2 为什么叫“窗口”函数

核心思想：**每一行的计算都不是只用当前行，而是使用“当前行周围的一组数据**。

这个数据范围就叫：Window (窗口)

例如：

```sql
SUM(amount) 
OVER (
  PARTITION BY user
  ORDER BY day
  ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
)
```

含义：当前行+前3行

这 4 行就形成了一个 **window**。

然后在这个 window 上计算：

```
sum / avg / rank
```

---

## 1.3 为什么窗口函数必须 partition + sort

窗口函数的核心本质是：

> **在一组有序数据中，针对当前行计算一个窗口范围**

这就必然需要两个动作：**partition+sort**

原因如下：

### 1） partition

定义：哪几行属于同一组

例如：`PARTITION BY region` 表示：`每个 region 单独计算`

数据逻辑：

```
region = A
   ↓
A1
A2
A3

region = B
   ↓
B1
B2
```

---

### 2） sort

窗口函数必须 **确定“前/后”顺序**。

例如：

```sql
LAG()
RANK()
running sum
```

都依赖顺序。

例子：

```sql
ORDER BY revenue DESC
```

数据变为：

```
300
200
100
```

才能计算排名：`rank`

---

### 3） window frame

最后定义：**窗口范围**

例如：当前行+前三行

```sql
ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
```

数据：

```sql
row5 (current)
row4
row3
row2
```

---

## 1.4 窗口函数分类

| 分类               | 作用       | 核心函数                                        |
| ---------------- | -------- | ------------------------------------------- |
| **1. 序号函数**      | 给行编号/排名  | `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `NTILE` |
| **2. 分布函数**      | 看数据分布    | `CUME_DIST`, `PERCENT_RANK`                 |
| **3. 前后函数**      | 看前一行/后一行 | `LAG`, `LEAD`                               |
| **4. 头尾函数**      | 看窗口首尾值   | `FIRST_VALUE`, `LAST_VALUE`                 |
| **5. 聚合函数（窗口版）** | 在窗口内做统计  | `SUM`, `AVG`, `COUNT`, `MAX/MIN`            |
| **6. 其他分析函数**    | 特殊统计     | `NTH_VALUE`                                 |

下面我按你给的 6 类，把 **Hive 窗口函数**讲透：**给数据源（建表+样例数据）→ 示例 SQL → 输出结果示例 → 原理分析（逻辑/执行/坑点）**。为避免来回切换数据，我全程使用同一份 `sales` 数据。

---

# 三、统一数据源

### 3.1 表结构 & 样例数据

> 场景：每个部门（dept）里有多名员工（emp），每天有一笔销售额（amount）。

```sql
DROP TABLE IF EXISTS sales;
CREATE TABLE sales (
dept STRING,
emp STRING,
dt STRING, -- 'yyyy-MM-dd'
amount INT
)
ROW FORMAT DELIMITED FIELDS TERMINATED BY '\t'
STORED AS TEXTFILE;

-- 样例数据（你也可以用 INSERT VALUES / LOAD DATA）
INSERT INTO sales VALUES
('A','alice','2026-05-01',100),
('A','alice','2026-05-02',120),
('A','bob' ,'2026-05-01',120), -- 与 alice 2026-05-02 并列金额 120（制造 tie）
('A','bob' ,'2026-05-03', 80),
('A','cindy','2026-05-02',120), -- 再制造 tie
('B','david','2026-05-01', 90),
('B','david','2026-05-02', 90), -- tie
('B','eric' ,'2026-05-01',200),
('B','eric' ,'2026-05-03', 50),
('B','frank','2026-05-02',200); -- tie 200
```

### 3.2 基础规则（先把“窗口”这件事说明白）

一个窗口函数长这样：

```sql
<窗口函数>(...) OVER (
  PARTITION BY ... -- 分组：每个分区独立计算
  ORDER BY ...     -- 分区内排序：定义“第1行/前后行/累计”的顺序
  ROWS/RANGE ...   -- 窗口帧：定义“本行能看到哪些行”（非常关键）
)
```

**1、PARTITION BY**：决定“组内计算”，类似 group by，但不折叠行。

**2、ORDER BY**：决定组内顺序，没有顺序就没有“前后/排名/累计”。

**3、帧（FRAME）**：决定“当前行的可见范围”。很多坑都来自默认帧。

- 窗口帧边界主要如下（按照起点到终点写）：
  
  | 边界写法                  | 含义                       |
  | --------------------- | ------------------------ |
  | `UNBOUNDED PRECEDING` | 分区内最前面                   |
  | `n PRECEDING`         | 当前行前面第 n 行，或当前排序值前 n 个范围 |
  | `CURRENT ROW`         | 当前行，或当前排序值所在 peer group  |
  | `n FOLLOWING`         | 当前行后面第 n 行，或当前排序值后 n 个范围 |
  | `UNBOUNDED FOLLOWING` | 分区内最后面                   |
  
  注意：**起点不能晚于终点。** （可以得出合法的组合为4 + 4 + 3 + 2 = 13种）
  
  - ROWS 下，n PRECEDING / n FOLLOWING 按物理行数算。
  
  - RANGE 下，n PRECEDING / n FOLLOWING 按 ORDER BY 值的范围算。
  
  - 不指定时表示从起点到当前行

其中工程中最常见的是这些：

| 场景         | 写法                                                         | 含义             |
| ---------- | ---------------------------------------------------------- | -------------- |
| 累计到当前行     | `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`         | 从分区第一行累加到当前行   |
| 整个分区总和     | `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` | 当前分区所有行        |
| 最近 N 行滑动窗口 | `ROWS BETWEEN N PRECEDING AND CURRENT ROW`                 | 当前行和前 N 行      |
| 前后窗口       | `ROWS BETWEEN N PRECEDING AND M FOLLOWING`                 | 当前行前 N 行到后 M 行 |
| 只看当前行      | `ROWS BETWEEN CURRENT ROW AND CURRENT ROW`                 | 当前行本身          |
| 当前行到未来     | `ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING`         | 当前行到分区最后       |

![](./assets/2026-06-01-13-27-09-2026-06-01-10-15-21-image.png)

准备测试FRAME的数据源，来分别测试验证下效果

```sql
drop table if exists test_table;

create table test_table(
emp string,
amount int
)
row format delimited fields terminated by '\t'
stored as textfile;

INSERT INTO test_table VALUES
('A',100),
('B',100),
('C',80),
('D',60);

select * from test_table;
```

| emp | amount |
| --- | ------ |
| A   | 100    |
| B   | 100    |
| C   | 80     |
| D   | 60     |

- `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` 对每一行，计算“当前行 + 前面 2 行”的 amount 总和
  
  ```sql
  SUM(amount) OVER (
    ORDER BY amount DESC
    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
  );
  ```
  
  | emp | amount                             |
  | --- | ---------------------------------- |
  | A   | 100（前面没有数据，所以结果为A的amount）          |
  | B   | 200（前2行数据只有100，所以结果为100+100）       |
  | C   | 280（前2行数据为100+100，所以结果为100+100+80） |
  | D   | 240（前2行数据为100+80，所以结果为100+80+60）   |

- `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`：**按“行数”算**，对每一行，计算“从分区第一行开始+到当前行”的 amount 总和
  
  ```sql
  select 
      SUM(amount) OVER (
    ORDER BY amount DESC
    ROWS between UNBOUNDED PRECEDING AND CURRENT ROW
  ) from test_table;
  ```
  
  没有标记Partition，所以整体为一个分区
  
  | emp | amount                                              |
  | --- | --------------------------------------------------- |
  | A   | 100（前面没有数据，所以结果为A的amount）                           |
  | B   | 200（分区第一行到当前行的数据为:100,100，所以结果为100+100）             |
  | C   | 280（分区第一行到当前行的数据为:100,100,80，所以结果为100+100+80）       |
  | D   | 340（分区第一行到当前行的数据为:100,100,80,60，所以结果为100+100+80+60） |

- `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`，**按“排序值范围”算**，对每一行，计算amount在 ORDER BY 定义的排序方向里，从“排序后的最前面”一直到“当前排序值所在的同值组”为止
  
  ```sql
  select 
      SUM(amount) OVER (
    ORDER BY amount DESC
    RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) from test_table;
  ```
  
  没有标记Partition，所以整体为一个分区；按照 `ORDER BY amount DESC`，分区内先按照amount倒序排序（数据源本身就是按照amount倒序的：100 100 80 60）。对于第一行来说，其amount=100，**RANGE看的是当前行的 ORDER BY 排序值。对于两个 amount = 100 的行，它们是同一个排序值**。所以 RANGE 会把它们一起圈进来，因此两个 100 的结果都是 100+100=200
  
  | emp | amount                                                |
  | --- | ----------------------------------------------------- |
  | A   | 200（对于两个 amount = 100 的行，它们是同一个排序值，所以结果为100+100）      |
  | B   | 200（从排序开头到当前值的可见范围：所有 amount = 100 的行，所以结果为100+100）   |
  | C   | 280（从排序开头到当前值的可见范围为:100,100,80，所以结果为100+100+80）       |
  | D   | 340（从排序开头到当前值的可见范围为:100,100,80,60，所以结果为100+100+80+60） |

> 重要坑：
> 
> - **聚合型窗口函数**（SUM/AVG/COUNT/MAX/MIN）如果写了 `ORDER BY`，很多引擎（Hive 也常见）默认帧是 **`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`**（“从开头到当前值范围”）——对有重复排序值时会影响结果。工程上更稳的是显式写 **`ROWS BETWEEN ...`**。
> - `LAST_VALUE` 默认只看到“到当前行”为止，所以经常拿不到“分区最后一行”，需要 `... BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`。

---

# 四、序号函数（给行编号/排名）

`ROW_NUMBER`, `RANK`, `DENSE_RANK`, `NTILE`

我们统一用：**每个部门按 amount 降序、dt 升序** 排序（金额相同按日期先后打散）。

## 4.1 ROW_NUMBER：严格递增的行号（不管并列）

### 示例 SQL

```sql
SELECT
  dept, emp, dt, amount,
  ROW_NUMBER() OVER (
    PARTITION BY dept
    ORDER BY amount DESC, dt ASC, emp ASC
  ) AS rn
FROM sales
ORDER BY dept, rn;
```

### 输出结果示例（dept='A'）

| dept | emp   | dt         | amount | rn  |
| ---- | ----- | ---------- | ------ | --- |
| A    | bob   | 2026-05-01 | 120    | 1   |
| A    | alice | 2026-05-02 | 120    | 2   |
| A    | cindy | 2026-05-02 | 120    | 3   |
| A    | alice | 2026-05-01 | 100    | 4   |
| A    | bob   | 2026-05-03 | 80     | 5   |

### 原理分析

- **逻辑**：分区（dept）内排序后，从 1 开始逐行加 1；并列不会共享名次。
- **执行**：Hive 会把同一 `dept` 的数据拉到一起（通常需要 shuffle），并在 reducer 端按 `ORDER BY` 排序，然后流式输出行号。
- **常用场景**：取 TopN（配合 `WHERE rn <= N`），去重（选择 rn=1 的那条）。

---

## 4.2 RANK：并列共享排名，名次会“跳号”

### 示例 SQL

```sql
SELECT
  dept, emp, dt, amount,
  RANK() OVER (
    PARTITION BY dept
    ORDER BY amount DESC
  ) AS rnk
FROM sales
WHERE dept='A'
ORDER BY amount DESC, dt ASC, emp ASC;
```

### 输出结果示例（dept='A'）

A 部门金额有三个 120 并列：

| dept | emp   | dt         | amount | rnk |
| ---- | ----- | ---------- | ------ | --- |
| A    | alice | 2026-05-02 | 120    | 1   |
| A    | bob   | 2026-05-01 | 120    | 1   |
| A    | cindy | 2026-05-02 | 120    | 1   |
| A    | alice | 2026-05-01 | 100    | 4   |
| A    | bob   | 2026-05-03 | 80     | 5   |

### 原理分析

- **逻辑**：同分（同排序键）共享排名；后面名次 = 前面行数 + 1，所以会出现 1,1,1,4…（跳过 2,3）。
- **注意**：`ORDER BY amount DESC` 时，只有 amount 作为并列判定。若你想把 dt 也纳入并列判定，就写 `ORDER BY amount DESC, dt ASC ...`。

---

## 4.3 DENSE_RANK：并列共享排名，但不跳号

### 示例 SQL

```sql
SELECT
  dept, emp, dt, amount,
  DENSE_RANK() OVER (
    PARTITION BY dept
    ORDER BY amount DESC
  ) AS drnk
FROM sales
WHERE dept='A'
ORDER BY amount DESC, dt ASC, emp ASC;
```

### 输出结果示例（dept='A'）

| dept | emp   | dt         | amount | drnk |
| ---- | ----- | ---------- | ------ | ---- |
| A    | alice | 2026-05-02 | 120    | 1    |
| A    | bob   | 2026-05-01 | 120    | 1    |
| A    | cindy | 2026-05-02 | 120    | 1    |
| A    | alice | 2026-05-01 | 100    | 2    |
| A    | bob   | 2026-05-03 | 80     | 3    |

### 原理分析

- **逻辑**：排名只跟“不同值的个数”有关：120 是第 1 档、100 第 2 档、80 第 3 档。
- **场景**：按“分档/层级”分析更合适（例如薪资等级、评分等级）。

---

## 4.4 NTILE：把排序后的数据切成 N 份（分桶/分位组）

### 示例 SQL（每部门分成 4 份）

```sql
SELECT
  dept, emp, dt, amount,
  NTILE(4) OVER (
    PARTITION BY dept
    ORDER BY amount DESC, dt ASC
  ) AS bucket
FROM sales
ORDER BY dept, bucket, amount DESC, dt ASC;
```

### 输出结果示例（直观理解）

- A 部门 5 行数据 → 分 4 份：前 1 份可能 2 行，其余各 1 行（**尽量均匀**）。
- B 部门 5 行同理。

| dept | emp   | dt         | amount | bucket |
| ---- | ----- | ---------- | ------ | ------ |
| A    | alice | 2026-05-02 | 120    | 1      |
| A    | bob   | 2026-05-01 | 120    | 1      |
| A    | cindy | 2026-05-02 | 120    | 2      |
| A    | alice | 2026-05-01 | 100    | 3      |
| A    | bob   | 2026-05-03 | 80     | 4      |

### 原理分析

- **逻辑**：排序后按行号切片：第 1 组 ≈ 前 25%，第 2 组 ≈ 25%~50%…（行数不能整除就前面的桶多 1 行）。
- **场景**：用户分层（Top 25%/中间/尾部）、绩效分位、风险分层。

---

# 五、分布函数（看数据分布）

`CUME_DIST`, `PERCENT_RANK`

这类函数的核心是：**把“排名”转换为 0~1 的比例**，用来做分位/分布分析。

## 5.1 CUME_DIST：累计分布（<= 当前值的占比）

### 示例 SQL（部门内按金额升序看“有多少比例不超过我”）

```sql
SELECT
  dept, emp, dt, amount,
  CUME_DIST() OVER (
    PARTITION BY dept
    ORDER BY amount ASC
  ) AS cd
FROM sales
WHERE dept='A'
ORDER BY amount ASC, dt ASC, emp ASC;
```

### 输出结果示例（dept='A'，金额升序：80,100,120,120,120）

| dept | emp   | dt         | amount | cd  | 解释           |
| ---- | ----- | ---------- | ------ | --- | ------------ |
| A    | bob   | 2026-05-03 | 80     | 0.2 | <=80 的有 1/5  |
| A    | alice | 2026-05-01 | 100    | 0.4 | <=100 的有 2/5 |
| A    | bob   | 2026-05-01 | 120    | 1.0 | <=120 的有 5/5 |
| A    | alice | 2026-05-02 | 120    | 1.0 | <=120 的有 5/5 |
| A    | cindy | 2026-05-02 | 120    | 1.0 | <=120 的有 5/5 |

### 原理分析

- **公式（直观）**：`CUME_DIST = (分区内 <= 当前排序值的行数) / (分区总行数)`
- **并列处理**：同一个值的所有行，`<= 当前值` 都一样，所以 **cd 相同**。
- **场景**：看某个金额处于分区的“累计比例”，比如“这条记录已经超过了 40% 的低值”。

---

## 5.2 PERCENT_RANK：百分比排名（基于 rank 的 0~1）

### 示例 SQL（金额升序）

```sql
SELECT
  dept, emp, dt, amount,
  PERCENT_RANK() OVER (
    PARTITION BY dept
    ORDER BY amount ASC
  ) AS pr
FROM sales
WHERE dept='A'
ORDER BY amount ASC, dt ASC, emp ASC;
```

### 输出结果示例（dept='A'）

对金额升序：80 最小 → rank=1；120 最大（并列）→ rank=3（因为 80、100、120 三档）

| dept | emp   | dt         | amount | pr(rank-1)/(n-1), n=5 |
| ---- | ----- | ---------- | ------ | --------------------- |
| A    | bob   | 2026-05-03 | 80     | 0.0                   |
| A    | alice | 2026-05-01 | 100    | 0.25                  |
| A    | bob   | 2026-05-01 | 120    | 0.5                   |
| A    | alice | 2026-05-02 | 120    | 0.5                   |
| A    | cindy | 2026-05-02 | 120    | 0.5                   |

> 注意：这里的 rank 是带并列的 rank 概念，所以 pr 不一定到 1（尤其是大量并列时）。

### 原理分析

- **公式（直观）**：`PERCENT_RANK = (RANK - 1) / (分区总行数 - 1)`
- **n=1 特殊**：分区只有 1 行时通常返回 0。
- **场景**：更偏向“排名位置的比例”，而不是“累计不超过我的比例”（那是 CUME_DIST）。

---

# 六、前后函数（看前一行/后一行）

`LAG(expr,offset,default_value)`, `LEAD(expr,offset,default_value)`

第一个参数为列名，第二个参数为往上第n行（可选，默认为1），第三个参数为默认值（当往上第n行为NULL时候，取默认值，如不指定，则为NULL）

这俩的本质是：**在同一分区、同一排序下，读取偏移行的字段值**。

```sql
LAG(expr, offset, default_value) OVER (
    PARTITION BY ...
    ORDER BY ...
)

LEAD(expr, offset, default_value) OVER (
    PARTITION BY ...
    ORDER BY ...
)
```

| 参数              | 是否必填 | 含义                        |
| --------------- | ---- | ------------------------- |
| `expr`          | 必填   | 要取值的列或表达式                 |
| `offset`        | 可选   | 向前/向后偏移几行，默认是 `1`         |
| `default_value` | 可选   | 如果取不到对应行，返回什么值，默认是 `NULL` |
| `PARTITION BY`  | 可选   | 确定分区，每个分区内部单独排序、单独取上一行。   |
| `ORDER BY`      | 可选   | 确定顺序，决定谁是上一行/下一行          |

## 6.1 LAG：取前n行（默认偏移 1）

我们用“员工维度的时间序列”最直观：同一个 emp 按 dt 排序，比较今天 vs 昨天。

### 示例 SQL（看每个员工相对上一天的变化——环比增长额）

增长额 = 当前值 - 上一期值

```sql
SELECT
  emp, dt, amount,
  LAG(amount, 1, 0) OVER (
    PARTITION BY emp
    ORDER BY dt
  ) AS prev_amount,
  amount - LAG(amount, 1, 0) OVER (
    PARTITION BY emp
    ORDER BY dt
  ) AS diff_from_prev
FROM sales
WHERE emp IN ('alice','david')
ORDER BY emp, dt;
```

### 输出结果示例（alice 与 david）

| emp   | dt         | amount | prev_amount | diff_from_prev |
| ----- | ---------- | ------ | ----------- | -------------- |
| alice | 2026-05-01 | 100    | 0           | 100            |
| alice | 2026-05-02 | 120    | 100         | 20             |
| david | 2026-05-01 | 90     | 0           | 90             |
| david | 2026-05-02 | 90     | 90          | 0              |

### 原理分析

- `LAG(amount, 1, 0) OVER (PARTITION BY emp ORDER BY dt)` 以emp为分组条件，组内按照 dt 排序，取分组内当前行前 1 行的 amount。
  
  如果没有前 1 行，则返回 0。

- 典型用途：环比/同比、差分、趋势检测、缺失填充（配合 COALESCE）。

---

### 应用

#### 计算环比增长率

增长率 = (当前值 - 上一期值) / 上一期值 即 `growth_rate = (amount - prev_amount) / prev_amount`

```sql
SELECT
    emp,
    dt,
    amount,
    prev_amount,
    CASE
        WHEN prev_amount IS NULL OR prev_amount = 0 THEN NULL
        ELSE (amount - prev_amount) / prev_amount
    END AS growth_rate
FROM (
    SELECT
        emp,
        dt,
        amount,
        LAG(amount) OVER (
            PARTITION BY emp
            ORDER BY dt
        ) AS prev_amount
    FROM sales
    WHERE emp IN ('alice','david')
) t;
```

结果：

| emp   | dt         | amount | prev_amount | growth_rate |
| ----- | ---------- | ------ | ----------- | ----------- |
| alice | 2026-05-01 | 100    |             |             |
| alice | 2026-05-02 | 120    | 100         | 0.2         |
| david | 2026-05-01 | 90     |             |             |
| david | 2026-05-02 | 90     | 90          | 0.0         |

---

## 6.2 LEAD：取后n行

### 示例 SQL（看下一天金额）

```sql
SELECT
  emp, dt, amount,
  LEAD(amount, 1, NULL) OVER (
    PARTITION BY emp
    ORDER BY dt
  ) AS next_amount
FROM sales
WHERE emp IN ('alice','eric')
ORDER BY emp, dt;
```

### 输出结果示例

| emp   | dt         | amount | next_amount |
| ----- | ---------- | ------ | ----------- |
| alice | 2026-05-01 | 100    | 120         |
| alice | 2026-05-02 | 120    | NULL        |
| eric  | 2026-05-01 | 200    | 50          |
| eric  | 2026-05-03 | 50     | NULL        |

### 原理分析

- `LEAD` 与 `LAG` 对称：向下取偏移行。
- 常用：找“下一次事件”、计算持续时间（next_dt - dt）、区间拼接。

---

# 七、头尾函数（看窗口首尾值）

`FIRST_VALUE`, `LAST_VALUE`

取分组内排序后，截至到当前行的第一个值

这俩**强依赖窗口帧（FRAME）**，尤其是 `LAST_VALUE`，很多人第一次用都会踩坑。

## 7.1 FIRST_VALUE：窗口内第一行的值

### 示例 SQL（每部门按金额降序，取“当前窗口看到的第一名金额”）

```sql
SELECT
  dept, emp, dt, amount,
  FIRST_VALUE(amount) OVER (
    PARTITION BY dept
    ORDER BY amount DESC, dt ASC
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS first_amt_so_far
FROM sales
ORDER BY dept, amount DESC, dt ASC, emp ASC;
```

### 输出结果示例（dept='A'）

排序后第一行是 120，因此后续行的 first_amt_so_far 都是 120：、

| dept | emp   | dt         | amount | first_amt_so_far |
| ---- | ----- | ---------- | ------ | ---------------- |
| A    | bob   | 2026-05-01 | 120    | 120              |
| A    | alice | 2026-05-02 | 120    | 120              |
| A    | cindy | 2026-05-02 | 120    | 120              |
| A    | alice | 2026-05-01 | 100    | 120              |
| A    | bob   | 2026-05-03 | 80     | 120              |
| B    | eric  | 2026-05-01 | 200    | 200              |
| B    | frank | 2026-05-02 | 200    | 200              |
| B    | david | 2026-05-01 | 90     | 200              |
| B    | david | 2026-05-02 | 90     | 200              |
| B    | eric  | 2026-05-03 | 50     | 200              |

### 原理分析

- 按照dept分为A、B两组，组内按照amount倒序，窗口frame为分组开始到当前行
- `FIRST_VALUE` 在给定 frame 内取“第一行”的表达式值，A组最大的amount为120，所以从第1行开始 FIRST_VALUE的值就为120
- 当 frame 是“从开头到当前行”，它等价于“到目前为止的最大值对应的金额”（在按金额降序时）。

---

## 7.2 LAST_VALUE：窗口内最后一行的值（**默认常踩坑**）

### 坑示范（默认到 CURRENT ROW，last_value 往往等于当前行）

```sql
SELECT
  dept, emp, dt, amount,
  LAST_VALUE(amount) OVER (
    PARTITION BY dept
    ORDER BY amount DESC, dt ASC
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS last_amt_so_far
FROM sales
WHERE dept='A'
ORDER BY amount DESC, dt ASC, emp ASC;
```

**输出直觉**：到当前行为止的“最后值”通常就是当前行的 amount（因为 last 就是 frame 的末端=当前行）。

| dept | emp   | dt         | amount | last_amt_so_far |
| ---- | ----- | ---------- | ------ | --------------- |
| A    | bob   | 2026-05-01 | 120    | 120             |
| A    | alice | 2026-05-02 | 120    | 120             |
| A    | cindy | 2026-05-02 | 120    | 120             |
| A    | alice | 2026-05-01 | 100    | 100             |
| A    | bob   | 2026-05-03 | 80     | 80              |

### 正确拿“分区最后一行”的写法（UNBOUNDED FOLLOWING）

```sql
SELECT
  dept, emp, dt, amount,
  LAST_VALUE(amount) OVER (
    PARTITION BY dept
    ORDER BY amount DESC, dt ASC
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  ) AS last_amt_in_partition
FROM sales
WHERE dept='A'
ORDER BY amount DESC, dt ASC, emp ASC;
```

**输出**：A 分区的最后一行（按金额降序）是 80，所以每行都是 80：

| dept | emp   | dt         | amount | last_amt_in_partition |
| ---- | ----- | ---------- | ------ | --------------------- |
| A    | bob   | 2026-05-01 | 120    | 80                    |
| A    | alice | 2026-05-02 | 120    | 80                    |
| A    | cindy | 2026-05-02 | 120    | 80                    |
| A    | alice | 2026-05-01 | 100    | 80                    |
| A    | bob   | 2026-05-03 | 80     | 80                    |

### 原理分析

- `LAST_VALUE` 取的是 **frame 内最后一行**，frame 若截止当前行，那 last 就是当前行。
- 想要“分区最后一行”，frame 必须覆盖整个分区：`... AND UNBOUNDED FOLLOWING`。

---

# 八、聚合函数（窗口版：在窗口内做统计）

`SUM`, `AVG`, `COUNT`, `MAX/MIN` over(...)

窗口聚合跟 group by 的最大区别：

- group by：一组变一行（折叠）。
- window agg：**每行都保留**，只是附加一列“该行所在窗口的聚合结果”。

## 8.1 分区总和（不写 ORDER BY → 默认整个分区）

### 示例 SQL：每部门总销售额

```sql
SELECT
  dept, emp, dt, amount,
  SUM(amount) OVER (PARTITION BY dept) AS dept_sum
FROM sales
ORDER BY dept, emp, dt;
```

### 输出结果示例（只看 dept_sum）

540 = (100+120+120+80+120)

630 = (90+90+200+50+200)

| dept | emp   | dt         | amount | dept_sum |
| ---- | ----- | ---------- | ------ | -------- |
| A    | alice | 2026-05-01 | 100    | 540      |
| A    | alice | 2026-05-02 | 120    | 540      |
| A    | bob   | 2026-05-01 | 120    | 540      |
| A    | bob   | 2026-05-03 | 80     | 540      |
| A    | cindy | 2026-05-02 | 120    | 540      |
| B    | david | 2026-05-01 | 90     | 630      |
| B    | david | 2026-05-02 | 90     | 630      |
| B    | eric  | 2026-05-01 | 200    | 630      |
| B    | eric  | 2026-05-03 | 50     | 630      |
| B    | frank | 2026-05-02 | 200    | 630      |

### 原理分析

- 没有 ORDER BY 时，frame 等价于整个分区，sum 对分区内所有行求和。
- 执行上仍可能需要按 dept 分区聚合，但会把结果广播/附加回每一行。

---

## 8.2 累计和（Running Sum）：从开头累加到当前行（显式 ROWS 更稳）

### 示例 SQL：部门内按日期累计

```sql
SELECT
  dept, emp, dt, amount,
  SUM(amount) OVER (
    PARTITION BY dept
    ORDER BY dt ASC, emp ASC
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_sum
FROM sales
WHERE dept='A'
ORDER BY dt ASC, emp ASC;
```

### 输出结果示例（dept='A'）

A 的数据按 dt、emp 排序后做累计：

| dt         | emp   | amount | running_sum |
| ---------- | ----- | ------ | ----------- |
| 2026-05-01 | alice | 100    | 100         |
| 2026-05-01 | bob   | 120    | 220         |
| 2026-05-02 | alice | 120    | 340         |
| 2026-05-02 | cindy | 120    | 460         |
| 2026-05-03 | bob   | 80     | 540         |

### 原理分析（为什么强调 ROWS）

- 如果你用默认 `RANGE ... CURRENT ROW`，当 `ORDER BY dt` 且 dt 有重复值时，“当前行”可能会把同 dt 的其他行都算进去，导致“看起来跳一下”。
- 用 `ROWS` 表示“按行数”，严格按排序后的物理顺序累计，更符合工程直觉。

### 易错点

**窗口函数里的 `ORDER BY` 决定 `SUM` 的累计计算顺序；外层 `ORDER BY` 只决定最终结果展示顺序**

也就是说：

- **窗口内 `ORDER BY`**：决定 `SUM(...) OVER (...)` 的计算顺序。
- **外层 `ORDER BY`**：只决定最终结果怎么展示。
- 外层排序不会重新计算窗口函数，也不会重新分配 `dept_sum`。

先举两个例子，理解一下窗口函数内的`ORDER BY`

![](./assets/2026-06-01-17-44-36-image.png)

外层 ORDER BY 和窗口内 ORDER BY 不一致时，窗口函数仍然按照窗口内顺序正确计算，并把结果绑定到对应原始行；

但最终展示时按另一个顺序排列，所以结果看起来不像按当前展示顺序累计。

---

## 8.3 移动平均（Moving Average）：最近 N 行

### 示例 SQL：最近 3 行的平均销售额

```sql
SELECT
  dept, emp, dt, amount,
  AVG(amount) OVER (
    PARTITION BY dept
    ORDER BY dt ASC, emp ASC
    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
  ) AS ma_3
FROM sales
WHERE dept='A'
ORDER BY dt ASC, emp ASC;
```

### 输出结果示例（dept='A'）

| dt         | emp   | amount | ma_3（最近3行均值） |
| ---------- | ----- | ------ | ------------ |
| 2026-05-01 | alice | 100    | 100.0        |
| 2026-05-01 | bob   | 120    | 110.0        |
| 2026-05-02 | alice | 120    | 113.33       |
| 2026-05-02 | cindy | 120    | 120.0        |
| 2026-05-03 | bob   | 80     | 106.67       |

### 原理分析

- frame 设为 `2 PRECEDING AND CURRENT ROW`，表示窗口最多包含 3 行：当前行 + 前两行。
- 常用于：移动平均、平滑指标、滑动窗口监控（比如延迟、QPS）。

---

## 8.4 COUNT / MAX / MIN 的窗口用法（举一组典型）

### 示例 SQL：部门内记录数、最大/最小金额

```sql
SELECT
  dept, emp, dt, amount,
  COUNT(*) OVER (PARTITION BY dept) AS dept_cnt,
  MAX(amount) OVER (PARTITION BY dept) AS dept_max,
  MIN(amount) OVER (PARTITION BY dept) AS dept_min
FROM sales
ORDER BY dept, emp, dt;
```

### 输出结果示例（只看聚合列）

| dept | dept_cnt | dept_max | dept_min |
| ---- | -------- | -------- | -------- |
| A    | 5        | 120      | 80       |
| B    | 5        | 200      | 50       |

### 原理分析

-  SUM 一样：无 ORDER BY → 全分区统计；有 ORDER BY → 可做“到当前”的 max/min/count（配合 frame）。

---

# 九、其他分析函数

` GROUPING SETS`，`ROLLUP`，`CUBE`，`GROUPING__ID`这 4 个概念都是 **SQL 多维聚合分析** 里的东西，常用于数仓报表、OLAP 分析、离线统计。

一句话概括：

> `GROUPING SETS` 是“手动指定多种分组方式”；  
> `ROLLUP` 是“按层级逐级汇总”；  
> `CUBE` 是“所有维度组合都汇总”；  
> `GROUPING__ID` 是“标识当前这一行是哪种汇总层级”。 

## 9.1 数据源

```sql
CREATE TABLE sales_location (
    dt STRING,
    province STRING,
    city STRING,
    amount BIGINT
);

-- 插入示例数据到sales_location表
INSERT INTO TABLE sales_location VALUES
('2024-01', 'Sichuan', 'Chengdu', 100),
('2024-01', 'Sichuan', 'Mianyang', 80),
('2024-01', 'Zhejiang', 'Hangzhou', 120),
('2024-02', 'Sichuan', 'Chengdu', 200),
('2024-02', 'Zhejiang', 'Hangzhou', 150);
```

## 9.2 为什么需要

普通分组

```sql
SELECT
    province,
    city,
    SUM(amount) AS total_amount
FROM sales_location
GROUP BY province, city;
```

结果只做了一个粒度（省份+城市）的聚合

| province | city     | total_amount |
| -------- | -------- | ------------ |
| Sichuan  | Chengdu  | 300          |
| Sichuan  | Mianyang | 80           |
| Zhejiang | Hangzhou | 270          |

但报表经常需要多多种粒度：省份 + 城市、省份、城市、全局总计。这时候就需要`GROUPING SETS`，`ROLLUP`，`CUBE`

## 9.3 GROUPING SETS 指定分组粒度

一次 SQL 中，同时执行多个 `GROUP BY`，最后把结果合并在一起。

语法：

```sql
SELECT
    col1,
    col2,
    SUM(metric)
FROM table_name
GROUP BY GROUPING SETS (
    (col1, col2), -- 按col1, col2聚合
    (col1), -- 按col1聚合
    (col2), -- 按col2聚合
    () -- 全局总计
);
```

**示例 SQL**

```sql
SELECT
    province,
    city,
    SUM(amount) AS total_amount
FROM sales
GROUP BY GROUPING SETS (
    (province, city),
    (province),
    (city),
    ()
);
```

| province | city     | total_amount |
| -------- | -------- | ------------ |
| Sichuan  | Chengdu  | 300          |
| Sichuan  | Mianyang | 80           |
| Sichuan  | NULL     | 380          |
| Zhejiang | Hangzhou | 270          |
| Zhejiang | NULL     | 270          |
| NULL     | Chengdu  | 300          |
| NULL     | Hangzhou | 270          |
| NULL     | Mianyang | 80           |
| NULL     | NULL     | 650          |

逻辑上等价于下面 4 个 SQL 的 `UNION ALL`：

```sql
-- 1. 省份+城市级别
SELECT '省份+城市' as level, province, city, SUM(amount) AS total_amount
FROM sales_location
GROUP BY province, city;
UNION
-- 2. 仅省份级别
SELECT '仅省份' as level, province, NULL as city, SUM(amount) AS total_amount
FROM sales_location
GROUP BY province;
UNION
-- 3. 仅城市级别
SELECT '仅城市' as level, NULL as province, city, SUM(amount) AS total_amount
FROM sales_location
GROUP BY city;
UNION
-- 4. 总计
SELECT '总计' as level, NULL as province, NULL as city, SUM(amount) AS total_amount
FROM sales_location;
```

这里的 `NULL` 有特殊含义：

- `province = NULL, city = NULL`：全局总计
- `city = NULL`：按省份汇总
- `province = NULL`：按城市汇总

注意：这里的 `NULL` 不一定是真实数据里的 NULL，它也可能表示“这个维度被聚合掉了”。

## 9.4 ROLLUP 按层级逐级汇总

`ROLLUP` 适合处理有层级关系的维度。比如 省份 -> 城市、日期 -> 月 -> 日、国家 -> 省份 -> 城市、品类 -> 子品类 -> 商品

语法

```sql
GROUP BY ROLLUP(col1, col2, col3)
```

它会生成这些分组，从右往左逐级去掉维度。**ROLLUP 是有顺序、有层级的。**

```sql
(col1, col2, col3)
(col1, col2)
(col1)
()
```

示例：

```sql
SELECT
    province,
    city,
    SUM(amount) AS total_amount
FROM sales
GROUP BY ROLLUP(province, city);
```

等价于

```sql
GROUPING SETS (
    (province, city), -- 按 province + city 聚合
    (province), --按 province 聚合
    () -- 全局总计
)
```

| province | city     | total_amount |
| -------- | -------- | ------------ |
| Sichuan  | Chengdu  | 300          |
| Sichuan  | Mianyang | 80           |
| Sichuan  | NULL     | 380          |
| Zhejiang | Hangzhou | 270          |
| Zhejiang | NULL     | 270          |
| NULL     | NULL     | 650          |

---

## 9.5 CUBE 所有维度都汇总

对指定的所有维度，生成所有可能的分组组合。如果有 n 个维度，CUBE 会生成 2^n 个分组组合

```sql
GROUP BY CUBE(col1, col2, col3)
```

统计维度

```sql
GROUPING SETS (
    (col1, col2, col3),
    (col1, col2),
    (col1, col3),
    (col2, col3),
    (col1),
    (col2),
    (col3),
    ()
)
```

示例：

```sql
SELECT
    province,
    city,
    SUM(amount) AS total_amount
FROM sales
GROUP BY CUBE(province, city);
```

等价于

```sql
GROUPING SETS (
    (province, city), -- province + city
    (province), -- province
    (city), -- city
    () -- 全局总计
)
```

| province | city     | total_amount |
| -------- | -------- | ------------ |
| Sichuan  | Chengdu  | 300          |
| Sichuan  | Mianyang | 80           |
| Sichuan  | NULL     | 380          |
| Zhejiang | Hangzhou | 270          |
| Zhejiang | NULL     | 270          |
| NULL     | Chengdu  | 300          |
| NULL     | Hangzhou | 270          |
| NULL     | Mianyang | 80           |
| NULL     | NULL     | 650          |

如果维度数量很多，比如 10 个维度会产生 2^10 = 1024 种分组组合，每种分组还会产生大量聚合结果，所以在大数据场景里要谨慎使用。

## 9.6 GROUPING_ID 判断当前行属于哪种汇总层级

### 1）为什么需要GROUPING_ID

前面我们看到，ROLLUP、CUBE、GROUPING SETS 会产生很多 NULL。
问题来了：

- 这里的 NULL 到底是真实数据里的 NULL？

- 还是因为这个维度被聚合掉了？

比如：province = NULL、city = Chengdu；这时候你就很难区分：真实 NULL和聚合产生的 NULL

所以需要 **GROUPING__ID 来标识当前行的聚合层级**。

### 2）示例

```sql
SELECT
    province,
    city,
    SUM(amount) AS total_amount,
    GROUPING__ID
FROM sales
GROUP BY CUBE(province, city);
```

| province | city     | total_amount | grouping__id |
| -------- | -------- | ------------ | ------------ |
| Sichuan  | Chengdu  | 300          | 0            |
| Sichuan  | Mianyang | 80           | 0            |
| Sichuan  | NULL     | 380          | 1            |
| Zhejiang | Hangzhou | 270          | 0            |
| Zhejiang | NULL     | 270          | 1            |
| NULL     | Chengdu  | 300          | 2            |
| NULL     | Hangzhou | 270          | 2            |
| NULL     | Mianyang | 80           | 2            |
| NULL     | NULL     | 650          | 3            |

### 3）GROUPING__ID列怎么看

把每个字段看成一个 bit 位

- 如果某个字段还在参与分组，bit 位值为 0

- 如果某个字段被聚合掉了，bit 位值为 1

```sql
province  city
   bit      bit
```

它们对应关系可以理解为：

| 分组方式               | province 是否聚合掉 | city 是否聚合掉 | 二进制理解 | 十进制值 | 含义   |
| ------------------ | -------------- | ---------- | ----- | ---- | ---- |
| `(province, city)` | 否              | 否          | `00`  | 0    | 明细层级 |
| `(province)`       | 否              | 是          | `01`  | 1    | 省份汇总 |
| `(city)`           | 是              | 否          | `10`  | 2    | 城市汇总 |
| `()`               | 是              | 是          | `11`  | 3    | 全局总计 |

### 4）CASE WHEN 做层级标记

```sql
SELECT
    province,
    city,
    SUM(amount) AS total_amount,
    GROUPING__ID AS grouping_id,
    CASE GROUPING__ID
        WHEN 0 THEN 'province_city_detail'
        WHEN 1 THEN 'province_subtotal'
        WHEN 2 THEN 'city_subtotal'
        WHEN 3 THEN 'grand_total'
    END AS aggregation_level
FROM sales
GROUP BY CUBE(province, city);
```

| province | city     | total_amount | grouping_id | aggregation_level    |
| -------- | -------- | ------------ | ----------- | -------------------- |
| Sichuan  | Chengdu  | 300          | 0           | province_city_detail |
| Sichuan  | Mianyang | 80           | 0           | province_city_detail |
| Sichuan  | NULL     | 380          | 1           | province_subtotal    |
| Zhejiang | Hangzhou | 270          | 0           | province_city_detail |
| Zhejiang | NULL     | 270          | 1           | province_subtotal    |
| NULL     | Chengdu  | 300          | 2           | city_subtotal        |
| NULL     | Hangzhou | 270          | 2           | city_subtotal        |
| NULL     | Mianyang | 80           | 2           | city_subtotal        |
| NULL     | NULL     | 650          | 3           | grand_total          |

### 5）总结对比

| 功能              | 含义       | 生成组合        | 是否有层级 | 适合场景              |
| --------------- | -------- | ----------- | ----- | ----------------- |
| `GROUPING SETS` | 手动指定分组组合 | 你写几个就生成几个   | 不一定   | 精确控制需要哪些汇总        |
| `ROLLUP`        | 按层级逐级汇总  | `n + 1` 个   | 有     | 年/月/日、省/市/区、品类/商品 |
| `CUBE`          | 所有维度组合汇总 | `2^n` 个     | 无     | 多维 OLAP 探索分析      |
| `GROUPING__ID`  | 标识聚合层级   | 不生成分组，只辅助判断 | 不涉及   | 区分明细、小计、总计        |

# 十、总结：窗口函数的“本质执行模型”

把窗口函数当成一个“流水线”会更容易理解：

1. **分区（PARTITION BY）**：把数据逻辑分组（通常意味着 shuffle 把同组拉到一起）。
2. **排序（ORDER BY）**：在每个分区内部排序（通常在 reducer 端完成排序）。
3. **确定窗口帧（ROWS/RANGE）**：对每一行确定它能“看见”的行集合。
4. **逐行计算函数**：
   - 排名类（row_number/rank/dense_rank）：只依赖排序位置和是否并列。
   - 偏移类（lag/lead）：按相对位置取值。
   - 帧聚合类（sum/avg/count/max/min、first/last/nth）：对帧内行做统计或取值。

> 工程建议（非常实用）：

- **只要你写了 ORDER BY，并且希望“按行移动/累计”**，就尽量显式写 `ROWS BETWEEN ...`，避免 RANGE 对重复排序值带来的“多算/跳变”。
- `LAST_VALUE` 想取全分区末尾，必须写到 `UNBOUNDED FOLLOWING`。
- TopN：优先 `ROW_NUMBER`（唯一）或 `DENSE_RANK`（按档）而不是 `RANK`（会跳号，筛选 TopN 时容易“多/少”）。