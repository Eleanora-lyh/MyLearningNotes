---
title: "[1] Hive Data Types"
date: 2026-05-13T22:47:21+08:00
draft: false
tags: ["Hive", "Data Types"]
categories: ["Hive"]
description: "An introduction to Hive data types, including primitive data types and complex data types."
---

## 1. Hive Data Types in Detail

Hive data types are mainly divided into two categories: **primitive data types** and **complex data types**. Understanding them is the foundation for writing efficient and correct HiveQL.

### 1. Primitive Types

Primitive types are similar to the data types in traditional relational databases such as MySQL. They are used to store single values.

| Type | Description | Example | Use Cases and Notes |
| --- | --- | --- | --- |
| **`TINYINT`** | 1-byte signed integer, range [-128, 127] | `1`, `-100` | Stores small-range enum values such as status codes or gender codes. |
| **`SMALLINT`** | 2-byte signed integer, range [-32,768, 32,767] | `1000`, `-20000` | Stores slightly larger IDs or codes. |
| **`INT`** | 4-byte signed integer, range around +/- 2.1 billion | `1000000`, `-1` | **The most commonly used integer type**, suitable for user IDs, order counts, and similar fields. |
| **`BIGINT`** | 8-byte signed integer with a very large range | `10000000000L` | Stores very large counts, such as globally unique long IDs or transaction serial numbers. |
| **`FLOAT`** | 4-byte single-precision floating-point number | `3.14159` | Used for scientific calculations or metrics that do not require high precision. Precision loss may occur. |
| **`DOUBLE`** | 8-byte double-precision floating-point number | `3.141592653589793` | **The most commonly used floating-point type**, suitable for amounts, ratios, and statistics. |
| **`DECIMAL(p, s)`** | High-precision decimal. `p` is the total number of digits, and `s` is the number of decimal places. | `DECIMAL(10,2)` represents `12345678.12` | **Interview focus**: stores exact values such as financial amounts and precise rates. Avoids the precision problems of `DOUBLE`. |
| **`BOOLEAN`** | Boolean value, `TRUE` or `FALSE` | `TRUE` | Stores flags such as "is VIP" or "is completed". |
| **`STRING`** | Variable-length string without a required length definition | `'Hello'`, `'Zhang San'` | **Most commonly used**: stores text, names, addresses, and similar values. In Hive, `STRING` is usually more general and practical than `VARCHAR`. |
| **`VARCHAR(max)`** | Variable-length string with a specified maximum length | `VARCHAR(100)` | Used when length needs to be restricted. Similar to `STRING`, but slightly less flexible. |
| **`CHAR(n)`** | Fixed-length string. Shorter values are padded with spaces. | `CHAR(10)` | Used less often. Suitable for fields with strictly fixed length. |
| **`DATE`** | Date, formatted as `YYYY-MM-DD` | `'2023-10-26'` | Stores dates. |
| **`TIMESTAMP`** | Timestamp with precision up to nanoseconds | `'2023-10-26 14:30:00.123'` | Stores exact points in time, such as log time or order creation time. |

**Best practices:**

- Prefer **`INT` for integers**, and use **`BIGINT` for very large numbers**.
- Prefer **`DOUBLE` for floating-point values**, and always use **`DECIMAL` for money or exact values**.
- Prefer **`STRING` for text**.

### 2. Complex Types

Complex types are one of the powerful features that distinguish Hive from traditional SQL. They allow structured collections to be stored in a single column, which is especially useful for semi-structured data such as JSON.

| Type | Description | Definition and Example Data | Access and Query Method |
| --- | --- | --- | --- |
| **`ARRAY<data_type>`** | An array of elements with the same type. Indexes start from 0. | `hobbies ARRAY<STRING>` data: `['basketball', 'music', 'reading']` | `SELECT hobbies[0] FROM user; -- Gets 'basketball'` `SELECT hobby FROM user LATERAL VIEW explode(hobbies) tmp AS hobby; -- Explodes the array` |
| **`MAP<primitive_type, data_type>`** | A collection of key-value pairs. Keys must be primitive types. | `properties MAP<STRING, STRING>` data: `{'age' -> '25', 'city' -> 'Chengdu'}` | `SELECT properties['city'] FROM user; -- Gets 'Chengdu'` `SELECT map_keys(properties) FROM user; -- Gets all keys` |
| **`STRUCT<col_name : data_type, ...>`** | Similar to a struct in C. It can contain multiple named fields. | `address STRUCT<province:STRING, city:STRING, detail:STRING>` data: `{'Sichuan', 'Chengdu', 'Tianfu Third Street'}` | `SELECT address.city FROM user; -- Gets 'Chengdu'` |
| **`UNIONTYPE<data_type, ...>`** | One of multiple possible data types. | Used less often. Basic understanding is enough. | |

**Example DDL:**

```sql
CREATE TABLE IF NOT EXISTS user_info (
    uid BIGINT COMMENT 'User ID',
    name STRING COMMENT 'Name',
    salary DECIMAL(10,2) COMMENT 'Salary',
    tags ARRAY<STRING> COMMENT 'User tags',
    ext_info MAP<STRING, STRING> COMMENT 'Extended information, for example: {"department":"bigdata","level":"P6"}',
    address STRUCT<province:STRING, city:STRING, district:STRING> COMMENT 'Residential address'
)
COMMENT 'User information table'
PARTITIONED BY (dt STRING COMMENT 'Partitioned by day')
ROW FORMAT DELIMITED
FIELDS TERMINATED BY '\t'
COLLECTION ITEMS TERMINATED BY ','
MAP KEYS TERMINATED BY ':'
STORED AS TEXTFILE;
```

**Advantages of complex types:** They avoid the large number of `NULL` values and rigid table structures caused by flattening every field. This makes the data model closer to business logic.

### 3. Type Conversion and NULL

- **Implicit conversion**: Hive automatically performs type conversion when necessary, such as converting `INT` to `DOUBLE`. However, reverse conversions such as `DOUBLE` to `INT`, or conversions from `STRING` to numeric types, may fail or lose precision.
- **Explicit conversion**: Use the `CAST` function, for example `CAST('123' AS INT)`.
- **NULL values**: Fields of all Hive data types support `NULL`. Any operation or comparison involving `NULL` returns `NULL`. Use `WHERE column IS NULL` when filtering for null values.

## 2. Hive Data Model

Hive includes several data models, including database, table, external table, partition, and bucket. These models define logical structures such as tables, databases, and partitions, as well as their physical mapping on HDFS.

| Component | Meaning and HDFS Representation | Use Cases and Purpose |
| --- | --- | --- |
| **Database (DB)** | A **namespace** used to organize and manage tables.<br>On HDFS, it appears as a **subdirectory** under `${hive.metastore.warehouse.dir}`. | **Multi-project or multi-team management**: isolates tables for different businesses or projects under different databases to avoid name conflicts. For example, create `db_fin` for finance and `db_user` for user data. |
| **Table** | The **core logical data abstraction** in Hive.<br>On HDFS, it appears as a **subdirectory** under the database directory. Data files for the table are stored in this directory. | **Storing structured and semi-structured data**: the foundation of most data analysis and data warehouse construction, such as `user_info` and `order_fact`. |
| **External Table** | Similar to a regular table, but Hive **only manages its metadata, not the data lifecycle**.<br>Data files **can be stored in any specified HDFS path**. | **Very important**: 1. **Data sharing and safety**: data may be generated by other programs such as Spark or Flink, or shared across systems. Dropping the table should not delete the data. 2. **Standard choice for the ODS layer**: raw data layers often use external tables pointing to raw HDFS paths, decoupling data from computation. |
| **Partition** | A **partition** physically divides data into different **subdirectories** based on the value of a table column, usually date or region.<br>These directories are under the table directory.<br>Directory names look like `dt=2023-10-26`. | **Core optimization method**: 1. **Greatly improves query efficiency**: when the `WHERE` condition specifies partitions, Hive scans only the corresponding partition data instead of the entire table. This is called **partition pruning**. 2. **Manages data by time, region, and similar dimensions**: partitioning by `dt` or `province` is common in data warehouses. |
| **Bucket** | A **bucket** divides data into a fixed number of files based on the hash value of another column, either inside a partition or within the whole table.<br>It appears as multiple hash-distributed files under the same table directory. | **Advanced optimization method**: 1. **Improves JOIN and sampling efficiency**: if two tables are bucketed on the same column and their bucket counts are multiples of each other, `Map-Side Join` can be optimized. 2. **Helps with data skew**: combining bucketing with partitioning can sometimes reduce skew for skewed keys. 3. **Efficient random sampling**: `TABLESAMPLE` can sample buckets efficiently. |

---

### 1. Table: Internal Table or Managed Table

- In HDFS, a managed table appears as a directory under its database directory.

- **Essence**: Hive manages not only the table's **metadata**, such as table name, columns, and types, but also the full **data lifecycle**.

- **Creation and storage:**

  ```sql
  -- Create an internal table
  CREATE TABLE my_managed_table (
      id INT,
      name STRING
  );
  -- After loading data, the data files are stored in the Hive warehouse directory by default, for example:
  -- /user/hive/warehouse/mydb.db/my_managed_table/datafile1.txt
  ```

- **Effect of deletion**: When `DROP TABLE my_managed_table;` is executed, **both the table metadata and the data files on HDFS are deleted**.

- **Use cases:**

  - **Intermediate and result layers of a data warehouse**: for example, cleaned and transformed detail tables in DWD, or aggregated summary tables in DWS/DWT. These data sets are generated by Hive ETL jobs and fully managed by Hive.
  - **Temporary data or data with a clear lifecycle**: intermediate results that do not need to be shared with other engines.

---

### 2. External Table

- Similar to a regular table, but its **data location can be any specified path**.

- **Essence**: Hive manages only the table's **metadata**, but **does not manage the data itself**. The data files can be located anywhere on HDFS.

- **Creation and storage:**

  ```sql
  -- Create an external table. The `EXTERNAL` keyword and `LOCATION` clause are required.
  CREATE EXTERNAL TABLE my_external_table (
      log_time STRING,
      client_ip STRING
  )
  ROW FORMAT DELIMITED FIELDS TERMINATED BY ','
  LOCATION '/data/logs/web_server/'; -- Points to an existing HDFS path that contains data
  ```

- **Effect of deletion**: When `DROP TABLE my_external_table;` is executed, **only the metadata is deleted. The data files on HDFS remain unchanged**.

- **Use cases:**

  - **Raw data layer, or ODS, in a data warehouse**: **this is the classic use case**. Data from log collection tools such as Flume or message queues such as Kafka is usually written to fixed HDFS directories by other programs. External tables map those directories into Hive so the data can stay where it is while becoming queryable.
  - **Data sharing across multiple engines**: When the same data needs to be analyzed by Spark, Flink, Presto, and other engines, external tables are a best practice because they prevent one engine from accidentally deleting shared data.
  - **Creating tables on existing data files**: If data files already exist on HDFS, Hive only needs to create a metadata mapping for analysis.

**Internal Table vs. External Table: Common Interview Question**

| Feature | Internal Table / Managed Table | External Table |
| --- | --- | --- |
| **Keyword** | Default, or `MANAGED` | `EXTERNAL` |
| **Data management** | Hive **fully manages** the data | Hive **only manages metadata** |
| **Storage location** | Default warehouse directory | Any path specified by the user through `LOCATION` |
| **After `DROP TABLE`** | **Both metadata and data files are deleted** | **Only metadata is deleted; data files remain** |
| **Data warehouse layer** | DWD, DWS, ADS, temporary tables | **ODS, the raw data layer** |
| **Design philosophy** | "My data, my responsibility" | "Your data, I read it" |

---

### 3. Partition

- In HDFS, a partition appears as a **subdirectory** under the table directory.

- **Essence**: Based on the value of a column, usually date, region, or category, Hive **splits data into different subdirectories** in physical storage. The directory name format is `partition_column=value`.

- **Creation and storage:**

  ```sql
  -- Create a table partitioned by date (dt) and region (country)
  CREATE TABLE logs (
      user_id BIGINT,
      event STRING
  )
  PARTITIONED BY (dt STRING, country STRING); -- Partition columns are virtual columns and do not appear in the data file

  -- Load data into a specific partition
  LOAD DATA INPATH '/input/log_20231026_us.csv' INTO TABLE logs PARTITION (dt='2023-10-26', country='US');
  -- The HDFS storage path is similar to:
  -- /user/hive/warehouse/logs/dt=2023-10-26/country=US/datafile.csv
  -- /user/hive/warehouse/logs/dt=2023-10-26/country=CN/datafile.csv
  ```

- **Core value: partition pruning**. When a query contains partition conditions, Hive **only reads data under the relevant partition directories**, skipping unrelated partitions and greatly improving query performance.

  ```sql
  -- This query scans only the dt='2023-10-26', country='US' subdirectory instead of the whole table
  SELECT COUNT(*) FROM logs WHERE dt='2023-10-26' AND country='US';
  ```

- **Use cases:**

  - **Time-range queries**: **the most important and common use case**, such as partitioning by year, month, or day with `dt`, then querying one day's data.
  - **Filtering by business dimensions**: such as `country`, `province`, or `product_line`.
  - **Data lifecycle management**: expired partitions can be deleted efficiently with `ALTER TABLE DROP PARTITION`.

---

### 4. Bucket

- In HDFS, bucketing appears as **multiple files** under the same table or partition directory after hash distribution.

- **Essence**: Within a partition or a table, Hive calculates the **hash value** of a column and **evenly distributes** data into a fixed number of buckets, which are stored as files.

- **Creation and storage:**

  ```sql
  -- Create a table bucketed by user_id
  CREATE TABLE user_bucketed (
      user_id INT,
      username STRING
  )
  CLUSTERED BY (user_id) INTO 4 BUCKETS -- Hash user_id and distribute data into 4 bucket files
  STORED AS ORC;

  -- After data is inserted, 4 files appear under the table or partition directory on HDFS, for example:
  -- 000000_0, 000001_0, 000002_0, 000003_0
  -- Records with the same user_id hash value are always assigned to the same file.
  ```

  Final result after bucketing:

  ```textile
  user_orders_bucketed         user_info_bucketed
        bucket file 0                bucket file 0
        bucket file 1                bucket file 1
        bucket file 2                bucket file 2
        bucket file 3                bucket file 3
             |                            |
          Mapper 0                     Mapper 0
      (reads only bucket 0)        (reads only bucket 0)
              \                       /
          The same user_id is already in the same bucket.
          The JOIN can be performed locally in the mapper.
  ```

- **Core value:**

  1. **Efficient sampling**: `TABLESAMPLE(BUCKET x OUT OF y)` can directly sample specific buckets efficiently and randomly.
  2. **Improved performance for specific JOINs**: If two tables are bucketed by the same JOIN key and their bucket counts are multiples of each other, Hive can trigger an efficient **bucket map join**, reducing shuffle overhead significantly.
  3. **Data skew mitigation**: Hashing skewed keys into buckets may sometimes improve later processing.

- **Use cases:**

  - **Optimizing equi-joins between very large tables**: this is one of the most important use cases for bucketing.
  - **Scenarios that require efficient random sampling**.
  - **Combining with partitioning**: first partition by time, then bucket by user ID within each partition to form a two-level data organization strategy.

- **Costs and notes for bucketing:**

  1. **Lower write performance**: writing requires hash calculation and correct bucket placement, so it is slower than direct writing.
  2. **Small file problem**: too many buckets create many small files, affecting HDFS and Hive performance.
  3. **Hash collisions**: different values may hash into the same bucket, though the probability is small.
  4. **Data skew**: if the bucket column has an uneven value distribution, some buckets may become much larger than others.

- **Bucketing principles:**

  - Rule of thumb for choosing the number of buckets: each bucket file should ideally be 200 MB to 1 GB. For example, if a table is 100 GB and the target size of each bucket is 500 MB, the number of buckets is `100 GB / 0.5 GB = 200`.

  - Principles for choosing a bucket column:

    - a) A high-cardinality column with many distinct values.
    - b) A column frequently used as a JOIN condition.
    - c) A column frequently used in `WHERE` equality filters.
    - d) A column that does not cause data skew.

---

### 5. View

A view is a **logical virtual table** in Hive. It does not store actual data. Instead, it simplifies queries by hiding complex data operations such as joins, subqueries, filters, and data flattening.

Once a view is created, its schema is fixed immediately. Later changes to the underlying table, such as adding new columns, do not affect the view's schema. If the underlying table disappears, queries against the view will fail. Therefore, views should be used carefully for frequently changing tables in ETL and data warehouse systems.

- **Essence**: an encapsulation of a predefined query statement.

- **Creation and usage:**

  ```sql
  -- Create a view based on an existing complex query
  CREATE VIEW view_user_summary AS
  SELECT
      user_id,
      COUNT(*) AS pv_count,
      MAX(event_time) AS last_active_time
  FROM dwd_user_event
  WHERE dt >= '2023-10-01'
  GROUP BY user_id;

  -- Use the view like a regular table
  SELECT * FROM view_user_summary WHERE pv_count > 100;
  -- Change view properties
  ALTER VIEW view_user_summary SET TBLPROPERTIES('comment'='This is a view');
  -- Redefine the view
  ALTER VIEW view_user_summary AS SELECT * FROM dwd_user_event;
  -- Drop the view
  DROP VIEW view_user_summary;
  ```

- **Core value:**

  1. **Simplifies complex queries**: encapsulates multi-table joins, complex filters, and aggregation logic, making them transparent to users.
  2. **Data security and permission control**: permissions can be granted only on the view, which may contain selected columns or rows, without exposing the underlying raw table.
  3. **Logical abstraction**: provides customized data perspectives for different business scenarios. Even if the underlying table structure changes, the view can be updated to hide the impact.

- **Difference from tables**: A view does not occupy HDFS storage space, except for metadata. Its data is dynamically calculated at query time.

### Comprehensive Example: E-Commerce Data Warehouse Scenario

The following complete example connects the four models described above:

```sql
-- 1. Create an external table in the ODS layer, pointing to the raw Nginx log directory
CREATE EXTERNAL TABLE ods_nginx_log (
    ip STRING,
    request_time STRING,
    url STRING,
    user_id INT
)
PARTITIONED BY (dt STRING)
LOCATION '/data/ods/nginx_log/';

-- 2. Create an internal table in the DWD layer for cleaned detail data, with bucketing
CREATE TABLE dwd_user_pv (
    user_id INT,
    session_id STRING,
    page_url STRING,
    view_time TIMESTAMP
)
PARTITIONED BY (dt STRING)
CLUSTERED BY (user_id) INTO 32 BUCKETS
STORED AS ORC;

-- 3. Insert data from the ODS layer into the DWD layer and use partition pruning
INSERT OVERWRITE TABLE dwd_user_pv PARTITION (dt='2023-10-26')
SELECT
    user_id,
    get_session_id(url) as session_id,
    url,
    parse_time(request_time) as view_time
FROM ods_nginx_log
WHERE dt='2023-10-26'
  AND user_id IS NOT NULL;
```

### Combining Learning with Practice: A Complete Example

Suppose you need to build a user behavior log table for an e-commerce company. You can design it as follows:

```sql
-- 1. Create a database, which corresponds to a DB and creates a directory on HDFS
CREATE DATABASE IF NOT EXISTS dw_web;
USE dw_web;

-- 2. Create an external table, pointing to the raw log path
CREATE EXTERNAL TABLE IF NOT EXISTS ods_user_log (
    user_id BIGINT COMMENT 'User ID',
    device_id STRING COMMENT 'Device ID',
    event_name STRING COMMENT 'Event name',
    event_time TIMESTAMP COMMENT 'Event time',
    page_info STRUCT<url:STRING, referer:STRING> COMMENT 'Page information',
    properties MAP<STRING, STRING> COMMENT 'Event properties'
)
COMMENT 'Raw user behavior log table'
PARTITIONED BY (`dt` STRING COMMENT 'Partitioned by day, format yyyymmdd')
ROW FORMAT DELIMITED
FIELDS TERMINATED BY '\001'
STORED AS ORC
LOCATION '/data/ods/web/user_log';

-- 3. Add a specific partition. Data goes under /data/ods/web/user_log/dt=20231026/
ALTER TABLE ods_user_log ADD PARTITION (dt='20231026');

-- 4. Based on the ODS layer, create a bucketed DWD detail table
CREATE TABLE dwd_user_event (
    user_id BIGINT,
    event_name STRING,
    hour STRING
    -- ... other cleaned fields
)
PARTITIONED BY (dt STRING)
CLUSTERED BY (user_id) INTO 32 BUCKETS
STORED AS ORC;

-- 5. Use partition pruning during queries to greatly improve efficiency
SELECT COUNT(*)
FROM ods_user_log
WHERE dt = '20231026'
  AND event_name = 'purchase';
```