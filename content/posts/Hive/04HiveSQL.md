---
title: "【四】HiveSQL 语法大全"
date: 2026-05-17T22:37:02+08:00
draft: false
tags: ["Hive", "HiveSQL", "DDL", "DQL", "数据仓库"]
categories: ["Hive"]
description: "系统梳理 Hive 数据库 / 表的 DDL（建库、建表、内外部表、分区、分桶、CTAS）以及 DQL 查询语法（SELECT、WHERE、GROUP BY、各种排序、JOIN、UNION 等）"
---

## 一、对 Hive 数据库（Database / Schema）的操作

在 Hive 里，**Database** 和 **Schema** 是同义词，本质是 HDFS 上的一个目录（默认在 `/user/hive/warehouse/<db_name>.db`），用于隔离表的命名空间。

### 1. 创建数据库

```sql
CREATE DATABASE [IF NOT EXISTS] db_name
[COMMENT '数据库描述']
[LOCATION 'hdfs_path'] -- 自定义 HDFS 存储路径
[WITH DBPROPERTIES ('key1'='value1', ...)]; -- 附加元数据
```

**示例：**

```sql
CREATE DATABASE IF NOT EXISTS tcec_dw
COMMENT 'TCEC 数据仓库'
LOCATION '/warehouse/tcec_dw.db'
WITH DBPROPERTIES ('owner'='liuyuhang', 'created'='2026-05-17');
```

显示更多行

> 📌 **要点**：不指定 `LOCATION` 时，默认路径为 `hive.metastore.warehouse.dir` 配置项 + `db_name.db`。

### 2. 查看数据库

| 操作     | 语法                                | 说明                          |
| ------ | --------------------------------- | --------------------------- |
| 列出所有库  | `SHOW DATABASES;`                 | 类似 MySQL 的 `SHOW DATABASES` |
| 模糊匹配   | `SHOW DATABASES LIKE 'tcec*';`    | 支持通配符                       |
| 查看库详情  | `DESC DATABASE db_name;`          | 显示路径、owner                  |
| 查看完整信息 | `DESC DATABASE EXTENDED db_name;` | 额外显示 DBPROPERTIES           |
| 查看当前库  | `SELECT current_database();`      | 当前会话所在库                     |

### 3. 切换数据库

```sql
USE db_name;
```

### 4. 修改数据库

Hive 数据库的**元数据大部分不可修改**（如名字、位置），只能改属性和 owner：

```sql
ALTER DATABASE db_name SET DBPROPERTIES ('edited-by'='liu', 'createtime'='20260515');

ALTER DATABASE db_name SET OWNER USER liuyuhang;

ALTER DATABASE db_name SET LOCATION 'hdfs://new_path'; -- Hive 2.2.1+ 支持
```

### 5. 删除数据库

```sql
DROP DATABASE [IF EXISTS] db_name [RESTRICT | CASCADE];
```

| 模式             | 行为                     |
| -------------- | ---------------------- |
| `RESTRICT`（默认） | 库里**有表则报错**，必须先清空      |
| `CASCADE`      | **级联删除**库下所有表（⚠️ 生产慎用） |

```sql
DROP DATABASE IF EXISTS tcec_dw CASCADE;
```

---

## 二、对数据表（Table）的操作

Hive 表分为：**内部表（Managed Table）**、**外部表（External Table）**、**分区表（Partitioned）**、**分桶表（Bucketed）**、**临时表（Temporary）**。

### 2.1 创建表

#### 2.1.1 完整建表语法

```sql
CREATE [TEMPORARY] [EXTERNAL] TABLE [IF NOT EXISTS] [db_name.]table_name
( col_name data_type [COMMENT '列注释'], ... )
[COMMENT '表注释']

[PARTITIONED BY (col_name data_type, ...)] -- 分区

[CLUSTERED BY (col_name, ...)
[SORTED BY (col_name [ASC|DESC], ...)]

INTO num_buckets BUCKETS] -- 分桶

[ROW FORMAT DELIMITED -- 指定分隔符
FIELDS TERMINATED BY ',' 

COLLECTION ITEMS TERMINATED BY '|'
MAP KEYS TERMINATED BY ':'
LINES TERMINATED BY '\n'] -- 行格式

[STORED AS TEXTFILE | ORC | PARQUET | SEQUENCEFILE | AVRO] -- 存储格式

[LOCATION 'hdfs_path'] -- 数据位置

[TBLPROPERTIES ('key'='value', ...)]; -- 表属性
```

#### 2.1.2 内部表 vs 外部表

| 维度              | 内部表（Managed）          | 外部表（External）           |
| --------------- | --------------------- | ----------------------- |
| 关键字             | `CREATE TABLE`        | `CREATE EXTERNAL TABLE` |
| 数据归属            | Hive 管理数据生命周期         | Hive 仅管理元数据             |
| `DROP TABLE` 影响 | **同时删除元数据 + HDFS 数据** | **只删元数据，HDFS 数据保留**     |
| 典型场景            | 中间结果、临时数仓表            | ODS 层原始数据、共享数据          |

- 内部表
  
  ```sql
  CREATE TABLE dws_user_order (
  user_id BIGINT COMMENT '用户ID',
  order_cnt INT,
  total_amt DECIMAL(18,2)
  )
  STORED AS ORC
  TBLPROPERTIES ('orc.compress'='SNAPPY');
  ```

- 外部表（指向已存在的 HDFS 数据）
  
  ```sql
  CREATE EXTERNAL TABLE ods_user_log (
  user_id BIGINT,
  action STRING,
  ts STRING
  )
  ROW FORMAT DELIMITED FIELDS TERMINATED BY '\t'
  LOCATION '/data/raw/user_log/';
  ```

#### 2.1.3 分区表

```sql
CREATE TABLE dwd_order (
order_id BIGINT,
user_id BIGINT,
amount DECIMAL(18,2)
)
PARTITIONED BY (dt STRING, region STRING) -- 二级分区
STORED AS PARQUET;
```

在HDFS上，分区会体现为目录结构：

```text
/user/hive/warehouse/dwd_order/
├── dt=2024-05-17/
│   ├── region=Chengdu/
│   │   └── 000000_0  (Parquet文件)
│   ├── region=Beijing/
│   └── region=Shanghai/
```

> 📌 分区字段**不出现在普通列中**，它们的**值**是通过目录名体现的，本质是 HDFS 上的子目录：`/dt=2026-05-17/region=cn/`。

错误案例：

```sql
-- 错误示例：CTAS缺少分区字段
CREATE TABLE employee_partitioned
PARTITIONED BY (dept STRING, year INT)
AS
SELECT id, name, salary  -- 只有3个字段，但表需要5个字段（3个普通+2个分区）
FROM source_table;
```

**报错信息**（Hive 3.x）：`FAILED: SemanticException [Error 10044]: Line 1:18 Insert to partition columns requires all partition columns to be specified in the SELECT expression. Specified: id,name,salary; Missing: dept,year`

**原因**：分区字段的值必须来自查询结果。Hive不知道如何为每条记录分配 `dept='?'`和 `year=?`

**加载数据到分区**

```sql
LOAD DATA LOCAL INPATH '/path/to/data_china_0517.csv'
INTO TABLE dwd_order s
PARTITION (dt='2024-05-17', region='2024-05-17China');
```

**查询分区表**

查询时，在`WHERE`中使用分区字段作为条件，才能触发分区裁剪。

```sql
-- 高效查询：只扫描‘China’分区下的‘2024-05-17’子目录
SELECT * FROM dwd_order 
WHERE region='China' AND dt='2024-05-17';
```

**查看分区**

```sql
show partitions dwd_order;
```

**添加分区**

添加分区的字段必须之前在表中存在否则会报错

```sql
ALTER TABLE dwd_order ADD
PARTITION(dt='2024-05-17', region='Chengdu')
PARTITION(dt='2024-05-17', region='Beijing')
PARTITION(dt='2024-05-17', region='Shanghai');
```

**删除分区**

DROP PARTITION

```sql
-- 这将删除 dt='2024-05-17' 下的所有region分区
ALTER TABLE dwd_order DROP PARTITION(dt='2024-05-17');

-- 或者删除多个指定分区
ALTER TABLE dwd_order DROP PARTITION(dt='2024-05-17', region='Chengdu'), PARTITION(dt='2024-05-17', region='Beijing');


-- 删除所有以特定模式匹配的分区
ALTER TABLE dwd_order DROP PARTITION(dt='2024-05-*');
ALTER TABLE dwd_order DROP PARTITION(region LIKE 'Cheng%');
```

TRUNCATE PARTITION

```sql
-- TRUNCATE PARTITION: 只删除数据，保留分区结构
TRUNCATE TABLE dwd_order PARTITION(dt='2024-05-17');
-- 执行后，分区目录还存在，但里面的数据文件被清空
```

**动态分区**

**动态分区**​ 是指Hive在执行`INSERT`操作时，**根据SELECT语句中某几列的值，自动决定数据应该写入哪个分区**，而无需手动为每条数据指定分区值。

```sql
-- 静态分区：需要明确指定分区值
INSERT INTO sales PARTITION (dt='2024-05-17', region='Chengdu')
SELECT order_id, amount FROM source_table WHERE dt='2024-05-17' AND region='Chengdu';

-- 动态分区：分区值从数据中自动提取
INSERT INTO sales PARTITION (dt, region)
SELECT order_id, amount, dt, region FROM source_table;

-- 常用模式：一级静态分区 + 二级动态分区
INSERT OVERWRITE TABLE user_behavior PARTITION (dt='2024-05-17', province)
SELECT 
    user_id,
    action,
    province  -- 动态分区字段
FROM source_table
WHERE dt = '2024-05-17';
-- 结果：在 dt=2024-05-17 下，按province自动创建子分区
```

动态分区的核心配置参数

```sql
-- 1. 启用动态分区（必须）
SET hive.exec.dynamic.partition=true;

-- 2. 设置分区模式（重要！）
SET hive.exec.dynamic.partition.mode=nonstrict;
-- strict: 必须至少有一个静态分区（安全但繁琐）
-- nonstrict: 允许所有分区都是动态的（生产常用）

-- 3. 控制最大分区数（防止创建过多分区）
SET hive.exec.max.dynamic.partitions=10000;  -- 总共允许的最大动态分区数
SET hive.exec.max.dynamic.partitions.pernode=1000;  -- 每个Mapper/Reducer允许的最大分区数

-- 4. 控制文件数量
SET hive.exec.max.created.files=100000;  -- 整个作业允许创建的最大文件数

-- 5. 错误处理
SET hive.error.on.empty.partition=false;  -- 是否在动态分区插入产生空分区时报错
```

#### 2.1.4 分桶表

分桶的本质是在数据写入时，通过**计算**指定字段的哈希值，将哈希值相同的分到同一个桶（值相同则一定在同一个桶，但同一个桶的值不一定相同），每个桶对应一个文件。这需要读取、计算哈希、排序、写入等多个步骤。

分桶可以提高`JOIN` 查询和抽样效率，详见 [Hive分桶.md](.\Hive分桶.md)

```sql
-- 1. 开启分桶约束（老版本需要，新版本Hive默认开启）
SET hive.enforce.bucketing = true;
-- 2. 设置Reduce任务数等于桶数，确保能生成对应数量的文件
SET mapreduce.job.reduces = 32; -- 注意：这里应该设置为32，与INTO 32 BUCKETS对应

CREATE TABLE dwd_user (
    user_id BIGINT,
    name STRING
)
-- 3. 核心定义：此表根据user_id的哈希值，将数据分散到32个桶文件中
CLUSTERED BY (user_id)
-- 4. 在每个桶文件内部，数据按照user_id升序排列
SORTED BY (user_id)
-- 5. 总共创建32个桶
INTO 32 BUCKETS
-- 6. 数据以ORC列式存储格式保存，以获得最佳的压缩和查询性能
STORED AS ORC;
```

> 📌 分桶字段**必须是表中已有列**，根据 `hash(col) % num_buckets` 分配到不同文件。配合你之前学的 **Bucket Map Join / SMB Join** 来优化大表 JOIN。

`hdfs dfs -put`  和 `LOAD DATA INPATH`都无法加载数据到分桶表，需要使用`INSERT OVERWRITE`

1. **hdfs dfs -put 的问题**（纯文件移动）

```bash
# 这只是简单的文件复制，Hive完全无法控制
hdfs dfs -put /local/user.txt /user/hive/warehouse/dwd_user/
```

**问题所在**：

- 你上传的文件可能包含多个用户的混合数据

- Hive不知道如何将文件内容分配到32个桶中

- 文件格式不匹配（ORC格式需要特殊的二进制编码）

- 没有桶的元数据信息（如索引、统计信息）

**结果**：Hive会把这个文件当成一个普通文件，**分桶功能完全失效**。

2. **LOAD DATA 的问题**（格式转换但无计算）

```sql
-- 这只会移动和转换数据格式，但不会计算分桶
LOAD DATA INPATH '/input/user.txt' INTO TABLE dwd_user;
```

**`LOAD DATA`实际上做了什么**：

1. 将HDFS上的源文件移动到表目录

2. 如果格式不同，会做简单转换

3. **但不会执行MapReduce计算**

**为什么不行**：

- 没有对`user_id`计算哈希值

- 没有按哈希值分配数据到不同桶

- 没有在每个桶内排序

- 没有生成ORC的复杂结构（索引、统计信息等）
3. **INSERT OVERWRITE 为什么能行**

```sql
-- 这才是正确的分桶表数据加载方式
INSERT OVERWRITE TABLE dwd_user
SELECT user_id, name FROM source_table;
```

**这个过程发生了什么**（简化版）：

```sql
-- 1. 启动MapReduce/Spark作业
-- 2. Map阶段：读取源数据
-- 3. 为每行计算哈希：hash(user_id) % 32 → 得到桶编号(0-31)
-- 4. Reduce阶段：32个Reducer各自处理分配到的数据
--    - 每个Reducer处理一个桶的数据
--    - 在Reducer内部对user_id排序
--    - 以ORC格式写入到对应桶文件
-- 5. 结果：生成32个有序的ORC文件
```

#### 2.1.5 CTAS & LIKE 建表

- CTAS（Create Table As Select）​ 根据查询结果建表（含数据）
  
  ```sql
  CREATE TABLE dws_top_user AS
  SELECT user_id, SUM(amount) AS total
  FROM dwd_order GROUP BY user_id;
  ```

- LIKE：仅复制结构（不含数据）
  
  ```sql
  CREATE TABLE dws_top_user_bak LIKE dws_top_user;
  ```

> ⚠️ **CTAS 不能创建分区表/外部表**，因为分区/外部属性需要显式声明。

### 2.2 查看表

| 操作       | 语法                                                        |
| -------- | --------------------------------------------------------- |
| 列出当前库所有表 | `SHOW TABLES;`                                            |
| 模糊查询     | `SHOW TABLES LIKE 'dwd_*';`                               |
| 查看表结构    | `DESC table_name;`                                        |
| 查看详细信息   | `DESC FORMATTED table_name;` （**生产高频**：能看到存储路径、格式、压缩、行数等） |
| 查看建表语句   | `SHOW CREATE TABLE table_name;`                           |
| 查看分区     | `SHOW PARTITIONS table_name;`                             |
| 查看分区（过滤） | `SHOW PARTITIONS table_name PARTITION(dt='2026-05-17');`  |

### 2.3 修改表（ALTER TABLE）

#### 2.3.1 表级别修改

```sql
-- 重命名
ALTER TABLE old_name RENAME TO new_name;

-- 修改表属性
ALTER TABLE t SET TBLPROPERTIES ('comment'='新描述');

-- 修改 SerDe
ALTER TABLE t SET SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde';

-- 内外部表互转
ALTER TABLE t SET TBLPROPERTIES ('EXTERNAL'='TRUE'); -- 改外部表
ALTER TABLE t SET TBLPROPERTIES ('EXTERNAL'='FALSE'); -- 改内部表
```

#### 2.3.2 列级别修改

```sql
-- 增加列
ALTER TABLE t ADD COLUMNS (email STRING COMMENT '邮箱');

-- 修改列（改名、改类型、调整位置）
ALTER TABLE t CHANGE COLUMN old_col new_col STRING [AFTER other_col | FIRST];

-- 替换全部列（保留表，覆盖列定义，⚠️慎用）
ALTER TABLE t REPLACE COLUMNS (id BIGINT, name STRING);
```

> ⚠️ **Hive 不支持直接 DROP COLUMN**，要删列必须用 `REPLACE COLUMNS` 把保留的列重列一遍。

#### 2.3.3 分区级别修改

```sql
-- 添加分区（手动）
ALTER TABLE t ADD PARTITION (dt='2026-05-17', region='cn')
LOCATION '/data/t/dt=2026-05-17/region=cn';

-- 删除分区
ALTER TABLE t DROP IF EXISTS PARTITION (dt='2026-05-17');
-- 修改分区路径
ALTER TABLE t PARTITION (dt='2026-05-17') SET LOCATION 'hdfs://new_path';

-- 修复分区（HDFS 上有目录但元数据没注册时常用）
MSCK REPAIR TABLE t;
```

### 2.4 删除/清空表

```sql
-- 删除表（内部表会删 HDFS 数据，外部表只删元数据）
DROP TABLE [IF EXISTS] table_name;

-- 清空表（保留结构，删数据；仅对内部表生效）
TRUNCATE TABLE table_name [PARTITION (dt='2026-05-17')];
```

如果HDFS开启了回收站，drop的数据是可以恢复的，表结构恢复不了，需要自己创建

TRUNCATE清空的表不进回收站，无法恢复（慎用）

### 2.5 数据加载

分区中加载数据

```sql
-- 从本地文件加载（复制）
LOAD DATA LOCAL INPATH '/home/liu/data.csv' INTO TABLE t;

-- 从 HDFS 加载（移动，原路径文件消失）
LOAD DATA INPATH '/tmp/data.csv' [OVERWRITE] INTO TABLE t PARTITION (dt='2026-05-17');

-- INSERT 查询写入
INSERT INTO TABLE t PARTITION (dt='2026-05-17') SELECT ... FROM src;
INSERT OVERWRITE TABLE t PARTITION (dt='2026-05-17') SELECT ... FROM src;

-- 创建表时加载查询结果数据
CREATE TABLE t AS SELECT ... FROM src;

-- 创建表时加载本地文件数据
CREATE EXTERNAL TABLE t (t_id, t_name)
ROW FORMAT DELIMITED FIELDS TERMINATED BY ',' LOCATION './teacher';

-- 根据已有表结构建表,并导入表数据
CREATE TABLE teacher2 like teacher;
EXPORT TABLE teacher TO '/export/teacher';
IMPORT TABLE teacher2 FROM '/export/teacher';
```

### 2.6 数据导出

Hive本身不存储数据，它管理的是存储在HDFS（或对象存储）上数据的“元数据”。因此，数据导出本质是将数据文件从Hive表对应的位置复制或转换到其他位置。

导出方式主要分为三类：**insert导出、Hadoop导出、Hive Shell 导出、Export导出**。

**insert导出**

```sql
-- 基本语法：导出整个表或查询结果（格式化导出）
INSERT OVERWRITE LOCAL DIRECTORY '/export/teacher'
ROW FORMAT DELIMITED
FIELDS TERMINATED BY ','  -- 指定字段分隔符，例如CSV格式
STORED AS TEXTFILE
SELECT * FROM teacher;

-- 导出指定查询结果到本地
INSERT OVERWRITE LOCAL DIRECTORY '/export/dept_sales'
SELECT dept_id, sum(salary) as total_salary
FROM employee
GROUP BY dept_id;

-- 导出指定查询结果到HDFS（没有LOCAL关键字）
INSERT OVERWRITE DIRECTORY '/export/dept_sales'
SELECT dept_id, sum(salary) as total_salary
FROM employee
GROUP BY dept_id;
```

**Hadoop导出到本地**

```hadoop
dfs -get /export/servers/exporthive/000000_0 /export/servers/exporthive/local.txt;
```

**Hive Shell 导出**

`hive -f/-e 执行语句或脚本 > file`

```hive
hive -e "select * from myhive.score;" > /export/servers/exporthive/score.txt;
```

将插入的查询语句写入.hql文件，再执行文件

```sql
-- export.hql
-- 可以包含多条SQL语句
USE myhive;
SELECT * FROM score;
```

```bash
hive -f export_data.hql > /export/servers/exporthive/score.txt;
```

将插入的查询语句写入.sh文件，再执行文件

```bash
#!/bin/bash
# export.sh
# 这是Shell脚本，内部调用Hive
hive -e "SELECT * FROM myhive.score;"
```

```bash
hive -f export_data.sh > /export/servers/exporthive/score.txt;
```

**Export导出到HDFS**

```sql
EXPORT TABLE score TO '/export/exporthive/score';
```

---

### 2.7 命令对照速查表（数据库 vs 数据表）

| 维度    | 数据库（Database）                         | 数据表（Table）                               |
| ----- | ------------------------------------- | ---------------------------------------- |
| 创建    | `CREATE DATABASE`                     | `CREATE [EXTERNAL/TEMPORARY] TABLE`      |
| 查看列表  | `SHOW DATABASES`                      | `SHOW TABLES`                            |
| 查看详情  | `DESC DATABASE [EXTENDED]`            | `DESC [FORMATTED]` / `SHOW CREATE TABLE` |
| 切换/使用 | `USE db_name`                         | （SELECT 时通过 `db.table` 引用）               |
| 修改属性  | `ALTER DATABASE ... SET DBPROPERTIES` | `ALTER TABLE ... SET TBLPROPERTIES`      |
| 改名    | ❌ 不支持                                 | ✅ `ALTER TABLE ... RENAME TO`            |
| 改结构   | 仅改属性/owner/location                   | 增/改/换列、加减分区                              |
| 删除    | `DROP DATABASE [CASCADE]`             | `DROP TABLE` / `TRUNCATE TABLE`          |

## 三、Hive的DQL查询语法

Hive 的 DQL（Data Query Language，数据查询语言）整体语法和标准 SQL 很相似，但因为底层是分布式计算（MapReduce/Tez/Spark），所以在排序、分桶采样、Join 等地方有自己的特色。

---

### 3.1 SELECT 完整语法骨架

```sql
SELECT [ALL | DISTINCT] select_expr, select_expr, ...
FROM table_reference
[WHERE where_condition]
[GROUP BY col_list]
[HAVING having_condition]
[CLUSTER BY col_list
| [DISTRIBUTE BY col_list] [SORT BY col_list]
| [ORDER BY col_list]
]
[LIMIT [offset,] rows]
```

这里的 **`|` 表示"或者"（互斥选择）**，也就是说这三种排序方式**只能选其中一种**，不能同时使用：

| 选项  | 写法                                | 含义                                                    |
| --- | --------------------------------- | ----------------------------------------------------- |
| ①   | `CLUSTER BY col`                  | 分发 + 排序（合二为一，**同字段升序**）                               |
| ②   | `DISTRIBUTE BY col1 SORT BY col2` | 按 col1 分发到不同 Reducer，再按 col2 在 Reducer 内排序（**可以拆开用**） |
| ③   | `ORDER BY col`                    | 全局排序（强制 1 个 Reducer）                                  |

> 📌 `[ ]` 表示可选；`|` 表示三选一；`DISTRIBUTE BY` 和 `SORT BY` 内部各自也是可选的，但通常成对出现。

执行顺序（**面试高频**）：

`FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY / SORT BY → LIMIT`

### 3.2 WHERE

`WHERE` < 是不包含null的，查询结果中没有deptno=null的情况

```sql
SELECT * FROM employees WHERE deptno < 20;
```

| 运算符                       | 含义            |
| ------------------------- | ------------- |
| `=, <>, !=, <, >, <=, >=` | 比较            |
| `BETWEEN A AND B`         | 闭区间           |
| `IS [NOT] NULL`           | 空值判断          |
| `IN / NOT IN`             | 集合            |
| `LIKE`                    | 通配符 `% _`     |
| `RLIKE / REGEXP`          | 正则匹配（Java 正则） |
| `AND / OR / NOT`          | 逻辑            |

### 3.3 GROUP BY

`GROUP BY` 使用`group by`则select后只能写分组的字段或聚合函数

**WHERE vs HAVING**：

| 区别点     | WHERE   | HAVING    |
| ------- | ------- | --------- |
| 过滤阶段    | 分组**前** | 分组**后**   |
| 能否用聚合函数 | ❌ 不能    | ✅ 可以      |
| 操作对象    | 原始行     | 分组结果/聚合函数 |

```sql
SELECT 
    province,
    city,
    COUNT(DISTINCT user_id) AS 活跃用户数
FROM user_behavior
GROUP BY province, city;
```

### 3.4 排序

Hive 的排序要先拆成两个问题来看：

1. **数据分到哪个 Reducer？** 这个由 `DISTRIBUTE BY` 控制，本质类似 MapReduce 里的 `Partitioner`。
2. **进入 Reducer 后怎么排序？** 这个由 `SORT BY` 控制，只保证每个 Reducer 内部有序。

所以 `DISTRIBUTE BY deptno SORT BY sal DESC` 的意思不是“全局按工资排序”，而是：**先按部门号 `deptno` 把数据分发到不同 Reducer，再在每个 Reducer 内部按工资 `sal` 降序排列**。

`DISTRIBUTE BY` 使用 Hash 分发，简化理解就是：

```text
reducer_id = hash(分发字段) % reducer数量
```

例如按照 `deptno` 分发时，相同部门号的数据会进入同一个 Reducer：

```text
Map1 ┐          ┌──→ Reducer1: 部门10的所有员工
Map2 ┼──hash──→ ├──→ Reducer2: 部门20的所有员工
Map3 ┘          └──→ Reducer3: 部门30的所有员工
```

如果后面再接 `SORT BY sal DESC`，那么每个 Reducer 内部会继续按 `sal` 降序输出：

```text
Reducer1: 部门10的所有员工，按 sal 降序
Reducer2: 部门20的所有员工，按 sal 降序
Reducer3: 部门30的所有员工，按 sal 降序
```

但注意：多个 Reducer 的输出文件之间没有统一比较，所以整体结果仍然不是全局有序。

#### 3.4.1 SORT BY

`SORT BY` 是**Reducer 内部排序**，不保证全局有序。它通常和 `DISTRIBUTE BY` 一起使用：前者控制“怎么排”，后者控制“分到哪”。

```sql
SELECT * FROM employees
DISTRIBUTE BY deptno
SORT BY sal DESC;
```

这条 SQL 的执行效果就是两步：

- `DISTRIBUTE BY deptno`：先保证同一个部门的数据进入同一个 Reducer
- `SORT BY sal DESC`：再保证每个 Reducer 内部按工资降序输出

如果只写 `SORT BY sal DESC`，数据会随机分发到多个 Reducer，你只能得到“每个 Reducer 内部按工资降序”，不能保证同一个部门的数据聚在一起。

#### 3.4.2 CLUSTER BY

`CLUSTER BY` 是 `DISTRIBUTE BY + SORT BY` 的**简写**，但有两个限制：

- **分发字段 = 排序字段**（必须同一个字段）

- **只能升序**（不能 DESC）

```sql
-- 以下两句等价
SELECT * FROM emp CLUSTER BY deptno;
SELECT * FROM emp DISTRIBUTE BY deptno SORT BY deptno;
```

#### 3.4.3 ORDER BY

`ORDER BY` 对输入做全局排序，因此只有1个reducer，当规模较大时会耗时

```sql
Map1 ┐
Map2 ┼──→  [单个 Reducer，所有数据汇总]  →  输出 1 个全局有序文件
Map3 ┘
```

#### 3.4.4 总结

| 子句              | 作用范围                              | 是否全局有序 | Reduce 数量 | 使用场景                 |
| --------------- | --------------------------------- | ------ | --------- | -------------------- |
| `ORDER BY`      | 全局排序                              | ✅ 是    | **强制为 1** | 小数据量全排序              |
| `SORT BY`       | 每个 Reducer 内部排序                   | ❌ 否    | 多个        | 局部排序，输出多个有序文件        |
| `DISTRIBUTE BY` | 控制数据到哪个 Reducer                   | ❌ 否    | 多个        | 类似 MR 中的 partitioner |
| `CLUSTER BY`    | = DISTRIBUTE BY + SORT BY（同字段、升序） | ❌ 否    | 多个        | 简写形式                 |

### 3.5 JOIN

Hive 的 JOIN 本质是：**根据连接条件，把两张表中能匹配上的行组合在一起**。在分布式执行时，默认 Common Join 通常要经历 `Map -> Shuffle -> Reduce`，也就是把相同 Join Key 的数据拉到同一个 Reducer 中再匹配。

实际开发中最常见的是等值连接：

```sql
ON e.dept_id = d.dept_id
```

Hive 2.x 以后对 `ON` 条件的支持更灵活，可以出现部分非等值条件或复杂表达式，但大数据场景里仍然优先使用等值 Join，因为优化器更容易选择 Map Join、Bucket Map Join、SMB Join 等高效执行方式。

#### 3.5.1 示例数据

下面所有示例都基于两张表：员工表 `employees` 和部门表 `departments`。

`employees`：

```text
+-----+-------+---------+
| id  | name  | dept_id |
+-----+-------+---------+
| 1   | Alice | 101     |
| 2   | Bob   | 102     |
| 3   | Carol | NULL    |
+-----+-------+---------+
```

`departments`：

```text
+---------+-----------+
| dept_id | dept_name |
+---------+-----------+
| 101     | Sales     |
| 103     | IT        |
+---------+-----------+
```

注意：`NULL` 不会和任何值相等，甚至也不会和另一个 `NULL` 相等。因此 `Carol` 的 `dept_id = NULL` 不会匹配到任何部门。

#### 3.5.2 INNER JOIN：内连接

`INNER JOIN` 只返回两张表中**连接条件匹配成功**的行。可以理解为只要交集：左表有、右表也能匹配上的数据才会留下。

```sql
SELECT e.name, d.dept_name
FROM employees e
INNER JOIN departments d ON e.dept_id = d.dept_id;
```

返回结果：

```text
+-------+-----------+
| name  | dept_name |
+-------+-----------+
| Alice | Sales     |
+-------+-----------+
```

解释：

- `Alice.dept_id = 101`，能匹配到 `Sales`
- `Bob.dept_id = 102`，部门表没有 `102`，被过滤掉
- `Carol.dept_id = NULL`，不能参与等值匹配，被过滤掉

#### 3.5.3 LEFT JOIN：左外连接

`LEFT JOIN` 会**保留左表全部数据**。右表能匹配上就补右表字段，匹配不上就用 `NULL` 填充右表字段。

```sql
SELECT e.name, d.dept_name
FROM employees e
LEFT JOIN departments d ON e.dept_id = d.dept_id;
```

返回结果：

```text
+-------+-----------+
| name  | dept_name |
+-------+-----------+
| Alice | Sales     |
| Bob   | NULL      |
| Carol | NULL      |
+-------+-----------+
```

解释：左表 `employees` 的三个人都会保留；其中 `Bob` 和 `Carol` 没有匹配部门，所以 `dept_name` 为 `NULL`。

#### 3.5.4 RIGHT JOIN：右外连接

`RIGHT JOIN` 和 `LEFT JOIN` 相反，会**保留右表全部数据**。左表能匹配上就补左表字段，匹配不上就用 `NULL` 填充左表字段。

```sql
SELECT e.name, d.dept_name
FROM employees e
RIGHT JOIN departments d ON e.dept_id = d.dept_id;
```

返回结果：

```text
+-------+-----------+
| name  | dept_name |
+-------+-----------+
| Alice | Sales     |
| NULL  | IT        |
+-------+-----------+
```

解释：右表 `departments` 的两个部门都会保留；`IT.dept_id = 103` 没有员工匹配，所以员工姓名为 `NULL`。

#### 3.5.5 FULL JOIN：全外连接

`FULL JOIN` 会**同时保留左表和右表的全部数据**。能匹配上的合并成一行，匹配不上的那一侧字段用 `NULL` 填充。

```sql
SELECT e.name, d.dept_name
FROM employees e
FULL JOIN departments d ON e.dept_id = d.dept_id;
```

返回结果：

```text
+-------+-----------+
| name  | dept_name |
+-------+-----------+
| Alice | Sales     |
| Bob   | NULL      |
| Carol | NULL      |
| NULL  | IT        |
+-------+-----------+
```

解释：

- `Alice` 和 `Sales` 匹配成功，合并成一行
- `Bob`、`Carol` 是左表未匹配数据，右表字段为 `NULL`
- `IT` 是右表未匹配数据，左表字段为 `NULL`

#### 3.5.6 CROSS JOIN：交叉连接

`CROSS JOIN` 是笛卡尔积，会把左表每一行和右表每一行都组合一次。如果左表有 3 行，右表有 2 行，结果就是 `3 * 2 = 6` 行。

```sql
SELECT e.name, d.dept_name
FROM employees e
CROSS JOIN departments d;
```

返回结果：

```text
+-------+-----------+
| name  | dept_name |
+-------+-----------+
| Alice | Sales     |
| Alice | IT        |
| Bob   | Sales     |
| Bob   | IT        |
| Carol | Sales     |
| Carol | IT        |
+-------+-----------+
```

`CROSS JOIN` 数据量膨胀很快，生产中要谨慎使用，通常需要配合过滤条件或确认两边都是小表。

#### 3.5.7 LEFT SEMI JOIN：左半连接

`LEFT SEMI JOIN` 是 Hive 中很常用的半连接，效果类似 `EXISTS`：**只返回左表中能在右表匹配成功的行**。

它和 `INNER JOIN` 的区别是：`LEFT SEMI JOIN` 只能查询左表字段，不能返回右表字段。

```sql
SELECT e.name
FROM employees e
LEFT SEMI JOIN departments d ON e.dept_id = d.dept_id;
```

返回结果：

```text
+-------+
| name  |
+-------+
| Alice |
+-------+
```

适合判断“左表记录是否存在于右表中”的场景：

```sql
-- 查询有合法部门的员工
SELECT e.*
FROM employees e
LEFT SEMI JOIN departments d ON e.dept_id = d.dept_id;
```

#### 3.5.8 JOIN 类型速查

| Join 类型          | 是否保留左表未匹配行 | 是否保留右表未匹配行 | 典型用途            |
| ---------------- | ---------- | ---------- | --------------- |
| `INNER JOIN`     | 否          | 否          | 只要两边匹配成功的数据     |
| `LEFT JOIN`      | 是          | 否          | 保留主表全部记录，补充维表信息 |
| `RIGHT JOIN`     | 否          | 是          | 保留右表全部记录，较少使用   |
| `FULL JOIN`      | 是          | 是          | 合并两边全集，检查缺失关系   |
| `CROSS JOIN`     | 不按匹配条件过滤   | 不按匹配条件过滤   | 生成所有组合，容易数据膨胀   |
| `LEFT SEMI JOIN` | 只保留左表匹配成功行 | 不返回右表字段    | 判断左表记录是否存在于右表   |

#### 3.5.9 JOIN 优化策略

Hive 中 JOIN 慢，通常不是因为 SQL 语法复杂，而是因为 Shuffle 数据量太大。常见优化策略如下：

| Join 类型                        | 触发条件            | 原理                               |
| ------------------------------ | --------------- | -------------------------------- |
| **Common Join (Shuffle Join)** | 默认              | Map 阶段输出 key，Reduce 阶段做 Join，开销大 |
| **Map Join**                   | 小表 < 25MB       | 小表广播到每个 Mapper，无 Shuffle         |
| **Bucket Map Join / SMB Join** | 两表分桶（+排序）且桶数成倍数 | 桶对桶 Join，无需 Shuffle              |

实际使用时可以按这个顺序判断：

1. 小表能否广播？能的话优先考虑 `Map Join`。
2. 两张大表是否经常按同一个 Key Join？是的话考虑分桶，进一步使用 `Bucket Map Join` 或 `SMB Join`。
3. 如果都不满足，就会退回默认的 `Common Join`，需要重点关注 Shuffle 数据量和数据倾斜。

### 3.6 LIMIT（带 offset）

```sql
SELECT * FROM emp LIMIT 5; -- 前 5 行

SELECT * FROM emp LIMIT 10, 5; -- 跳过 10 行，取 5 行（部分版本支持）
```

### 3.7 UNION / UNION ALL

```sql
-- UNION ALL：不去重，效率高
SELECT * FROM emp WHERE deptno = 10
UNION ALL
SELECT * FROM emp WHERE deptno = 20;

-- UNION：去重，会触发额外 MR
```
