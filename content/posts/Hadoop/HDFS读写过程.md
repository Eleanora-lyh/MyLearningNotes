# HDFS 写入

## 前置概念

### 网络拓扑概念

在本地网络中，两个节点被称为“彼此近邻”是什么意思？在海量数据处理中，其主要限制因素是节点之间数据的传输速率——带宽很稀缺。这里的想法是将两个节点间的带宽作为距离的衡量标准。

节点距离：两个节点到达最近的共同祖先的距离总和。

例如，假设有数据中心 d1 机架 r1 中的节点 n1。该节点可以表示为 /d1/r1/n1。利用这种标记，这里给出四种距离描述。

## 1、Client 请求创建文件

1）应用程序调用类似下面的方法：

```java
FSDataOutputStream outputStream = fileSystem.create(new Path("/data/test.txt"));
```

```java
// DistributedFileSystem.java
public FSDataOutputStream create(Path f, ...) {
    return new FileSystemLinkResolver<FSDataOutputStream>() {
        @Override
        public FSDataOutputStream doCall(...) throws IOException {
            return dfs.create(getPathName(f), ...);
        }
    }.resolve(this, f);
}
```

2）`DistributedFileSystem` 通过 HDFS Client 与 NameNode 通信，请求在 HDFS 命名空间中创建文件。

3）NameNode 

DFSClient（关键类）

```java
// DFSClient.java
public DFSOutputStream create(String src, ...) throws IOException {
    ...
    namenode.create(src, masked, clientName, ...);
}
```

检查：

- 父目录是否存在
- 用户是否有写权限
- 目标路径是否已经存在
- 文件名是否合法
- 是否满足配额等限制

4）检查通过后，NameNode 在内存中的 HDFS 命名空间创建文件元数据，并记录相应的编辑日志。

5）NameNode 返回创建成功，Client 得到一个 `FSDataOutputStream`。



1. Client客户端发送上传请求，通过RPC与NameNode建立通信，NameNode检查该用户是否有上传权限，以及上传的文件是否在HDFS对应的目录下重名，如果这两者有任意一个不满足，则直接报错，如果两者都满足，则返回给客户端一个可以上传的信息；
2. Client根据文件的大小进行切分，默认128M一块，切分完成之后给NameNode发送请求第一个block块上传到哪些服务器上；
3. NameNode收到请求之后，根据网络拓扑和机架感知以及副本机制进行文件分配，返回可用的DataNode的地址；

> **注**：Hadoop在设计时考虑到数据的安全与高效，数据文件默认在HDFS上存放三份，存储策略为本地一份，同机架内其它节点上一份，不同机架的某一节点上一份。

1. 客户端收到地址之后与服务器地址列表中的一个节点如A进行通信，本质上就是RPC调用，建立pipeline，A收到请求后会继续调用B，B在调用C，将整个pipeline建立完成，逐级返回Client；
2. Client开始向A上发送第一个block（先从磁盘读取数据然后放到本地内存缓存），以packet（数据包，64kb）为单位，A收到一个packet就会发送给B，然后B发送给C，A每传完一个packet就会放入一个应答队列等待应答；
3. 数据被分割成一个个的packet数据包在pipeline上依次传输，在pipeline反向传输中，逐个发送ack（命令正确应答），最终由pipeline中第一个DataNode节点A将pipelineack发送给Client；
4. 当一个block传输完成之后，Client再次请求NameNode上传第二个block，NameNode重新选择三台DataNode给Client。

# HDFS读流程

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









<style>
a {
 text-decoration: none;
 color: #464feb;
}
tr th, tr td {
 border: 1px solid #e6e6e6;
}
tr th {
 background-color: #f5f5f5;
}
</style>

# 一、检查 HDFS 写入流程

## 第 1 步：Client 请求创建文件

你的描述：

> Client 发送上传请求，通过 RPC 与 NameNode 建立通信，NameNode 检查用户是否有上传权限，以及文件是否重名。

这部分**基本正确**。

更准确的过程是：

2. 应用程序调用类似下面的方法：

Java

FSDataOutputStream outputStream =

fileSystem.create(new Path("/data/test.txt"));

3. `DistributedFileSystem` 通过 HDFS Client 与 NameNode 通信，请求在 HDFS 命名空间中创建文件。

4. NameNode 检查：
   
   - 父目录是否存在
   - 用户是否有写权限
   - 目标路径是否已经存在
   - 文件名是否合法
   - 是否满足配额等限制

5. 检查通过后，NameNode 在内存中的 HDFS 命名空间创建文件元数据，并记录相应的编辑日志。

6. NameNode 返回创建成功，Client 得到一个 `FSDataOutputStream`。

### 一个重要细节

此时只是完成了**文件元数据的创建**，还没有真正把文件数据写入 DataNode。

所以这里的“返回一个可以上传的信息”，更准确地说是：

> NameNode 确认文件可以创建，Client 随后通过 `FSDataOutputStream` 开始写入数据。

---

## 第 2 步：Client 对数据进行 Block 划分

你的描述：

> Client 根据文件的大小进行切分，默认 128 MB 一块，切分完成之后请求 NameNode 返回第一个 Block 上传到哪些服务器。

这里的核心思路正确，但“先切分完成”容易产生误解。

## 更准确的理解

Client 通常不是先读取整个文件，然后一次性切成：

Plain Text

Block 1：128 MB

Block 2：128 MB

Block 3：44 MB

再开始上传。

实际过程更接近**边读取、边缓存、边写入**：

Plain Text

应用程序不断写数据

↓

FSDataOutputStream

↓

DFSOutputStream

↓

Packet 缓冲区

↓

当前 Block 对应的 DataNode Pipeline

Client 知道 Block 大小，例如 128 MB。当当前 Block 累计写满 128 MB 后，Client 再向 NameNode 申请下一个 Block。

因此建议把原描述改为：

> Client 按照 HDFS Block 大小，以流式方式组织数据。当需要写入第一个 Block 时，Client 向 NameNode 申请一个新的 Block，并请求为该 Block 分配 DataNode。

### 默认 Block 大小不是绝对固定值

常见 HDFS 2.x/3.x 环境默认是 **128 MiB**，但可以配置，也可以在创建文件时指定。

这里更严谨地写成：

> Block 默认大小通常为 128 MiB，具体值由集群配置以及文件创建参数决定。

严格来说，这里的 M 应当写成 **MiB**，因为通常指的是：

Plain Text

128 × 1024 × 1024 字节

---

## 第 3 步：NameNode 选择 DataNode

你的描述：

> NameNode 根据网络拓扑和机架感知以及副本机制进行文件分配，返回可用的 DataNode 地址。

这部分正确，但建议把“文件分配”改成“为当前 Block 选择副本存放位置”。

NameNode 不是简单地随机选择三个 DataNode，而是综合考虑：

- 副本数量
- Client 所在位置
- DataNode 所属机架
- DataNode 是否存活
- DataNode 剩余磁盘空间
- DataNode 当前负载
- DataNode 是否进入维护或退役状态
- DataNode 是否已保存当前 Block 的副本
- 存储类型要求
- 集群的副本放置策略

NameNode 返回的通常是一个有顺序的 DataNode 列表，例如：

Plain Text

DN-A → DN-B → DN-C

这个顺序随后用于建立数据 Pipeline。

---

# 二、“网络拓扑、机架感知和副本机制”分别是什么

这三个概念有关联，但不是同一个概念。

---

## 1. 网络拓扑 Network Topology

NameNode 会把 DataNode 按照网络位置组织成一种树形逻辑结构。

例如：

Plain Text

集群

├── Rack-1

│ ├── DN-A

│ ├── DN-B

│ └── DN-C

│

└── Rack-2

├── DN-D

├── DN-E

└── DN-F

在大型集群中还可能包含数据中心等更多层级：

Plain Text

/data-center/rack/node

例如：

Plain Text

/dc1/rack1/dn1

/dc1/rack1/dn2

/dc1/rack2/dn3

NameNode 根据这个拓扑判断节点之间的“网络距离”。

一般来说：

Plain Text

同一个节点

<

同一个机架中的不同节点

<

不同机架的节点

也就是说：

- 同一个 DataNode 上不需要网络传输
- 同一机架内传输通常经过机架内部交换机
- 跨机架传输通常需要经过更上层的网络设备

因此，跨机架传输通常成本更高。

---

## 2. 机架感知 Rack Awareness

机架感知是指：

> NameNode 知道每个 DataNode 属于哪个机架，并在选择副本位置时利用这些信息。

假设集群有两个机架：

Plain Text

Rack-1：DN-A、DN-B、DN-C

Rack-2：DN-D、DN-E、DN-F

如果三个副本全部放在 Rack-1：

Plain Text

Rack-1：副本 1、副本 2、副本 3

Rack-2：无副本

一旦 Rack-1 的交换机、电源或者网络整体发生故障，三个副本可能同时不可用。

所以 HDFS 通常会让副本分布到不同机架：

Plain Text

Rack-1：副本 1

Rack-2：副本 2、副本 3

这样即使一个机架整体故障，另一个机架仍然保存副本。

### 机架感知的目的

机架感知主要在两个目标之间进行平衡：

2. **可靠性**
   
   - 副本跨机架保存
   - 防止整个机架故障导致数据不可用

3. **网络效率**
   
   - 并非让每个副本都放到不同机架
   - 避免产生过多跨机架数据传输

---

## 3. 副本机制 Replication

副本机制是指一个 HDFS Block 保存多少份副本。

例如文件大小是 300 MiB，Block 大小是 128 MiB：

Plain Text

文件

├── Block-1：128 MiB

├── Block-2：128 MiB

└── Block-3：44 MiB

如果副本系数为 3，那么：

Plain Text

Block-1：3 个副本

Block-2：3 个副本

Block-3：3 个副本

这里不是整个文件复制三次后作为三个大文件保存，而是：

> 每个 Block 分别保存三个副本。

例如：

| Block   | 副本位置           |
| ------- | -------------- |
| Block-1 | DN-A、DN-D、DN-E |
| Block-2 | DN-B、DN-E、DN-F |
| Block-3 | DN-C、DN-D、DN-F |

每个 Block 的 DataNode 组合可以不同。

---

# 三、默认三个副本到底怎么放

你引用的表述是：

> 本地一份，同机架内其他节点一份，不同机架某个节点一份。

这个描述**不够准确**。

对于传统的默认副本放置策略，当副本系数为 3，并且写入 Client 就运行在集群内的 DataNode 上时，通常可以理解为：

2. 第一个副本放在本地 DataNode
3. 第二个副本放在另一个机架的 DataNode
4. 第三个副本放在与第二个副本相同机架的另一个 DataNode

结构通常是：

Plain Text

Rack-1

└── DN-A：副本 1，靠近 Client

Rack-2

├── DN-B：副本 2

└── DN-C：副本 3

所以更常见的表述是：

> 第一份尽量放在本地节点，第二份放到远端机架，第三份放到第二份所在机架的另一个节点。

这与“第二份放同机架、第三份放不同机架”的说法顺序不同。

## 为什么这样设计

如果三份全部放在不同机架：

Plain Text

Client → Rack-1

→ Rack-2

→ Rack-3

可靠性更高，但每写一个 Block 可能需要进行更多跨机架传输。

默认策略通常选择：

Plain Text

两个机架

三个节点

这样既能抵抗一个机架故障，又只需要进行一次主要的跨机架传输。

---

## 例外：Client 不在 DataNode 上

如果 Client 是集群外部机器，或者 Client 所在节点不是 DataNode，就不能说“第一份放在本地 DataNode”。

这种情况下，NameNode 通常选择一个合适并且相对接近的 DataNode 作为第一个副本位置。

所以，“本地一份”需要满足前提：

> Client 运行在某个合格的 DataNode 上，并且该 DataNode 符合副本放置条件。

---

# 四、Pipeline 建立过程

你的描述：

> Client 与地址列表中的 A 通信，A 继续调用 B，B 再调用 C，形成 Pipeline。

整体正确。

假设 NameNode 返回：

Plain Text

DN-A → DN-B → DN-C

建立过程是：

Plain Text

Client ──连接──> DN-A

│

└──连接──> DN-B

│

└──连接──> DN-C

建立成功后，数据传输方向为：

Plain Text

Client → DN-A → DN-B → DN-C

但有一个术语需要调整：

> Client 与 DataNode 之间的数据传输不应全部笼统地表述为 RPC。

Client 与 NameNode 的元数据操作使用 RPC，例如创建文件、申请 Block、完成文件。

而 Client 与 DataNode 之间真正的 Block 数据传输使用 HDFS Data Transfer Protocol，通过网络连接传输 Packet。

所以可以区分为：

Plain Text

Client ↔ NameNode

元数据控制通信，通常通过 RPC

Client → DataNode Pipeline

实际数据传输，使用 Data Transfer Protocol

---

# 五、Packet 数据传输

你的描述：

> Client 以 Packet，64 KB 为单位发送，A 收到一个 Packet 后发送给 B，B 再发送给 C。

这个过程基本正确。

数据层级可以理解为：

Plain Text

File

↓

Block

↓

Packet

↓

Checksum Chunk

- **Block**：HDFS 的存储和副本管理单位，例如 128 MiB
- **Packet**：Pipeline 中的数据传输单位，常见大小大约为 64 KiB，但应视实现与版本配置而定
- **Checksum Chunk**：校验单位，常见为 512 字节数据对应一个校验值

Packet 除了数据本身，通常还包含：

- Packet Header
- 序列号
- 当前 Block 中的偏移量
- 数据长度
- 校验和
- 是否为最后一个 Packet 等标记

因此“一个 Packet 等于固定 64 KB 原始文件数据”并不完全严谨。

更准确地说：

> HDFS 会把 Block 中的数据组织成 Packet，通过 Pipeline 连续发送。Packet 的大小通常约为 64 KiB，Packet 中还包含校验和及控制信息。

---

# 六、ACK 应答流程

你的描述：

> ACK 在 Pipeline 中反向传输，最终由第一个 DataNode 返回给 Client。

正确。

数据方向：

Plain Text

Client → DN-A → DN-B → DN-C

ACK 方向：

Plain Text

Client ← DN-A ← DN-B ← DN-C

较完整的过程是：

2. Client 发送 Packet 给 DN-A
3. DN-A 写入数据，并将 Packet 转发给 DN-B
4. DN-B 写入数据，并将 Packet 转发给 DN-C
5. DN-C 写入成功后向 DN-B 返回 ACK
6. DN-B 综合自身写入结果和下游 ACK，向 DN-A 返回 ACK
7. DN-A 再向 Client 返回 Pipeline ACK
8. Client 收到确认后，将对应 Packet 从 ACK 等待队列中移除

可以理解为：

Plain Text

数据：

Client

│ Packet 1

▼

DN-A

│ Packet 1

▼

DN-B

│ Packet 1

▼

DN-C

ACK：

DN-C

│ ACK

▼

DN-B

│ ACK

▼

DN-A

│ ACK

▼

Client

这里不一定要等一个 Packet 完整完成所有 ACK 后才发送下一个 Packet。

Pipeline 可以连续发送多个 Packet：

Plain Text

Packet 1 → 正在 DN-C 写入

Packet 2 → 正在 DN-B 传输

Packet 3 → 正在 DN-A 传输

Packet 4 → Client 准备发送

这正是 Pipeline 提高吞吐量的原因。

---

# 七、一个 Block 写完以后

你的描述：

> 一个 Block 传输完成后，Client 再次请求 NameNode 上传第二个 Block，NameNode 重新选择三台 DataNode。

基本正确，但“重新选择三台”需要稍微调整。

更准确地说：

2. 当前 Block 写满或文件结束
3. Client 向 NameNode 请求分配下一个 Block
4. NameNode 为新 Block 选择副本位置
5. Client 建立新的 Pipeline
6. Client 继续发送 Packet

但是：

> 下一个 Block 的 DataNode 可能与前一个 Block 完全不同，也可能部分相同。

例如：

Plain Text

Block-1：DN-A、DN-B、DN-C

Block-2：DN-A、DN-D、DN-E

不是强制每次都选择三台完全没使用过的 DataNode。

---

# 八、文件写入完成：close 和 complete

你的步骤中遗漏了一点：所有 Block 写完以后，还需要完成整个文件。

从图片上也可以看到：

Plain Text

6: close

7: complete

完整过程是：

2. 应用程序调用 `FSDataOutputStream.close()`
3. Client 刷新尚未发送的数据
4. Client 等待所有 Packet 的 ACK
5. Client 确保最后一个 Block 完成
6. Client 通知 NameNode 完成文件
7. NameNode 检查 Block 是否达到所需的最小副本条件
8. NameNode 将文件从“正在写入”状态转换为“已完成”状态

需要区分：

Plain Text

close

主要是应用程序或 Client 侧对输出流执行关闭操作。

Plain Text

complete

是 Client 通知 NameNode：该文件的所有 Block 已写入完毕，可以完成文件元数据。

---

# 九、修正后的完整流程

你可以把原来的笔记改成下面这一版：

## HDFS 文件写入流程

2. Client 调用 HDFS API 创建目标文件，并通过 RPC 向 NameNode 发送创建请求。
3. NameNode 检查目标路径、文件是否已存在、用户权限、命名空间配额等信息。
4. 检查通过后，NameNode 创建文件元数据并返回创建成功。此时尚未写入实际文件数据。
5. Client 通过 `FSDataOutputStream` 流式写入数据。当需要写入第一个 Block 时，Client 向 NameNode 申请新的 Block。
6. NameNode 根据副本系数、副本放置策略、网络拓扑、机架感知、节点存活状态、磁盘空间和负载等因素，为当前 Block 选择 DataNode。
7. NameNode 向 Client 返回有顺序的 DataNode 列表，例如 `DN-A → DN-B → DN-C`。
8. Client 与 DN-A 建立连接，DN-A 与 DN-B 建立连接，DN-B 与 DN-C 建立连接，从而形成 DataNode Pipeline。
9. Client 将 Block 数据组织成 Packet，并按照 `Client → DN-A → DN-B → DN-C` 的方向连续发送。
10. DataNode 一边把数据写入本地存储，一边将 Packet 转发给 Pipeline 中的下一个 DataNode。
11. ACK 按照 `DN-C → DN-B → DN-A → Client` 的方向返回。Client 收到成功 ACK 后，从等待确认队列中删除对应 Packet。
12. 当前 Block 写满后，Client 向 NameNode 申请下一个 Block。NameNode为新 Block 重新选择副本位置，并建立新的 Pipeline。
13. 所有数据写完后，Client 关闭输出流，等待未确认 Packet 完成，并通知 NameNode 完成文件。
14. NameNode 确认 Block 达到最小副本要求后，将文件标记为完整状态。

---

# 十、对图片的判断

图片表达的总体流程正确：

- 左上为 `HDFS Client`
- Client 通过 `DistributedFileSystem` 向 NameNode 执行 `create`
- 实际数据通过 `FSDataOutputStream` 写入 DataNode Pipeline
- 数据沿三个 DataNode 从左到右传输
- ACK 沿 DataNode Pipeline 从右到左返回
- Client 执行 `close`
- `DistributedFileSystem` 最后向 NameNode 执行 `complete`

不过图片进行了简化，没有明确展示：

- Block 的申请过程
- NameNode 返回 DataNode 列表
- Packet 内部的 checksum
- Client 的 data queue 和 ack queue
- Pipeline 出现 DataNode 故障后的恢复
- 每个 Block 可能使用不同的 Pipeline

## 最核心的心智模型

你可以把整个过程概括为：

Plain Text

NameNode 管“写到哪里”

DataNode 管“实际存储”

Client 管“切换 Block、建立 Pipeline、发送 Packet、等待 ACK”

其中：

- **副本机制**决定一个 Block 存多少份
- **网络拓扑**描述 DataNode 在网络中的位置和距离
- **机架感知**让 NameNode 知道 DataNode 属于哪个机架
- **副本放置策略**综合这些信息，决定每个副本放在哪个 DataNode 上

因此，“根据网络拓扑、机架感知以及副本机制进行分配”的完整含义是：

> NameNode 先按照副本系数确定需要多少个副本，再利用网络拓扑和机架信息选择合适的 DataNode，使副本既能跨故障域提高可靠性，又尽量减少跨机架网络传输。
