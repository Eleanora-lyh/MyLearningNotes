# HDFS 写入

## 前置概念

### 网络拓扑概念

在本地网络中，两个节点被称为“彼此近邻”是什么意思？在海量数据处理中，其主要限制因素是节点之间数据的传输速率——带宽很稀缺。这里的想法是将两个节点间的带宽作为距离的衡量标准。

节点距离：两个节点到达最近的共同祖先的距离总和。

例如，假设有数据中心 d1 机架 r1 中的节点 n1。该节点可以表示为 /d1/r1/n1。利用这种标记，这里给出四种距离描述。

## 1、Client 请求创建文件

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

1. 应用程序调用类似下面的方法：

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
