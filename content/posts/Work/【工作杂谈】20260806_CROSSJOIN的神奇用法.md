---
title: "20260806_CROSS JOIN 的神奇用法：灵活生成多维聚合组合"
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

# 2、应用场景

## 2.1 问题出现背景+以及CROSS JOIN引入

当想一次SQL跑出多种粒度组合的聚合结果时，很容易想到 [HIVE高级分组聚合的 GROUPING SETS / ROLL UP / CUBE 关键字](https://eleanora-lyh.github.io/MyLearningNotes/posts/hive/07hive%E5%87%BD%E6%95%B0/#%E5%85%AD%E9%AB%98%E7%BA%A7%E5%88%86%E7%BB%84%E8%81%9A%E5%90%88grouping-sets--cube--rollup)

但是有些情况还不够灵活，比如现在有5个维度的统计指标

- 如果5个维度之间不存在递进关系，就不能使用`ROLL UP`

- 5个维度完全组合会得到2^5次方=32共32种维度组合，但如果某些组合不想要了，就不能使用 `CUBE`

- 假设只需其中30种的维度组合，全部在`GROUPING SETS` 中声明也很麻烦。而且如果维度变为6个，那么代码又要重新修改。

## 2.2 使用方法

此时如果将维度组合显示记录在一个辅助表，就可以避免上面的问题。

从数学的角度看，这5个维度的组合就是5个可重复的独立选择，这5个空位分别有两个值可选：不聚合/聚合进而可以抽象成0/255

- `0` 是一个“保留原始维度值”的控制标记。

- `255` 是一个“将该维度替换为 All”的控制标记。

那么事先讲这些组合写入0/255的辅助表如下，和业务表执行 `CROSS JOIN`就自然可以得出所有维度的组合。当想去掉某些维度的聚合时，只需要将列值置为0则不会进入聚合阶段。

下面以完整的32个组合的辅助表AllUpCombinations为例，讲下具体怎么使用

| 维度1 | 维度2 | 维度3 | 维度4 | 维度5 |
| --- | --- | --- | --- | --- |
| 0   | 0   | 0   | 0   | 0   |
| 0   | 0   | 0   | 0   | 255 |
| 0   | 0   | 0   | 255 | 0   |
| 0   | 0   | 255 | 0   | 0   |
| 0   | 255 | 0   | 0   | 0   |
| ... | ... | ... | ... | ... |
| 255 | 255 | 255 | 255 | 255 |

当一条记录如下，其中的ContentTypeId, VerticalId,MarketId,LanguageId, DeviceId就对应了我们想要组合的5个维度，也就是辅助表AllUpCombinations的5个维度

```plain
PartnerID    = P1
BrandID      = B1
ContentID    = C1
ContentType  = Article
Vertical     = Sports
Market       = US
Language     = en-US
Device       = Mobile
MUID         = U1
IsActiveUser = 1
```

这条记录和 32 行 AllUpCombinations 做 CROSS JOIN 后，这一行会逻辑上扩展成 32 行。以`ContentType` 被置为255为例，讲一下此类型的组合后续会发生什么，其他组合同理。

当某条 `AllUpCombinations` 记录的 `ContentTypeId = 255` 时，该组合下所有原始 `ContentType` 都被映射为统一的 `255`，虽然 `ContentTypeId` 仍出现在分组列中，但由于其值完全相同，效果等同于消除 ContentType 维度。可以理解为此组合下时分组条件从 ContentTypeId, VerticalId,MarketId,LanguageId, DeviceId 5列变为了VerticalId,MarketId,LanguageId, DeviceId 4列

```sql
ContentPreAgg =
     SELECT 
         L.PartnerID,
         L.BrandID,
         R.ContentTypeId == 0 ? L.ContentTypeId : 255 AS ContentTypeId,
         R.VerticalId == 0 ? L.VerticalId : 255 AS VerticalId,
         R.MarketId == 0 ? L.MarketId : 255 AS MarketId,
         R.LanguageId == 0 ? L.LanguageId : 255 AS LanguageId,
         R.DeviceId == 0 ? L.DeviceId : 255 AS DeviceId,
         UserMUID
     FROM ContentLevelTable AS L
         CROSS JOIN AllUpCombinations AS R;
```

那么此时执行 `COUNT(DISTINCT UserMUID)`，相当于消除了此维度，只留下一个值255，得出结果就是以ContentTypeId维度汇总的数据

```sql
ContentAgg = 
     SELECT
         PartnerID,
         BrandID,
         ContentTypeId,
         VerticalId,
         MarketId,
         LanguageId,
         DeviceId,
         COUNT(DISTINCT UserMUID) AS PageViewAUCount
     FROM ContentPreAgg;
```

以此类推，这样通过一个辅助表AllUpCombinations，就可以通过一次分组得到任意5个维度的所有组合，而不必指定具体维度名字。如果有其他表的其他列也需要进行5个维度的全组合，也可以使用。

## 2.3 详细步骤

如果上面的使用方法的抽象概念没有看懂，可以看下这里的分步详解；如果上面的讲解能够理解，这一小节可以跳过。

表还是ContentLevelTable，以下面的记录为例

```plain
PartnerID  BrandID  ContentTypeId  VerticalId  MarketId  LanguageId  DeviceId  UserMUID
P1         B1       1              10          20        30          40        U1
P1         B1       2              10          20        30          40        U1
P1         B1       1              10          20        30          40        U2
P1         B1       2              10          20        30          40        U3
```

为了便于理解，暂时不看AllUpCombinations的全部 32 行，只取下面两个组合：

```plain
ContentTypeId  VerticalId  MarketId  LanguageId  DeviceId
0              0           0         0           0
255            0           0         0           0
```

它们分别表示：

```plain
0   0 0 0 0  = 五个维度全部保留原值
255 0 0 0 0  = ContentType 上卷为 All，其他四个维度保留原值
```

代码中的表达式：

```sql
R.ContentTypeId == 0 ? L.ContentTypeId : 255 AS ContentTypeId
```

含义是：

```sql
R.ContentTypeId = 0
    => 输出 L.ContentTypeId，保留原值

R.ContentTypeId = 255
    => 输出 255，表示 All Content Types
```

原始四条数据经过下面的sql转换后

```sql
ContentPreAgg =
     SELECT 
         L.PartnerID,
         L.BrandID,
         R.ContentTypeId == 0 ? L.ContentTypeId : 255 AS ContentTypeId,
         R.VerticalId == 0 ? L.VerticalId : 255 AS VerticalId,
         R.MarketId == 0 ? L.MarketId : 255 AS MarketId,
         R.LanguageId == 0 ? L.LanguageId : 255 AS LanguageId,
         R.DeviceId == 0 ? L.DeviceId : 255 AS DeviceId,
         UserMUID
     FROM ContentLevelTable AS L
         CROSS JOIN AllUpCombinations AS R;
```

### 2.3.1 第一个组合：0 0 0 0 0

第一个组合`0 0 0 0 0` 的全部保留原值，仍然是

```plain
PartnerID  BrandID  ContentTypeId  VerticalId  MarketId  LanguageId  DeviceId  UserMUID
P1         B1       1              10          20        30          40        U1
P1         B1       2              10          20        30          40        U1
P1         B1       1              10          20        30          40        U2
P1         B1       2              10          20        30          40        U3
```

之后对输出列进行分组

```sql
ContentAgg = 
     SELECT
         PartnerID,
         BrandID,
         ContentTypeId,
         VerticalId,
         MarketId,
         LanguageId,
         DeviceId,
         COUNT(DISTINCT UserMUID) AS PageViewAUCount
     FROM ContentPreAgg;
```

 语义等价于

```sql
ContentAgg = 
     SELECT
         PartnerID,
         BrandID,
         ContentTypeId,
         VerticalId,
         MarketId,
         LanguageId,
         DeviceId,
         COUNT(DISTINCT UserMUID) AS PageViewAUCount
     FROM ContentPreAgg
     GROUP BY
        PartnerID,
        BrandID,
        ContentTypeId,
        VerticalId,
        MarketId,
        LanguageId,
        DeviceId
```

会得到聚合数据如下

```plain
PartnerID  BrandID  ContentTypeId  VerticalId  MarketId  LanguageId  DeviceId  PageViewAUCount
P1         B1       1              10          20        30          40        2
P1         B1       2              10          20        30          40        2
```

### 2.3.2 第二个组合：255 0 0 0 0

当组合为：`255 0 0 0 0`，表示ContentType 上卷为 All。执行下面的代码后

```sql
ContentPreAgg =
     SELECT 
         L.PartnerID,
         L.BrandID,
         R.ContentTypeId == 0 ? L.ContentTypeId : 255 AS ContentTypeId,
         R.VerticalId == 0 ? L.VerticalId : 255 AS VerticalId,
         R.MarketId == 0 ? L.MarketId : 255 AS MarketId,
         R.LanguageId == 0 ? L.LanguageId : 255 AS LanguageId,
         R.DeviceId == 0 ? L.DeviceId : 255 AS DeviceId,
         UserMUID
     FROM ContentLevelTable AS L
         CROSS JOIN AllUpCombinations AS R;
```

表达式会把每条记录的 ContentTypeId 都改成 255：

```plain
PartnerID  BrandID  ContentTypeId  VerticalId  MarketId  LanguageId  DeviceId  UserMUID
P1         B1       255            10          20        30          40        U1
P1         B1       255            10          20        30          40        U1
P1         B1       255            10          20        30          40        U2
P1         B1       255            10          20        30          40        U3
```

注意，U1 出现了两次，因为 U1 看过两种 ContentType。之后依然按照输出的七列进行分组：

```sql
ContentAgg = 
     SELECT
         PartnerID,
         BrandID,
         ContentTypeId,
         VerticalId,
         MarketId,
         LanguageId,
         DeviceId,
         COUNT(DISTINCT UserMUID) AS PageViewAUCount
     FROM ContentPreAgg;
```

但此时 ContentTypeId 对所有记录都是 255，所以在效果上，确实相当于不再区分 ContentTypeId

```plain
PartnerID  BrandID  ContentTypeId  VerticalId  MarketId  LanguageId  DeviceId  PageViewAUCount
P1         B1       255            10          20        30          40        3
```

因为去重后的用户是 U1、U2、U3，所以All ContentType PageViewAUCount = 3

### 2.3.3 组合总结

通过上面的两种组合的案例，应该可以很好地将这个逻辑扩展到剩余的组合中。

当初始表的维度为5个时，光统计一个AUCount（ActiveUserCount）指标我们就可以膨胀出2^5=32条记录。也就是说随着表的维度增加，统计的指标增加，最终膨胀出的行数是以指数级别扩张的。

所以这时候使用CROSS JOIN辅助表的优势就会越来越明显，因为一次`CROSS JOIN`可以得出多个维度组合的统计，不仅比分开写多条GROUP BY的代码更简洁，还减少对原始表的重复扫描，并减少了Reduce的次数。

# CROSS JOIN扩展维度的优势

最后再总结一下使用CORSS JOIN 辅助表的好处：

- 不依赖特定 `CUBE` 语法，可通过修改资源文件增加或删除某些组合。
- 可以统一用 `255` 表示 `All`，避免用 `NULL` 与真实空值混淆。
- 其他表的处理可以复用相近的维度组合逻辑。
