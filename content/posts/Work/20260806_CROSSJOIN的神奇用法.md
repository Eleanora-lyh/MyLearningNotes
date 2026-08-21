---
title: "【工作杂谈】20260806_CROSS JOIN 的神奇用法：灵活生成多维聚合组合"
date: 2026-08-06T22:17:08+08:00
draft: false
tags: ["HiveSQL", "CROSS JOIN", "多维聚合", "GROUPING SETS"]
categories: ["工作杂谈"]
description: "介绍如何通过 CROSS JOIN 和维度组合辅助表灵活生成多维聚合结果，并对比 GROUPING SETS、ROLLUP 与 CUBE 的适用场景。"
---

# 1、CROSS JOIN简介

`CROSS JOIN` 返回两表的笛卡尔积：左表的每一行都会与右表的每一行组合。本例两表各有 3 行，因此返回 3 \times 3 = 9 行；`NULL` 不参与匹配判断，也不会阻止组合。

连接 Hive 数据库，创建示例表并填充数据：

```sql
create table orders(
user_id string,
amount double
)
row format delimited fields terminated by '\t'
stored as textfile;

insert into orders values
('1',100),
(NULL,200),
('3',300);

create table users(
user_id string,
user_name string
)
row format delimited fields terminated by '\t'
stored as textfile;

insert into users values
('1','Alice'),
('2','Bob'),
(NULL,'Charlie');

select * from orders;
select * from users;
```

`orders`

| user_id | amount |
| ------- | ------ |
| 1       | 100    |
| NULL    | 200    |
| 3       | 300    |

`users`

| user_id | user_name |
| ------- | --------- |
| 1       | Alice     |
| 2       | Bob       |
| NULL    | Charlie   |

```sql
SELECT *
FROM orders o
CROSS JOIN users u;
```

结果：

| user_id | amount | user_id | user_name |
| ------- | ------ | ------- | --------- |
| 1       | 100.0  | 1       | Alice     |
| 1       | 100.0  | 2       | Bob       |
| 1       | 100.0  | NULL    | Charlie   |
| NULL    | 200.0  | 1       | Alice     |
| NULL    | 200.0  | 2       | Bob       |
| NULL    | 200.0  | NULL    | Charlie   |
| 3       | 300.0  | 1       | Alice     |
| 3       | 300.0  | 2       | Bob       |
| 3       | 300.0  | NULL    | Charlie   |

> SQL 在没有 `ORDER BY` 时不保证结果顺序，表格中的顺序仅用于展示。

# 2、大数据下的应用场景

## 2.1 引入分组聚合函数

假设`SourceTable`表的记录如下，其中的`Col1, Col2,Col3,Col4, Col5` 对应了我们关注的5个统计维度

| PartnerID | BrandID | ContentID | Col1    | Col2 | Col3 | Col4 | Col5   | UserMUID |
| --------- | ------- | --------- | ------- | ---- | ---- | ---- | ------ | -------- |
| P1        | B1      | C1        | Video   | 10   | App  | CN   | Sports | U1       |
| P1        | B1      | C1        | Video   | 30   | Web  | CN   | Finace | U1       |
| P1        | B1      | C1        | Artical | 20   | App  | CN   | Finace | U2       |
| P1        | B1      | C1        | Artical | 10   | App  | CN   | Sports | U1       |

如果想探究`Col1`与用户的关系，那么就需要计算在不同的Col1值下 User的数量，也就是下面的sql

```sql
select Col1,Count(distinct UserMUID)
from SourceTable
group by Col1
```

同理如果想探究`Col2, cols3, col4 col5`与用户的关系，那么就需要计算在不同的`Col2, cols3, col4 col5`值下 User的数量，也就是下面的sql

```sql
select Col2,Count(distinct UserMUID)
from SourceTable
group by Col2

select Col3,Count(distinct UserMUID)
from SourceTable
group by Col3

select Col4,Count(distinct UserMUID)
from SourceTable
group by Col4

select Col5,Count(distinct UserMUID)
from SourceTable
group by Col5
```

现在问题变得更复杂，如果想探究`Col1, Col2`的组合与用户的关系，那么就需要写重新sql进行计算

回想一下数学种的统计知识，已知`Col1, Col2, cols3, col4 col5`这5个维度是互不干扰的，且每个维度的值都不为空，那么其所有的组合就是对5个位置的独立选择，这5个空位分别有两个值可选：存在/不存在。最后会得到2的5次方=32共32种组合

那么如果我们想全面地分析维度与用户数量的关系，就应该得到32个类似上面的sql。很显然这种做法很蠢，是白白浪费代码和时间，属于是在时间和空间上都不讨巧的笨蛋做法。

所以早在1996年就有人提出了更加优秀的解决办法：**分组聚合函数**

使用分组聚合函数`ROLLUP / CUBE / GROUPING SETS`可以用一个sql直接生成上面32种维度的聚合结果指定维度的组合，

> ## 大数据领域 OLAP 分组扩展引入时间线
> 
> | 时间点             | 事件                                                             |
> | --------------- | -------------------------------------------------------------- |
> | 1996            | Gray 等学者在论文中提出 CUBE 概念                                         |
> | 1999–2002       | SQL:1999 标准正式纳入 ROLLUP / CUBE / GROUPING SETS                  |
> | **~2012–2013**​ | **Hive 0.10.0 引入 GROUPING SETS、CUBE、ROLLUP(Hadoop 生态最早原生支持**​) |
> | **2015 年中**​    | **Spark 1.4.0 在 DataFrame API 中引入 CUBE 算子**​                   |
> | **2015 年底**​    | **Spark 1.6 补齐 rollup()，DataFrame API 多维聚合能力完整**​              |
> | 2016            | PostgreSQL 9.5 才支持 CUBE / ROLLUP / GROUPING SETS               |
> | 2017            | Hive 2.3.0 对齐标准 SQL 的 GROUPING 语义                              |

由于这篇文章不是为了介绍分组聚合函数的，所以对三个关键字不熟悉或者感兴趣的同学可以看我这篇文章：[HIVE高级分组聚合的 GROUPING SETS / ROLL UP / CUBE 关键字](https://eleanora-lyh.github.io/MyLearningNotes/posts/hive/07hive%E5%87%BD%E6%95%B0/#%E5%85%AD%E9%AB%98%E7%BA%A7%E5%88%86%E7%BB%84%E8%81%9A%E5%90%88grouping-sets--cube--rollup)

## 2.2 引入CROSS JOIN搭配辅助表

当想一次SQL跑出多种维度组合的聚合结果时，很容易想到 [HIVE高级分组聚合的 GROUPING SETS / ROLL UP / CUBE 关键字](https://eleanora-lyh.github.io/MyLearningNotes/posts/hive/07hive%E5%87%BD%E6%95%B0/#%E5%85%AD%E9%AB%98%E7%BA%A7%E5%88%86%E7%BB%84%E8%81%9A%E5%90%88grouping-sets--cube--rollup)

但是有些情况还不够灵活：

- 如果5个维度之间不存在递进关系，就不能使用`ROLL UP`

- 5个维度完全组合会得到2^5次方=32共32种维度组合，但如果某些组合不想要了，就不能使用 `CUBE`（`CUBE`是自动按照维度计算全组合的）

- 假设只需其中30种的维度组合，全部都在`GROUPING SETS` 中一个个声明也很麻烦。而且如果维度从5个变为6个，那么代码又要重新修改。

**此时如果将维度组合显示记录在一个辅助表`DimensionCombinations`，就可以避免上面的问题：**

从数学的角度看，这5个维度的组合就是5个可重复的独立选择，这5个空位分别有两个值可选：不聚合/聚合，分别可以抽象成0/255

- `0` 是一个“保留原始维度值”的控制标记。

- `255` 是一个“将该维度替换为 All”的控制标记。

那么事先将这些组合写入0/255的辅助表中，再和业务表执行 `CROSS JOIN`就自然可以得出所有维度的组合。当想去掉某些维度的聚合时，只需要将列值置为0则不会进入聚合阶段。

这里的做法我觉得很类似用空间换时间的算法，我们提前将表进行膨胀组合，就省去了后面多次按照不同维度的聚合。

---

下面以完整的32个组合的辅助表`DimensionCombinations`为例，讲下具体怎么使用

| 维度1 | 维度2 | 维度3 | 维度4 | 维度5 |
| --- | --- | --- | --- | --- |
| 0   | 0   | 0   | 0   | 0   |
| 0   | 0   | 0   | 0   | 255 |
| 0   | 0   | 0   | 255 | 0   |
| 0   | 0   | 255 | 0   | 0   |
| 0   | 255 | 0   | 0   | 0   |
| ... | ... | ... | ... | ... |
| 255 | 255 | 255 | 255 | 255 |

当一条记录如下，其中的`Col1, Col2,Col3,Col4, Col5 `对应了我们关注的5个数据维度，分别对应辅助表`DimensionCombinations` 会进行组合的5个维度

| PartnerID | BrandID | ContentID | Col1  | Col2 | Col3 | Col4 | Col5   | UserMUID |
| --------- | ------- | --------- | ----- | ---- | ---- | ---- | ------ | -------- |
| P1        | B1      | C1        | Video | 10   | App  | CN   | Sports | U1       |

这条记录和 辅助表的32 行 做 `CROSS JOIN` 后，这一行会在逻辑上扩展成 32 行。

以`Col1` 被置为255为例，讲一下此类型的组合后续会发生什么，其他组合同理。

当某条 `DimensionCombinations` 记录的 `Col1 = 255` 时，该组合下所有原始 `Col1` 都被映射为统一的 `255`，虽然 `Col1` 仍出现在分组列中，但由于其值完全相同，效果等同于消除 `Col1` 维度。可以理解为此组合下时分组条件从 `Col1, Col2,Col3,Col4, Col5` 的5列变为了`Col2,Col3,Col4,Col5` 的4列

```sql
ExtendedResult =
     SELECT 
         L.PartnerID,
         L.BrandID,
         R.Col1 == 0 ? L.Col1 : 255 AS Col1 ,
         R.Col2 == 0 ? L.Col2 : 255 AS Col2 ,
         R.Col3 == 0 ? L.Col3 : 255 AS Col3 ,
         R.Col4 == 0 ? L.Col4 : 255 AS Col4 ,
         R.Col5 == 0 ? L.Col5 : 255 AS Col5 ,
         UserMUID
     FROM SourceTable AS L
         CROSS JOIN DimensionCombinations AS R;
```

那么此时再执行 `COUNT(DISTINCT UserMUID)`（如下），膨胀出来的32行的具有相同的`UserMUID`，`CROSS JOIN`只是提前将所有统计维度提前应用到原始行上，组合结果中如果`Col1 = 255`则表示消除了此维度，只留下一个值255

中文的含义就是以`Col1=all`维度的汇总数据

```sql
AggResult = 
     SELECT
         PartnerID,
         BrandID,
         Col1 ,
         Col2 ,
         Col3 ,
         Col4 ,
         Col5 ,
         COUNT(DISTINCT UserMUID) AS AUCount
     FROM ExtendedResult;
```

以此类推，这样通过一个辅助表`DimensionCombinations`，就可以通过一次分组计算得到任意5个维度的所有组合，而不必指定具体维度名字。如果有其他表的其他列也需要进行5个维度的全组合，也可以使用同样的辅助表。

以这种方式来计算多维度下的统计数据，可以减少计算资源的浪费，因为只读取了一次源数据，就得到了所有维度的统计结果，避免了重复读取。

## 2.3 详细步骤

如果上面的使用方法的抽象概念没有看懂，可以看下这里的分步详解；如果上面的讲解能够理解，这一小节可以跳过。

表还是SourceTable，以下面的记录为例

| PartnerID | BrandID | ContentID | Col1    | Col2 | Col3 | Col4 | Col5   | UserMUID |
| --------- | ------- | --------- | ------- | ---- | ---- | ---- | ------ | -------- |
| P1        | B1      | C1        | Video   | 10   | App  | CN   | Sports | U1       |
| P1        | B1      | C1        | Video   | 30   | Web  | CN   | Finace | U1       |
| P1        | B1      | C1        | Artical | 20   | App  | CN   | Finace | U2       |
| P1        | B1      | C1        | Artical | 10   | App  | CN   | Sports | U1       |

为了便于理解，暂时不看`DimensionCombinations`的全部 32 行，只取下面两个组合：

```plain
Col1    Col2    Col3    Col4    Col5
255     0       0       0       0
255     255     0       0       255
```

它们分别表示：

```plain
255 0 0 0 0  = Col1 上卷为 All，其他四个维度保留原值
255 255 0 0 255  = Col1、Col2、Col5 上卷为 All，其他两个维度保留原值
```

代码中的表达式：

```sql
R.Col1 == 0 ? L.Col1 : 255 AS Col1
```

含义是：

```sql
R.Col1 = 0
    => 输出 L.Col1，保留原值

R.Col1 = 255
    => 输出 255，表示 All Col1 Types
```

原始4条数据经过下面的sql转换后

```sql
ExtendedResult =
     SELECT 
         L.PartnerID,
         L.BrandID,
         L.ContentID,
         R.Col1 == 0 ? L.Col1 : 255 AS Col1 ,
         R.Col2 == 0 ? L.Col2 : 255 AS Col2 ,
         R.Col3 == 0 ? L.Col3 : 255 AS Col3 ,
         R.Col4 == 0 ? L.Col4 : 255 AS Col4 ,
         R.Col5 == 0 ? L.Col5 : 255 AS Col5 ,
         UserMUID
     FROM SourceTable AS L
         CROSS JOIN DimensionCombinations AS R;
```

就会膨胀得到4*32行，表示原始行与32个维度的组合

### 2.3.1 第一个组合：255 0 0 0 0

当组合为：`255 0 0 0 0`，表示Col1 上卷为 All。执行下面的代码后

```sql
ExtendedResult =
     SELECT 
         L.PartnerID,
         L.BrandID,
         L.ContentID,
         R.Col1 == 0 ? L.Col1 : 255 AS Col1 ,
         R.Col2 == 0 ? L.Col2 : 255 AS Col2 ,
         R.Col3 == 0 ? L.Col3 : 255 AS Col3 ,
         R.Col4 == 0 ? L.Col4 : 255 AS Col4 ,
         R.Col5 == 0 ? L.Col5 : 255 AS Col5 ,
         UserMUID
     FROM SourceTable AS L
         CROSS JOIN DimensionCombinations AS R;
```

表达式会把每条记录的 Col1 都改成 255，此时Col1=all（即不再区分 Col1），第一行、第四行的数据在Col1~Col5这几列是完全一致的

| PartnerID | BrandID | ContentID | Col1 | Col2 | Col3 | Col4 | Col5   | UserMUID |
| --------- | ------- | --------- | ---- | ---- | ---- | ---- | ------ | -------- |
| P1        | B1      | C1        | 255  | 10   | App  | CN   | Sports | U1       |
| P1        | B1      | C1        | 255  | 30   | Web  | CN   | Finace | U1       |
| P1        | B1      | C1        | 255  | 20   | App  | CN   | Finace | U2       |
| P1        | B1      | C1        | 255  | 10   | App  | CN   | Sports | U1       |

这部分数据再进行分组

```sql
AggResult = 
     SELECT
         PartnerID,
         BrandID,
         ContentID,
         Col1,
         Col2,
         Col3,
         Col4,
         Col5,
         COUNT(DISTINCT UserMUID) AS AUCount
     FROM ExtendedResult;
```

统计结果如下

| PartnerID | BrandID | ContentID | Col1 | Col2 | Col3 | Col4 | Col5   | AUCount |
| --------- | ------- | --------- | ---- | ---- | ---- | ---- | ------ | ------- |
| P1        | B1      | C1        | 255  | 10   | App  | CN   | Sports | 1       |
| P1        | B1      | C1        | 255  | 30   | Web  | CN   | Finace | 1       |
| P1        | B1      | C1        | 255  | 20   | App  | CN   | Finace | 1       |

需要注意由于原来的第一行和第四行是同一个用户，所以ActiveUser通过DISTINCT只能算作一个

### 2.3.2 第一个组合：255 255 0 0 255

当组合为：`255 255 0 0 255`，表示Col1,Col2,Col5 上卷为 All。执行下面的代码后

```sql
ExtendedResult =
     SELECT 
         L.PartnerID,
         L.BrandID,
         L.ContentID,
         R.Col1 == 0 ? L.Col1 : 255 AS Col1 ,
         R.Col2 == 0 ? L.Col2 : 255 AS Col2 ,
         R.Col3 == 0 ? L.Col3 : 255 AS Col3 ,
         R.Col4 == 0 ? L.Col4 : 255 AS Col4 ,
         R.Col5 == 0 ? L.Col5 : 255 AS Col5 ,
         UserMUID
     FROM SourceTable AS L
         CROSS JOIN DimensionCombinations AS R;
```

表达式会把每条记录的 Col1,Col2,Col5 的值都改成 255，此时Col1=all, Col2=all,  Col5=all,（即不再区分 Col1,Col2,Col5），第一行、第三行、第四行的数据在Col1~Col5这几列是完全一致的

| PartnerID | BrandID | ContentID | Col1 | Col2 | Col3 | Col4 | Col5 | UserMUID |
| --------- | ------- | --------- | ---- | ---- | ---- | ---- | ---- | -------- |
| P1        | B1      | C1        | 255  | 255  | App  | CN   | 255  | U1       |
| P1        | B1      | C1        | 255  | 255  | Web  | CN   | 255  | U1       |
| P1        | B1      | C1        | 255  | 255  | App  | CN   | 255  | U2       |
| P1        | B1      | C1        | 255  | 255  | App  | CN   | 255  | U1       |

这部分数据再进行分组

```sql
AggResult = 
     SELECT
         PartnerID,
         BrandID,
         ContentID,
         Col1,
         Col2,
         Col3,
         Col4,
         Col5,
         COUNT(DISTINCT UserMUID) AS AUCount
     FROM ExtendedResult;
```

统计结果如下

| PartnerID | BrandID | ContentID | Col1 | Col2 | Col3 | Col4 | Col5 | AUCount |
| --------- | ------- | --------- | ---- | ---- | ---- | ---- | ---- | ------- |
| P1        | B1      | C1        | 255  | 255  | App  | CN   | 255  | 2       |
| P1        | B1      | C1        | 255  | 255  | Web  | CN   | 255  | 1       |

### 2.3.3 组合总结

通过上面的两种组合的案例，应该可以很好地将这个逻辑扩展到剩余的组合中。

当初始表的维度为5个时，光统计一个AUCount（ActiveUserCount）指标我们就可以膨胀出2^5=32倍的记录。也就是说随着表的维度增加，统计的指标增加，最终膨胀出的行数是以指数级别扩张的。（当数据量达到千万以上时需要注意数据倾斜的问题）

所以这时候使用CROSS JOIN辅助表的优势就会越来越明显，因为一次`CROSS JOIN`可以得出多个维度组合的统计，不仅比分开写多条GROUP BY的代码更简洁，还减少对原始表的重复扫描，并减少了Reduce的次数。

# 3、CROSS JOIN扩展维度的优势

最后再总结一下使用CORSS JOIN 辅助表的好处：

- 不依赖特定 `CUBE` 语法，可通过修改资源文件增加或删除某些组合。
- 可以统一用 `255` 表示 `All`，避免用 `NULL` 与真实空值混淆。
- 其他表的处理可以复用相近的维度组合逻辑。
