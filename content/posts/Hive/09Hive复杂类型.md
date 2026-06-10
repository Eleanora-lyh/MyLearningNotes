---
title: "【九】Hive 复杂数据类型：ARRAY / MAP / STRUCT 与嵌套展开"
date: 2026-05-27T22:59:32+08:00
draft: false
tags: ["Hive", "复合类型", "ARRAY", "MAP", "STRUCT", "LATERAL VIEW", "UNNEST"]
categories: ["Hive"]
description: "系统讲解 Hive 三种复合数据类型（ARRAY / MAP / STRUCT）的定义、访问语法、嵌套用法，以及配套的 UDTF 函数（explode / posexplode / LATERAL VIEW）与 Spark 3.0+ 的 CROSS JOIN UNNEST 标准语法对比"
---

Hive 除了支持基础数据类型（INT、STRING、DOUBLE 等）之外，还提供了 **4 种复合（Complex）数据类型**，用于在单个字段中存储结构化/半结构化数据。这在数仓建模中非常常见——比如用户标签、嵌套 JSON、商品多属性等场景。

---

# 一、三种复合类型总览

| 类型         | 语法定义                                       | 取值                                      | 是否有序       | 是否允许重复 | 典型场景          |
| ---------- | ------------------------------------------ | --------------------------------------- | ---------- | ------ | ------------- |
| **ARRAY**  | `ARRAY<data_type>`                         | `列名[下标]` (**下标从 0 开始**)<br/>`scores[0]` | ✅ 有序       | ✅ 允许   | 用户兴趣标签、商品图片列表 |
| **MAP**    | `MAP<key_type, value_type>`                | `列名[key]`<br/>`info['name']`            | ❌ 无序       | Key 唯一 | 用户属性、KV 配置项   |
| **STRUCT** | `STRUCT<col1:type, col2:type, ...>`        | `列名.字段名`<br/>`details.name`             | ✅ 有序（字段固定） | 字段名唯一  | 地址（省市区）、嵌套实体  |
| **嵌套类型**   | `ARRAY<STRUCT<col1:type, col2:type, ...>>` | `列名[下标].字段名`<br/>`Array[0].name`        | ✅ 有序       | ✅ 允许   | 复杂嵌套 JSON     |

结配合 `get_json_object` / `json_tuple` 解析

| 场景             | 推荐类型   | 理由          |
| -------------- | ------ | ----------- |
| 用户多标签、商品多图片    | ARRAY  | 顺序有意义、可重复   |
| 动态 KV 属性（如点参数） | MAP    | Key 不固定、可扩展 |
| 嵌套实体（地址、设备信息）  | STRUCT | 字段固定、语义清晰   |
| 复杂嵌套 JSON      |        |             |

> 💡 **本质**：复合类型让 Hive 能直接承接 JSON、Parquet/ORC 这类嵌套结构的数据，避免拆表带来的 Join 开销。

---

# 二、ARRAY

Hive 的一种复杂数据类型，表示“数组/列表”，常见用途是把多个值放到一个字段里，后续用 `explode` 展开

`array(1, 2, 3)`表示一个数组`[1, 2, 3]`,它本身还是 一行里的一个字段值，结果是 1 行 1 列：

| nums      |
| --------- |
| `[1,2,3]` |

### 2.1 建表

```sql
CREATE TABLE user_scores (
    user_id INT,
    scores ARRAY<INT>  -- 成绩数组
);
```

### 2.2 访问

下标从 0 开始，array 常和 explode 搭配

```sql
-- 1. 访问特定元素（下标从0开始）
SELECT scores[0] AS first_score FROM user_scores;

-- 2. 展开数组（行转列）
SELECT user_id, score
FROM user_scores
LATERAL VIEW explode(scores) exploded AS score;
```

| 组件                | 解释                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `explode(scores)` | **核心函数**：`explode()`是一个内置的UDTF（用户自定义表生成函数）。它接收一个数组（或Map）作为输入，然后将数组中的**每个元素输出为一行**。                          |
| `LATERAL VIEW`    | **连接机制**：这是一个Hive/Spark SQL的关键字。它的作用是**将UDTF（如`explode`）生成的结果集（一个虚拟表）与原始表的每一行进行连接（JOIN）**。你可以把它想象成一种“横向连接”。 |
| `exploded`        | **虚拟表的别名**：这是为`explode(scores)`生成的结果虚拟表起的一个**表别名**。                                                         |
| `score`           | **列的别名**：这是虚拟表中**那唯一一列**的列名，这一列的值就来自数组`scores`中的每一个元素。                                                      |

## 2.3 统计

⚠️ **常见误区**：`length()` 是**字符串函数**，不能用于 ARRAY/MAP；反之 `size()` 也不能用于 STRING（会报错或返回意外结果）。

```sql
 统计数组长度
SELECT size(scores) AS score_count FROM user_scores;
```

---

# 三、Map

## 3.1 建表

```sql
CREATE TABLE user_info (
    user_id INT,
    info MAP<STRING, STRING>  -- 用户属性映射
);
```

## 3.2 访问

```sql
-- 1. 访问特定key的值
SELECT info['name'] AS user_name FROM user_info;


-- 3. 获取所有keys或values
SELECT map_keys(info) AS all_keys,
       map_values(info) AS all_values
FROM user_info;
```

## 3.3 统计

⚠️ **常见误区**：`length()` 是**字符串函数**，不能用于 ARRAY/MAP；反之 `size()` 也不能用于 STRING（会报错或返回意外结果）。

```sql
-- 统计Map键值对数量
SELECT size(info) AS info_count FROM user_info;
```

# 四、Struct

## 4.1 建表

```sql
CREATE TABLE employees (
    id INT,
    details STRUCT<name:STRING, age:INT, dept:STRING>
);
```

## 4.2 访问

```sql
-- 1. 访问字段（用点号）
SELECT details.name, details.age FROM employees;
```

## 4.3 统计

STRUCT 字段数是**建表时固定的**，没有运行时的 size 函数。如果一定要拿字段数，可以通过 `DESCRIBE` 或元数据查询，但实际工程中很少这么做

---

# 五、嵌套类型访问

复合类型可以**嵌套**，比如 `ARRAY<STRUCT<...>>` 或 `MAP<STRING, ARRAY<INT>>`：

```sql
-- 假设有列 orders ARRAY<STRUCT<order_id:INT, amount:DOUBLE>>
SELECT orders[0].amount FROM t; -- 取第一个订单的金额

-- 假设有列 tag_scores MAP<STRING, ARRAY<INT>>
SELECT tag_scores['vip'][0] FROM t; -- 取 vip 标签下数组的第一个元素
```

这类嵌套结构在解析 JSON / Parquet 时**非常常见**，掌握后能极大减少展开表的工作量。

# 六、常用辅助函数UDTF（配合复合类型）

**UDTF**​ = **U**ser-**D**efined **T**able-**G**enerating **F**unction（中文：用户定义表生成函数）

**核心特性**

- **一行输入 → 多行输出**：将单行数据展开为多行

- **一对多转换**：类似SQL中的`LATERAL VIEW`+ `EXPLODE`

- **内置常用UDTF**：`explode()`、`posexplode()`、`inline()`等

| 函数                         | 作用                         | 示例                                             |
| -------------------------- | -------------------------- | ---------------------------------------------- |
| `explode(array)`           | 把 ARRAY 炸开成多行              | `SELECT explode(hobbies) FROM user_profile;`   |
| `explode(map)`             | 把 MAP 炸开成 key, value 两列多行  | `SELECT explode(scores) FROM user_profile;`    |
| `posexplode(map/array)`    | 把 MAP/ARRAY 炸开成多行并保留炸开后的索引 | `SELECT posexplode(scores) FROM user_profile;` |
| `LATERAL VIEW explode()`   | 炸开后与原表 Join，保留其他列          | 见下                                             |
| `map_keys(map)`            | 返回 MAP 所有 key 的 ARRAY      | `map_keys(scores)` → `['math','english']`      |
| `map_values(map)`          | 返回 MAP 所有 value 的 ARRAY    | `map_values(scores)` → `[90, 85]`              |
| `array_contains(arr, val)` | 判断 ARRAY 是否包含某值            | `array_contains(hobbies,'coding')`             |
| `sort_array(arr)`          | 对 ARRAY 排序                 | `sort_array(hobbies)`                          |

`lateral view`用于和`split、explode`等**UDTF**一起使用的，能将一行数据拆分成多行数据，在此基础上可以对拆分的数据进行聚合，`lateral view`首先为原始表的每行调用UDTF，UDTF会把一行拆分成一行或者多行，lateral view在把结果组合，产生一个支持别名表的虚拟表。

## 6.1 Array相关函数

### ① explode(array)  数组展开

```sql
-- 基础用法：将数组元素展开为多行
CREATE TABLE user_scores (
    user_id INT,
    scores ARRAY<INT>  -- 成绩数组
);

-- 插入测试数据
INSERT INTO user_hobbies VALUES
(1, ARRAY(85, 92, 78)),
(2, ARRAY(90, 88));

-- 实际场景：分析用户浏览历史
SELECT user_id, score
FROM user_scores
LATERAL VIEW explode(scores) exploded AS score;
```

**数据源**

| user_id | scores       |
| ------- | ------------ |
| 1       | [85, 92, 78] |
| 2       | [90, 88]     |

**执行步骤：**

1. **遍历**：查询引擎开始逐行扫描 `user_scores`表。

2. **第一行 (user_id=1)**：
   
   - `explode([85, 92, 78])`开始工作，生成一个包含3行的虚拟表。我们给这个虚拟表起名为 `exploded`，它只有一列，我们叫这列为 `score`。
   
   - 虚拟表 `exploded`的内容是：
     
     | score |
     | ----- |
     | 85    |
     | 92    |
     | 78    |
   
   - `LATERAL VIEW`将原始行 (`user_id=1`) 与这个虚拟表 `exploded`进行**笛卡尔积**（在这个场景下是1对多连接）。于是，我们得到：
     
     | user_id | score |
     | ------- | ----- |
     | 1       | 85    |
     | 1       | 92    |
     | 1       | 78    |

3. **第二行 (user_id=2)**：
   
   - 重复相同过程：`explode([90, 88])`生成虚拟表，内容为 `[90, 88]`。
   
   - `LATERAL VIEW`将原始行 (`user_id=2`) 与虚拟表连接，得到：
     
     | user_id | score |
     | ------- | ----- |
     | 2       | 90    |
     | 2       | 88    |

4. **合并结果**：
   
   - 将上述所有中间结果合并，就是最终的输出。**原始的一行数据（包含数组），被“炸开”成了多行扁平化数据。**
     
     | user_id | score |
     | ------- | ----- |
     | 1       | 85    |
     | 1       | 92    |
     | 1       | 78    |
     | 2       | 90    |
     | 2       | 88    |

**为什么要用 `LATERAL VIEW`？**

因为 `explode()`这样的UDTF，输入一行会输出多行，这破坏了SQL中“一行进，一行出”的常规函数规则。`LATERAL VIEW`就是Hive/Spark SQL为了解决“如何将这种一行变多行的结果，与上下文（原表其他列）正确关联”而引入的语法。

**一个常见错误写法（无法运行）：**

```sql
-- 错误！SELECT子句中不能直接使用返回多行的UDTF
SELECT user_id, explode(scores) AS score FROM user_scores;
```

这个查询会报错，因为它不知道如何将 `user_id`(1行) 与 `explode(scores)`(3行) 对齐。`LATERAL VIEW`就是解决这个对齐问题的标准方式。

### ② posexplode(array) 带索引展开

和 `explode(array)` 相比，在炸开时增加了索引`position`，在合并的结果中可以体现出来，类似分组排序

```sql
-- 用法：同时返回数组索引和元素
CREATE TABLE user_hobbies (
    user_id INT,
    hobbies ARRAY<STRING>  -- 爱好数组
);

-- 插入测试数据
INSERT INTO user_hobbies VALUES
(1, ARRAY('reading', 'music', 'sports')),
(2, ARRAY('coding', 'gaming'));

-- 查询
SELECT user_id, hobby, position
FROM user_hobbies
LATERAL VIEW posexplode(hobbies) exploded AS position, hobby;
```

**数据源**

| user_id | hobbies                        |
| ------- | ------------------------------ |
| 1       | ['reading', 'music', 'sports'] |
| 2       | ['coding', 'gaming']           |

**执行步骤：**

1. **遍历**：查询引擎开始逐行扫描 `user_hobbies`表。

2. **第一行 (user_id=1, hobbies=['reading','music','sports'])**：
   
   - `posexplode(['reading','music','sports'])`开始工作，生成一个包含3行的虚拟表。我们给这个虚拟表起名为 `exploded`，它有两列：位置列和值列，分别命名为 `position`和 `hobby`。
   
   - 虚拟表 `exploded`的内容是：
     
     | position | hobby   |
     | -------- | ------- |
     | 0        | reading |
     | 1        | music   |
     | 2        | sports  |
   
   - `LATERAL VIEW`将原始行 (`user_id=1`) 与这个虚拟表 `exploded`进行连接。于是，我们得到：
     
     | user_id | position | hobby   |
     | ------- | -------- | ------- |
     | 1       | 0        | reading |
     | 1       | 1        | music   |
     | 1       | 2        | sports  |

3. **第二行 (user_id=2, hobbies=['coding','gaming'])**：
   
   - 重复相同过程：`posexplode(['coding','gaming'])`生成虚拟表，内容为：
     
     | position | hobby  |
     | -------- | ------ |
     | 0        | coding |
     | 1        | gaming |
   
   - `LATERAL VIEW`将原始行 (`user_id=2`) 与虚拟表连接，得到：
     
     | user_id | position | hobby  |
     | ------- | -------- | ------ |
     | 2       | 0        | coding |
     | 2       | 1        | gaming |

4. **合并结果**：
   
   - 将上述所有中间结果合并，就是最终的输出。**原始的一行数据（包含数组），被"炸开"成了多行扁平化数据，并保留了元素在数组中的位置索引。**
     
     | user_id | position | hobby   |
     | ------- | -------- | ------- |
     | 1       | 0        | reading |
     | 1       | 1        | music   |
     | 1       | 2        | sports  |
     | 2       | 0        | coding  |
     | 2       | 1        | gaming  |

### ③ array_contains(arr, value) 数组包含判断

```sql
-- 用法：判断数组是否包含特定值
CREATE TABLE products (
    product_id INT,
    tags ARRAY<STRING>  -- 商品标签
);

-- 插入测试数据
INSERT INTO products VALUES
(1, ARRAY('electronics', 'discount', 'new')),
(2, ARRAY('clothing', 'summer')),
(3, ARRAY('electronics', 'home'));

-- 查询：查找所有电子类商品
SELECT product_id, tags
FROM products
WHERE array_contains(tags, 'electronics');
```

**数据源**

| product_id | tags                               |
| ---------- | ---------------------------------- |
| 1          | ['electronics', 'discount', 'new'] |
| 2          | ['clothing', 'summer']             |
| 3          | ['electronics', 'home']            |

**执行步骤：**

1. **遍历**：查询引擎开始逐行扫描 `products`表。

2. **逐行应用 `array_contains`函数**：
   
   - **第一行 (product_id=1, tags=['electronics','discount','new'])**：
     
     - 计算 `array_contains(['electronics','discount','new'], 'electronics')`
     
     - 检查数组 `['electronics','discount','new']`是否包含字符串 `'electronics'`
     
     - 结果为 `TRUE`（包含）
- **第二行 (product_id=2, tags=['clothing','summer'])**：
  
  - 计算 `array_contains(['clothing','summer'], 'electronics')`
  
  - 检查数组 `['clothing','summer']`是否包含字符串 `'electronics'`
  
  - 结果为 `FALSE`（不包含）

- **第三行 (product_id=3, tags=['electronics','home'])**：
  
  - 计算 `array_contains(['electronics','home'], 'electronics')`
  
  - 检查数组 `['electronics','home']`是否包含字符串 `'electronics'`
  
  - 结果为 `TRUE`（包含）
3. **应用WHERE条件过滤**：
   
   - 只保留 `array_contains`返回 `TRUE`的行
   
   - 符合条件的是第1行和第3行

4. **返回结果**：
   
   - 输出满足条件的行
     
     | product_id | tags                             |
     | ---------- | -------------------------------- |
     | 1          | ['electronics','discount','new'] |
     | 3          | ['electronics','home']           |

### ④ sort_array(arr) 数组排序

```sql
-- 用法：对数组元素进行排序
CREATE TABLE student_results (
    student_id INT,
    scores ARRAY<INT>,  -- 多次考试成绩
    subjects ARRAY<STRING>  -- 科目列表
);

-- 插入测试数据
INSERT INTO student_results VALUES
(1, ARRAY(85, 92, 78, 90), ARRAY('physics', 'math', 'english', 'chemistry')),
(2, ARRAY(88, 75, 95), ARRAY('history', 'geography', 'biology'));

-- 查询：对成绩数组进行排序
SELECT 
    student_id,
    scores,
    sort_array(scores) AS sorted_scores,
    subjects,
    sort_array(subjects) AS sorted_subjects
FROM student_results;
```

**数据源**

| student_id | scores           | subjects                                    |
| ---------- | ---------------- | ------------------------------------------- |
| 1          | [85, 92, 78, 90] | ['physics', 'math', 'english', 'chemistry'] |
| 2          | [88, 75, 95]     | ['history', 'geography', 'biology']         |

**执行步骤：**

1. **遍历**：查询引擎开始逐行扫描 `student_results`表。

2. **逐行应用 `sort_array`函数**：
   
   - **第一行 (student_id=1)**：
     
     - 原始数据：
       
       - `scores = [85, 92, 78, 90]`
       
       - `subjects = ['physics','math','english','chemistry']`
     
     - 计算 `sort_array([85, 92, 78, 90])`：
       
       - 对整数数组进行升序排序
       
       - 结果：`[78, 85, 90, 92]`
     
     - 计算 `sort_array(['physics','math','english','chemistry'])`：
       
       - 对字符串数组按字典序排序
       
       - 结果：`['chemistry','english','math','physics']`
- **第二行 (student_id=2)**：
  
  - 原始数据：
    
    - `scores = [88, 75, 95]`
    
    - `subjects = ['history','geography','biology']`
    
    - 计算 `sort_array([88, 75, 95])`：
      
      - 对整数数组进行升序排序
      
      - 结果：`[75, 88, 95]`
    
    - 计算 `sort_array(['history','geography','biology'])`：
      
      - 对字符串数组按字典序排序
      
      - 结果：`['biology','geography','history']`
3. **构造结果行**：
   
   - 对每一行，保留原始列，并添加排序后的新列

4. **返回结果**：
   
   原来scores和subjects的对应关系在排序后消失
   
   | student_id | scores        | sorted_scores | subjects                                 | sorted_subjects                          |
   | ---------- | ------------- | ------------- | ---------------------------------------- | ---------------------------------------- |
   | 1          | [85,92,78,90] | [78,85,90,92] | ['physics','math','english','chemistry'] | ['chemistry','english','math','physics'] |
   | 2          | [88,75,95]    | [75,88,95]    | ['history','geography','biology']        | ['biology','geography','history']        |

## 6.2 Map映射相关函数

### ① explode(map) Map展开

```sql
-- 用法：将Map展开为key-value对
CREATE TABLE student_scores (
    student_id INT,
    scores MAP<STRING, INT>  -- 科目-分数映射
);

-- 插入测试数据
INSERT INTO student_scores VALUES
(1, MAP('math', 90, 'english', 85, 'physics', 88)),
(2, MAP('math', 92, 'chemistry', 78));

-- 查询
SELECT student_id, subject, score
FROM student_scores
LATERAL VIEW explode(scores) exploded AS subject, score;
```

**数据源**

| student_id | scores                                |
| ---------- | ------------------------------------- |
| 1          | {'math':90,'english':85,'physics':88} |
| 2          | {'math':92,'chemistry':78}            |

**执行步骤：**

1. **遍历**：查询引擎开始逐行扫描 `student_scores`表。

2. **第一行 (student_id=1, scores={'math':90,'english':85,'physics':88})**：
   
   - `explode({'math':90,'english':85,'physics':88})`开始工作，生成一个包含3行的虚拟表。我们给这个虚拟表起名为 `exploded`，它有两列：键列和值列，分别命名为 `subject`和 `score`。
   
   - 虚拟表 `exploded`的内容是：
     
     | subject | score |
     | ------- | ----- |
     | math    | 90    |
     | english | 85    |
     | physics | 88    |
   
   - `LATERAL VIEW`将原始行 (`student_id=1`) 与这个虚拟表 `exploded`进行连接。于是，我们得到：
     
     | student_id | subject | score |
     | ---------- | ------- | ----- |
     | 1          | math    | 90    |
     | 1          | english | 85    |
     | 1          | physics | 88    |

3. **第二行 (student_id=2, scores={'math':92,'chemistry':78})**：
   
   - 重复相同过程：`explode({'math':92,'chemistry':78})`生成虚拟表，内容为：
     
     | subject   | score |
     | --------- | ----- |
     | math      | 92    |
     | chemistry | 78    |
   
   - `LATERAL VIEW`将原始行 (`student_id=2`) 与虚拟表连接，得到：
     
     | student_id | subject   | score |
     | ---------- | --------- | ----- |
     | 2          | math      | 92    |
     | 2          | chemistry | 78    |

4. **合并结果**：
   
   - 将上述所有中间结果合并，就是最终的输出。**原始的一行数据（包含Map），被"炸开"成了多行扁平化数据，每行包含一个键值对。**
     
     | student_id | subject   | score |
     | ---------- | --------- | ----- |
     | 1          | math      | 90    |
     | 1          | english   | 85    |
     | 1          | physics   | 88    |
     | 2          | math      | 92    |
     | 2          | chemistry | 78    |

### ②map_keys(map) map_values(map) 提取Map的键或值

```sql
-- 用法：提取Map中的所有键或所有值
CREATE TABLE employee_skills (
    emp_id INT,
    skills MAP<STRING, INT>  -- 技能:熟练度映射
);

-- 插入测试数据
INSERT INTO employee_skills VALUES
(1, MAP('Java', 5, 'Python', 4, 'SQL', 3)),
(2, MAP('JavaScript', 4, 'React', 5));

-- 查询1：提取所有技能名称
SELECT 
    emp_id,
    map_keys(skills) AS skill_names
FROM employee_skills;

-- 查询2：提取所有熟练度
SELECT 
    emp_id,
    map_values(skills) AS skill_levels
FROM employee_skills;
```

**数据源**

| emp_id | skills                        |
| ------ | ----------------------------- |
| 1      | {'Java':5,'Python':4,'SQL':3} |
| 2      | {'JavaScript':4,'React':5}    |

**执行步骤（查询1 - `map_keys`）：**

1. **遍历**：查询引擎开始逐行扫描 `employee_skills`表。

2. **逐行应用 `map_keys`函数**：
   
   - **第一行 (emp_id=1, skills={'Java':5,'Python':4,'SQL':3})**：
     
     - 计算 `map_keys({'Java':5,'Python':4,'SQL':3})`
     
     - 提取Map中的所有键
     
     - 结果：数组 `['Java','Python','SQL']`
- **第二行 (emp_id=2, skills={'JavaScript':4,'React':5})**：
  
  - 计算 `map_keys({'JavaScript':4,'React':5})`
  
  - 提取Map中的所有键
  
  - 结果：数组 `['JavaScript','React']`
3. **构造结果行**：
   
   - 每一行包含 `emp_id`和对应的技能名称数组

4. **返回结果**：
   
   | emp_id | skill_names             |
   | ------ | ----------------------- |
   | 1      | ['Java','Python','SQL'] |
   | 2      | ['JavaScript','React']  |

**执行步骤（查询2 - `map_values`）：**

1. **遍历**：查询引擎开始逐行扫描 `employee_skills`表。

2. **逐行应用 `map_values`函数**：
   
   - **第一行 (emp_id=1, skills={'Java':5,'Python':4,'SQL':3})**：
     
     - 计算 `map_values({'Java':5,'Python':4,'SQL':3})`
     
     - 提取Map中的所有值
     
     - 结果：数组 `[5, 4, 3]`
- **第二行 (emp_id=2, skills={'JavaScript':4,'React':5})**：
  
  - 计算 `map_values({'JavaScript':4,'React':5})`
  
  - 提取Map中的所有值
  
  - 结果：数组 `[4, 5]`
3. **构造结果行**：
   
   - 每一行包含 `emp_id`和对应的熟练度数组

4. **返回结果**：
   
   | emp_id | skill_levels |
   | ------ | ------------ |
   | 1      | [5, 4, 3]    |
   | 2      | [4, 5]       |

---

## 6.3 多个 LATERAL VIEW

### ① 基本语法回顾

```sql
CREATE TABLE user_data (
    user_id INT,
    tags ARRAY<STRING>,
    hobbies ARRAY<STRING>
);

-- 基本用法
SELECT user_id, tag
FROM user_data
LATERAL VIEW explode(tags) t AS tag;
```

### ② 多个 LATERAL VIEW 的笛卡尔积问题

```sql
-- 创建测试表
CREATE TABLE user_interests (
    user_id INT,
    tags ARRAY<STRING>,    -- 标签数组
    skills ARRAY<STRING>   -- 技能数组
);

-- 插入测试数据
INSERT INTO user_interests VALUES
(1, ARRAY('student', 'coder'), ARRAY('Java', 'SQL')),
(2, ARRAY('teacher'), ARRAY('Python', 'C++', 'Go'));

-- 示例1：多个LATERAL VIEW（可能产生笛卡尔积）
SELECT 
    user_id,
    tag,
    skill
FROM user_interests
LATERAL VIEW explode(tags) t1 AS tag
LATERAL VIEW explode(skills) t2 AS skill;
```

**数据源**

| user_id | tag                  | skill                   |
| ------- | -------------------- | ----------------------- |
| 1       | ['student', 'coder'] | ['Java', 'SQL']         |
| 2       | ['teacher']          | ['Python', 'C++', 'Go'] |

**执行步骤分析：**

1. **遍历原始表**：
   
   - 第一行：user_id=1, tags=['student','coder'], skills=['Java','SQL']
   
   - 第二行：user_id=2, tags=['teacher'], skills=['Python','C++','Go']

2. **第一个 LATERAL VIEW 展开 tags**：
   
   - 对第一行：
     
     - 虚拟表t1：tag='student'
     
     - 虚拟表t1：tag='coder'
- 对第二行：
  
  - 虚拟表t1：tag='teacher'
3. **第二个 LATERAL VIEW 展开 skills**：
   
   - 对第一行的第一个tag（'student'）：
     
     - 展开skills数组：['Java','SQL']
     
     - 生成：('student', 'Java'), ('student', 'SQL')
- 对第一行的第二个tag（'coder'）：
  
  - 展开skills数组：['Java','SQL']
  
  - 生成：('coder', 'Java'), ('coder', 'SQL')

- 对第二行的tag（'teacher'）：
  
  - 展开skills数组：['Python','C++','Go']
  
  - 生成：('teacher', 'Python'), ('teacher', 'C++'), ('teacher', 'Go')
4. **最终结果**：
   
   | user_id | tag     | skill  |
   | ------- | ------- | ------ |
   | 1       | student | Java   |
   | 1       | student | SQL    |
   | 1       | coder   | Java   |
   | 1       | coder   | SQL    |
   | 2       | teacher | Python |
   | 2       | teacher | C++    |
   | 2       | teacher | Go     |

**⚠️ 注意**：这产生了笛卡尔积！user_id=1 的 2个tags × 2个skills = 4行。这可能不是你想要的效果。

### ③ 使用 posexplode 按索引对齐

#### 对齐

```sql
-- 创建表
CREATE TABLE student_subjects (
    student_id INT,
    subjects ARRAY<STRING>,  -- 科目
    grades ARRAY<INT>        -- 对应成绩
);

-- 插入测试数据
INSERT INTO student_subjects VALUES
(1, ARRAY('数学', '英语', '物理'), ARRAY(90, 85, 88)),
(2, ARRAY('化学', '生物'), ARRAY(92, 78));

-- ✅ 正确做法：使用 posexplode 按位置对齐
SELECT 
    student_id,
    subject,
    grade
FROM student_subjects
LATERAL VIEW posexplode(subjects) s AS pos1, subject
LATERAL VIEW posexplode(grades) g AS pos2, grade
WHERE pos1 = pos2;  -- 关键：按相同位置连接
```

**数据源**

| student_id | subjects           | grades       |
| ---------- | ------------------ | ------------ |
| 1          | ['数学', '英语', '物理'] | [90, 85, 88] |
| 2          | ['化学', '生物']       | [92, 78]     |

**执行步骤：**

**1. 使用 posexplode 展开 subjects**：

- 第一行：
  
  - (0, '数学'), (1, '英语'), (2, '物理')

- 第二行：
  
  - (0, 90), (0, 85), (0, 88)

**2. 使用 posexplode 展开 grades**：

- 第一行：
  
  - (0, '化学'), (1, '生物')

- 第二行：
  
  - (0, 92), (0, 78)

**3. 按照笛卡尔积展开所有组合**：

| student_id | pos1 | subject | pos2 | grade |
| ---------- | ---- | ------- | ---- | ----- |
| 1          | 0    | 数学      | 0    | 90    |
| 1          | 0    | 数学      | 1    | 85    |
| 1          | 0    | 数学      | 2    | 88    |
| 1          | 1    | 英语      | 0    | 90    |
| 1          | 1    | 英语      | 1    | 85    |
| 1          | 1    | 英语      | 2    | 88    |
| 1          | 2    | 物理      | 0    | 90    |
| 1          | 2    | 物理      | 1    | 85    |
| 1          | 2    | 物理      | 2    | 88    |
| 2          | 0    | 化学      | 0    | 92    |
| 2          | 0    | 化学      | 1    | 78    |
| 2          | 1    | 生物      | 0    | 92    |
| 2          | 1    | 生物      | 1    | 78    |

**3. 按where指定的pos1=pos2进行连接**：

- student_id=1，pos1=0 只能连接 pos2=0 → ('数学', 90)

- student_id=1，pos1=1 只能连接 pos2=1 → ('英语', 85)

- student_id=1，pos1=2 只能连接 pos2=2 → ('物理', 88)

- student_id=2，pos1=0 只能连接 pos2=0 → ('化学', 92)

- student_id=2，pos1=1 只能连接 pos2=1 → ('物理', 78)

**最终结果**：

| user_id | subject | grade |
| ------- | ------- | ----- |
| 1       | 数学      | 90    |
| 1       | 英语      | 85    |
| 1       | 物理      | 88    |
| 2       | 化学      | 92    |
| 2       | 物理      | 78    |

**✅ 正确**：按位置对齐，避免了意外的笛卡尔积。

#### 对不齐

```sql
-- 使用 posexplode 按位置对齐
SELECT 
    user_id,
    tag,
    skill
FROM user_interests
LATERAL VIEW posexplode(tags) t1 AS pos1, tag
LATERAL VIEW posexplode(skills) t2 AS pos2, skill
WHERE pos1 = pos2;  -- 按相同位置对齐
```

**数据源**

| user_id | tag                  | skill                   |
| ------- | -------------------- | ----------------------- |
| 1       | ['student', 'coder'] | ['Java', 'SQL']         |
| 2       | ['teacher']          | ['Python', 'C++', 'Go'] |

**执行步骤：**

**1. 使用 posexplode 展开 tags**：

- 第一行：
  
  - (0, 'student'), (1, 'coder')

- 第二行：
  
  - (0, 'teacher')

**2. 使用 posexplode 展开 skills**：

- 第一行：
  
  - (0, 'Java'), (1, 'SQL')

- 第二行：
  
  - (0, 'Python'), (1, 'C++'), (2, 'Go')

**3. 按位置连接**：

| user_id | pos1 | tag     | pos2 | skill  |
| ------- | ---- | ------- | ---- | ------ |
| 1       | 0    | student | 0    | Java   |
| 1       | 0    | student | 1    | SQL    |
| 1       | 1    | coder   | 0    | Java   |
| 1       | 1    | coder   | 1    | SQL    |
| 2       | 0    | teacher | 0    | Python |
| 2       | 0    | teacher | 1    | C++    |
| 2       | 0    | teacher | 2    | Go     |

- 第一行，pos1=0 只能连接 pos2=0 → ('student', 'Java')

- 第一行，pos1=1 只能连接 pos2=1 → ('coder', 'SQL')

- 第二行，pos1=0 只能连接 pos2=0 → ('teacher', 'Python')

**最终结果**：

| user_id | tag     | skill  |
| ------- | ------- | ------ |
| 1       | student | Java   |
| 1       | coder   | SQL    |
| 2       | teacher | Python |

**✅ 正确**：按位置对齐，避免了意外的笛卡尔积。

### ④ OUTER 关键字的作用

几乎没有额外性能开销，但会让结果集包含更多行（保留了空数组对应的行）。

```sql
-- 创建包含空数组的数据
INSERT INTO user_interests VALUES
(3, ARRAY('engineer'), ARRAY()),  -- skills为空数组
(4, ARRAY(), ARRAY('Java'));      -- tags为空数组

-- 没有OUTER关键字
SELECT 
    user_id,
    tag
FROM user_interests
LATERAL VIEW explode(tags) t AS tag;
```

**数据源**

| user_id | tag                  | skill                   |
| ------- | -------------------- | ----------------------- |
| 1       | ['student', 'coder'] | ['Java', 'SQL']         |
| 2       | ['teacher']          | ['Python', 'C++', 'Go'] |
| 3       | ['engineer']         | []                      |
| 4       | []                   | ['Java']                |

**执行结果（没有OUTER）**：

| user_id | tag      |
| ------- | -------- |
| 1       | student  |
| 1       | coder    |
| 2       | teacher  |
| 3       | engineer |
| 4       | ❌ 这行会丢失！ |

user_id=4 的标签数组为空，`explode([])`不会生成任何行，所以这行数据完全丢失了。

```sql
-- 使用OUTER关键字
SELECT 
    user_id,
    tag
FROM user_interests
LATERAL VIEW OUTER explode(tags) t AS tag;
```

**执行结果（有OUTER）**：

| user_id | tag      |
| ------- | -------- |
| 1       | student  |
| 1       | coder    |
| 2       | teacher  |
| 3       | engineer |
| 4       | NULL     |

**✅ 关键区别**：`OUTER`关键字会保留原始行，即使 UDTF 没有输出任何行，也会用 NULL 填充。

### ⑤ 复杂场景示例

```sql
-- 创建电商订单表
CREATE TABLE orders (
    order_id STRING,
    order_date STRING,
    items ARRAY<STRUCT<  -- 商品项
        product_id STRING,
        quantity INT,
        price DECIMAL(10,2)
    >>,
    promotions ARRAY<STRING>  -- 优惠活动
);

-- 插入测试数据
INSERT INTO orders VALUES
('O001', '2024-01-01', 
 ARRAY(
    STRUCT('P001', 2, 50.00),
    STRUCT('P002', 1, 100.00)
 ), 
 ARRAY('NEW_USER', 'FREE_SHIPPING')
),
('O002', '2024-01-01',
 ARRAY(
    STRUCT('P003', 3, 30.00)
 ),
 ARRAY()  -- 没有促销
),
('O003', '2024-01-02',
 ARRAY(),  -- 没有商品
 ARRAY('DISCOUNT_10')
);

-- 示例1：展开订单商品，保留没有商品的订单
SELECT 
    order_id,
    order_date,
    item.product_id,
    item.quantity,
    item.price
FROM orders
LATERAL VIEW OUTER explode(items) t AS item;
```

**数据源**：

| order_id | order_date | items                                    | promotions                    |
| -------- | ---------- | ---------------------------------------- | ----------------------------- |
| O001     | 2024-01-01 | [('P001', 2, 50.00),('P002', 1, 100.00)] | ['NEW_USER', 'FREE_SHIPPING'] |
| O002     | 2024-01-01 | [('P003', 3, 30.00)]                     | []                            |
| O003     | 2024-01-02 | []                                       | ['DISCOUNT_10']               |

**执行结果**：

| order_id | order_date | product_id | quantity | price  |
| -------- | ---------- | ---------- | -------- | ------ |
| O001     | 2024-01-01 | P001       | 2        | 50.00  |
| O001     | 2024-01-01 | P002       | 1        | 100.00 |
| O002     | 2024-01-01 | P003       | 3        | 30.00  |
| O003     | 2024-01-02 | NULL       | NULL     | NULL   |

**注意**：O003 订单没有商品，但使用了 `OUTER`，所以被保留下来，商品相关字段为 NULL。

### ⑥ 多个 LATERAL VIEW 与 OUTER 的组合

```sql
-- 同时展开商品和促销
SELECT 
    order_id,
    item.product_id,
    promotion
FROM orders
LATERAL VIEW OUTER explode(items) t1 AS item
LATERAL VIEW OUTER explode(promotions) t2 AS promotion;
```

**执行过程分析**：

1. **原始数据**：
   
   - O001: 2个商品 × 2个促销 = 4行
   
   - O002: 1个商品 × 0个促销 = 1行（因为OUTER）
   
   - O003: 0个商品 × 1个促销 = 1行（因为OUTER）

2. **最终结果**：
   
   | order_id | product_id | promotion     |
   | -------- | ---------- | ------------- |
   | O001     | P001       | NEW_USER      |
   | O001     | P001       | FREE_SHIPPING |
   | O001     | P002       | NEW_USER      |
   | O001     | P002       | FREE_SHIPPING |
   | O002     | P003       | NULL          |
   | O003     | NULL       | DISCOUNT_10   |

### ⑦ 实际业务场景示例

```sql
-- 用户行为分析
CREATE TABLE user_events (
    user_id INT,
    date STRING,
    page_views ARRAY<STRING>,  -- 访问页面
    clicks ARRAY<STRUCT<      -- 点击事件
        element_id STRING,
        timestamp BIGINT
    >>,
    sessions ARRAY<STRUCT<    -- 会话信息
        session_id STRING,
        duration INT
    >>
);

-- 复杂的多维度分析
SELECT 
    user_id,
    date,
    page_view,
    click.element_id AS clicked_element,
    click.timestamp AS click_time,
    session.session_id,
    session.duration
FROM user_events
LATERAL VIEW OUTER explode(page_views) pv AS page_view
LATERAL VIEW OUTER explode(clicks) c AS click
LATERAL VIEW OUTER explode(sessions) s AS session
WHERE date = '2024-01-15';
```

### ⑧ 性能优化建议

```sql
-- ❌ 不推荐的写法：在WHERE前做复杂的展开
SELECT 
    user_id,
    page_view,
    click.element_id
FROM user_events
LATERAL VIEW OUTER explode(page_views) pv AS page_view
LATERAL VIEW OUTER explode(clicks) c AS click
WHERE page_view LIKE '%product%'
  AND click.timestamp > 1673712000;

-- ✅ 推荐的写法：先过滤，再展开
WITH filtered_data AS (
    SELECT 
        user_id,
        page_views,
        clicks
    FROM user_events
    WHERE EXISTS (
        SELECT 1
        FROM UNNEST(page_views) AS pv
        WHERE pv LIKE '%product%'
    )
)
SELECT 
    user_id,
    page_view,
    click.element_id
FROM filtered_data
LATERAL VIEW OUTER explode(page_views) pv AS page_view
LATERAL VIEW OUTER explode(clicks) c AS click
WHERE click.timestamp > 1673712000;
```

## 6.4 stack

`stack(n, expr1, expr2, ..., exprk)` 是 Hive 的表生成函数。它的作用是：把后面的表达式按照指定列数切分，展开成 `n` 行。

示例：

```sql
SELECT stack(3, 'math', 90, 'english', 80, 'history', 70) AS (subject, score);
```

- `AS (subject, score)`定义了输出有两列。

- `N=3`表示要生成3行。

- 因此，需要的总参数数量为 `3行 * 2列 = 6个`。

- 你提供的6个参数 `('math', 90, 'english', 80, 'history', 70)`被依次填充：
  
  - 第1行: (`'math'`, `90`)
  
  - 第2行: (`'english'`, `80`)
  
  - 第3行: (`'history'`, `70`)

| subject | score |
| ------- | ----- |
| math    | 90    |
| english | 80    |
| history | 70    |

**示例2**

```sql
SELECT stack(10, 0,1,2,3,4,5,6,7,8,9) AS d;
```

- `AS d`定义了输出只有一列（列名为 `d`）。

- `N=10`表示要生成10行。

- 因此，需要的总参数数量为 `10行 * 1列 = 10个`。

- 你提供的10个参数 `(0,1,2,3,4,5,6,7,8,9)`被依次填充到这一列的10行中。

| d   |
| --- |
| 0   |
| 1   |
| 2   |
| 3   |
| 4   |
| 5   |
| 6   |
| 7   |
| 8   |
| 9   |

# 七、Spark 3.0+ 的新语法 CROSS JOIN UNNEST（推荐）

这是现代SQL（Spark 3.0+、Presto/Trino、BigQuery等）中处理数组的标准方法。

`UNNEST` 是 SQL（尤其在 Hive、Spark SQL、Flink SQL 等大数据框架中）用于将嵌套的集合类型数据“展开”成多行数据的核心操作。它主要用于处理数组（Array）和映射（Map）类型的数据。

## 7.1 基本概念对比

首先，我们对比两种语法：

| 特性          | `LATERAL VIEW explode()`(Hive风格) | `CROSS JOIN UNNEST()`(SQL标准)                   |
| ----------- | -------------------------------- | ---------------------------------------------- |
| **语法来源**​   | Hive/Spark特有扩展                   | SQL标准语法                                        |
| **可读性**​    | 较复杂，需要理解UDTF概念                   | 更直观，类似表连接                                      |
| **SQL标准**​  | 非标准                              | SQL:2016标准                                     |
| **支持平台**​   | Hive, Spark (2.x+)               | Spark 3.0+, Presto, Trino, BigQuery, Snowflake |
| **多个数组展开**​ | 需要多个LATERAL VIEW                 | 可在UNNEST中指定多个数组                                |
| **默认行为**    | 内连接，丢弃空/空数组行                     | 内连接，丢弃空/空数组行                                   |
| 保留原行语法      | `LATERAL VIEW OUTER explode()`   | `LEFT JOIN UNNEST() ON true`                   |

## 7.2 基本数组展开

```sql
-- 创建测试表
CREATE TABLE student_grades (
    student_id INT,
    name STRING,
    grades ARRAY<INT>
);

-- 插入数据
INSERT INTO student_grades VALUES
(1, '张三', ARRAY(85, 90, 92)),
(2, '李四', ARRAY(78, 82)),
(3, '王五', ARRAY()),  -- 空数组
(4, '赵六', NULL);    -- NULL数组

-- 展开数组
SELECT 
    student_id,
    name,
    grade
FROM student_grades
CROSS JOIN UNNEST(grades) AS t(grade);
```

**数据源**

| student_id | name | grades       |
| ---------- | ---- | ------------ |
| 1          | 张三   | [85, 90, 92] |
| 2          | 李四   | [78, 82]     |
| 3          | 王五   | ARRAY()      |
| 4          | 赵六   | NULL         |

**结果：**

```markdown
+-----------+------+-------+
| student_id| name | grade |
+-----------+------+-------+
| 1         | 张三  | 85    |
| 1         | 张三  | 90    |
| 1         | 张三  | 92    |
| 2         | 李四  | 78    |
| 2         | 李四  | 82    |
+-----------+------+-------+
```

⚠️ **注意**：王五和赵六的数据**丢失了**，因为CROSS JOIN不会保留空数组或NULL数组的行。

## 7.3 保留空数组的行 (LEFT JOIN)

```sql
-- 使用 LEFT JOIN 保留空数组
SELECT 
    student_id,
    name,
    grade
FROM student_grades
LEFT JOIN UNNEST(grades) AS t(grade) ON true;
```

**结果：**

```markdown
+-----------+------+-------+
| student_id| name | grade |
+-----------+------+-------+
| 1         | 张三  | 85    |
| 1         | 张三  | 90    |
| 1         | 张三  | 92    |
| 2         | 李四  | 78    |
| 2         | 李四  | 82    |
| 3         | 王五  | NULL  |  -- 空数组，grade为NULL
| 4         | 赵六  | NULL  |  -- NULL数组，grade为NULL
+-----------+------+-------+
```

✅ **关键**：`LEFT JOIN UNNEST(...) ON true`相当于 `LATERAL VIEW OUTER explode(...)`

## 7.4 展开多个数组 (按元素对齐)

```sql
-- 创建表
CREATE TABLE student_subjects (
    student_id INT,
    subjects ARRAY<STRING>,  -- 科目
    grades ARRAY<INT>        -- 对应成绩
);

-- 插入测试数据
INSERT INTO student_subjects VALUES
(1, ARRAY('数学', '英语', '物理'), ARRAY(90, 85, 88)),
(2, ARRAY('化学', '生物'), ARRAY(92, 78));

-- 同时展开多个数组（按位置对齐）
SELECT 
    student_id,
    subject,
    grade
FROM student_subjects
CROSS JOIN UNNEST(subjects, grades) AS t(subject, grade);


-- ✅ 等价于 posexplode 按位置对齐
SELECT 
    student_id,
    subject,
    grade
FROM student_subjects
LATERAL VIEW posexplode(subjects) s AS pos1, subject
LATERAL VIEW posexplode(grades) g AS pos2, grade
WHERE pos1 = pos2;  -- 关键：按相同位置连接
```

**数据源**

| student_id | subjects           | grades       |
| ---------- | ------------------ | ------------ |
| 1          | ['数学', '英语', '物理'] | [90, 85, 88] |
| 2          | ['化学', '生物']       | [92, 78]     |

**执行过程：**

```markdown
UNNEST(subjects, grades) 按位置对齐展开：

student_id=1:
  - 第一组：('数学', 90)
  - 第二组：('英语', 85)
  - 第三组：('物理', 88)

student_id=2:
  - 第一组：('化学', 92)
  - 第二组：('生物', 78)

结果：
+-----------+--------+-------+
| student_id| subject| grade |
+-----------+--------+-------+
| 1         | 数学   | 90    |
| 1         | 英语   | 85    |
| 1         | 物理   | 88    |
| 2         | 化学   | 92    |
| 2         | 生物   | 78    |
+-----------+--------+-------+
```

#### 🆚CROSS JOIN UNNEST()与LATERAL VIEW posexplode()对比

| 特性           | `CROSS JOIN UNNEST(arr1, arr2)` | `LATERAL VIEW posexplode()`组合          |
| ------------ | ------------------------------- | -------------------------------------- |
| **语法简洁性**​   | ⭐⭐⭐⭐⭐ 一行搞定                      | ⭐⭐ 需要多行，复杂                             |
| **按位置对齐**​   | ✅ 自动按位置对齐                       | ❌ 不会自动对齐                               |
| **避免笛卡尔积**​  | ✅ 自动避免                          | ❌ 会产生笛卡尔积，需手动处理                        |
| **可读性**​     | ⭐⭐⭐⭐⭐ 直观易懂                      | ⭐⭐ 需要理解 posexplode 和连接条件               |
| **数组长度检查**​  | ✅ 自动处理长度不匹配，用NULL填充             | ❌ 需要手动处理长度不匹配                          |
| **多字段下的性能**​ | ✅ 单次扫描表<br/>一次操作完成多数组展开         | ❌ 多次扫描表或生成中间结果<br/>需要额外连接操作，可能产生大量中间数据 |

语法对比表

| 场景     | Hive/Spark 2.x 语法                             | SQL标准语法 (Spark 3.0+)                                     |
| ------ | --------------------------------------------- | -------------------------------------------------------- |
| 基本展开   | `LATERAL VIEW explode(arr) t AS elem`         | `CROSS JOIN UNNEST(arr) AS t(elem)`                      |
| 带位置展开  | `LATERAL VIEW posexplode(arr) t AS pos, elem` | `CROSS JOIN UNNEST(arr) WITH ORDINALITY AS t(elem, pos)` |
| 保留空数组  | `LATERAL VIEW OUTER explode(arr) t AS elem`   | `LEFT JOIN UNNEST(arr) AS t(elem) ON true`               |
| 展开多个数组 | 需要多个LATERAL VIEW                              | `CROSS JOIN UNNEST(arr1, arr2) AS t(elem1, elem2)`       |
| 展开Map  | `LATERAL VIEW explode(map) t AS k, v`         | `CROSS JOIN UNNEST(map) AS t(k, v)`                      |

#### 处理数组长度不匹配

**数据源**

| student_id | subjects           | grades       |
| ---------- | ------------------ | ------------ |
| 1          | ['数学', '英语', '物理'] | [90, 85, 88] |
| 2          | ['化学', '生物']       | [92, 78]     |
| 3          | ['历史', '地理', '政治'] | [80, 85]     |

**使用 `CROSS JOIN UNNEST`（自动处理）：**

```sql
-- UNNEST 自动处理长度不匹配
INSERT INTO student_subjects VALUES
(3, ARRAY('历史', '地理', '政治'), ARRAY(80, 85));  -- 长度不匹配

SELECT 
    student_id,
    subject,
    grade
FROM student_subjects
CROSS JOIN UNNEST(subjects, grades) AS t(subject, grade);
```

**结果（自动用NULL填充）：**

```markdown
student_id | subject | grade
-----------|---------|------
3          | 历史    | 80
3          | 地理    | 85
3          | 政治    | NULL  -- 自动用NULL填充
```

**使用 `LATERAL VIEW posexplode`（手动处理）：**

```sql
-- 使用 FULL OUTER JOIN 处理长度不匹配
SELECT 
    COALESCE(s.student_id, g.student_id) AS student_id,
    s.subject,
    g.grade
FROM (
    SELECT student_id, pos, subject
    FROM student_subjects
    LATERAL VIEW posexplode(subjects) s AS pos, subject
) s
FULL OUTER JOIN (
    SELECT student_id, pos, grade
    FROM student_subjects
    LATERAL VIEW posexplode(grades) g AS pos, grade
) g ON s.student_id = g.student_id AND s.pos = g.pos;
```

## 7.5 带位置索引展开 (WITH ORDINALITY)

```sql
-- 使用 WITH ORDINALITY 获取元素位置
SELECT 
    student_id,
    pos,        -- 位置索引（从1开始）
    grade
FROM student_grades
CROSS JOIN UNNEST(grades) WITH ORDINALITY AS t(grade, pos);
```

**数据源**

| student_id | subjects           | grades       |
| ---------- | ------------------ | ------------ |
| 1          | ['数学', '英语', '物理'] | [90, 85, 88] |
| 2          | ['化学', '生物']       | [92, 78]     |

**结果：**

```markdown
+-----------+----+-------+
| student_id| pos| grade |
+-----------+----+-------+
| 1         | 1  | 85    |
| 1         | 2  | 90    |
| 1         | 3  | 92    |
| 2         | 1  | 78    |
| 2         | 2  | 82    |
+-----------+----+-------+
```

## 7.6 展开 Map 类型

```sql
-- 创建包含Map的表
CREATE TABLE student_scores (
    student_id INT,
    scores MAP<STRING, INT>  -- 科目:分数
);

-- 插入数据
INSERT INTO student_scores VALUES
(1, MAP('数学', 90, '英语', 85, '物理', 88)),
(2, MAP('化学', 92, '生物', 78));

-- 展开Map
SELECT 
    student_id,
    subject,
    score
FROM student_scores
CROSS JOIN UNNEST(scores) AS t(subject, score);
```

**数据源**

| student_id | scores                    |
| ---------- | ------------------------- |
| 1          | {'数学':90,'英语':85,'物理':88} |
| 2          | {'化学':92,'生物':78}         |

**结果：**

```markdown
+-----------+--------+-------+
| student_id| subject| score |
+-----------+--------+-------+
| 1         | 数学   | 90    |
| 1         | 英语   | 85    |
| 1         | 物理   | 88    |
| 2         | 化学   | 92    |
| 2         | 生物   | 78    |
+-----------+--------+-------+
```

## 7.7 🔄 高级用法

### ① 多层嵌套展开

```sql
-- 复杂数据结构
CREATE TABLE nested_data (
    id INT,
    data ARRAY<STRUCT<
        name STRING,
        values ARRAY<INT>
    >>
);

-- 插入数据
INSERT INTO nested_data VALUES
(1, ARRAY(
    STRUCT('A', ARRAY(1, 2, 3)),
    STRUCT('B', ARRAY(4, 5))
));
```

两层展开

```sql
SELECT 
    id,
    outer_data.name,
    inner_value
FROM nested_data
CROSS JOIN UNNEST(data) AS outer_data 
CROSS JOIN UNNEST(outer_data.values) AS inner_value;
```

**等价于：**

```sql
SELECT 
    id,
    outer_data.name,
    inner_value
FROM nested_data,
UNNEST(data) AS outer_data,
UNNEST(outer_data.values) AS inner_value;
```

| id  | outer_data.name | inner_value |
| --- | --------------- | ----------- |
| 1   | A               | 1           |
| 1   | A               | 2           |
| 1   | A               | 3           |
| 1   | B               | 1           |
| 1   | B               | 2           |
| 1   | B               | 3           |

### ② 过滤展开后的数据

```sql
-- 只展开特定条件的元素
SELECT 
    student_id,
    grade
FROM student_grades
CROSS JOIN UNNEST(grades) AS t(grade)
WHERE grade > 85;  -- 只保留大于85的成绩
```

### ③ 聚合与展开组合

```sql
-- 计算每个学生的平均分
SELECT 
    student_id,
    name,
    AVG(grade) AS avg_grade
FROM student_grades
CROSS JOIN UNNEST(grades) AS t(grade)
GROUP BY student_id, name;
```
