---
title: "【四_(1)】Hive/Spark SQL 七种 JOIN 的区别：NULL 匹配规则与结果对比"
date: 2026-05-18T22:16:40+08:00
draft: false
tags: ["HiveSQL", "FULL OUTER JOIN", "CROSS JOIN", "LEFT SEMI JOIN"]
categories: ["Hive"]
description: "通过 orders 和 users 示例表对比 Hive/Spark SQL 中 INNER JOIN、LEFT JOIN、RIGHT JOIN、FULL OUTER JOIN、CROSS JOIN、LEFT SEMI JOIN 和 LEFT ANTI JOIN 的匹配规则与结果差异。"
---

# 1、数据源

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

# 2、NULL 值判断

`NULL` 和 任意值比较的结果都是`UNKNOWN`，如下：

| 表达式           | 结果        |
| ------------- | --------- |
| `NULL = 1`    | `UNKNOWN` |
| `NULL = NULL` | `UNKNOWN` |

∵ Join 只有在 `ON` 条件结果为 `TRUE` 时才匹配，且`NULL = NULL` 的结果不是 `TRUE`，而是 `UNKNOWN`

∴ 因此，**普通等值 Join 中，NULL 不会与 NULL 匹配**，但不同 Join 类型对于“未匹配行是否保留”有区别

# 3、JOIN 类别

## 3.1 INNER JOIN

`INNER JOIN` 只会保留双方都匹配上的行

- 当 `o.user_id` 或 `u.user_id` 为 `NULL` 时，等值条件返回 `UNKNOWN`，因此未匹配的相关行被过滤

```sql
SELECT *
FROM orders o
INNER JOIN users u
    ON o.user_id = u.user_id;
```

结果：

| user_id | amount | user_id | user_name |
| ------- | ------ | ------- | --------- |
| 1       | 100.0  | 1       | Alice     |

## 3.2 LEFT JOIN

`LEFT JOIN` 保留完整的左表以及匹配上的右表，右表未匹配上的列会补上NULL

- 左表 Key=NULL 时无法匹配右表，但由于是 Left Join，左表记录仍然保留，右表所有字段补 NULL

```sql
SELECT *
FROM orders o
LEFT JOIN users u
    ON o.user_id = u.user_id;
```

| user_id | amount | user_id | user_name |
| ------- | ------ | ------- | --------- |
| 1       | 100.0  | 1       | Alice     |
| NULL    | 200.0  | NULL    | NULL      |
| 3       | 300.0  | NULL    | NULL      |

## 3.3 RIGHT JOIN

`RIGHT JOIN` 保留完整的右表以及匹配上的左表，左表未匹配上的列会补上NULL

- 右表 `Key=NULL` 时无法匹配左表，但由于是 `RIGHT JOIN`，右表记录仍然保留，左表所有字段补 `NULL`

```sql
SELECT *
FROM orders o
RIGHT JOIN users u
    ON o.user_id = u.user_id;
```

| user_id | amount | user_id | user_name |
| ------- | ------ | ------- | --------- |
| 1       | 100.0  | 1       | Alice     |
| NULL    | NULL   | 2       | Bob       |
| NULL    | NULL   | NULL    | Charlie   |

## 3.4 FULL OUTER JOIN

`FULL OUTER JOIN` 保留左表所有行和右表所有行，能根据 ON 条件匹配上的行合并成一行，无法匹配的行，缺失的一侧用 NULL 填充

- 左或右表 Key=NULL 时无法匹配则另一边所有字段都补 NULL

```sql
SELECT *
FROM orders o
FULL OUTER JOIN users u
    ON o.user_id = u.user_id;
```

结果：

| user_id | amount | user_id | user_name |
| ------- | ------ | ------- | --------- |
| 1       | 100.0  | 1       | Alice     |
| NULL    | NULL   | 2       | Bob       |
| 3       | 300.0  | NULL    | NULL      |
| NULL    | NULL   | NULL    | Charlie   |
| NULL    | 200.0  | NULL    | NULL      |

- user_id=1 在两表中都存在 → 正常匹配，合并为一行

- `user_id=NULL (amount=200)` 在左表，右表也有一个 `user_id=NULL` 的行，但 `NULL = NULL` 的结果是 `UNKNOWN` 而不是 `TRUE`，所以两行不会匹配，左表行单独出现且右表字段填 `NULL`

- user_id=3 只在左表 → 保留左表，右表填 NULL

- user_id=2 只在右表 → 保留右表，左表填 NULL

- user_id=NULL (Charlie) 在右表，同理，它没有匹配到左表的任何行（包括左表的 NULL 行），所以右表这一行单独出现，左表填 NULL

## 3.5 CROSS JOIN

`CROSS JOIN` 返回两表的笛卡尔积：左表的每一行都会与右表的每一行组合。本例两表各有 3 行，因此返回 $3 \times 3 = 9$ 行；`NULL` 不参与匹配判断，也不会阻止组合。

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

### 👉 应用场景

当想一次SQL跑出多种粒度的聚合结果时，很容易想到 [HIVE高级分组聚合的 GROUPING SETS / ROLL UP / CUBE 关键字](https://eleanora-lyh.github.io/MyLearningNotes/posts/hive/07hive%E5%87%BD%E6%95%B0/#%E5%85%AD%E9%AB%98%E7%BA%A7%E5%88%86%E7%BB%84%E8%81%9A%E5%90%88grouping-sets--cube--rollup)

但是还不够灵活，比如现在有5个维度的统计指标

- 如果5个维度之间不存在递进关系，就不能使用`ROLL UP`

- 5个维度完全组合会得到2^5次方=32共32种维度组合，但如果某些组合不想要了，就不能使用 `CUBE`

- 假设只需其中30种的维度组合，全部在`GROUPING SETS` 中声明也很麻烦。而且如果维度变为6个，那么代码又要重新修改。

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

以此类推，这样通过一个辅助表AllUpCombinations，就可以通过一次分组得到任意5个维度的所有组合，而不必指定具体维度名字。如果有其他表的其他列也需要进行5个维度的全组合，也可以使用这个辅助表。

最后再总结一下使用CORSS JOIN 辅助表的好处：

- 不依赖特定 `CUBE` 语法，可通过修改资源文件增加或删除某些组合。
- 可以统一用 `255` 表示 `All`，避免用 `NULL` 与真实空值混淆。
- 其他表的处理可以复用相近的维度组合逻辑。

如果还是没有看懂，可以详见另一篇文章：[20260806_CROSS JOIN 的神奇用法：灵活生成多维聚合组合](https://eleanora-lyh.github.io/MyLearningNotes/posts/work/%E5%B7%A5%E4%BD%9C%E6%9D%82%E8%B0%8820260806_crossjoin%E7%9A%84%E7%A5%9E%E5%A5%87%E7%94%A8%E6%B3%95/)

## 3.6 LEFT SEMI JOIN

`LEFT SEMI JOIN` 只返回左表中能与右表匹配的行，**且只输出左表的列**（相当于 WHERE EXISTS）。

```sql
SELECT o.*
FROM orders o
LEFT SEMI JOIN users u
ON o.user_id = u.user_id;
```

结果（只有左表能匹配的行被保留）：

| user_id | amount |
| ------- | ------ |
| 1       | 100.0  |

`orders.user_id=NULL` 与右表的 `NULL` 在普通等值条件下不匹配，`user_id=3` 在右表中也不存在，因此这两行不会出现在结果中。

## 3.7 LEFT ANTI JOIN（Spark SQL）

`LEFT ANTI JOIN` 只返回左表中**不能与右表匹配**的行，并且只输出左表的列，语义相当于 `WHERE NOT EXISTS`。

Spark SQL 原生支持 `LEFT ANTI JOIN`，但 Hive 的 JOIN 语法不包含该类型。Hive 0.13 及以上版本可以使用 `NOT EXISTS` 表达相同语义。实际执行策略和性能取决于优化器、数据规模、数据分布及是否能够广播右表，不能仅凭 JOIN 写法断定一定会减少 Shuffle。

```sql
SELECT o.*
FROM orders o
LEFT ANTI JOIN users u
ON o.user_id = u.user_id;
```

**结果**：

| user_id | amount |
| ------- | ------ |
| NULL    | 200    |
| 3       | 300    |

Hive 中的等价写法：

```sql
SELECT o.*
FROM orders o
WHERE NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE o.user_id = u.user_id
);
```

## 3.8 汇总不同 JOIN 的行为

| Join 类型         | 未匹配 NULL 行是否保留          |
| --------------- | ----------------------- |
| INNER JOIN      | 不保留                     |
| LEFT JOIN       | 保留左表 NULL Key 行         |
| RIGHT JOIN      | 保留右表 NULL Key 行         |
| FULL OUTER JOIN | 左右两边分别保留                |
| LEFT SEMI JOIN  | 普通等值条件下不保留左表 NULL Key 行 |
| LEFT ANTI JOIN  | 普通等值条件下保留左表 NULL Key 行  |

FULL OUTER JOIN 会同时保留左右表的所有行，并用 NULL 填充未匹配的另一侧。对比结果：

**FULL OUTER JOIN 结果**（之前已经算过）：

| o.user_id | o.amount | u.user_id | u.user_name |
| --------- | -------- | --------- | ----------- |
| 1         | 100      | 1         | Alice       |
| NULL      | 200      | NULL      | NULL        |
| 3         | 300      | NULL      | NULL        |
| NULL      | NULL     | 2         | Bob         |
| NULL      | NULL     | NULL      | Charlie     |

可以看到：

- SEMI 只取了左表匹配行（第1行）

- ANTI 取了左表未匹配行（第2、3行）

- FULL 保留了所有左表行和右表行

# 4、NULL-safe equality

Hive / Spark SQL/ MySQL 通常可以使用 `<=>` 表示 NULL-safe equality

| 条件              | 结果    |
| --------------- | ----- |
| `NULL <=> 1`    | FALSE |
| `NULL <=> NULL` | TRUE  |

因此

```sql
a.key <=> b.key
```

相当于以下条件：

```sql
a.key = b.key
OR (a.key IS NULL AND b.key IS NULL)
```

SQL Server 2022 及以上版本还可以使用 `a.key IS NOT DISTINCT FROM b.key`；旧版本可以使用上面的显式条件。
