---
title: "【一】Hive数据类型"
date: 2026-05-13T22:47:21+08:00
draft: false
tags: ["Hive", "数据类型"]   
categories: ["Hive"]  
description: "介绍Hive的数据类型:基本数据类型、复杂数据类型"
---

## 一、Hive 数据类型详解

Hive的数据类型主要分为两大类：**基本数据类型** 和**复杂数据类型**。理解它们，是写出高效、正确HiveQL的基础。

### 1. 基本数据类型（Primitive Types）

类似于传统关系数据库（如MySQL）中的数据类型，用于存储单个值。

| 类型                  | 说明                           | 示例                              | 应用场景与注意事项                                           |
| ------------------- | ---------------------------- | ------------------------------- | --------------------------------------------------- |
| **`TINYINT`**       | 1字节有符号整数，范围[-128, 127]       | `1`， `-100`                     | 存储状态码、性别编码等小范围枚举值。                                  |
| **`SMALLINT`**      | 2字节有符号整数，范围[-32,768, 32,767] | `1000`， `-20000`                | 存储稍大范围的ID或编码。                                       |
| **`INT`**           | 4字节有符号整数，范围约±21亿             | `1000000`， `-1`                 | **最常用的整数类型**，用于存储用户ID、订单数等。                         |
| **`BIGINT`**        | 8字节有符号整数，范围极大                | `10000000000L`                  | 存储非常大的计数，如全局唯一长ID、交易流水号。                            |
| **`FLOAT`**         | 4字节单精度浮点数                    | `3.14159`                       | 对精度要求不高的科学计算或指标。存在精度损失。                             |
| **`DOUBLE`**        | 8字节双精度浮点数                    | `3.141592653589793`             | **最常用的浮点数类型**，如金额、比率、统计数据。                          |
| **`DECIMAL(p, s)`** | 高精度小数，p是总位数，s是小数位            | `DECIMAL(10,2)`表示 `12345678.12` | **【面试重点】** 存储精确数值，如金融金额、精确费率。避免`DOUBLE`计算时的精度问题。    |
| **`BOOLEAN`**       | 布尔型，TRUE/FALSE               | `TRUE`                          | 存储标记位，如“是否VIP”、“是否完成”。                              |
| **`STRING`**        | 变长字符串，无需定义长度                 | `‘Hello’`, `‘张三’`               | **【最常用】** 存储文本、名称、地址等。Hive的`STRING`优于`VARCHAR`，更通用。 |
| **`VARCHAR(max)`**  | 变长字符串，需指定最大长度                | `VARCHAR(100)`                  | 在需要限制长度的场景使用，与`STRING`类似但功能稍少。                      |
| **`CHAR(n)`**       | 定长字符串，不足补空格                  | `CHAR(10)`                      | 较少用，用于长度严格固定的场景。                                    |
| **`DATE`**          | 日期，格式 ‘YYYY-MM-DD’           | `‘2023-10-26’`                  | 存储日期。                                               |
| **`TIMESTAMP`**     | 时间戳，精度到纳秒                    | `‘2023-10-26 14:30:00.123’`     | 存储精确的时间点，如日志时间、订单创建时间。                              |

**最佳实践建议**：

- **整数优选`INT`**，大数用`BIGINT`。
- **浮点优选`DOUBLE`**，**金额/精确值必用`DECIMAL`**。
- **字符串优选`STRING`**。

### 2. 复杂数据类型（Complex Types）

这是Hive区别于传统SQL的强大特性，允许在单个列中存储结构化的数据集合，非常适合处理半结构化数据（如JSON）。

| 类型                                      | 说明                     | 定义与示例数据                                                                                  | 访问与查询方式                                                                                                               |
| --------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **`ARRAY<data_type>`**                  | 相同类型元素的数组，索引从0开始。      | `hobbies ARRAY<STRING>` 数据： `[‘篮球’， ‘音乐’， ‘阅读’]`                                         | `SELECT hobbies[0] FROM user; -- 获取‘篮球’` `SELECT hobby FROM user LATERAL VIEW explode(hobbies) tmp AS hobby; -- 展开数组` |
| **`MAP<primitive_type, data_type>`**    | 键值对集合，键必须是基本类型。        | `properties MAP<STRING, STRING>` 数据： `{‘age’ -> ‘25’, ‘city’ -> ‘成都’}`                   | `SELECT properties[‘city’] FROM user; -- 获取‘成都’` `SELECT map_keys(properties) FROM user; -- 获取所有键`                    |
| **`STRUCT<col_name : data_type, ...>`** | 类似于C语言的结构体，可以包含多个命名字段。 | `address STRUCT<province:STRING, city:STRING, detail:STRING>` 数据： `{‘四川’， ‘成都’， ‘天府三街’}` | `SELECT address.city FROM user; -- 获取‘成都’`                                                                            |
| **`UNIONTYPE<data_type, ...>`**         | 多种数据类型中的一种。            | 较少用，了解即可。                                                                                |                                                                                                                       |

**示例DDL（创建表）**：

```sql
CREATE TABLE IF NOT EXISTS user_info (
    uid BIGINT COMMENT '用户ID',
    name STRING COMMENT '姓名',
    salary DECIMAL(10,2) COMMENT '薪资',
    tags ARRAY<STRING> COMMENT '用户标签',
    ext_info MAP<STRING, STRING> COMMENT '扩展信息，如：{"department":"bigdata","level":"P6"}',
    address STRUCT<province:STRING, city:STRING, district:STRING> COMMENT '居住地址'
)
COMMENT '用户信息表'
PARTITIONED BY (dt STRING COMMENT '按天分区') -- 这里用到了你图片中的Partition模型
ROW FORMAT DELIMITED
FIELDS TERMINATED BY '\t' -- 列分隔符
COLLECTION ITEMS TERMINATED BY ',' -- 数组和Struct中元素分隔符
MAP KEYS TERMINATED BY ':' -- Map键值对分隔符
STORED AS TEXTFILE; -- 存储格式
```

**复杂类型的优势**：避免了将所有字段“扁平化”存储带来的大量NULL值和表结构僵化问题，使数据模型更贴近业务逻辑。

### 3. 数据类型转换与NULL

- **隐式转换**：Hive会在必要时自动进行类型转换，如`INT`转`DOUBLE`。但反向转换（如`DOUBLE`转`INT`）或`STRING`转数字可能会失败或丢失精度。
- **显式转换**：使用`CAST`函数，如 `CAST(‘123’ AS INT)`。
- **NULL值**：Hive中所有数据类型的字段都支持`NULL`值。`NULL`与任何值运算、比较结果均为`NULL`。过滤需用 `WHERE column IS NULL`。

## 二、Hive 数据模型

Hive中包含以下数据模型（db、table、external table、partition、bucket）定义了表、库、分区等逻辑结构及其在HDFS上的物理映射。

| **组件**             | **含义与HDFS表现**                                                                                 | **适用场景与目的**                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database (DB)**  | **命名空间**，用于组织和管理表。<br>在HDFS上表现为`${hive.metastore.warehouse.dir}`目录下的一个**子文件夹**。               | **多项目/团队管理**：将不同业务或项目的表隔离在不同的DB下，避免表名冲突。例如，创建 `db_fin`（财务库）和 `db_user`（用户库）。                                                                              |
| **Table**          | Hive中**核心的数据逻辑抽象**。<br>在HDFS上表现为**所属DB目录**下的一个**子文件夹**。表中的数据文件就存储在此文件夹内。                      | **存储结构化/半结构化数据**：绝大多数数据分析和数仓建设的基础。例如 `user_info`（用户信息表）、`order_fact`（订单事实表）。                                                                              |
| **External Table** | **外部表**。与普通表类似，但Hive**只管理其元数据，不管理其数据生命周期**。<br>数据文件**可以存放在HDFS任意指定路径**。                       | **【非常重要】** 1. **数据共享与安全**：数据由其他程序（如Spark、Flink）生成，或被多系统共享，不希望删除表时连带删除数据。 2. **数仓ODS层标配**：原始数据层通常使用外部表指向HDFS上的原始数据路径，实现数据与计算的解耦。                           |
| **Partition**      | **分区**。根据表中某列（通常是日期、地区等）的值，将数据在物理上划分到不同的**子目录**中。<br>Table目录下的子目录。<br>目录名格式如 `dt=2023-10-26`。 | **【核心优化手段】** 1. **大幅提升查询效率**：查询时通过`WHERE`条件指定分区，Hive只会扫描对应分区的数据，避免全表扫描（**分区裁剪**）。 2. **按时间、地域等维度管理数据**：例如按 `dt`（天）、`province`（省）分区，是数仓的常见做法。              |
| **Bucket**         | **分桶**。在分区内（或表内），根据另一列的哈希值，将数据划分为多个**固定数量**的文件。<br>同一个表目录下根据hash散列之后的多个文件                     | **【高级优化手段】** 1. **提升JOIN和采样效率**：对两个表在相同列上分桶且桶数成倍数，可以大大优化`Map-Side Join`效率。 2. **数据倾斜优化**：与分区结合，对倾斜键进行分桶有时能缓解问题。 3. **高效随机采样**：`TABLESAMPLE`语法可以高效地对桶进行采样。 |

---

### 1. Table（内部表/托管表）

- 在HDFS中表现为其所属数据库目录下的一个文件夹。

- **本质**：Hive不仅管理这张表的**元数据**（如表名、列、类型），还**全权管理其数据生命周期**。

- **创建与存储**：
  
  ```sql
  -- 创建一张内部表
  CREATE TABLE my_managed_table (
      id INT,
      name STRING
  );
  -- 加载数据后，数据文件会默认存储在Hive仓库目录下，例如：
  -- /user/hive/warehouse/mydb.db/my_managed_table/datafile1.txt
  ```

- **删除操作的影响**：执行 `DROP TABLE my_managed_table;`时，**表的元数据和HDFS上的数据文件都会被删除**。

- **适用场景**：
  
  - **数仓的中间层和结果层**：例如，经过清洗、转换后的明细数据表（DWD）、聚合汇总表（DWS/DWT）。这些数据由Hive ETL作业生成，并完全由Hive管理。
  - **临时或生命周期明确的数据**：不需要被其他引擎共享的中间结果。

---

### 2. External Table（外部表）

- 与table类似，不过其**数据存放位置可以在任意指定路径**。

- **本质**：Hive只管理这张表的**元数据**，但**不管理数据本身**。数据文件可以位于HDFS的任何位置。

- **创建与存储**：
  
  ```sql
  -- 创建一张外部表，必须使用 `EXTERNAL` 关键字和 `LOCATION` 子句
  CREATE EXTERNAL TABLE my_external_table (
      log_time STRING,
      client_ip STRING
  )
  ROW FORMAT DELIMITED FIELDS TERMINATED BY ','
  LOCATION '/data/logs/web_server/'; -- 指向一个已存在数据的HDFS路径
  ```

- **删除操作的影响**：执行 `DROP TABLE my_external_table;`时，**仅删除元数据，HDFS上的数据文件会原封不动地保留**。

- **适用场景**：
  
  - **数仓的原始数据层（ODS）**：**这是最经典的应用**。日志采集（Flume）、消息队列（Kafka）中的数据通常由其他程序写入HDFS固定目录。用外部表关联此目录，可实现“数据不动，计算就绪”。
  - **多引擎共享数据**：当一份数据需要被Spark、Flink、Presto等多个计算引擎分析时，使用外部表是最佳实践，避免数据被某个引擎误删。
  - **基于现有数据文件建表**：已有数据文件在HDFS上，只需通过Hive为其建立映射关系进行分析。

**📊 内部表 vs. 外部表（面试必考题）**

| 特性                 | 内部表（Managed Table）  | 外部表（External Table） |
| ------------------ | ------------------- | ------------------- |
| **关键字**            | 默认，或`MANAGED`       | `EXTERNAL`          |
| **数据管理**           | Hive**全权管理**        | Hive**只管理元数据**      |
| **存储位置**           | 默认仓库目录              | 用户`LOCATION`指定的任意路径 |
| **`DROP TABLE`后果** | **元数据 + 数据文件 均被删除** | **仅元数据被删除，数据文件保留**  |
| **数仓应用层**          | DWD, DWS, ADS, 临时表  | **ODS（原始数据层）**      |
| **设计哲学**           | “我的数据，我负责”          | “你的数据，我来读”          |

---

### 3. Partition（分区）

- 在HDFS中表现为table目录下的**子目录**。

- **本质**：根据表中某一列（通常是日期、地区、类别等）的值，在物理存储上**将数据拆分到不同的子目录中**。目录名格式为 `分区列=值`。

- **创建与存储**：
  
  ```sql
  -- 创建一张按日期（dt）和地区（country）分区的表
  CREATE TABLE logs (
      user_id BIGINT,
      event STRING
  )
  PARTITIONED BY (dt STRING, country STRING); -- 分区列是虚拟列，不体现在数据文件中
  
  -- 加载数据到特定分区
  LOAD DATA INPATH '/input/log_20231026_us.csv' INTO TABLE logs PARTITION (dt='2023-10-26', country='US');
  -- 数据在HDFS上的存储路径类似：
  -- /user/hive/warehouse/logs/dt=2023-10-26/country=US/datafile.csv
  -- /user/hive/warehouse/logs/dt=2023-10-26/country=CN/datafile.csv
  ```

- **核心价值：分区裁剪**：当查询带有分区条件时，Hive**只会读取相关分区目录下的数据**，跳过无关分区，从而极大提升查询性能。
  
  ```sql
  -- 这个查询只会扫描 dt='2023-10-26', country='US' 这个子目录，而不是全表
  SELECT COUNT(*) FROM logs WHERE dt='2023-10-26' AND country='US';
  ```

- **适用场景**：
  
  - **按时间范围查询**：**这是最主要、最普遍的用法**，例如按`年/月/日`（`dt`）分区，查询某一天的数据。
  - **按业务维度筛选**：如按`国家`、`省份`、`产品线`分区。
  - **数据生命周期管理**：可以方便地删除整个过期分区（`ALTER TABLE DROP PARTITION`），效率极高。

---

### 4. Bucket（分桶/桶表）

- 在HDFS中表现为同一个表（或分区）目录下根据hash散列之后的**多个文件**。

- **本质**：在分区内（或表内），根据某一列值的**哈希值**，将数据**均匀分发**到固定数量的桶（文件）中。

- **创建与存储**：
  
  ```sql
  -- 创建一张对user_id分桶的表
  CREATE TABLE user_bucketed (
      user_id INT,
      username STRING
  )
  CLUSTERED BY (user_id) INTO 4 BUCKETS -- 根据user_id的哈希值，将数据散列到4个桶文件中
  STORED AS ORC;
  
  -- 插入数据后，在HDFS上该表或分区的目录下，会出现4个文件，例如：
  -- 000000_0, 000001_0, 000002_0, 000003_0
  -- 所有user_id哈希值相同的记录，一定会被分到同一个文件里。
  ```
  
  分桶后的最终效果
  
  ```textile
  user_orders_bucketed         user_info_bucketed
        桶0文件                       桶0文件
        桶1文件                       桶1文件  
        桶2文件                       桶2文件
        桶3文件                       桶3文件
        ↓                             ↓
      Mapper 0                     Mapper 0
      (只读桶0文件)                (只读桶0文件)
            ↘                     ↙
          相同的user_id已经在同一个桶中！
          可以在Mapper本地直接JOIN
  ```

- **核心价值**：
  
  1. **高效抽样**：`TABLESAMPLE(BUCKET x OUT OF y)`可以直接对特定桶进行高效、随机的采样。
  2. **提升特定JOIN性能**：如果两个表基于相同的JOIN键分桶，且桶的数量成倍数关系，可以触发高效的**桶映射连接（Map-Side Join）**，大幅减少Shuffle开销。
  3. **缓解数据倾斜**：将倾斜的键值通过哈希打散到不同桶中，有时能优化后续处理。

- **适用场景**：
  
  - **超大表间的等值JOIN优化**：这是分桶最重要的应用场景之一。
  - **需要高效进行随机采样的场景**。
  - **与分区结合**：先按时间分区，在分区内再按用户ID分桶，实现两级数据组织。

- **分桶的代价与注意事项**
  
  1. **写入性能下降**：写入时需要计算哈希并确保数据进入正确的桶，比直接写入慢
  
  2. **小文件问题**：桶数过多会产生大量小文件，影响HDFS和Hive性能
  
  3. **哈希冲突**：不同值可能哈希到同一个桶（概率很小）
  
  4. **数据倾斜**：如果分桶列值分布不均，某些桶可能很大

- **分桶原则**
  
  - 桶数量选择经验公式：每个桶文件大小在200MB-1GB为宜（假设表大小100GB，目标每个桶500MB，则桶数=100GB/0.5GB=200个）
  
  - 分桶列选择原则
    
    - a) 高基数（不同值多）的列
    
    - b) 经常作为JOIN条件的列
    
    - c) 经常用于WHERE等值过滤的列
    
    - d) 不会导致数据倾斜的列

---

### 5、视图（View）

视图是Hive中一个**逻辑上的虚拟表**，它不存储实际数据，通过隐藏复杂数据操作（Join、子查询、过滤、数据扁平化）简化查询操作。

一旦创建视图，他的schema会立刻确定，后续他的底层表的更改（如新增列），并不会影响视图的schema。底层表消失后视图的查询将失败。所以ETL和数据仓库中经常变化的表应慎用视图。

- **本质**：一条预定义的查询语句的封装。

- **创建与使用**：
  
  ```sql
  -- 基于现有的复杂查询创建一个视图
  CREATE VIEW view_user_summary AS
  SELECT 
      user_id,
      COUNT(*) AS pv_count,
      MAX(event_time) AS last_active_time
  FROM dwd_user_event
  WHERE dt >= '2023-10-01'
  GROUP BY user_id;
  
  -- 像查询普通表一样使用视图
  SELECT * FROM view_user_summary WHERE pv_count > 100;
  -- 更改视图属性
  ALTER VIEW view_user_summary SET TBLPROPERTIES('comment'='This is a view');
  -- 重新定义视图
  ALTER VIEW view_user_summary AS SELECT * FROM dwd_user_event;
  -- 删除视图
  DROP VIEW view_user_summary;
  ```

- **核心价值**：
  
  1. **简化复杂查询**：将多表关联、复杂过滤和聚合的逻辑封装起来，对使用者透明。
  2. **数据安全与权限控制**：可以只将视图（包含部分列或行）的权限开放给用户，而不暴露底层原始表。
  3. **逻辑抽象**：为不同的业务场景提供定制化的数据视角，即使底层表结构发生变化，也可以通过更新视图来屏蔽影响。

- **与表的区别**：视图不占用HDFS存储空间（只存储元数据），其数据在查询时动态计算生成。

### 综合应用示例（电商数仓场景）

让我们用一个完整的例子，串联起这四种模型：

```sql
-- 1. 创建外部表（ODS层）：指向原始Nginx日志目录
CREATE EXTERNAL TABLE ods_nginx_log (
    ip STRING,
    request_time STRING,
    url STRING,
    user_id INT
)
PARTITIONED BY (dt STRING) -- 按天分区
LOCATION '/data/ods/nginx_log/';

-- 2. 创建内部表（DWD层）：清洗后的明细数据，并分桶
CREATE TABLE dwd_user_pv (
    user_id INT,
    session_id STRING,
    page_url STRING,
    view_time TIMESTAMP
)
PARTITIONED BY (dt STRING) -- 按天分区
CLUSTERED BY (user_id) INTO 32 BUCKETS -- 按user_id分32个桶，为后续JOIN优化做准备
STORED AS ORC; -- 使用高效的列式存储格式

-- 3. 从ODS层向DWD层插入数据，并进行分区裁剪
INSERT OVERWRITE TABLE dwd_user_pv PARTITION (dt='2023-10-26')
SELECT 
    user_id,
    get_session_id(url) as session_id,
    url,
    parse_time(request_time) as view_time
FROM ods_nginx_log
WHERE dt='2023-10-26' -- 分区裁剪，只处理今天的数据
  AND user_id IS NOT NULL;
```

### 学习与实践结合：一个完整示例

假设你要在一家电商公司构建用户行为日志表，可以这样设计：

```sql
-- 1. 创建数据库（对应图片中的DB，在HDFS创建一个文件夹）
CREATE DATABASE IF NOT EXISTS dw_web;
USE dw_web;

-- 2. 创建外部表（对应图片中的External Table，指向原始日志路径）
CREATE EXTERNAL TABLE IF NOT EXISTS ods_user_log (
    user_id BIGINT COMMENT '用户ID',
    device_id STRING COMMENT '设备ID',
    event_name STRING COMMENT '事件名',
    event_time TIMESTAMP COMMENT '事件时间',
    page_info STRUCT<url:STRING, referer:STRING> COMMENT '页面信息', -- 复杂数据类型
    properties MAP<STRING, STRING> COMMENT '事件属性' -- 复杂数据类型
)
COMMENT '用户行为日志原始表'
PARTITIONED BY (`dt` STRING COMMENT '按天分区，格式yyyymmdd') -- 分区列，物理上成为子目录
ROW FORMAT DELIMITED
FIELDS TERMINATED BY '\001'
STORED AS ORC -- 使用ORC列式存储格式，性能更好
LOCATION '/data/ods/web/user_log'; -- 外部表，数据在此路径下

-- 3. 加载数据到指定分区（数据会进入 /data/ods/web/user_log/dt=20231026/ 目录下）
ALTER TABLE ods_user_log ADD PARTITION (dt='20231026');

-- 4. 基于ODS层，创建一张分桶的DWD（明细层）表
CREATE TABLE dwd_user_event (
    user_id BIGINT,
    event_name STRING,
    hour STRING,
    -- ... 其他清洗后的字段
)
PARTITIONED BY (dt STRING)
CLUSTERED BY (user_id) INTO 32 BUCKETS -- 根据user_id分32个桶
STORED AS ORC;

-- 5. 查询时利用分区裁剪，极大提升效率
SELECT COUNT(*)
FROM ods_user_log
WHERE dt = '20231026' -- Hive只会扫描20231026这一天的数据文件
  AND event_name = 'purchase';
```
