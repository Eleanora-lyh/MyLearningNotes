**整体类比：** 统计一本书里每个单词出现多少次

- **Map** = 把书分给100人，每人数自己那几页的词频，输出(词, 1)
- **Shuffle** = 把所有"hadoop"汇给同一个人，"spark"汇给另一个人
- **Reduce** = 每人把收到的同一词的数字加起来，得出最终结果

### 介绍下MapReduce

分布式批处理计算框架，将计算分为两阶段：

- **Map**：对输入数据做转换/过滤，输出KV对
- **Reduce**：对相同key的value做聚合

中间通过**Shuffle**（分区、排序、合并、网络传输）连接两个阶段。

### MapReduce优缺点

- **优点**：简单、高容错、适合超大规模离线批处理
- **缺点**：延迟高（中间结果落磁盘）、不适合实时、不适合迭代计算

### MapReduce工作原理

```
输入文件 → Split切分 → MapTask → 环形缓冲区
→ 溢写（分区+排序）→ 合并 → Shuffle（网络传输）
→ ReduceTask归并排序 → Reduce函数 → 输出文件
```

### MapReduce哪个阶段最费时间

**Shuffle阶段**最耗时：大量磁盘溢写 + 归并排序 + 网络传输。

### MapReduce中的Combine是干嘛的？有什么好处？

在Map端本地预聚合，减少传输到Reduce的数据量。

- 好处：减少网络传输、减轻ReduceTask压力、整体加快
- 要求：操作满足交换律和结合律（✅ sum/max，❌ avg）

### MapReduce为什么一定要有环形缓冲区

Map输出先写内存环形缓冲区（默认100MB），满80%再批量溢写磁盘。

避免每条数据都触发磁盘I/O，批量写效率高得多。环形设计可以边写边溢写，不阻塞。

### MapReduce为什么一定要有Shuffle过程

Map和Reduce之间需要**按key分组**：相同key的数据必须汇聚到同一个ReduceTask处理。Shuffle负责分区→排序→网络传输→归并，没有Shuffle就无法实现分布式聚合。

### MapReduce的Shuffle过程及其优化

**Map端：** Map输出 → 写环形缓冲区 → 满80%溢写（按分区快速排序）→ 多个溢写文件归并合并

**Reduce端：** HTTP拉取各MapTask输出 → 归并排序 → 传给Reducer

**优化：**

- 开启Combiner预聚合，减少传输量
- 压缩Map输出（`mapreduce.map.output.compress=true`，推荐Snappy）
- 调大环形缓冲区（`mapreduce.task.io.sort.mb`）

### Reduce怎么知道去哪里拉Map结果集？

ApplicationMaster追踪所有MapTask完成情况和输出位置。ReduceTask定期询问AM，获取已完成MapTask的输出位置（Host+端口），通过HTTP主动拉取。

### Reduce阶段都发生了什么，有没有进行分组

1. **拉取数据**：从各MapTask HTTP拉取属于本Reducer的分区数据
2. **归并排序**：将多份数据归并排序（相同key相邻）
3. **分组**：相同key的所有value形成一个Iterable（**有分组**）
4. **调用Reduce函数**：对每个key的value集合执行用户逻辑
5. **输出**：写入HDFS

### MapReduce Shuffle的排序算法

- **Map端溢写**：快速排序
- **Map端合并溢写文件**：归并排序
- **Reduce端合并拉取数据**：归并排序

### shuffle为什么要排序？

排序使相同key的数据**相邻**，Reduce端分组只需顺序扫描，无需额外哈希表，内存占用低，效率高。

### 说一下map是怎么到reduce的？

Map输出 → 写环形缓冲区 → 按分区排序 → 溢写磁盘 → 归并合并成一个有序文件 → Reduce通过HTTP拉取 → 归并排序 → 传给Reducer

### MapReduce的数据处理过程

Input → InputFormat切分 → RecordReader读取KV → Map函数 → Partitioner分区 → 排序 → Combiner（可选）→ Shuffle → Reduce函数 → OutputFormat → Output

### mapjoin的原理？应用场景？

**原理：** 将小表通过DistributedCache广播到所有MapTask的内存中，Map阶段直接与大表做join，**无需Reduce和Shuffle**。

> 类比：把城市编码表打印一份给每个工人，工人本地查表，不用汇总给主管。

**应用场景：** 大表 join 小表（小表能装入内存，如几百MB以内），可完全避免数据倾斜。

### reducejoin如何执行（原理）

1. 两张表数据都打上标记（标注来自哪张表）
2. 以join key为Map输出key，相同key的数据到同一Reducer
3. Reducer中按标记区分两张表，做匹配

缺点：所有数据都要Shuffle，数据量大时可能数据倾斜，性能不如MapJoin。

### MapReduce为什么不能产生过多小文件

- 每个小文件对应一个MapTask，JVM启动开销远大于实际计算
- 大量小文件消耗NameNode内存（每文件约150字节元数据）

### MapReduce分区及作用

分区决定Map输出的KV数据发送到哪个ReduceTask。

默认：`HashPartitioner`：`key.hashCode() % numReduceTasks`

保证相同key一定到同一Reducer。可自定义Partitioner实现业务分区。

### ReduceTask数量和分区数量关系

- ReduceTask == 分区数：✅ 正常
- ReduceTask > 分区数：多余的Task空转，产生空文件
- ReduceTask < 分区数：❌ 报错，部分分区数据无处写入

### Map的分片有多大

默认分片大小 = Block大小（128MB）。

分片大小 = `max(minSize, min(maxSize, blockSize))`

### reduce任务什么时候开始？

- **Shuffle拉取数据**：5%的MapTask完成后就开始拉
- **Reduce真正计算**：等所有MapTask完成后才开始

### MapReduce用了几次排序，分别是什么？

共**3次**：

1. **Map端溢写时**：快速排序（对缓冲区内数据）
2. **Map端合并溢写文件时**：归并排序
3. **Reduce端合并拉取数据时**：归并排序

### MapReduce怎么确定MapTask的数量？Map数量由什么决定

MapTask数量 = 输入数据的**Split数量**，一个Split对应一个MapTask。

Split数 = 输入文件大小 / 分片大小（默认=Block大小128MB）

小文件多时，每个文件至少一个Split，MapTask数会爆炸。

### MapReduce作业执行过程中，中间数据存在什么地方？

存在**本地磁盘**（非HDFS）。

Map输出先写内存环形缓冲区（100MB），超过80%溢写到**本地磁盘**，最终合并成本地文件。Reduce拉取后也先写本地磁盘归并，再传给Reducer计算。

### map输出数据超出缓冲区后，落地到磁盘还是HDFS？

**本地磁盘**（不是HDFS）。中间数据走本地磁盘效率更高，HDFS是最终输入输出用的。

### Map到Reduce默认的分区机制是什么？

默认`HashPartitioner`：`(key.hashCode() & Integer.MAX_VALUE) % numReduceTasks`

### MapReduce数据倾斜产生的原因及其解决方案

**原因：** key分布不均，某些key数据量远大于其他，对应Reducer处理时间远长。

> 类比：100人统计词频，"的"字出现100万次全汇给一个人，这人累死其他人都完了。

**解决方案：**

- **MapJoin**：小表广播内存，避免Reduce阶段（最彻底）
- **key加随机前缀**：打散热点key（加1-100随机数前缀），聚合后再二次聚合
- **自定义Partitioner**：将热点key均匀分配
- **Combiner预聚合**：减少传到Reducer的数据
- **过滤NULL或异常key**：提前过滤无效数据

### Map Join为什么能解决数据倾斜

MapJoin完全在Map端完成join，**没有Shuffle没有Reduce**，每个MapTask独立处理一部分数据并查询内存中的小表，数据天然均衡，不存在某节点数据集中的问题。

### MapReduce运行过程中会发生OOM，OOM发生的位置？

- **Map端**：环形缓冲区设置过大，或Map逻辑缓存了太多数据
- **Reduce端**：归并数据时内存不足，或Reduce逻辑缓存太多

解决：调大 `mapreduce.map/reduce.memory.mb` 和对应JVM堆内存参数。

### MapReduce压缩方式

- **Map输出压缩**：减少Shuffle传输量，推荐Snappy（快）
- **最终输出压缩**：减少HDFS存储，推荐Bzip2（可切分）或Gzip

配置：`mapreduce.map.output.compress=true`

### MapReduce中怎么处理一个大文件

- 确保文件**可切分**（避免不可切分的Gzip压缩）
- 使用`FileInputFormat`按Block自动切分
- 调大Map内存和超时时间
- 开启Combiner和Map输出压缩
