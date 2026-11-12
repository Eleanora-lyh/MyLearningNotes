[大数据面试题V3.0，约870篇牛客大数据面经480道面试题_牛客网](https://www.nowcoder.com/discuss/353159520220291072)

https://zhuanlan.zhihu.com/p/424296249 [大数据开发面经汇总【持续更新...】_牛客网](https://www.nowcoder.com/discuss/594817738107781120)

https://leetcode.cn/discuss/post/3516212/zi-jie-mian-jing-nian-xin-70wda-shu-ju-s-23r7/

[大数据开发面经_大数据面经-CSDN博客](https://blog.csdn.net/axzy5863/article/details/158429145)

[大数据开发（牛客）面试被问频率最高的几道面试题-腾讯云开发者社区-腾讯云](https://cloud.tencent.com/developer/article/2071876)

## 综合问题

### 为什么Spark比MapReduce快？

|      | MapReduce     | Spark       |
| ---- | ------------- | ----------- |
| 中间结果 | 每步落磁盘         | 放内存         |
| 类比   | 每算完一步存档，下步再读档 | 一直在内存算，最后才存 |
| 速度   | 慢             | 快10-100倍    |

磁盘比内存慢100倍以上，所以Spark快很多。另外Spark用DAG优化执行计划，减少不必要的shuffle。

### 宽依赖窄依赖

- **窄依赖**：父RDD每个分区只被子RDD**一个**分区使用（如map、filter）→ 可pipeline，不需要shuffle
- **宽依赖**：父RDD每个分区被子RDD**多个**分区使用（如groupByKey、join）→ 需要shuffle，是stage划分边界

> 类比：窄依赖 = 一个工人负责一道工序（流水线）；宽依赖 = 所有工人的结果都要汇总再重新分配（需要等待）

### 是否遇到过数据倾斜问题？如何解决的

症状：大多数Task很快完成，少数Task卡住很久。

排查：看Spark UI，找数据量异常大的Task。

解决：

1. 过滤NULL或异常key
2. 大表join小表用MapJoin（广播小表）
3. 热点key加随机前缀打散，聚合后去掉前缀二次聚合
4. 增大shuffle分区数（`spark.sql.shuffle.partitions`）
5. Spark 3.x开启AQE（自适应查询执行）自动处理

### Spark的shuffle有几种方式

- **HashShuffle**（已废弃）：按key哈希写文件，文件数=Map数×Reduce数，文件太多
- **SortShuffle**（默认）：先排序再写一个文件+索引，文件数=Map数，效率更高
- **TungstenSortShuffle**：SortShuffle优化版，使用堆外内存，减少GC

### Hadoop和Spark的主要区别。Spark为什么更有优势？

|      | Hadoop MR       | Spark                |
| ---- | --------------- | -------------------- |
| 计算模型 | 两阶段（Map+Reduce） | DAG多阶段               |
| 中间数据 | 落HDFS磁盘         | 内存（必要时spill磁盘）       |
| 速度   | 慢               | 快10-100倍             |
| 编程模型 | 只有Map/Reduce，复杂 | RDD/DataFrame/SQL，丰富 |
| 适合场景 | 超大规模单次批处理       | 迭代计算、交互查询、流处理        |

**数据超内存时**：Spark自动将RDD分区spill到本地磁盘，性能降低但仍可工作。

### 你如何进行大数据平台的性能调优？

1. **存储层**：列式存储（ORC/Parquet）+压缩，合并小文件
2. **计算层**：合理设置并行度，用MapJoin，开启Combiner
3. **资源配置**：合理分配内存/CPU，调整JVM参数
4. **SQL优化**：谓词下推、分区裁剪、避免SELECT *、减少shuffle
5. **数据倾斜**：加盐打散、广播join
6. **监控定位**：Spark UI/YARN UI找瓶颈任务

### 一个Hive SQL或Spark任务运行很慢，你会从哪些方面排查？

1. **执行计划**：`EXPLAIN`，看是否全表扫描、缺少分区裁剪
2. **数据倾斜**：看各Task数据量是否均匀（Spark UI）
3. **小文件**：Map数过多，每个Task数据量极小
4. **Shuffle量**：是否Shuffle了大量数据
5. **资源**：是否频繁GC，内存是否够用
6. **Join策略**：大表join是否可改为MapJoin

### 对实时流处理的理解。用过哪些流处理框架？

实时流处理：对持续产生的数据流做低延迟处理，相对批处理的T+1，可达秒级甚至毫秒级。

|      | Spark Streaming | Flink           |
| ---- | --------------- | --------------- |
| 处理方式 | 微批（把流切成小批次）     | 真流（逐条处理）        |
| 延迟   | 秒级              | 毫秒级             |
| 吞吐量  | 高               | 高               |
| 语义   | At-Least-Once为主 | Exactly-Once    |
| 适合   | 对延迟要求不极致，吞吐高    | 低延迟、精确计算（对账、风控） |

### 在大数据开发中，如何管理数据权限和保障数据安全？

- **认证**：Kerberos（确保只有合法用户可访问）
- **授权**：Apache Ranger（表/列/行级别细粒度权限控制）
- **传输加密**：TLS/SSL
- **存储加密**：HDFS透明加密（KMS管理密钥）
- **数据脱敏**：敏感字段（手机号、身份证）在查询层脱敏
- **审计日志**：记录所有访问操作，便于追溯

---

## 数据湖

### 你了解数据湖、数据湖仓一体这些概念吗？它们与传统数据仓库相比有何演进？

|      | 数据仓库                    | 数据湖                  | 湖仓一体（Lakehouse）             |
| ---- | ----------------------- | -------------------- | --------------------------- |
| 类比   | 整理好的档案室                 | 什么都往里扔的储物间           | 智能储物室（存得下又找得到）              |
| 数据格式 | 只存结构化                   | 任意格式                 | 任意格式                        |
| 写入方式 | Schema-on-Write（写时定义结构） | Schema-on-Read（读时定义） | Schema-on-Write（有管理）        |
| 查询   | 快，有索引                   | 慢，无组织                | 快（有索引+统计信息）                 |
| 成本   | 贵                       | 便宜（对象存储）             | 便宜                          |
| ACID | 支持                      | 不支持                  | 支持（Delta Lake/Hudi/Iceberg） |
| 缺点   | 灵活性差，不支持非结构化            | 容易变"数据沼泽"，难治理        | 相对复杂                        |

**演进路径：** 数仓（贵但好用）→ 数据湖（便宜但难用）→ 湖仓一体（既便宜又好用）

代表技术：Delta Lake（Databricks）、Apache Hudi（Uber）、Apache Iceberg（Netflix）

### 
