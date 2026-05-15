## 一、不分区+不分桶

假设两张表分别为orders、users（后面直接简称为A、B表）。执行普通JOIN（无分区、无分桶）会发生什么？

### 1、表结构

```sql
-- 表结构和数据
CREATE TABLE orders (
    order_id BIGINT,
    user_id BIGINT,
    amount DECIMAL(10,2),
    order_time TIMESTAMP
);

CREATE TABLE users (
    user_id BIGINT,
    name STRING,
    city STRING
);
```

### 2、物理存储

```textile
HDFS路径：
/user/hive/warehouse/orders/
    ├── 000000_0  (100GB，杂乱存储)
    ├── 000000_1
    └── ...
/user/hive/warehouse/users/
    ├── 000000_0  (10GB，杂乱存储)
    └── ...
```

假设 orders 表 100GB，HDFS 默认 128MB 一个 block，那么会被切成约 800 个 block，**随机分散在集群几十/几百台机器上**：

```textile
机器1: orders的block_001, block_017, block_233 ...
机器2: orders的block_002, block_089, block_456 ...
机器3: orders的block_003, users的block_012 ...
...
```

**HDFS 存储时不关心 user_id 的值**，只按"写入顺序 + 128MB 切块"分散
👉 也就是说：**同一个 user_id 对应的 A 表记录和 B 表记录，几乎一定不在同一台机器上**。

### 3、Join 的本质要求：相同 key 必须"碰面"

SQL 的 `ON o.user_id = u.user_id` 本质是要做：

> 对于每一个 `user_id` 值，把 A 表里所有这个 user_id 的行 + B 表里所有这个 user_id 的行，**放到同一个地方**，然后两两配对。

**举个例子**，`user_id=1001`：

- A 表（orders）里有 5 条订单
- B 表（users）里有 1 条用户信息
- Join 结果 = 5 × 1 = 5 行

要完成这个匹配，**这 6 条记录必须出现在同一个进程的内存里**，否则根本无法对比。

### 4、执行过程（Reduce Join / Common Join）

```sql
;

-- 查询：按user_id JOIN
SELECT o.*, u.name
FROM orders o
JOIN users u ON o.user_id = u.user_id
WHERE o.order_tim
```

#### 4.1、Map

每个 Map 任务只能读取自己机器上的一个 block（数据本地性原则）：

```
Map任务1（在机器1上）：读 orders 的 block_001
  → 看到了 user_id = 1001, 2003, 1001, 5008 ...

Map任务2（在机器2上）：读 orders 的 block_002
  → 看到了 user_id = 1001, 3007, 8002 ...

Map任务800（在机器30上）：读 users 的 block_012
  → 看到了 user_id = 1001, 1002, 1003 ...
```

**map 任务彼此之间是隔离的，无法通信**。Map1 不知道 Map2 看到了什么，更不知道 users 表的 1001 在哪里。所以必须 Shuffle —— 它就 是"重新洗牌"

#### 4.2、Shuffle

Shuffle 的作用：**按 join key 对所有数据重新分组,把相同 key 的数据搬运到同一个 Reducer**。

```
Shuffle 规则： reducer_id = hash(user_id) % R

假设 R=3：
  user_id=1001 → hash%3=0 → 全部送到 Reducer0
  user_id=2003 → hash%3=1 → 全部送到 Reducer1
  user_id=5008 → hash%3=2 → 全部送到 Reducer2
```

无论 `user_id=1001` 原本在哪台机器、哪个 block、来自 A 表还是 B 表，**Shuffle 后都会被搬到 Reducer0**。

#### 4.3、Reduce

- **1、收集**：到了 Reducer0，它收到的所有具有相同JOIN键的记录, `user_id=1001` 的记录长这样：
  
  ```sql
  user_id=1001, order_id=8001, amount=99.0
  user_id=1001, order_id=8002, amount=50.0
  user_id=1001, order_id=8003, amount=120.0
  user_id=1001, name="张三", city="成都"
  ```

- **2、分组**：Reducer 在内存里把来自两表的记录按JOIN键分组
  
  - A 组（orders）：3 条
  
  - B 组（users）：1 条

- **3、JOIN**：在组内进行笛卡尔积：3 × 1 = 3 条 Join 结果输出。

#### 4.4 总结

```markdown
Map阶段：
  - 启动M个Map任务读取orders表  ===> 输出键值对：<order_id,B记录>  <order_id,B记录> ...
  - 启动N个Map任务读取users表   ===> 输出键值对：<user_id,A记录>  <user_id,A记录> ...

Shuffle阶段： hash(user_id) 网络传输重新分组 ⭐⭐⭐⭐⭐ 性能瓶颈！
  - 所有记录按user_id哈希，发送到R个Reducer
  - 网络传输：100GB + 10GB = 110GB全部通过网络传输
  - 如果某个user_id有大量订单（大V用户），会发送到同一个Reducer

Reduce阶段：每个Reducer内做笛卡尔积
  - 每个Reducer接收特定user_id范围的所有记录
  - 在Reducer内存中分组：orders记录 vs users记录
  - 执行笛卡尔积：orders × users
```

### 5、引申出分区/分表的概念

到这里应该能明白：为什么"都在HDFS存储了"，Join还要网络传输到内存才能计算了吧！

| 误解                    | 真相                                                                     |
| --------------------- | ---------------------------------------------------------------------- |
| HDFS 是共享存储，数据已经"在一起"了 | HDFS 是**分布式存储**，数据**物理上分散**在几百台机器的磁盘上                                  |
| 读取就能 Join             | 读取只能拿到"局部数据"，Join 需要"全局按 key 聚合"                                       |
| Shuffle 没必要           | **Shuffle 是分布式计算里"让相同 key 相遇"的唯一手段**（除非用 Map Join / Bucket Join 提前规划好） |

## 二、分区+不分桶

### 1、表结构

```sql
CREATE TABLE orders_partitioned (
    order_id BIGINT,
    user_id BIGINT,
    amount DECIMAL(10,2)
)
PARTITIONED BY (dt STRING);  -- 按天分区

CREATE TABLE users (  -- users表通常不分区，因为用户维度表变化慢
    user_id BIGINT,
    name STRING,
    city STRING
);
```

### 2、物理存储

```markdown
HDFS路径：
/user/hive/warehouse/orders_partitioned/
    ├── dt=2024-01-01/  (1GB)
    ├── dt=2024-01-02/  (1GB)
    ├── dt=2024-01-03/  (1GB)
    └── ... (共100天，100GB)

/users/
    └── 000000_0  (10GB)
```

### 3、执行过程

```sql
-- 带分区条件的查询
SELECT o.*, u.name
FROM orders_partitioned o
JOIN users u ON o.user_id = u.user_id
WHERE o.dt = '2024-01-01';  -- 关键：使用分区条件
```

#### 3.1、Map

```sql
启动 机器数 个 Map 任务，每个任务只处理一对桶
1. Map任务1（在机器1上）：读 orders 的 block_001
    Key: user_id
    Value: 用户记录
2. 流式读取orders表桶i的数据
3. 第i个Map任务：
    对每条order记录，在HashMap中查找匹配的user_id
    读取orders表的桶i文件 + users表的桶i文件
    在内存中直接JOIN（因为相同user_id必然在同一编号桶中）小表桶加载到 HashMap，大表桶流式扫描匹配
4. 输出结果
```

- **分区裁剪（Partition Pruning）**：只扫描 `dt>='2024-01-01'` 的目录，**100GB 可能只读 10GB**
- 但读出来的数据**user_id 依然是乱的**

#### 3.2、Shuffle

- user_id 在分区内**完全随机分布**，`user_id=1001` 可能出现在任何一个分区的任何一个文件
- **依然要按 user_id 哈希，全网传输 → Shuffle 不可避免**

Shuffle 的作用：按 join key 对所有数据重新分组,把相同 key 的数据搬运到同一个 Reducer。

```
Shuffle 规则： reducer_id = hash(user_id) % R

假设 R=3：
  user_id=1001 → hash%3=0 → 全部送到 Reducer0
  user_id=2003 → hash%3=1 → 全部送到 Reducer1
  user_id=5008 → hash%3=2 → 全部送到 Reducer2
```

无论 `user_id=1001` 原本在哪台机器、哪个 block、来自 A 表还是 B 表，**Shuffle 后都会被搬到 Reducer0**。

#### 3.3、Reduce

到了 Reducer0，它收到的所有 `user_id=1001` 的记录长这样：

```
user_id=1001, order_id=8001, amount=99.0
user_id=1001, order_id=8002, amount=50.0
user_id=1001, order_id=8003, amount=120.0
user_id=1001, name="张三", city="成都"
```

Reducer 在内存里**按表来源分成两组**：

- A 组（orders）：3 条
- B 组（users）：1 条

然后做笛卡尔积：3 × 1 = 3 条 Join 结果输出。

#### 3.4 总结

```markdown
Map阶段：
  - orders表：只启动Map任务读取dt=2024-01-01分区（1GB）===> 输出键值对：<order_id,B记录> <order_id,B记录> ...
  - users表：启动Map任务读取全部（10GB） ===> 输出键值对：<user_id,A记录> <user_id,A记录> ...

Shuffle阶段：
  - 所有记录按user_id哈希，发送到R个Reducer
  - 网络传输：1GB(orders) + 10GB(users) = 11GB
  - 相比普通JOIN的110GB，减少90%！

Reduce阶段：(同普通JOIN)
  - 每个Reducer接收特定user_id范围的所有记录
  - 在Reducer内存中分组：orders记录 vs users记录
  - 执行笛卡尔积：orders × users
```

**分区 = 减少输入数据量，但 Shuffle 一分都没少。** 如果 WHERE 条件不带分区字段，分区等于白做。

### 4、分区设计原则

```sql
-- 按时间分区（最常用）
PARTITIONED BY (dt STRING, hour STRING)

-- 按业务维度分区
PARTITIONED BY (country STRING, province STRING)

-- 分区不宜过多，否则产生大量小文件
-- 每个分区数据量建议：100MB-2GB
```

## 三、分桶+不分区

### 1.1、表结构(小表桶+大表桶) HashMap

```sql
CREATE TABLE orders_bucketed (
    order_id BIGINT,
    user_id BIGINT,
    amount DECIMAL(10,2),
    order_time TIMESTAMP
)
CLUSTERED BY (user_id) INTO 32 BUCKETS;  -- 按user_id分32个桶

CREATE TABLE users_bucketed (
    user_id BIGINT,
    name STRING,
    city STRING
)
CLUSTERED BY (user_id) INTO 32 BUCKETS;  -- 同样分32个桶

-- 设置参数启用桶优化
SET hive.optimize.bucketmapjoin = true;
SET hive.optimize.bucketmapjoin.sortedmerge = true;
```

### 1.2、表结构(大表桶+大表桶) SMB Join（Sort Merge Bucket Join）

```sql
CREATE TABLE orders_bucketed (
    order_id BIGINT,
    user_id BIGINT,
    amount DECIMAL(10,2),
    order_time TIMESTAMP
)
CLUSTERED BY (user_id) SORTED BY (user_id) INTO 32 BUCKETS;  -- 按user_id分32个桶 + 排序：

CREATE TABLE users_bucketed (
    user_id BIGINT,
    name STRING,
    city STRING
)
CLUSTERED BY (user_id)  SORTED BY (user_id) INTO 32 BUCKETS;  -- 同样分32个桶 + 排序：


SET hive.optimize.bucketmapjoin.sortedmerge = true;
SET hive.auto.convert.sortmerge.join = true;
```

### 2、物理存储

```markdown
HDFS路径：
/user/hive/warehouse/orders_bucketed/
    ├── 000000_0  (桶0：user_id哈希后%32=0的记录)
    ├── 000001_0  (桶1)
    ├── ...
    └── 000031_0  (桶31)

/users_bucketed/
    ├── 000000_0  (桶0)
    ├── ...
    └── 000031_0  (桶31)
```

### 3、执行过程（启用Bucket Map Join）

```sql
SELECT o.*, u.name
FROM orders_bucketed o
JOIN users_bucketed u ON o.user_id = u.user_id
WHERE o.order_time >= '2024-01-01';
```

#### 3.1、Map

##### (小表桶+大表桶) 小表桶加载到HashMap+大表桶流式扫描匹配

**A表的桶0 和 B表的桶0，包含的 user_id 是完全一致的集合！**

因为两边都用 `hash(user_id) % 32` 分桶，所以 `user_id=1001` 在 A 表必在桶 X，在 B 表也必在桶 X。

```text
启动 32 个 Map 任务，每个任务只处理一对桶
1. 将users表桶i的全部数据加载到内存的HashMap中，内存占用：≈ users表桶大小
    Key: user_id
    Value: 用户记录
2. 流式读取orders表桶i的数据
3. 第i个Map任务：
    对每条order记录，在HashMap中查找匹配的user_id
    读取orders表的桶i文件 + users表的桶i文件
    在内存中直接JOIN（因为相同user_id必然在同一编号桶中）小表桶加载到 HashMap，大表桶流式扫描匹配
4. 输出结果
```

##### (大表桶+大表桶) Sort Merge Bucket Join

```text
启动 32 个 Map 任务，每个任务只处理一对桶
1. 第i个Map任务：
    双指针归并读取users表桶i的数据
    双指针归并读取order表桶i的数据
    在内存中直接JOIN（因为相同user_id必然在同一编号桶中）
2. 输出结果
```

那么连 HashMap 都不用建，**双指针归并**即可，内存几乎为 0，可处理超大表 Join 超大表。

#### 3.2、Shuffle（跳过）

**Shuffle阶段** ✅ **完全跳过！**

- 因为相同 key 已经在同一个桶里"碰面"了，**没有跨机器传输的必要**

#### 3.3、Reduce（跳过）

在map阶段就已经join并合并结果了，是**完整的数据分组**！不需要 Reducer将相同userId的记录合并

- Map任务0处理了**所有**user_id哈希值为0的记录

- Map任务1处理了**所有**user_id哈希值为1的记录

- 没有跨任务的重叠数据（每个任务的userId本来就是相同的），所以不需要合并

#### 3.4、总结

```markdown
Map阶段：
  - 启动M个Map任务读取orders表  ===> 输出键值对：<order_id,B记录>  <order_id,B记录> ...
  - 启动M个Map任务读取users表   ===> 输出键值对：<user_id,A记录>  <user_id,A记录> ...
  - 读取orders表的桶i文件 + users表的桶i文件
  - 在内存中直接JOIN（因为相同user_id必然在同一编号桶中）
- 输出结果
无Shuffle阶段！⭐⭐⭐⭐⭐
```

### 4、特殊分桶

#### 情况1：只对一张表分桶

```sql
-- orders分桶，users未分桶
SELECT o.*, u.name
FROM orders_bucketed o  -- 分桶表
JOIN users u            -- 未分桶表
ON o.user_id = u.user_id;

-- 执行过程：
-- 如果users小：Map Join（广播users表到所有Map任务）
-- 如果users大：Reduce Join（退化为普通JOIN，分桶优势很小）
-- 最差的分桶情况
```

只有A表分桶，B表广播

```textile
Map任务数：64个（A表的每个桶一个任务）
每个Map任务处理：
  - order表：1个桶文件（1/64的A表数据）
  - users表：如果users小,Map Join（广播整个users表到64个Map任务）
            如果users大：Reduce Join（退化为普通JOIN，分桶优势很小）
  - 内存压力：每个任务都需要缓存整个B表
网络传输：B表被传输64次
```

#### 情况2：分桶但桶数不同

```sql
-- orders分64，users分32
SELECT o.*, u.name
FROM order_64_bucket o  -- 分桶表
JOIN users_32_bucket u            -- 未分桶表
ON o.user_id = u.user_id;
```

理想情况（两表都是64桶）

```sql
-- 最优效率：Bucket Map Join
Map任务数：64个
每个Map任务处理：
  - order表：1个桶文件（1/64的数据）
  - users表：1个桶文件（1/64的数据）
  - 总计：每个任务处理 1/32 的总数据量
无Shuffle，完全本地JOIN
```

混合情况（A表64桶，B表32桶）

```sql
-- 次优但高效的方案
Map任务数：64个
每个Map任务处理：
  - 处理users表的任务：1个桶文件（1/32的B表数据）
  - 处理order表的任务：2个桶文件（2/64 = 1/32的A表数据）
  - 注意：实际是order表和users表分开处理，但对应关系一致
无Shuffle，完全本地JOIN
```

#### 情况3：分桶JOIN后还要GROUP BY

```sql
SELECT u.city, COUNT(*) as order_count, SUM(o.amount) as total_amount
FROM orders o
JOIN users u ON o.user_id = u.user_id
GROUP BY u.city;
```

执行计划变化

```markdown
Map阶段（Bucket Map Join）：
  - 每个Map任务执行本地JOIN
  - 然后执行本地预聚合（Partial Aggregation）
  - 输出：<city, (count, sum)>

Reduce阶段（这次有了！）：
  - 收集所有Map任务的本地聚合结果
  - 按city合并：sum(count), sum(sum)
  - 输出最终结果
```

**注意**：此时仍然有Reduce，但：

1. Reduce的输入已经是**聚合后的中间结果**，数据量小很多

2. 主要的JOIN工作已经在Map端完成，避免了大数据Shuffle

## 四、分桶+分区

### 1、表结构

```sql
CREATE TABLE orders_partitioned (
    order_id BIGINT,
    user_id BIGINT,
    amount DECIMAL(10,2)
)
PARTITIONED BY (dt STRING);  -- 按天分区
CLUSTERED BY (user_id) SORTED BY (user_id) INTO 32 BUCKETS;  -- 按user_id分32个桶 + 排序：

CREATE TABLE users (  -- users表通常不分区，因为用户维度表变化慢
    user_id BIGINT,
    name STRING,
    city STRING
);
CLUSTERED BY (user_id) SORTED BY (user_id) INTO 32 BUCKETS;  -- 按user_id分32个桶 + 排序：

SET hive.optimize.bucketmapjoin = true; -- 允许优化器把 Join 转成 Bucket Map Join
SET hive.optimize.bucketmapjoin.sortedmerge = true; -- 允许优化器把 Join 转成 SMB Join
SET hive.auto.convert.sortmerge.join = true;
```

### 2、物理存储

```textile
HDFS路径：
/user/hive/warehouse/orders_partitioned/
    ├── dt=2024-01-01/  (1GB)
    │   ├── 000000_0  ← 桶0文件
    │   ├── 000001_0  ← 桶1文件
    │   ├── ...
    │   └── 000031_0  ← 桶31文件
    ├── dt=2024-01-03/  (1GB)
    │   ├── 000000_0  ← 桶0文件
    │   ├── 000001_0  ← 桶1文件
    │   ├── ...
    │   └── 000031_0  ← 桶31文件
    └── ... (共100天，100GB)

/users_bucketed/
    ├── 000000_0  (桶0)
    ├── ...
    └── 000031_0  (桶31)
```

### 3、执行过程

```sql
-- 带分区条件的查询
SELECT o.*, u.name
FROM orders_partitioned o
JOIN users u ON o.user_id = u.user_id -- 关键：使用分桶条件
WHERE o.dt = '2024-01-01';  -- 关键：使用分区条件
```

#### 3.1、Map

由于使用`PARTITIONED BY (dt STRING);`根据天进行了分区，

```sql
启动 32 个 Map 任务，每个任务只处理一对桶

1. 第i个Map任务：
    双指针归并读取users表桶i的数据
    双指针归并读取order表桶i的数据
    在内存中直接JOIN（因为相同user_id必然在同一编号桶中）
2. 输出结果
```

**Map阶段** ✅ 优化点：

- **分区裁剪（Partition Pruning）**：只扫描 `dt>='2024-01-01'` 的目录，**100GB 可能只读 10GB**
- 但读出来的数据**user_id 依然是乱的**

那么连 HashMap 都不用建，**双指针归并**即可，内存几乎为 0，可处理超大表 Join 超大表。

#### 3.2、Shuffle（跳过）

**Shuffle阶段** ✅ **完全跳过！**

- 因为相同 key 已经在同一个桶里"碰面"了，**没有跨机器传输的必要**

#### 3.3、Reduce（跳过）

在map阶段就已经join并合并结果了，是**完整的数据分组**！不需要 Reducer将相同userId的记录合并

- Map任务0处理了**所有**user_id哈希值为0的记录

- Map任务1处理了**所有**user_id哈希值为1的记录

- 没有跨任务的重叠数据（每个任务的userId本来就是相同的），所以不需要合并

#### 3.4 总结

```markdown
Map阶段：
  - 启动M个Map任务读取orders表  ===> 输出键值对：<order_id,B记录>  <order_id,B记录> ...
  - 启动M个Map任务读取users表   ===> 输出键值对：<user_id,A记录>  <user_id,A记录> ...
  - 读取orders表的桶i文件 + users表的桶i文件
  - 在内存中直接JOIN（因为相同user_id必然在同一编号桶中）
- 输出结果
无Shuffle阶段！⭐⭐⭐⭐⭐
```

**分区 = 减少输入数据量，但 Shuffle 一分都没少。** 如果 WHERE 条件不带分区字段，分区等于白做。

## 五、最佳实践总结

1. **分桶设计原则**：
   
   选择高基数、常作为JOIN条件的列
   
   桶数计算：总数据量 / 每个桶目标大小(200MB-1GB) 例如：100GB数据，目标500MB/桶 → 200个桶
   
   确保频繁JOIN的表在JOIN键上分桶，且桶数相同或成倍数
   
   ```sql
   -- 最佳：桶数相同
   CREATE TABLE table_a CLUSTERED BY (key) INTO 64 BUCKETS;
   CREATE TABLE table_b CLUSTERED BY (key) INTO 64 BUCKETS;
   
   -- 可接受：桶数成倍数（大表桶数是小表的整数倍）
   CREATE TABLE large_table CLUSTERED BY (key) INTO 64 BUCKETS;  -- 大表
   CREATE TABLE small_table CLUSTERED BY (key) INTO 32 BUCKETS;  -- 小表
   
   -- 避免：桶数不成倍数
   CREATE TABLE table_a CLUSTERED BY (key) INTO 64 BUCKETS;
   CREATE TABLE table_b CLUSTERED BY (key) INTO 30 BUCKETS;  -- 不好！
   ```
- **配置调优**：
  
  ```sql
  -- 确保启用桶优化
  SET hive.optimize.bucketmapjoin = true;
  SET hive.optimize.bucketmapjoin.sortedmerge = true;
  SET hive.enforce.bucketing = true;  -- 确保写入时正确分桶
  SET hive.enforce.sorting = true;    -- 如果使用sortedmerge，需要排序
  ```

- **监控与验证**：
  
  ```sql
  -- 查看桶的统计信息
  DESCRIBE FORMATTED table_a;
  
  -- 检查桶数是否匹配
  SHOW TBLPROPERTIES table_a;
  SHOW TBLPROPERTIES table_b;
  
  -- 查看执行计划确认优化
  EXPLAIN EXTENDED
  SELECT /*+ MAPJOIN(b) */ a.*, b.*
  FROM table_a a JOIN table_b b ON a.key = b.key; 
  ```

## 六、性能量化对比

假设：

- 总数据量：A表（100GB），B表（10GB）

- 集群节点：10个

- 每个节点内存：16GB

**效率对比表**

| 场景               | 任务类型         | 总数据移动          | 内存使用                         | 网络开销 | 执行时间估算      |
| ---------------- | ------------ | -------------- | ---------------------------- | ---- | ----------- |
| 不分桶（Reduce Join） | Map + Reduce | 110GB全部Shuffle | 中等                           | 极高   | 慢（5-10分钟）   |
| **只有A分桶，B广播**​   | Map Only     | B表广播10次（100GB） | 极高（每个节点存10GB B表）             | 高    | 中等（2-3分钟）   |
| **A64桶，B32桶**​   | Map Only     | 无Shuffle，本地读取  | 低（每个任务约0.3GB A + 0.3GB B）    | 极低   | 快（1-2分钟）    |
| **都分桶64桶**​      | Map Only     | 无Shuffle，本地读取  | 最低（每个任务约0.16GB A + 0.16GB B） | 极低   | 最快（30秒-1分钟） |

- **内存效率**：混合分桶每个任务只处理1/32的数据，内存压力小

- **网络效率**：混合分桶无Shuffle，只有A分桶需要广播整个B表

- **计算效率**：两者都是Map-Only，但混合分桶的数据本地性更好

## 七、参数设置

**配置速览表**

| 配置项                                       | 作用阶段    | 作用对象 | 默认值（不同版本）         | 一句话说明                          |
| ----------------------------------------- | ------- | ---- | ----------------- | ------------------------------ |
| `hive.optimize.bucketmapjoin`             | **查询时** | 读    | false             | 允许优化器把 Join 转成 Bucket Map Join |
| `hive.optimize.bucketmapjoin.sortedmerge` | **查询时** | 读    | false             | 允许优化器把 Join 转成 SMB Join        |
| `hive.enforce.bucketing`                  | **写入时** | 写    | Hive 2.x 起默认 true | 强制 INSERT 时按桶数生成对应 reducer     |
| `hive.enforce.sorting`                    | **写入时** | 写    | Hive 2.x 起默认 true | 强制 INSERT 时按 SORTED BY 排序      |

> 📌 **关键区分**：`optimize.*` 是"**查询读取时的优化开关**"，`enforce.*` 是"**数据写入时的约束开关**"。两者必须配合使用，否则查询优化没有数据基础。

---

### 1️⃣ `hive.optimize.bucketmapjoin = true`

**作用**：告诉 Hive 优化器——如果检测到 Join 两边的表都按 Join Key 分桶，且桶数成倍数关系，就**自动把 Common Join（Reduce Join）转换成 Bucket Map Join**。

**触发条件**（必须全部满足）：

- ✅ 两张表都用 `CLUSTERED BY (join_key)` 分桶
- ✅ 分桶字段 = Join 字段
- ✅ 桶数成**整数倍**关系（如 32 vs 32，或 32 vs 8）
- ✅ Join 类型为 INNER / LEFT / RIGHT（不支持 FULL OUTER）

**没开会怎样？** 即使表分桶了，Hive 也会**当成普通表**走 Common Join，分桶白做、Shuffle 照常发生。

**开了之后的执行变化**：

```
Before (Common Join):  Map → Shuffle → Reduce ❌
After  (Bucket MJ):    Map (桶对桶直接Join) → 输出 ✅
```

---

### 2️⃣ `hive.optimize.bucketmapjoin.sortedmerge = true`

**作用**：在 Bucket Map Join 基础上**再进一步**——如果两张表不仅分桶，还**按 Join Key 排序**了，就用 **SMB Join (Sort Merge Bucket Join)**。

**触发条件**（在 Bucket Map Join 基础上加一条）：

- ✅ 满足 Bucket Map Join 所有条件
- ✅ 两张表都用了 `SORTED BY (join_key)` 排序

**SMB Join 比普通 Bucket Map Join 强在哪？**

| 维度   | Bucket Map Join | SMB Join         |
| ---- | --------------- | ---------------- |
| 内存需求 | 小桶要全部装进 HashMap | **几乎零内存**（双指针归并） |
| 桶数要求 | 成倍数即可           | 必须**完全相等**       |
| 排序要求 | 不需要             | 必须按 Join Key 排序  |
| 适用场景 | 大表 Join 中表      | **超大表 Join 超大表** |

**归并原理**（这就是为什么不用内存）：

```
A表桶0(已排序): 1001 → 1003 → 1005 → 1008
B表桶0(已排序): 1001 → 1002 → 1005 → 1009
                ↓ 双指针对齐扫一遍即可
匹配: 1001 ✓, 1005 ✓
```

**配套推荐参数**：

```sql
SET hive.auto.convert.sortmerge.join = true; -- 自动转换为 SMB
SET hive.auto.convert.sortmerge.join.noconditionaltask = true;
```

---

### 3️⃣ `hive.enforce.bucketing = true`

**作用**：**INSERT 写入数据时**，强制 Hive 启动**正好等于桶数**的 reducer，确保数据按 `hash(bucket_col) % N` 严格分配到 N 个文件。

**为什么需要？** Hive 的分桶**不是数据库式的强约束**——你建表时声明了 `CLUSTERED BY (user_id) INTO 32 BUCKETS`，但**写入时如果不强制**，Hive 可能：

- 启动 100 个 reducer，写出 100 个文件 → 桶完全乱套
- 启动 5 个 reducer，写出 5 个文件 → 根本没有 32 桶
- 数据分配规则混乱 → 同一个 user_id 落到不同桶

**开启后的写入行为**：

```sql
NSERT INTO orders_bucketed SELECT * FROM orders_raw;
-- 自动行为：
-- 1. 启动正好 32 个 reducer
-- 2. 按 hash(user_id) % 32 分配数据
-- 3. 每个 reducer 输出一个桶文件 000000_0 ~ 000031_0
```

**不开会怎样？**

- 桶数和文件数不一致
- Bucket Map Join 时按桶号配对会**找错数据**或**直接报错**
- 查询结果可能不正确 ⚠️

> 📌 **Hive 2.x 起默认就是 true**，老版本（0.x、1.x）需要手动开。

---

### 4️⃣ `hive.enforce.sorting = true`

**作用**：和 `hive.enforce.bucketing` 配对——**INSERT 写入数据时**，对建表语句中的 `SORTED BY` 字段强制排序后再写入文件。

**为什么需要？** 建表时声明的：

```sql
CLUSTERED BY (user_id) SORTED BY (user_id) INTO 32 BUCKETS
```

**只是元数据声明**，Hive 默认不会真的去排序。如果不强制，写入的桶文件内部数据是乱的，SMB Join 时的"归并"前提就不成立。

**开启后的写入行为**：

```
桶0文件内容（开启sorting）：
  user_id=1001, ...
  user_id=1003, ...
  user_id=1005, ...
  user_id=1008, ...   ← 严格按 user_id 升序
```

**不开会怎样？**

- 桶内数据无序
- SMB Join 的归并算法直接失效
- 结果错误或回退到普通 Bucket Map Join ⚠️

---

### 四个参数的协作关系图

```
┌─────────────────────────────────────────────────────────────┐
│                        【写入侧】                            │
│   建表：CLUSTERED BY (user_id) SORTED BY (user_id) INTO 32  │
│                          │                                  │
│              ┌───────────┴───────────┐                      │
│              ▼                       ▼                      │
│   hive.enforce.bucketing    hive.enforce.sorting            │
│   （保证桶数正确）          （保证桶内有序）                  │
│              │                       │                      │
│              └──────数据落盘─────────┘                      │
│                          ▼                                  │
│             32个桶文件，每个内部有序 ✅                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        【查询侧】                            │
│              SELECT ... JOIN ...                            │
│                          │                                  │
│              ┌───────────┴───────────┐                      │
│              ▼                       ▼                      │
│  hive.optimize.bucketmapjoin    hive.optimize.              │
│  （启用桶对桶Join）              bucketmapjoin.sortedmerge   │
│                                  （启用SMB Join）            │
│                          │                                  │
│                          ▼                                  │
│              跳过 Shuffle，桶对桶归并 ✅                       │
└─────────────────────────────────────────────────────────────┘
```

---

### 典型踩坑场景

| 现象                              | 原因                                        | 解决                                                         |
| ------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| 表分桶了，但 Join 还是 Shuffle          | 没开 `hive.optimize.bucketmapjoin`          | 启用查询优化参数                                                   |
| 开了 bucketmapjoin，但 Join 报错或结果不对 | 写入时没开 `hive.enforce.bucketing`，桶文件数和声明不一致 | 重建表 + 开 enforce                                            |
| SMB Join 没生效，回退到 Bucket MJ      | 桶内未排序 / 没开 sortedmerge                    | 开 `enforce.sorting` + `optimize.bucketmapjoin.sortedmerge` |
| 桶数对，但 Join 结果有遗漏                | 写入时用了 `DISTRIBUTE BY` 但 hash 函数不同         | 用 `INSERT` 让 Hive 自动按桶规则写                                  |

---

### 生产环境推荐配置组合

#### A. 通用 Bucket Map Join 配置

```sql
-- 写入侧
SET hive.enforce.bucketing = true;
-- 查询侧
SET hive.optimize.bucketmapjoin = true;
SET hive.auto.convert.join = true; -- 自动判断是否走 Map Join
```

#### B. SMB Join 完整配置（超大表 Join 超大表）

```sql
-- 写入侧
SET hive.enforce.bucketing = true;
SET hive.enforce.sorting = true;
-- 查询侧
SET hive.optimize.bucketmapjoin = true;
SET hive.optimize.bucketmapjoin.sortedmerge = true;
SET hive.auto.convert.sortmerge.join = true;
SET hive.auto.convert.sortmerge.join.noconditionaltask = true;
SET hive.input.format = org.apache.hadoop.hive.ql.io.BucketizedHiveInputFormat;
```

---

一句话记忆口诀

> **`enforce.*` 管"写得规整"，`optimize.*` 管"读得聪明"。** **写时不规整，读时再优化也白搭；写时规整了，读时不开优化也浪费。**
