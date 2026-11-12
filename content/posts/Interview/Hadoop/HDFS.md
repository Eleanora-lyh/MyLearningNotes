# 基础

**整体类比：** 图书馆管理系统

- NameNode = 图书馆目录（记录书在哪，但不存书）
- DataNode = 书架（真正放书的地方）
- Block = 把大书撕成若干份（128MB一份）
- 副本数3 = 每份复印3本放不同书架，防止丢失

### HDFS写流程

1. Client客户端发送上传请求，通过RPC与NameNode建立通信，NameNode检查该用户是否有上传权限，以及上传的文件是否在HDFS对应的目录下重名，如果这两者有任意一个不满足，则直接报错，如果两者都满足，则返回给客户端一个可以上传的信息；
2. Client根据文件的大小进行切分，默认128M一块，切分完成之后给NameNode发送请求第一个block块上传到哪些服务器上；
3. NameNode收到请求之后，根据网络拓扑和机架感知以及副本机制进行文件分配，返回可用的DataNode的地址；

> **注**：Hadoop在设计时考虑到数据的安全与高效，数据文件默认在HDFS上存放三份，存储策略为本地一份，同机架内其它节点上一份，不同机架的某一节点上一份。

1. 客户端收到地址之后与服务器地址列表中的一个节点如A进行通信，本质上就是RPC调用，建立pipeline，A收到请求后会继续调用B，B在调用C，将整个pipeline建立完成，逐级返回Client；
2. Client开始向A上发送第一个block（先从磁盘读取数据然后放到本地内存缓存），以packet（数据包，64kb）为单位，A收到一个packet就会发送给B，然后B发送给C，A每传完一个packet就会放入一个应答队列等待应答；
3. 数据被分割成一个个的packet数据包在pipeline上依次传输，在pipeline反向传输中，逐个发送ack（命令正确应答），最终由pipeline中第一个DataNode节点A将pipelineack发送给Client；
4. 当一个block传输完成之后，Client再次请求NameNode上传第二个block，NameNode重新选择三台DataNode给Client。

### HDFS读流程

1. Client向NameNode发送RPC请求。请求文件block的位置；
2. NameNode收到请求之后会检查用户权限以及是否有这个文件，如果都符合，则会视情况返回部分或全部的block列表，对于每个block，NameNode都会返回含有该block副本的DataNode地址；这些返回的DataNode地址，会按照集群拓扑结构得出DataNode与客户端的距离，然后进行排序，排序两个规则：网络拓扑结构中距离 Client 近的排靠前；心跳机制中超时汇报的DataNode状态为STALE，这样的排靠后；
3. Client选取排序靠前的DataNode来读取block，如果客户端本身就是DataNode,那么将从本地直接获取数据(短路读取特性)；
4. 底层上本质是建立Socket Stream（FSDataInputStream），重复的调用父类DatalnputStream的read方法，直到这个块上的数据读取完毕；
5. 当读完列表的block后，若文件读取还没有结束，客户端会继续向NameNode 获取下一批的block列表；
6. 读取完一个block都会进行checksum验证，如果读取DataNode时出现错误，客户端会通知NameNode，然后再从下一个拥有该block副本的DataNode 继续读；
7. read方法是并行的读取block信息，不是一块一块的读取；NameNode只是返回Client请求包含块的DataNode地址，并不是返回请求块的数据；
8. 最终读取来所有的block会合并成一个完整的最终文件；

HDFS NameNode高可用如何实现？需要哪些角色？

架构：**Active NameNode + Standby NameNode**

| 角色                 | 作用                           |
| ------------------ | ---------------------------- |
| Active NameNode    | 对外提供服务                       |
| Standby NameNode   | 热备，实时同步editlog               |
| JournalNode集群（≥3个） | 共享editlog，Active写入，Standby读取 |
| ZooKeeper          | 选主，记录谁是Active                |
| ZKFC               | 监控NameNode健康，触发自动切换          |

### HDFS中向DataNode写数据失败了怎么办

1. 将失败的DataNode从pipeline中移除
2. 已写数据标记为损坏
3. NameNode重新分配新DataNode，重建pipeline继续写
4. 写完后NameNode发现副本数不足，触发后台重新复制

### DataNode什么情况下不会备份

强制关闭或非正常断电时。

### HDFS中DataNode怎么存储数据的

- 数据以**Block文件**存在本地磁盘
- 每个Block对应一个`.meta`校验文件（CRC）
- DataNode每3秒向NameNode发**心跳**，每6小时发**块报告**

### NameNode存数据吗？

**不存实际数据**，只存**元数据**：文件目录树、文件与Block的映射、权限等。

持久化方式：`fsimage`（全量快照）+ `editlog`（操作日志）

### HDFS文件写入和读取流程

**写入流程：**

1. Client → NameNode：申请创建文件
2. NameNode返回DataNode列表（DN1→DN2→DN3 流水线）
3. Client将数据切Block，按流水线依次写入（DN1写完传给DN2，DN2传给DN3）
4. 每个packet写完，ack沿流水线反向回传给Client
5. 全部写完，Client通知NameNode完成

**读取流程：**

1. Client → NameNode：请求读文件
2. NameNode返回各Block所在DataNode列表（按距离排序）
3. Client就近选DataNode读取每个Block
4. CRC校验，损坏则自动切换其他副本

### HDFS优缺点及使用场景

- **优点**：高容错、高吞吐（流式读取）、低成本、可扩展
- **缺点**：高延迟、不适合小文件、不支持随机写、不支持并发写
- **使用场景**：日志存储、数据仓库原始数据、离线批处理

### HDFS的容错机制

- **心跳检测**：DataNode超时未发心跳，NameNode触发副本重建
- **CRC校验**：读写时检测数据损坏，自动切换副本
- **多副本**：默认3副本，一个节点坏了不影响数据
- **NameNode HA**：元数据不丢失

### HDFS的副本机制

默认**3副本**放置策略：

- 第1副本：客户端所在节点
- 第2副本：**不同机架**的节点
- 第3副本：与第2副本**同机架**不同节点

兼顾可靠性（跨机架防机架故障）和网络效率。

### HDFS的常见数据格式，列式存储格式和行存储格式异同点，列式存储优点有哪些？

**行存储**：一行数据连续存储，适合OLTP（增删改查整行）

**列式存储**：同一列数据连续存储，适合OLAP（只读少数列的聚合分析）

**列式存储优点：**

- 压缩比高（同列数据类型相同，压缩效果好）
- I/O少（只读需要的列，跳过无关数据）
- 聚合计算快（sum/count等）

常见格式：TextFile（行）、SequenceFile（行）、ORC（列）、Parquet（列）

### HDFS的默认副本数？为什么？如何修改？

默认**3副本**：在可靠性和存储成本之间取平衡（容忍2个节点同时故障）。

修改：

- `hdfs-site.xml` 中 `dfs.replication=3`
- 或命令：`hdfs dfs -setrep -w 2 /path/to/file`

### HDFS的块默认大小，64M和128M是在哪个版本更换的？怎么修改默认块大小？

Hadoop **1.x默认64MB**，**2.x起改为128MB**。

修改：`hdfs-site.xml` 中 `dfs.blocksize=134217728`（单位字节）

### HDFS的block为什么是128M？增大或减小有什么影响？

磁盘寻址约10ms，传输速率约100MB/s，128MB传输约1.28秒，寻址时间占比约1%，效率最优。

- **增大**：Map并行度降低，适合超大文件
- **减小**：Map任务数增多，启动开销大，NameNode元数据增多

### HDFS HA怎么实现？是个什么架构？

见上方"NameNode高可用"部分：Active NN + Standby NN + JournalNode集群 + ZooKeeper + ZKFC

### 导入大文件到HDFS时如何自定义分片？

实现自定义`InputFormat`，重写`getSplits()`方法。或调整参数：

- `mapreduce.input.fileinputformat.split.maxsize`
- `mapreduce.input.fileinputformat.split.minsize`

### HDFS的mapper和reducer的个数如何确定？reducer的个数依据是什么？

- **Mapper数**：由输入Split数决定，一个Split = 一个MapTask（默认Split大小 = Block大小）
- **Reducer数**：手动设置（`job.setNumReduceTasks(n)`），一般设为节点数×1.5~2倍

### HDFS跨节点怎么进行数据迁移

- `hadoop distcp`：分布式拷贝，适合集群间大量数据迁移（推荐）
- 跨集群：`hadoop distcp hdfs://cluster1/path hdfs://cluster2/path`

### HDFS的数据一致性靠什么保证？

- **写入时**：pipeline写入，所有副本ack后才确认写成功
- **读取时**：CRC校验，不一致自动切换副本
- **副本监控**：NameNode持续监控副本数，不足时触发重建

### HDFS怎么保证数据安全

- 多副本（数据冗余）
- CRC校验（检测损坏）
- Kerberos认证（身份验证）
- ACL权限控制（文件级权限）
- 传输加密（TLS）和存储加密（KMS）
- 审计日志

### HDFS写数据过程，写的过程中有哪些故障，分别会怎么处理？

写数据过程见上方"写入流程"。

故障处理：

- **某DataNode宕机**：从pipeline移除，用新DataNode替换，事后补足副本数
- **NameNode宕机（HA模式）**：Standby自动切为Active，Client重连继续写
- **网络超时**：packet重传，超时后报错，Client可重试

### 直接将数据文件上传到HDFS的表目录中，如何在表中查询到该数据？

- **非分区表**：直接可查，Hive会扫描目录下所有文件
- **分区表**：执行 `MSCK REPAIR TABLE 表名;` 刷新分区元数据，或手动 `ALTER TABLE 表名 ADD PARTITION (...)`

---
