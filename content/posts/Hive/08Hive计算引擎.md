---
title: "【八】Hive 计算引擎：MapReduce / Tez / Spark 对比与选型"
date: 2026-05-26T21:37:59+08:00
draft: false
tags: ["Hive", "计算引擎", "MapReduce", "Tez", "Spark"]
categories: ["数据仓库"]
description: "系统梳理大数据三类计算引擎（批处理 / 流处理 / 查询）的边界与职责，并深入对比 Hive 支持的 MapReduce、Tez、Spark 三种执行引擎的原理、优缺点与工程选型建议。"
---

# 一、什么是计算引擎

计算引擎是大数据处理中的核心软件框架，它负责对海量数据执行具体的计算任务，是数据从“存储”到“价值”的加工车间。

它的核心职责是：

1. **资源管理**：协调和管理集群中的CPU、内存等计算资源。

2. **任务调度**：将用户编写的计算逻辑（如一个复杂的分析或转换任务）拆解成多个小任务，并合理分配到集群的各个节点上并行执行。

3. **执行计算**：在分配的节点上真正执行代码，完成数据的过滤、聚合、关联、机器学习等操作。

**为什么需要它？**

它抽象了底层分布式计算的复杂性（如容错、并行、通信），让开发者可以像编写单机程序一样，通过高级API（如SQL、Python、Java）来处理TB/PB级的数据。

**一个简单类比**：

把数据比作食材，数据存储（如HDFS）是**仓库**，而计算引擎（如Spark、Flink）就是**厨房和厨师**，负责按照菜谱（你的程序）将食材加工成菜肴（分析结果）。

在企业数据平台里，计算需求通常会自然聚成三类：

**三类主流大数据计算引擎举例**：

- **批处理引擎**：**Apache Spark**（核心，速度快，通用），**MapReduce**（Hadoop原生，较慢但经典）。

- **流处理引擎**：**Apache Flink**（流批一体，延迟极低），**Apache Spark Streaming**（微批处理）。

- **查询引擎**：**Apache Hive**（将SQL翻译成MapReduce/Spark/Tez任务），**Presto/Trino**（交互式快速查询）

**三类计算引擎的定义是根据下面的指标划分的**

1. **数据边界不同**
   
   - 批处理：数据集是**有界**的（比如“昨天全量日志”“历史订单全量”），可以等数据齐了再算。
   - 流处理：数据是**无界**的（事件持续产生），系统必须边来边算、一直跑。
   - 查询：数据通常已落地（湖/仓/OLAP），重点是“对已存在数据做**即席查询**”。

2. **时效/延迟目标不同**
   
   - 批：分钟~小时级（吞吐优先、成本友好）。
   - 流：毫秒~秒级（低延迟 + 连续输出）。
   - 查：秒级甚至亚秒级（交互体验优先）。

3. **运行形态不同**
   
   - 批：典型是“提交一次作业 → 跑完结束”。
   - 流：典型是“提交一个长期运行作业 → 持续处理”。
   - 查：典型是“每个 SQL/请求是一条短查询”，并发高、响应快。

4. **状态与一致性处理方式不同**
   
   - 批：很多时候“状态”隐含在 shuffle/sort 和中间结果里，失败可重跑整批。
   - 流：必须显式维护**跨事件状态**（窗口、聚合、会话、去重），需要 checkpoint/一致性语义。Apache Flink Documentation 明确把 Flink定位为在有界/无界数据流上做有状态计算，并强调 exactly-once、事件时间等能力。 
   - 查：倾向“每次查询尽量无状态/弱状态”，靠列式、向量化、谓词下推、并行执行把单次查询做到极快。

# 二、三类引擎分别“负责什么功能”？

### A. 批处理引擎（Batch Engine）——“算全量/大规模离线作业”

**核心功能**：对**有界**数据集进行一次性计算，强调吞吐、可扩展、成本效率。  
典型任务：

- 离线 ETL/ELT（ODS→DWD→DWS→ADS 的批加工）
- T+1 报表、历史回溯重算（backfill）
- 大规模 join、聚合、排序、离线特征工程、离线训练数据准备

**典型特征**

- 作业是“短生命周期”：提交→执行→结束
- 更能容忍较高延迟，换取更高吞吐/更低成本
- 容错常见方式：失败重跑整批或重跑失败 stage

**常见代表（举例）**：MapReduce、Spark（Batch）、Hive on Tez/Spark 等（按生态演进不同）。

---

### B. 流处理引擎（Stream Engine）——“事件来了立刻算、持续产出结果”

**核心功能**：对**无界**数据流做持续计算，强调**低延迟 + 有状态 + 时间语义 + 一致性**。  
典型任务：

- 实时指标/实时大屏（PV/UV、延迟、成功率）
- 实时风控/反欺诈、实时告警
- 会话窗口（session window）、滚动/滑动窗口聚合
- CDC（变更数据捕获）入湖/入仓、实时维表关联（enrichment）

**典型特征（以 Flink 的官方描述为例）**

- 运行形态：长作业常驻
- 能力侧重：有状态计算、Exactly-once 状态一致性、事件时间处理、低延迟高吞吐、checkpoint（增量检查点）等。
- 结果输出：持续不断更新（流式 sink）

---

### C. 查询/交互式查询引擎（Query Engine / Interactive SQL Engine）——“即席问、快速答”

**核心功能**：对已落地在数据湖/数仓/多数据源的数据做**交互式 SQL**，强调**低延迟、并发、即席分析体验**。  
典型任务：

- BI 报表/仪表盘（高并发、秒级响应）
- 数据分析师 ad-hoc 探索（临时 join、过滤、聚合）
- 联邦查询：跨 Hive/湖表 + MySQL/ES/Kafka 等多源联合分析（取决于引擎）

**典型特征（以 Presto 官方首页描述为例）**

- 定位：开源 SQL 查询引擎，面向数据分析；支持交互式/即席查询，目标是（可达）亚秒级性能；并强调“查询数据所在之处”、连接多种数据源、分布式内存 SQL 引擎等。
- 作业形态：每条查询是短请求；适合高并发、多用户
- 通常不负责复杂 ETL 流水线（更多是“读多、快查”）

---

## 三类引擎“功能边界”总结

| 维度       | 批处理引擎                 | 流处理引擎                          | 查询引擎（交互式）             |
| -------- | --------------------- | ------------------------------ | --------------------- |
| 主要处理对象   | **有界**数据集（全量/分区批）     | **无界**事件流（持续进入）                | 已落地数据（湖/仓/多源）         |
| 运行形态     | 提交一次作业→跑完结束           | 长期运行作业→持续处理                    | 每条 SQL/请求一次执行         |
| 核心目标     | 吞吐、成本效率、可扩展           | 低延迟、状态一致性、时间语义                 | 低延迟、并发、即席分析体验         |
| 状态管理     | 多为“批内隐式状态”，失败可重跑      | **强状态**（窗口/去重/会话），需 checkpoint | 尽量无状态/弱状态（单查询内）       |
| 典型延迟     | 分钟~小时                 | 毫秒~秒                           | 秒级~亚秒（视数据与查询）         |
| 典型产出     | 离线表、宽表、汇总表、离线特征       | 实时指标流、告警、实时明细/宽表增量             | 查询结果集（给人/BI）          |
| 代表例子（举例） | MapReduce、Spark Batch | Flink、Storm、Kafka Streams      | Presto/Trino、Impala 等 |

> 说明：现实里很多系统在“流批一体/湖仓一体”趋势下会互相渗透，但**主责**仍按上表分工最清晰。

---

## 现在为什么又出现“流批一体/多引擎协作”？

你会发现越来越多平台不再只选一种引擎，而是**组合拳**：

- **Spark 的 Structured Streaming**：官方文档强调它构建在 Spark SQL 引擎上，允许你用“写批处理”的方式表达流计算；默认内部用 micro-batch，把流当作一系列小批作业增量执行，并通过 checkpoint/WAL 提供端到端 exactly-once 等保证。 [[spark.apache.org]](https://spark.apache.org/docs/latest/streaming/index.html)
- **Flink**：官方定位就是同时支持有界/无界数据流的有状态计算（把批看作有界流的一种情况）。 [[flink.apache.org]](https://flink.apache.org/zh/)

这背后的工程现实是：

- **批**负责“把数据加工成可用形态”（治理、建模、汇总）
- **流**负责“把最新变化尽快算出来/写进去”（实时指标、CDC 入湖）
- **查**负责“让人/BI 快速取数”（交互式体验）  
  成熟平台往往三者共存，各做各的甜区，整体成本和体验最好。

# 三、查询引擎

今天学习的是查询引擎**Apache Hive**，目前Hive支持**MapReduce、Tez和Spark**三种执行引擎。

Hive 本质上是一个 SQL → 分布式计算任务 的翻译器，它本身不执行计算，而是把 HiveQL 解析、优化后翻译成底层引擎可执行的物理计划。Hive 从 0.x 时代一路演进到 3.x/4.x，先后支持了 **MapReduce、Tez、Spark** 三种执行引擎，可通过 `hive.execution.engine` 参数切换：

```sql
SET hive.execution.engine=mr;     -- MapReduce（已废弃）
SET hive.execution.engine=tez;    -- Tez（Hortonworks/HDP 主推）
SET hive.execution.engine=spark;  -- Spark（Cloudera/CDH 主推）
```

## 3.1 MapReduce 引擎（Hive 的"出生"引擎）

Hive 把 SQL 翻译成一连串的 **MR Job**：每个 Job 由一个 Map 阶段 + 一个 Reduce 阶段组成，**中间结果必须落盘到 HDFS**，下一个 Job 再从 HDFS 读取。

### ① 工作原理（详细数据流）

MapReduce 是一个**严格的两段式**计算模型：`Map → Shuffle → Reduce`，每个阶段的数据流动都涉及大量磁盘 I/O。

#### 🟦 Map 端（输入侧）

1. **Split 切分**：输入文件（HDFS 上的大文件）会被按 **InputSplit**（默认与 HDFS Block 对齐，约 128MB）切分成若干份，每份对应一个 **MapTask**。
2. **Record 读取**：每个 MapTask 通过 `RecordReader` 把数据按行（或按 key-value）读入 **map() 方法** 进行业务处理。
3. **环形缓冲区（Ring Buffer）**：map() 的输出 **不直接写磁盘**，而是先写到一块内存缓冲区（默认 100MB，由 `mapreduce.task.io.sort.mb` 控制）。
4. **分区 + 排序 + Spill 溢写**：当缓冲区使用率达到阈值（默认 80%，`mapreduce.map.sort.spill.percent`）时，后台线程会：
   - 按 **Partitioner**（默认 `HashPartitioner`）给每条记录打上分区号（决定将来去哪个 Reduce）；
   - 在分区内按 key 进行**快速排序**；
   - 将排序后的数据**溢写（spill）到本地磁盘**，形成一个个临时 spill 文件。
5. **Merge 归并**：一个 MapTask 通常会产生多个 spill 文件，Map 结束时会把它们**多路归并成一个有序的大文件**（按分区 + key 排序），存放在该节点的**本地磁盘**（注意：不是 HDFS！），等待 Reduce 来拉取。

#### 🟥 Reduce 端（拉取 + 聚合）

1. **Shuffle（Copy 阶段）**：ReduceTask 启动后，会通过 HTTP 从**所有 MapTask 节点**拉取属于自己分区的数据，先写入 Reduce 节点的内存缓冲区。
2. **内存溢写 + 再次排序**：内存装不下时再次 spill 到磁盘，并对数据进行**第二轮排序**（保证全局有序）。
3. **Merge 归并**：所有 Map 端数据拉取完成后，对磁盘上的多个临时文件进行**多路归并**，形成一个有序的输入流。
4. **Reduce 计算**：归并后的数据**作为 reduce() 函数的数据源**，按 key 分组喂给业务逻辑，最终结果**写入 HDFS**。

> 📌 **核心特征**：整个过程中数据要经历 **HDFS输入文件 → Map内存溢出到本地磁盘 → Reduce读取本地文件到内存 → Reduce内存溢出到多个本地磁盘→ 合并到一个本地文件** 多次落盘，I/O 是性能瓶颈的根源。也就是为什么后面出现了Tez执行引擎

### ② 多 Job 串行的痛点

```sql
SELECT a.x, SUM(b.y) FROM a 
JOIN b ON a.id = b.id 
GROUP BY a.x;
```

会被拆分成：

- **Job 1（JOIN）**：Map(读 a/b) → Shuffle → Reduce(关联) → **写 HDFS 临时目录**
- **Job 2（GROUP BY）**：Map(读临时文件) → Shuffle → Reduce(聚合) → 输出

**两个 Job 之间通过 HDFS 传递中间结果**，复杂 SQL 可能产生 5~10 个串行 Job，每个 Job 都要重启 JVM、重新读写 HDFS，性能极差。

### ③ 优缺点

| 维度        | 表现                                       |
| --------- | ---------------------------------------- |
| ✅ 稳定性     | 极高，"慢但不死"，适合 PB 级离线批处理                   |
| ✅ 容错性     | 任务失败粒度细，单 Task 失败重跑代价小                   |
| ❌ 性能      | 中间结果反复落盘（本地磁盘 + HDFS），磁盘 I/O 巨大          |
| ❌ 启动开销    | 每个 Job 启动 JVM，多 Stage SQL 启动开销叠加         |
| ❌ DAG 表达力 | 只能"两段式"（Map→Reduce），复杂 SQL 必须拆成多个 Job 串行 |

> ⚠️ **Hive 2.0 起官方已标记 MR 为 deprecated，Hive 3.x 默认不再推荐使用，Hive 4.0 已彻底移除 MR 引擎支持。**

---

## 3.2 Tez 引擎（在 MR 基础上的"DAG 化"升级）

### ① 定位与起源

**Apache Tez 是面向大规模数据处理、支持 DAG(Directed Acyclic Graph) 作业的通用计算框架**，**直接源自 MapReduce**——可以理解为"MR 的进化版"。它**完全兼容 MR 的能力**（Map/Reduce 语义、Shuffle 语义、容错语义），但在此之上提供了**更灵活的作业表达模型**，允许多种作业形式在同一集群内统一调度。

- **MapReduce的固定模型**：一旦这个 Job 需要跨分区重分布数据，执行模式必须按`Map -> Shuffle/Sort -> Reduce`的固定三阶段执行，导致冗余的I/O和调度开销。
  
  - 注意：这里强调的是**一旦这个 Job 需要跨分区重分布数据**，如对于 group by、join、distinct、全局排序等需要按 key 汇聚数据的任务。MapReduce 对这类复杂多阶段任务的表达能力较弱，**多个阶段往往需要拆成多个 Job**，通常需要经过 Shuffle/Sort，再由 Reduce 处理，并**通过 HDFS 落盘（HDFS落盘=HDFS->本地磁盘）传递中间结果，从而带来额外 I/O 和调度开销**。
  
  - 并不是所有任务都必须有 Reduce，也不是所有场景都必须发生完整 Shuffle。Map-only 任务可以没有 Shuffle；如果数据已经按计算 key 做了合适的分区/分桶/排序，执行引擎可能减少或避免某些 Shuffle。

- **Directed Acyclic Graph 有向无环图**：在计算引擎里，DAG 表示一个作业中，各个计算步骤之间的依赖关系图。比如 SQL：
  
  ```sql
  SELECT user_id, COUNT(*)
  FROM logs
  WHERE dt = '2026-05-27'
    AND event_type = 'click'
  GROUP BY user_id;
  ```
  
  - 传统 MapReduce 更像这样：
    
    ```sql
    Map：
    
    各个Map（读 logs、过滤 dt、过滤 event_type）
    → 各个Map生成中间结果 
    → Map将中间结果写入本地磁盘 
    
    Shuffle：
    按照user_id进行分区，相同user_id分配到同一个 Reducer
    → 各个Reducer 通过网络从各个 Mapper 所在节点拉取对应分区的中间结果，合并结果
    
    Reduce：
    Reducer 对相同 `city` 的数据做最终聚合，例如 `COUNT(*)`
    
    Output：
    Reduce 结果直接写入 HDFS。
    ```
  
  - DAG 引擎会先看到完整流程，再切分执行阶段分析，而不是每一步都机械地变成一个 MR Job（例如：哪些操作可以合并？哪里必须 Shuffle？哪里可以 pipeline？哪里可以避免落盘？哪里可以并行？）
    
    ```sql
    Read → Filter → Partial Count
                            ↓
                         Shuffle
                            ↓
                    Final Count → Outputort
    ```

- **Tez的DAG模型**：允许你根据实际数据处理逻辑，自由定义任务节点（可以是Map、Reduce或其他处理器）和它们的依赖边。DAG 引擎相比 MapReduce 的优势在于，它能从全局依赖关系出发，把多个操作组合成更灵活的执行图，只在必要的边界进行 Shuffle 或落盘。例如，一个作业可以是 `Map -> Reduce`，也可以是 `Map -> Map -> Reduce`，甚至是多个Map的输出汇合到一个Reduce。

Tez 由 Hortonworks 主导贡献给 Apache 社区，HDP/CDP 体系（现 Cloudera CDP）默认采用。

### ② 核心抽象：Vertex + Edge

Tez 最关键的创新是**把 MR 那种僵硬的 "Map + Reduce 两段式" 拆解为更细粒度的元操作**，重新组合成 DAG：

| Tez 抽象            | 含义                    | 类比 MR                     |
| ----------------- | --------------------- | ------------------------- |
| **Vertex（顶点）**    | 一个计算节点，代表一组并行执行的 Task | 相当于一个 Map 阶段或 Reduce 阶段   |
| **Vertex Input**  | Vertex 的数据输入逻辑        | 类比 MR 的 InputFormat       |
| **Vertex Output** | Vertex 的数据输出逻辑        | 类比 MR 的 OutputFormat      |
| **Sorting**       | 排序原语                  | MR 中固化在 shuffle 里，Tez 中可选 |
| **Shuffling**     | 跨节点数据传输               | MR 的 shuffle 阶段           |
| **Merging**       | 归并多源数据                | MR 的 merge 阶段             |
| **Edge（边）**       | Vertex 之间的数据通信通道      | 相当于 MR Job 之间的 HDFS 中转    |

> 💡 **关键思想**：Sorting / Shuffling / Merging 这些在 MR 中**强制绑定**的步骤，在 Tez 里变成**可拆卸、可组合的元操作**。例如某些 Join 不需要排序，Tez 就可以**跳过 Sorting**；某些计算不需要全量 shuffle，可以用更轻量的 Edge 类型（如 Broadcast Edge）。

这些元操作被**控制程序（DAG Plan）灵活组装**后，形成一张完整的 **DAG 作业**——原本需要 N 个 MR Job 串行的 SQL，**现在可以塞进一个 Tez DAG 任务一次性跑完**。

### ③ 与 MR 的对比图（逻辑示意）

假设有 SQL：

```sql
SELECT city, COUNT(*) AS cnt
FROM user_log
WHERE dt = '2026-05-27'
GROUP BY city;
```

---

| 对比项                      | Hive on MapReduce                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Hive on Tez                                                                                                                                                                                                                                                                                                                 | Hive on Spark                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **核心定位**                 | Hive SQL 被编译成一个或多个 MapReduce Job 执行                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Hive SQL 被编译成 Tez DAG 执行                                                                                                                                                                                                                                                                                                    | Hive SQL 被编译成 Spark 执行计划，通过 Spark DAG/Stage 执行                                                                                                                                                                                                                                                                                                  |
| **执行模型**                 | 主要是 `Map-only` 或 `Map → Shuffle/Sort → Reduce`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `DAG → Vertex → Task`                                                                                                                                                                                                                                                                                                       | `Application → Job → Stage → Task`                                                                                                                                                                                                                                                                                                              |
| **过程**                   | **Map 阶段：**<br><br>读取 HDFS 上的输入数据<br><br>执行过滤条件，例如 `dt = '2026-05-27'`<br><br>生成中间 KV，例如 `(city, 1)`<br><br>Map 输出会按照分区规则写入本地磁盘的中间文件，不是写入 HDFS<br><br>**Shuffle/Sort 阶段：**<br><br>按照 `city` 进行分区。<br><br>相同 `city` 的数据会被分配到同一个 Reducer。<br><br>Reducer 通过网络从各个 Mapper 所在节点拉取对应分区的中间结果。<br><br>拉取后会进行 merge/sort。<br><br>**Reduce 阶段：**<br><br>Reducer 对相同 `city` 的数据做最终聚合，例如 `COUNT(*)`。<br><br>**Output 阶段：**<br><br>Reduce 结果直接写入 HDFS。<br><br>如果 SQL 很复杂，例如包含多个 join、group by、order by，可能被拆成多个 MR Job 串联执行，Job 之间通常通过 HDFS 落盘传递中间结果。 | **Vertex 1：**<br><br>读取数据。<br><br>执行过滤条件。<br><br>执行局部聚合，例如先在每个 Task 内部做 `city → partial count`。<br><br>**Shuffle Edge by city：**<br><br>通过 Tez Edge 按 `city` 重新分布数据。<br><br>相同 `city` 的数据进入下游对应的 Vertex Task。<br><br>**Vertex 2：**<br><br>执行全局聚合。<br><br>输出最终结果。<br><br>相比 MapReduce，Tez 可以把多个处理阶段组织成一个 DAG，不一定每个阶段都落 HDFS。 | **Stage 0：**<br><br>读取数据。<br><br>执行过滤。<br><br>执行 map-side combine / partial aggregation。<br><br>执行 shuffle write，把按 `city` 分区后的中间结果写到本地磁盘，供下游 Stage 拉取。<br><br>**Shuffle：**<br><br>按照 `city` 重新分布数据。<br><br>**Stage 1：**<br><br>执行 shuffle read。<br><br>读取上游 Stage 的 shuffle 文件。<br><br>执行 reduce aggregation，也就是最终聚合。<br><br>输出结果到 HDFS 或其他存储。 |
| **是否必须有 Reduce/Shuffle** | 不一定。<br><br>如果只是 `SELECT ... WHERE ...` 这种过滤/投影，可以是 Map-only Job。<br><br>如果有 `GROUP BY city`，一般需要 Shuffle 和 Reduce。                                                                                                                                                                                                                                                                                                                                                                                                                     | 不一定。<br><br>如果只是过滤/投影，可以只有一个 Vertex。<br><br>如果有 group by/join/order by，则 DAG 中会出现 Shuffle Edge。                                                                                                                                                                                                                             | 不一定。<br><br>窄依赖操作，例如 filter/map/project，可以放在同一个 Stage。<br><br>遇到 groupBy/join/distinct/orderBy 这类宽依赖，通常会产生 Shuffle 并切分 Stage。                                                                                                                                                                                                                   |
| **中间结果位置**               | Map 输出中间结果主要在 Mapper 节点本地磁盘。<br><br>多个 MR Job 之间的中间结果通常落 HDFS。                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Vertex 之间可以通过内存、本地磁盘、网络传输。<br><br>不必像多个 MR Job 那样频繁落 HDFS。                                                                                                                                                                                                                                                                  | Stage 内部可以 pipeline。<br><br>Shuffle 文件通常写本地磁盘。<br><br>RDD/DataFrame 可以 cache/persist 到内存或磁盘。                                                                                                                                                                                                                                                    |
| **DAG 能力**               | 单个 MR Job 本身不是灵活 DAG。<br><br>复杂 SQL 往往拆成多个 MR Job 串起来。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Tez 的核心就是 DAG。<br><br>Hive 会把 SQL 编译成 Vertex + Edge 的 DAG。                                                                                                                                                                                                                                                                  | Spark 也是 DAG 执行。<br><br>Spark 根据 RDD lineage 或 Spark SQL 物理计划生成 DAG，再切分 Stage。                                                                                                                                                                                                                                                                  |
| **优化**                   | 主要依赖 Hive 优化器 + MapReduce 能力。<br><br>常见优化包括：<br><br>分区裁剪。<br><br>列裁剪。<br><br>谓词下推。<br><br>Map-side aggregation。<br><br>Combiner。<br><br>MapJoin。<br><br>Bucket Map Join。<br><br>Sort-Merge Bucket Join。<br><br>压缩。<br><br>合理设置 Reducer 数量。                                                                                                                                                                                                                                                                                              | 相比 MR，可以减少不必要的 HDFS 落盘。<br><br>多个阶段可以组织成一个 DAG。<br><br>支持更灵活的数据传输边，例如 shuffle edge、broadcast edge。<br><br>可以减少 Job 启动开销。<br><br>更适合 Hive SQL 批处理查询。                                                                                                                                                                         | 支持 Catalyst 优化器和 Tungsten 执行优化。<br><br>可以做 whole-stage codegen。<br><br>支持 cache/persist。<br><br>对迭代计算、交互式查询、复杂 ETL 更友好。<br><br>可以通过 AQE 自适应优化 shuffle 分区、join 策略等。                                                                                                                                                                              |
| **优点**                   | 模型简单。<br><br>稳定成熟。<br><br>容错能力强。<br><br>适合传统大规模离线批处理。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 相比 MR 更快。<br><br>减少多 MR Job 之间的 HDFS 落盘。<br><br>更适合 Hive SQL。<br><br>资源利用率更好。                                                                                                                                                                                                                                               | 通用性强。<br><br>不只支持 SQL，还支持 DataFrame、RDD、机器学习、流处理。<br><br>内存计算能力强。<br><br>复杂任务性能通常更好。                                                                                                                                                                                                                                                            |
| **缺点**                   | 多阶段 SQL 容易拆成多个 MR Job。<br><br>Job 启动开销较大。<br><br>中间结果频繁落 HDFS。<br><br>对复杂 DAG 表达能力弱。<br><br>交互式查询性能较差。                                                                                                                                                                                                                                                                                                                                                                                                                                  | 主要作为 DAG 执行框架，本身不是完整通用计算生态。<br><br>通常依赖 Hive/Pig 等上层系统。<br><br>调优也有一定复杂度。                                                                                                                                                                                                                                                   | 集群资源消耗可能更高。<br><br>内存管理、shuffle、倾斜、executor 配置调优复杂。<br><br>Hive on Spark 在很多企业环境中不一定是主流 Hive 执行方式。                                                                                                                                                                                                                                              |
| **适合场景**                 | 传统离线批处理。<br><br>稳定性要求高、性能要求不极致的任务。<br><br>老 Hadoop 集群。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Hive SQL 批处理查询。<br><br>希望替代 Hive on MR，提高 SQL 执行效率。                                                                                                                                                                                                                                                                         | 复杂 ETL。<br><br>交互式分析。<br><br>机器学习。<br><br>流批一体。<br><br>需要复用 Spark 生态的场景。                                                                                                                                                                                                                                                                        |

---

### ④ Tez 在 Hive 上的关键收益

1. **DAG 一次性执行**：让 Hive 一条复杂 SQL 在一个 Tez 任务内跑完，而不是多个 MR Job 串行。
2. **中间结果免落 HDFS**：上游 Vertex 输出通过 Edge **直接传给下游 Vertex**，走内存或本地磁盘，**不强制写 HDFS**。
3. **容器复用（Container Reuse）**：一个 YARN Container 可被多个 Task 复用，**避免反复启动 JVM**。
4. **动态优化**：Dynamic Partition Pruning、Runtime Reoptimization 等，运行时根据数据量动态调整 reducer 数、shuffle 策略。

### ⑤ 优缺点

| 维度         | 表现                                   |
| ---------- | ------------------------------------ |
| ✅ 性能       | 相比 MR 提升 **3~10 倍**，尤其多 Join、多聚合 SQL |
| ✅ 资源利用     | Container 复用 + 动态调度，YARN 资源效率更高      |
| ✅ Hive 集成度 | **专为 Hive 优化**，与 CBO、向量化执行、LLAP 配合最好 |
| ❌ 通用性      | 几乎只服务 Hive/Pig，不像 Spark 是通用计算引擎      |
| ❌ 社区活跃度    | 近几年活跃度下降，主要靠 Cloudera 维护             |

> 💡 **HDP/CDP 体系的 Hive 默认引擎就是 Tez**，配合 **LLAP（Long-Live and Process）** 可以做到秒级交互式查询。

---

## 3.3 Spark 引擎（Hive on Spark）

### ① 定位

**Apache Spark 是专为大规模数据处理而设计的快速、通用、支持 DAG 作业的计算引擎**，类似于 Hadoop MapReduce 的通用并行框架，可用来构建**大型、低延迟的数据分析应用**。Spark 是**大规模数据处理的统一分析引擎**，核心特点：

- **基于内存计算**：中间结果优先驻留内存（RDD/DataFrame Cache），相比 MR 的反复落盘，数据处理实时性大幅提升。
- **高容错**：通过 RDD 的 Lineage（血缘）机制，失败时可重算丢失分区，无需全量重跑。
- **高可伸缩**：可部署在大量普通硬件上形成集群，从单机到数千节点弹性扩展。
- **通用性**：同一个引擎覆盖批处理、流计算（Structured Streaming）、机器学习（MLlib）、图计算（GraphX）。

Hive on Spark 就是把 Hive 的物理计划翻译成 **Spark 的 RDD/DAG 任务** 来执行，由 Cloudera 主导推进（CDH 体系默认）。

### ② 概念定义

**1、RDD = Resilient Distributed Dataset 弹性分布式数据集**，它是 Spark 早期最核心的抽象，可以拆成三层理解

- **Dataset：数据集**，RDD 表示一批数据。比如日志文件：
  
  ```sql
  line1
  line2
  line3
  ...
  ```
  
  在 Spark 里可以表示成 `val rdd = sc.textFile("hdfs://logs")`

- **Distributed：分布式**，RDD 不是存在一台机器上，而是被切成多个 partition，分布在集群多个 Executor 上。
  
  ```sql
  RDD
  ├── Partition 0 → Executor A
  ├── Partition 1 → Executor B
  ├── Partition 2 → Executor C
  └── Partition 3 → Executor D
  ```
  
  这里的 partition 是 Spark 内部的计算分区，不要和 Hive 表分区完全混淆。（Hive 表分区通常是物理目录：`/dt=2026-05-27/hour=10/`）
  
  Spark RDD partition 是执行层面的数据切片：
  
  ```sql
  Task 0 处理 Partition 0
  Task 1 处理 Partition 1
  Task 2 处理 Partition 2
  ```

- **Resilient：弹性/容错**，RDD 的重点是：
  
  它不一定要把每一步的中间结果都持久化下来，而是记录“这个 RDD 是怎么由上游 RDD 计算出来的”。（这就是 lineage，血缘 ）例如：
  
  ```scala
  val rdd1 = sc.textFile("logs")
  val rdd2 = rdd1.map(parse)
  val rdd3 = rdd2.filter(_.isValid)
  val rdd4 = rdd3.map(x => (x.userId, 1))
  val rdd5 = rdd4.reduceByKey(_ + _)
  ```
  
  血缘关系是：`rdd1 → rdd2 → rdd3 → rdd4 → rdd5` **用于实现 RDD 的容错能力**
  
  如果 rdd3 的某个 partition 丢了，Spark 可以根据血缘重新算：
  
  ```scala
  rdd1 的对应 partition
      ↓
  重新 map
      ↓
  重新 filter
      ↓
  恢复 rdd3 的那个 partition
  ```

**2、某分区数据丢失**

“分区数据丢失”通常不是指 Hive 表分区目录丢了，而是指：计算过程中，某个 Task 产生的中间结果丢失了。比如 Spark 中：

```sql
RDD Partition 3 缓存在 Executor B 内存中
```

后来：`Executor B 挂了`，那么 `Partition 3 的缓存数据就没了`
但是 Spark 有 lineage存储了 `Partition 3 是怎么从上游 partition 算出来的`，所以可以重新计算。

MapReduce 的 Map 输出中间结果通常在本地磁盘。比如：

```sql
MapTask_1 在 NodeA 上产生中间文件
ReduceTask_3 需要从 NodeA 拉这个文件
```

如果 NodeA 挂了，Reduce 拉不到这个中间结果。

MapReduce 的处理方式是：

```sql
重新运行失败的 MapTask_1
重新生成中间输出
Reduce 再去拉
```

所以 **MapReduce** 也有容错。但是它的容错方式更偏：**Task 级别重试** 

**Spark RDD** 更强调：**通过 RDD 血缘关系重算丢失的 partition**  

### ③ ⚠️ 区分两个易混概念

| 概念                                 | 入口               | SQL 解析             | 物理执行               | 元数据            |
| ---------------------------------- | ---------------- | ------------------ | ------------------ | -------------- |
| **Hive on Spark**                  | Hive CLI / HS2   | Hive 解析器           | **Spark RDD**      | Hive Metastore |
| **Spark on Hive**（Spark SQL + HMS） | Spark / SparkSQL | **Spark Catalyst** | **Spark Tungsten** | Hive Metastore |

> 业界主流是后者：**Spark 自己解析 + 自己执行，只借用 HMS 读元数据**。Hive 退化成元数据中枢。

### ④ 核心改进

1. **天然 DAG + 内存计算**：中间结果优先驻留内存（RDD/DataFrame Cache），磁盘 I/O 大幅降低。
2. **统一执行模型**：Map/Reduce/Shuffle 都是 RDD 上的算子，调度粒度细化为 Stage → Task。
3. **Tungsten + CodeGen**：堆外内存管理 + 全阶段代码生成，把物理执行下推到接近手写代码的效率。
4. **丰富生态**：批/流/ML/图 一栈式复用，无需为不同负载切换引擎。

### ⑤ 优缺点

| 维度     | 表现                                       |
| ------ | ---------------------------------------- |
| ✅ 性能   | 内存计算 + Tungsten 优化，复杂 SQL 与 Tez 相当或更快    |
| ✅ 生态   | MLlib、Structured Streaming、GraphX 一栈式    |
| ✅ 通用性  | 不仅服务 Hive，还能跑批/流/ML，企业一栈式落地              |
| ❌ 资源占用 | 内存吃得多，OOM 风险比 Tez 高                      |
| ❌ 版本耦合 | Hive on Spark 版本兼容性敏感（Hive ↔ Spark 严格对应） |

| 维度          | 表现                                             |
| ----------- | ---------------------------------------------- |
| ✅ 性能        | 内存计算，复杂 SQL 表现优秀，与 Tez 相当或更快                   |
| ✅ 生态        | Spark 生态丰富（MLlib、Streaming、GraphX），同一个引擎可复用    |
| ✅ 通用性       | Spark 不仅服务 Hive，还能跑批/流/ML，企业一栈式                |
| ❌ 资源占用      | 内存吃得多，OOM 风险比 Tez 高                            |
| ❌ 与 Hive 耦合 | Hive on Spark 版本兼容性较敏感（Hive 版本 ↔ Spark 版本严格对应） |

---

## 3.4 三者对比总表（重点记忆）

| 对比项             | **MapReduce**   | **Tez**                 | **Spark**                            |
| --------------- | --------------- | ----------------------- | ------------------------------------ |
| **执行模型**        | 两段式 Map-Reduce  | DAG                     | DAG + 内存计算                           |
| **中间结果**        | **必须落 HDFS**    | 内存 / 本地磁盘               | 优先内存（可 cache）                        |
| **JVM 启动**      | 每 Task 一个，启动开销大 | Container 复用            | Executor 长驻，任务复用，启动开销小。              |
| **多 Stage SQL** | 多个 Job 串行       | 一个 DAG                  | 一个 DAG                               |
| **性能**          | ⭐（最慢）           | ⭐⭐⭐⭐                    | ⭐⭐⭐⭐<br/>比基于磁盘的 MapReduce 快 10-100 倍 |
| **稳定性**         | ⭐⭐⭐⭐⭐           | ⭐⭐⭐⭐                    | ⭐⭐⭐                                  |
| **资源占用**        | 低（磁盘换内存）        | 中                       | 高（内存密集）                              |
| **典型发行版**       | Hive 1.x、早期 CDH | HDP / CDP               | CDH / 通用                             |
| **当前状态**        | 已废弃             | 仍在维护                    | 主流之一                                 |
| **适用场景**        | 超大规模、稳定优先的离线批   | Hive 交互式 / 批处理（HDP/CDP） | 批流一体、ML 一栈式                          |

## 3.5 实际工程中的选型建议

1. **新项目几乎不再选 MR**：太慢，且官方已废弃。除非有遗留作业兼容性需求。
2. **HDP/CDP 体系 → Tez + LLAP**：交互式查询体验最好，是 Hive 原生最优解。
3. **需要一栈式（批 + 流 + ML）→ Spark SQL on Hive Metastore**：现代数据平台主流姿势，**Hive 退化为元数据服务（HMS）**，计算全交给 Spark。
4. **湖仓一体场景（Delta/Iceberg/Hudi）→ Spark / Flink / Trino**：Hive 本身的执行引擎已经不是重点，HMS 仍作为元数据中枢继续存在。

> 🎯 **趋势总结**：Hive 正在从"计算+存储+元数据"的三合一系统，演变为**Hive Metastore（HMS）+ 计算引擎插件化**的模式。MR 已退场，Tez 守住 Hive 自家阵地，Spark 则在更大的数据平台范畴内成为事实标准。

| 引擎             | 核心思想                                           | 优点                                                                                       | 缺点                                    | 应用场景比喻                                |
| -------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------- |
| **MapReduce**​ | **分而治之**。将任务分成Map（映射）和Reduce（归约）两个阶段，中间结果写入磁盘。 | 1. **非常稳定**，Hadoop原生支持。<br>2. 适合处理海量离线数据。<br>3. 容错性强。                                    | 1. **速度慢**，每一步都要读写磁盘。<br>2. 编程模型相对复杂。 | **“绿皮火车”**：稳定、能拉重货（海量数据），但速度慢。        |
| **Tez**​       | **有向无环图优化**。将多个MR任务拼接成一个更复杂的执行图，减少不必要的磁盘I/O。   | 1. **比MR快数倍**。<br>2. 资源利用率更高。<br>3. 与Hive、YARN集成好。                                       | 生态系统和社区活跃度低于Spark。                    | **“动车组”**：在原有铁路（YARN）上大幅提速，是MR的优化升级版。 |
| **Spark**​     | **基于内存的迭代计算**。将数据尽可能放在内存中处理，并提供了更丰富的算子（API）。   | 1. **速度极快**，比MR快10-100倍。<br>2. 提供一站式解决方案（Spark SQL, Streaming, MLlib）。<br>3. 生态火爆，是当前主流。 | 对内存资源要求高，配置不当易OOM（内存溢出）。              | “高铁”：速度最快，乘坐体验（开发体验）好，是现代主流选择。        |
