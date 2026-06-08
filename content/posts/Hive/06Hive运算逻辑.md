---
title: "【六】Hive 运算逻辑：数学 / 逻辑 / 条件 / 日期 / 字符串函数"
date: 2026-05-20T22:47:22+08:00
draft: false
tags: ["Hive", "运算符", "条件函数", "日期函数", "字符串函数"]
categories: ["Hive"]
description: "全面梳理 Hive 的数学运算、逻辑运算、条件函数（IF/CASE/COALESCE/NVL）、日期函数（时间戳互转/加减/截断）以及字符串函数（截取/拼接/正则/JSON 解析）的语法与易错点"
---

## 一、数学运算（Arithmetic Operations）

Hive 支持标准 SQL 的数学运算符，用于数值计算。

### 1.1 基本算术运算符

```sql
-- 加、减、乘、除、取余
SELECT 
    10 + 5 AS addition,           -- 15
    10 - 5 AS subtraction,        -- 5  
    10 * 5 AS multiplication,     -- 50
    10 / 3 AS division,           -- 3.3333
    10 % 3 AS modulus,            -- 1
    10 DIV 3 AS integer_division  -- 3 (Hive 3.0+)
FROM table_name LIMIT 1;
```

### 1.2 数学函数

```sql
-- 常用数学函数
SELECT
    ABS(-10) AS absolute,          -- 10（绝对值）
    ROUND(3.14159, 2) AS round2,   -- 3.14（四舍五入）
    CEIL(3.2) AS ceiling,          -- 4（向上取整）
    FLOOR(3.8) AS floor,           -- 3（向下取整）
    POWER(2, 3) AS power,          -- 8.0（平方）
    SQRT(16) AS sqrt,              -- 4.0（开根）
    EXP(1) AS exp,                 -- 2.71828（e的n次方）
    LN(10) AS ln,                  -- 2.30259（log2）
    LOG10(100) AS log10,           -- 2.0（log10）
    RAND() AS random,              -- 0.0~1.0随机数（随机数）
    SIGN(-5) AS sign_negative      -- -1（符号函数（取正负号））
FROM table_name LIMIT 1;
```

### 1.3 三角函数

```sql
-- 角度弧度转换
SELECT
    SIN(RADIANS(30)) AS sin30,     -- 0.5
    COS(0) AS cos0,                -- 1.0
    TAN(PI()/4) AS tan45,          -- 1.0
    DEGREES(PI()) AS degrees       -- 180.0
FROM table_name LIMIT 1;
```

## 二、逻辑运算（Logical Operations）

用于条件判断和布尔运算，返回 TRUE/FALSE/NULL。

### 2.1 比较运算符

支持：

等值(=)、不等值(!= 或 <>)、小于(<)、小于等于(<=)、大于(>)、大于等于(>=)

字符串比较（字典序）

BETWEEN

LIKE 模糊匹配

```sql
SELECT
    -- 数值比较
    10 > 5 AS greater_than,        -- TRUE
    10 <= 10 AS less_equal,        -- TRUE
    10 != 5 AS not_equal,          -- TRUE
    10 <> 5 AS not_equal2,         -- TRUE

    -- 字符串比较（字典序）
    'apple' < 'banana' AS str_compare,  -- TRUE

    -- BETWEEN
    15 BETWEEN 10 AND 20 AS between,   -- TRUE

    -- IN
    'red' IN ('red', 'blue', 'green') AS in_set,  -- TRUE

    -- LIKE 模糊匹配
    'hello' LIKE 'he%' AS like_match,  -- TRUE
    'data' LIKE 'd_t_' AS like_single  -- TRUE
FROM table_name LIMIT 1;
```

### 2.2 逻辑运算符

```sql
SELECT
    -- AND/OR/NOT
    (10 > 5) AND (3 < 4) AS and_result,   -- TRUE
    (10 < 5) OR (3 < 4) AS or_result,      -- TRUE
    NOT (10 < 5) AS not_result,            -- TRUE

    -- 处理 NULL
    NULL IS NULL AS is_null,               -- TRUE
    NULL IS NOT NULL AS is_not_null,       -- FALSE

    -- 特殊NULL处理函数
    COALESCE(NULL, 'default') AS coalesce,  -- 'default'
    NVL(NULL, 'backup') AS nvl_result,      -- 'backup'
    NULLIF(10, 10) AS nullif_same,          -- NULL
    NULLIF(10, 5) AS nullif_diff            -- 10
FROM table_name LIMIT 1;
```

### 2.3 CASE 条件表达式

```sql
-- 简单CASE
SELECT 
    user_id,
    CASE age
        WHEN age < 18 THEN '未成年'
        WHEN age BETWEEN 18 AND 35 THEN '青年'
        WHEN age BETWEEN 36 AND 60 THEN '中年'
        ELSE '老年'
    END AS age_group
FROM users;

-- 搜索CASE
SELECT
    order_id,
    amount,
    CASE
        WHEN amount > 1000 THEN '大额'
        WHEN amount > 500 THEN '中额'
        WHEN amount > 0 THEN '小额'
        ELSE '异常'
    END AS amount_level
FROM orders;
```

## 三、数值运算与聚合

### 3.1 类型转换函数

```sql
SELECT
    CAST('123' AS INT) AS cast_int,        -- 123
    CAST(123.456 AS DECIMAL(5,2)) AS cast_decimal,  -- 123.46
    CONVERT('123.45', DOUBLE) AS convert_double,    -- 123.45
    -- 隐式转换（自动）
    10 + '5' AS implicit_cast              -- 15.0
FROM table_name LIMIT 1;
```

### 3.2 聚合计算

```sql
-- 基本聚合
SELECT
    COUNT(*) AS total_count,
    COUNT(DISTINCT user_id) AS distinct_users,
    SUM(amount) AS total_amount,
    AVG(amount) AS avg_amount,
    MIN(amount) AS min_amount,
    MAX(amount) AS max_amount,
    VARIANCE(amount) AS variance_amount,
    STDDEV(amount) AS stddev_amount
FROM transactions
WHERE dt = '2023-10-01';

-- 分组聚合
SELECT
    department,
    AVG(salary) AS avg_salary,
    PERCENTILE_APPROX(salary, 0.5) AS median_salary  -- 近似中位数
FROM employees
GROUP BY department;
```

### 3.3 窗口计算（具体详见另一篇：Hive函数）

[【七】Hive 函数：聚合 / 统计 / 分位数 / 集合 / 高级分组](https://eleanora-lyh.github.io/MyLearningNotes/posts/hive/07hive%E5%87%BD%E6%95%B0/)

```sql
-- 窗口函数（分析函数）
SELECT
    user_id,
    order_date,
    amount,
    SUM(amount) OVER (
        PARTITION BY user_id 
        ORDER BY order_date 
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_total,
    AVG(amount) OVER (PARTITION BY user_id) AS user_avg,
    RANK() OVER (PARTITION BY product_id ORDER BY amount DESC) AS sales_rank
FROM orders;
```

---

## 四、条件函数（Conditional Functions）

### 4.1 函数清单一览

| 函数                     | 语法                                                           | 作用                    |
| ---------------------- | ------------------------------------------------------------ | --------------------- |
| `IF`                   | `IF(boolean testCondition, T valueTrue, T valueFalseOrNull)` | 二选一分支                 |
| `COALESCE`             | `COALESCE(T v1, T v2, ...)`                                  | 返回第一个非 NULL 值         |
| `NVL`                  | `NVL(T value, T default_value)`                              | 如果是 NULL 返回默认值        |
| `CASE WHEN`            | `CASE WHEN c1 THEN r1 WHEN c2 THEN r2 ELSE rN END`           | 多分支判断                 |
| `CASE 字段`              | `CASE col WHEN v1 THEN r1 ELSE rN END`                       | 等值多分支                 |
| `NULLIF`               | `NULLIF(a, b)`                                               | 当 a=b 时返回 NULL，否则返回 a |
| `ISNULL` / `ISNOTNULL` | `ISNULL(a)`                                                  | 判断是否为 NULL            |
| `assert_true`          | `assert_true(boolean)`                                       | 断言为真，否则抛异常（常用于数据校验）   |

---

### 4.2 详解 + 示例

#### ① IF

```sql
SELECT IF(score >= 60, '及格', '不及格') AS result FROM students;
-- 注意：valueTrue 和 valueFalse 必须类型一致或可隐式转换

SELECT IF(1=1, 'a', 100); -- 会报错或隐式转 string
```

#### ② COALESCE（最常用！）

返回第一个非 NULL 的值,如果所有值都为NULL，那么返回NULL

```sql
SELECT COALESCE(phone, email, '未知联系方式') FROM user_info;
-- 先判断 phone，若非 NULL 则返回 phone；
-- 若 phone为 NULL，则判断 email，若非 NULL 则返回 email；
-- 若 phone和 email都为 NULL，则返回字符串 '未知联系方式'。
```

👉 **场景**：多字段降级取值、空值兜底。

#### ③ NVL（COALESCE 的简化版，只支持两个参数）

```sql
SELECT NVL(salary, 0) FROM emp;
-- 等价于 COALESCE(salary, 0)
-- 如果 salary字段不为 NULL，就返回 salary的值；
-- 如果 salary为 NULL，就返回 0
```

#### ④ CASE WHEN（最灵活）

```sql
-- 写法一：搜索式（条件可以是任意表达式）
SELECT
CASE
WHEN score >= 90 THEN 'A'
WHEN score >= 80 THEN 'B'
WHEN score >= 60 THEN 'C'
ELSE 'D'
END AS grade
FROM students;

-- 写法二：简单式（只能做等值判断）
SELECT
CASE gender
WHEN 'M' THEN '男'
WHEN 'F' THEN '女'
ELSE '未知'
END
FROM user_info;
```

👉 **易错点**：`CASE` 必须以 `END` 结尾；多个 `WHEN` 命中时只返回**第一个**。

#### ⑤ NULLIF

为0则返回NULL

```sql
SELECT NULLIF(a, 0); -- 当 a=0 时返回 NULL，避免除零

SELECT amount / NULLIF(qty, 0) FROM orders; -- 经典防除零写法
```

#### ⑥ ISNULL / ISNOTNULL

过滤指定值为NULL的数据行

```sql
SELECT * FROM t WHERE ISNULL(col);
SELECT * FROM employee WHERE col IS NULL;

SELECT * FROM t WHERE ISNOTNULL(col); -- 等价于 col IS NOT NULL
SELECT * FROM employee WHERE col IS NOT NULL;
```

---

### 4.3 易错点 ⚠️

1. **类型一致性**：`IF`、`CASE` 返回的多个分支必须是兼容类型，否则报错或隐式转换出错。
2. **NULL 比较**：`NULL = NULL` 结果是 NULL（不是 true），所以 `CASE WHEN col = NULL` 永远不命中，必须用 `IS NULL`。
3. **短路求值**：`COALESCE` 是短路的，但所有参数会先做类型检查。

---

## 五、日期函数（Date Functions）

Hive 中日期可以是 `DATE`（仅日期）、`TIMESTAMP`（含时间）、`STRING`（'yyyy-MM-dd HH:mm:ss' 格式）三种形式，函数大多对字符串友好。

### 5.1 函数清单一览（按用途分类）

#### 📌 获取当前时间

| 函数                    | 返回                         |
| --------------------- | -------------------------- |
| `current_date()`      | 当前日期，DATE                  |
| `current_timestamp()` | 当前时间戳，TIMESTAMP            |
| `unix_timestamp()`    | 当前时区的 Unix 秒数（已不推荐，因为非确定性） |

#### 📌 时间戳 ↔ 字符串/日期 转换

| 函数                                            | 说明                                             |
| --------------------------------------------- | ---------------------------------------------- |
| `unix_timestamp(string date[, pattern])`      | 字符串 → Unix 秒（默认 `yyyy-MM-dd HH:mm:ss`）转换失败则返回0 |
| `unix_timestamp(string date, string pattern)` | 自定义格式 → Unix 秒                                 |
| `from_unixtime(bigint unixtime[, pattern])`   | Unix 秒 → 字符串,pattern为yyyyMMdd                  |
| `to_date(string ts)`                          | 截取日期部分                                         |
| `to_unix_timestamp(...)`                      | 确定性版本（推荐）                                      |

#### 📌 日期组件提取

| 函数                               | 说明            |
| -------------------------------- | ------------- |
| `year(date)`                     | 取年            |
| `month(date)`                    | 取月            |
| `day(date)` / `dayofmonth(date)` | 取日            |
| `hour/minute/second(date)`       | 取时/分/秒        |
| `weekofyear(date)`               | 年内第几周         |
| `dayofweek(date)`                | 星期几（1=Sunday） |
| `quarter(date)`                  | 季度            |

#### 📌 日期运算

| 函数                           | 说明            |
| ---------------------------- | ------------- |
| `datediff(end, start)`       | 相差天数          |
| `date_add(date, n)`          | 加 n 天         |
| `date_sub(date, n)`          | 减 n 天         |
| `add_months(date, n)`        | 加 n 月         |
| `months_between(d1, d2)`     | 相差月份（含小数）     |
| `last_day(date)`             | 当月最后一天        |
| `next_day(date, 'MO')`       | 下一个周一         |
| `trunc(date, 'MM'/'YY')`     | 截断到月/年（月初/年初） |
| `date_format(date, pattern)` | 格式化输出         |

---

### 5.2 详解 + 示例

#### ① 当前时间

```sql
SELECT current_date(); -- 2026-05-25

SELECT current_timestamp(); -- 2026-05-25 21:42:41.123

SELECT unix_timestamp(); -- 1748180561（秒）
```

#### ② Unix 时间戳 ↔ 字符串（最常用！）

```sql
-- 字符串 → Unix 秒
SELECT unix_timestamp('2026-05-25 21:42:41'); -- 默认格式
SELECT unix_timestamp('2026/05/25', 'yyyy/MM/dd'); -- 自定义格式

-- Unix 秒 → 字符串
SELECT from_unixtime(1748180561); -- '2026-05-25 21:42:41'
SELECT from_unixtime(1748180561, 'yyyy-MM-dd'); -- '2026-05-25'
```

显示更多行

👉 **结合你的项目**：Cosmos 时间戳（毫秒）→ Hive 友好的字符串经常需要 `from_unixtime(ts/1000, 'yyyy-MM-dd HH')` 这类写法。

#### ③ 日期组件提取

```sql
SELECT year('2026-05-25'), -- 2026
month('2026-05-25'), -- 5
day('2026-05-25'), -- 25
weekofyear('2026-05-25'), -- 21
quarter('2026-05-25'); -- 2
```

#### ④ 日期加减

```sql
SELECT date_add('2026-05-25', 7); -- 2026-06-01

SELECT date_sub('2026-05-25', 7); -- 2026-05-18

SELECT add_months('2026-05-25', 1); -- 2026-06-25

SELECT datediff('2026-05-25', '2026-05-01'); -- 24

SELECT months_between('2026-05-25', '2026-01-01'); -- 4.77...
```

#### ⑤ 截断 & 格式化

```sql
SELECT trunc('2026-05-25', 'MM'); -- 2026-05-01（月初）

SELECT trunc('2026-05-25', 'YY'); -- 2026-01-01（年初）

SELECT last_day('2026-05-25'); -- 2026-05-31

SELECT date_format('2026-05-25', 'yyyyMMdd'); -- '20260525'

SELECT date_format('2026-05-25 21:42:41', 'yyyy-MM-dd HH:00:00'); -- 小时桶
```

#### ⑥ 时区处理

```sql
-- from_utc_timestamp / to_utc_timestamp
SELECT from_utc_timestamp('2026-05-25 13:42:41', 'Asia/Shanghai');
-- → '2026-05-25 21:42:41'（UTC + 8h）

SELECT to_utc_timestamp('2026-05-25 21:42:41', 'Asia/Shanghai');
-- → '2026-05-25 13:42:41'
```

---

### 5.3 易错点 ⚠️

1. **`unix_timestamp()` 无参版本是非确定性函数**：在 MapReduce 中可能每个分片得到不同的值，Hive 2.0+ 推荐用 `current_timestamp()` 或 `to_unix_timestamp()`。
2. **格式 pattern 大小写敏感**：`yyyy`（年）、`MM`（月）、`mm`（分钟）、`HH`（24h）、`hh`（12h），写错就全错。
3. **日期相减不是 `date1 - date2`**，必须用 `datediff`。
4. **`dayofweek` 默认 Sunday=1**，不是 Monday=1。
5. **NULL 输入**：所有日期函数对 NULL 输入返回 NULL。

---

## 六、字符串函数（String Functions）

### 6.1 函数清单一览（按用途分类）

#### 📌 长度 & 大小写

| 函数                      | 说明            |
| ----------------------- | ------------- |
| `length(s)`             | 字符长度（中文按字符计数） |
| `lower(s)` / `lcase(s)` | 转小写           |
| `upper(s)` / `ucase(s)` | 转大写           |
| `initcap(s)`            | 首字母大写         |

#### 📌 截取 & 拼接

| 函数                                      | 说明                                               |
| --------------------------------------- | ------------------------------------------------ |
| `substr(s, start[, len])` / `substring` | 截取子串（**从 1 开始**）                                 |
| `concat(s1, s2, ...)`                   | 拼接，任一为 NULL 则结果为 NULL                            |
| `concat_ws(sep, s1, s2, ...)`           | 用分隔符拼接，**自动忽略 NULL**<br/>"ws" 是 "with separator" |

#### 📌 去空格 & 填充

| 函数                           | 说明       |
| ---------------------------- | -------- |
| `trim(s)`                    | 去两端空格    |
| `ltrim(s)` / `rtrim(s)`      | 去左/右空格   |
| `lpad(s, len, pad)` / `rpad` | 左/右补齐    |
| `space(n)`                   | 生成 n 个空格 |
| `repeat(s, n)`               | 重复 n 次   |
| `reverse(s)`                 | 反转       |

#### 📌 查找 & 替换

| 函数                              | 说明                                    |
| ------------------------------- | ------------------------------------- |
| `instr(s, substr)`              | 子串首次出现位置（从 1 开始，0=未找到）                |
| `locate(substr, s[, pos])`      | 同 instr，可指定起始位置                       |
| `replace(s, old, new)`          | 普通替换                                  |
| `regexp_replace(s, regex, new)` | 正则替换，s中符合regex的替换为new                 |
| `regexp_extract(s, regex, idx)` | 通过正则表达式提取字符串匹配部分<br/>idx=0：返回整个匹配的字符串 |
| <br/>idx=1：返回第一个捕获组             |                                       |
| <br/>idx=2：返回第二个捕获组             |                                       |
| `regexp(s, regex)`              | 正则匹配（Hive 2.0+）                       |

#### 📌 拆分 & 解析

| 函数                                            | 说明                                            |
| --------------------------------------------- | --------------------------------------------- |
| `split(s, regex)`                             | 拆成数组                                          |
| `parse_url(url, partKey[, key])`              | 解析 URL，partKey为要提取的部分，可以是以下值（不区分大小写）：         |
| <br/>`HOST`：主机名                               |                                               |
| <br/>`PATH`：路径                                |                                               |
| <br/>`QUERY`：查询字符串                            |                                               |
| <br/>`REF或 FRAGMENT`：锚点部分                     |                                               |
| <br/>`PROTOCOL`：协议                            |                                               |
| <br/>`AUTHORITY`：授权机构                         |                                               |
| <br/>`FILE`：文件名                               |                                               |
| <br/>`USERINFO`：用户信息                          |                                               |
| <br/>`QUERY:<key>`：查询参数中指定key的值（需要指定第三个参数key） |                                               |
| `get_json_object(json, '$.path')`             | 从JSON字符串中提取指定路径的值，能处理嵌套的JSON                  |
| `json_tuple(json, k1, k2, ...)`               | 一次提取多个 JSON 字段（更高效），但注意，它不能处理嵌套的JSON，只能提取顶层的键 |

#### 📌 编码 & 类型转换

| 函数                                          | 说明         |
| ------------------------------------------- | ---------- |
| `cast(x as string)`                         | 类型转换       |
| `base64(binary)` / `unbase64(s)`            | Base64 编解码 |
| `encode(s, charset)` / `decode(b, charset)` | 字符集编码      |
| `ascii(s)`                                  | 取首字符 ASCII |

---

### 6.2 详解 + 示例

#### ① 长度与大小写

```sql
SELECT length('hello世界'); -- 7（按字符算）

SELECT upper('abc'), lower('ABC'), initcap('hello world');
-- 'ABC', 'abc', 'Hello World'
```

#### ② 截取与拼接

```sql
-- 注意：Hive substr 索引从 1 开始
SELECT substr('abcdef', 2, 3); -- 'bcd'

SELECT substr('abcdef', -3); -- 'def'（负数从右数）

SELECT concat('a', 'b', 'c'); -- 'abc'

SELECT concat('a', NULL, 'c'); -- NULL ⚠️

SELECT concat_ws('-', 'a', NULL, 'c'); -- 'a-c'（自动忽略 NULL）

SELECT concat_ws(',', array('a', 'b', 'c')); -- 'a,b,c'（拼数组）
```

#### ③ 去空格 & 填充

```sql
SELECT trim(' hello '); -- 'hello'

SELECT lpad('5', 3, '0'); -- '005'（左补 0）

SELECT rpad('abc', 6, '*'); -- 'abc***'

SELECT repeat('ab', 3); -- 'ababab'

SELECT reverse('hello'); -- 'olleh'
```

#### ④ 查找与替换

```sql
-- 从头开始查找字符o的出现位置(索引从1开始)
SELECT instr('hello world', 'o'); -- 5

-- 指定起始位置为6，开始搜索字符o
SELECT locate('o', 'hello world', 6); -- 8

-- 将字符串中-替换为_
SELECT replace('a-b-c', '-', '_'); -- 'a_b_c'

-- 正则替换（脱敏经典场景）
SELECT regexp_replace('13812345678', '(\\d{3})\\d{4}(\\d{4})', '$1****$2');
-- '138****5678'

-- 正则提取
SELECT regexp_extract('order_20260525_001', '(\\d{8})', 1); -- '20260525'
```

👉 **注意**：Hive 中正则 `\d` 要写成 `\\d`（双反斜杠转义）。

#### ⑤ 拆分与 JSON

```sql
SELECT split('a,b,c', ','); -- ['a','b','c']

SELECT split('a,b,c', ',')[1]; -- 'b'

-- JSON 提取
SELECT get_json_object('{"name":"Tom","age":18}', '$.name'); -- 'Tom'

-- 一次提多个字段（推荐，性能好）
SELECT b.name, b.age
FROM (SELECT '{"name":"Tom","age":18}' AS json) t
LATERAL VIEW json_tuple(t.json, 'name', 'age') b AS name, age;
```

#### ⑥ URL 解析

```sql
SELECT parse_url('https://www.bing.com/search?q=hive', 'HOST'); -- 'www.bing.com'

SELECT parse_url('https://www.bing.com/search?q=hive', 'QUERY', 'q'); -- 'hive'SELECT parse_url('https://www.bing.com/search?q=hive', 'HOST'); -- 'www.bing.com'

SELECT parse_url('https://www.bing.com/search?q=hive', 'QUERY', 'q'); -- 'hive'
```

---

### 6.3 易错点 ⚠️

1. **`concat` 遇 NULL 全 NULL**：拼接字段时强烈建议用 `concat_ws` 或先 `COALESCE` 兜底。
2. **`substr` 索引从 1 开始**，不是 0（和很多编程语言不同）。
3. **正则要双重转义**：`\d` → `\\d`，`\.` → `\\.`。
4. **`split` 第二个参数是正则**：拆分 `.`、`|`、`+` 等特殊字符要转义，如 `split(s, '\\.')`。
5. **`length` 统计字符数，不是字节数**：UTF-8 中文一个字符是 3 字节，但 `length` 返回 1。

---

### 6.4 速查表（按使用频率排序）

| 排名   | 函数                                  | 类别  | 用途      |
| ---- | ----------------------------------- | --- | ------- |
| 🔥1  | `COALESCE` / `NVL`                  | 条件  | 空值兜底    |
| 🔥2  | `CASE WHEN`                         | 条件  | 多分支判断   |
| 🔥3  | `date_format`                       | 日期  | 任意格式化   |
| 🔥4  | `from_unixtime` / `unix_timestamp`  | 日期  | 时间戳互转   |
| 🔥5  | `datediff` / `date_add`             | 日期  | 日期算术    |
| 🔥6  | `concat_ws`                         | 字符串 | 安全拼接    |
| 🔥7  | `substr`                            | 字符串 | 截取      |
| 🔥8  | `regexp_replace` / `regexp_extract` | 字符串 | 正则处理    |
| 🔥9  | `split`                             | 字符串 | 拆分      |
| 🔥10 | `get_json_object`                   | 字符串 | JSON 解析 |
