# 1、Daemon（守护进程）

Daemon（守护进程）​ 就是在**后台持续运行、不直接跟用户交互**、专门负责一类职责的程序。

在 HDFS 里，NameNode、DataNode、SecondaryNameNode、ResourceManager、NodeManager、JobHistoryServer 都是 daemon：

- **NameNode daemon**：专职**元数据管理**（目录树、文件→块映射）
- **DataNode daemon**：专职**数据块存储**
- **SecondaryNameNode daemon**：专职**检查点合并**

> 它们启动后就在那一直跑着，等着别人来请求，自己不会退出。

## 启停命令

### 单进程管理（Daemon）

daemon就是守护进程的英文，当想**精确单独管理**某个守护进程时，相关的命令都带有`daemon`。把 `start` 换成 `stop` 就是停止。这套是**在哪台机器执行，就启停哪台机器上的那个进程**，不走 SSH 远程分发。

| 组件                | Hadoop 2.x 写法                                 | Hadoop 3.x 写法（推荐）                       |
| ----------------- | --------------------------------------------- | --------------------------------------- |
| NameNode          | `hadoop-daemon.sh start namenode`             | `hdfs --daemon start namenode`          |
| DataNode          | `hadoop-daemon.sh start datanode`             | `hdfs --daemon start datanode`          |
| SecondaryNameNode | `hadoop-daemon.sh start secondarynamenode`    | `hdfs --daemon start secondarynamenode` |
| ResourceManager   | `yarn-daemon.sh start resourcemanager`        | `yarn --daemon start resourcemanager`   |
| NodeManager       | `yarn-daemon.sh start nodemanager`            | `yarn --daemon start nodemanager`       |
| JobHistoryServer  | `mr-jobhistory-daemon.sh start historyserver` | `yarn --daemon start historyserver`     |

守护进程启动完毕之后，系统里会多一个对应的常驻 Java 进程，可以使用`jps命令`查看

```bash
[hadoop@node1 ~]$ jps
4608 NameNode
5063 SecondaryNameNode
5421 NodeManager
5789 Jps
5294 ResourceManager
```

### 分层启停

**HDFS 层** 拉起 NameNode + 所有 DataNode + SecondaryNameNode

**只能在 NameNode 所在节点执行**

```bash
$HADOOP_HOME/sbin/start-dfs.sh
$HADOOP_HOME/sbin/stop-dfs.sh
```

**YARN 层**  拉起 ResourceManager + 所有 NodeManager

**只能在 ResourceManager 所在节点执行**

```bash
$HADOOP_HOME/sbin/start-yarn.sh    
$HADOOP_HOME/sbin/stop-yarn.sh
```

跑 MapReduce 需要同时启动 JobHistoryServer

```bash
# Hadoop 2.x
mr-jobhistory-daemon.sh start historyserver
# Hadoop 3.x
yarn --daemon start historyserver
```

这时肯定有疑问：为什么 `start-dfs.sh`和`start-dfs.sh`可以启动其他机器上的进程，`hdfs --daemon start namenode`就无法启动其他机器上的进程？

因为`--daemon`是**单点的执行器**，在**当前这台机器**直接起一个 JVM，所以只对当前节点生效

`start-dfs.sh`和`start-dfs.sh`是**带分发能力的总控脚本**，**当前节点做调度**，通过 SSH 让整个 HDFS 集群的**其他节点各自**执行 `--daemon`命令


```plain text
你在 node1 start-dfs.sh
   │
   ├─ 本机执行：hdfs --daemon start namenode            （node1 自己起 NameNode）
   │
   ├─ 读 workers = [node1, node2, node3]
   │     └─ ssh node1 "hdfs --daemon start datanode"    （远端起 DataNode）
   │     └─ ssh node2 "hdfs --daemon start datanode"
   │     └─ ssh node3 "hdfs --daemon start datanode"
   │
   └─ getconf 问出 SecondaryNameNode 在 node3
         └─ ssh node3 "hdfs --daemon start secondarynamenode"
```



| 组件            | 核心职责                                                                                                                                                   | 是否存储真实数据         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| **NameNode**​ | **元数据管理**：<br>1. 维护文件系统的目录树（文件名、权限、修改时间等）<br>2. 记录每个文件被切分成了哪几个 Block，以及这些 Block 存储在哪些 DataNode 上<br>3. 处理客户端的读写请求（告诉客户端去哪读/写）<br>4. 管理 DataNode 的心跳和状态 | **不存储**<br>只存元数据 |
| **DataNode**​ | **数据块存储**：<br>1. 实际存储文件的数据块（Block）<br>2. 负责数据块的读写、校验<br>3. 定期向 NameNode 发送心跳和块报告（汇报自己有哪些块）                                                             | **存储**<br>存真实数据  |

简单比喻：**NameNode 是“图书管理员”（知道书在哪、谁借了），DataNode 是“书架”（真正放书的地方）。**

# 9.1 NameNode 与 DataNode 启动

## NameNode 工作机制

1. 第一次启动 NameNode 格式化后，创建 fsimage 和 edits 文件。如果不是第一次启动，直接加载编辑日志和镜像文件到内存。

2. 客户端对元数据进行增删改的请求。

3. NameNode 记录操作日志，更新滚动日志。

4. NameNode 在内存中对数据进行增删改查。

## Secondary NameNode

1. Secondary NameNode 询问 NameNode 是否需要 checkpoint，直接带回 NameNode 是否检查结果。

2. Secondary NameNode 请求执行 checkpoint。

3. NameNode 滚动正在写的 edits 日志。

4. 将滚动前的编辑日志和镜像文件拷贝到 Secondary NameNode。

5. Secondary NameNode 加载编辑日志和镜像文件到内存，并合并。

6. 生成新的镜像文件 `fsimage.chkpoint`。

7. 拷贝 `fsimage.chkpoint` 到 NameNode。

8. NameNode 将 `fsimage.chkpoint` 重新命名成 `fsimage`。

---

# 9.2 FSImage 与 Edits 详解

所有的元数据信息都保存在了 FSImage 与 Edits 文件当中，这两个文件就记录了所有数据的元数据信息，元数据信息的保存目录配置在了 `hdfs-site.xml` 当中。

```xml
<!-- fsimage 文件存储的路径 -->

<property>

    <name>dfs.namenode.name.dir</name>

    <value>file:///opt/hadoop-2.6.0-cdh5.14.0/hadoopDatas/...</value>

</property>

<!-- edits 文件存储的路径 -->

<property>

    <name>dfs.namenode.edits.dir</name>

    <value>file:///opt/hadoop-2.6.0-cdh5.14.0/hadoopDatas/...</value>

</property>
```

客户端对 HDFS 进行写文件时，会首先被记录在 edits 文件中。

edits 修改时，元数据也会更新。

每次 HDFS 更新时，edits 先更新后，客户端才会看到最新信息。

FSImage：是 NameNode 中关于元数据的镜像，一般称为检查点。

一般开始时，对 NameNode 的操作都放在 edits 中，为什么不放在 FSImage 中呢？

因为 FSImage 是 NameNode 的完整镜像，内容很大。如果每次都加载到内存的话，生成树状拓扑结构，这是非常耗内存和 CPU 的。

FSImage 内容包含了 NameNode 管理下的所有 DataNode 中文件及文件 Block，以及 Block 所在 DataNode 的元数据信息。随着 edits 内容增大，就需要在一定时间点和 FSImage 合并。

---

# 9.3 FSImage 文件当中的文件信息查看

使用命令 `hdfs oiv`：

```bash
cd /opt/hadoop-2.6.0-cdh5.14.0/hadoopDatas/namenodeDatas/current

hdfs oiv \

  -i fsimage_0000000000000000112 \

  -p XML \

  -o hello.xml
```

---

# 9.4 Edits 当中的文件信息查看

查看命令 `hdfs oev`：

```bash
cd /opt/hadoop-2.6.0-cdh5.14.0/hadoopDatas/dfs/nn/edits

hdfs oev \

  -i edits_0000000000000000112-0000000000000000113 \

  -o myedits.xml
```

---

# 9.5 Secondary NameNode 如何辅助管理 FSImage 与 Edits 文件

1. Secondary NameNode 通知 NameNode 切换 editlog。

2. Secondary NameNode 从 NameNode 中获得 FSImage 和 editlog，通过 HTTP 方式。

3. Secondary NameNode 将 FSImage 载入内存，然后开始合并 editlog，合并之后成为新的 FSImage。

4. Secondary NameNode 将新的 FSImage 发回给 NameNode。

5. NameNode 用新的 FSImage 替换旧的 FSImage。

完成合并的是 Secondary NameNode。Secondary NameNode 会请求 NameNode 停止使用 edits，暂时将新写操作放入一个新的文件中，即 `edits.new`。

Secondary NameNode 从 NameNode 中通过 HTTP GET 获得 edits。因为要和 FSImage 合并，所以也是通过 HTTP GET 的方式把 FSImage 加载到内存，然后逐一执行具体对文件系统的操作，与 FSImage 合并，生成新的 FSImage。然后把 FSImage 发送给 NameNode，通过 HTTP POST 的方式。

NameNode 从 Secondary NameNode 获得了 FSImage 后，会把原有的 FSImage 替换为新的 FSImage，把 `edits.new` 变成 edits，同时会更新 FSImage。

Hadoop 进入安全模式时，需要管理员使用 `dfsadmin` 的 `save namespace` 来创建新的检查点。

Secondary NameNode 在合并 edits 和 FSImage 时需要消耗内存，和 NameNode 差不多，所以一般把 NameNode 和 Secondary NameNode 放在不同的机器上。

FSImage 与 edits 的合并时机取决于两个参数。

第一个参数：时间达到一个小时，FSImage 与 edits 就会进行合并。

```properties
dfs.namenode.checkpoint.period=3600
```

第二个参数：HDFS 操作达到 1000000 次也会进行合并。

```properties
dfs.namenode.checkpoint.txns=1000000
```

第三个参数：每隔多长时间检查一次 HDFS 的操作次数。

```properties
dfs.namenode.checkpoint.check.period=60
```

---

# 9.6 NameNode 元数据信息多目录配置

为了保证元数据的安全性，我们一般都是先确定好磁盘挂载目录，将元数据的磁盘做 RAID 1。

NameNode 的本地目录可以配置成多个，且每个目录存放内容相同，增加了可靠性。

具体配置方案：

## hdfs-site.xml

```xml
<property>

    <name>dfs.namenode.name.dir</name>

    <value>file:///export/servers/hadoop-2.6.0-cdh5.14.0/hadoopDatas/...</value>

</property>
```

---

# 9.7 NameNode 故障恢复

在 Secondary NameNode 对 NameNode 当中的 FSImage 和 edits 进行合并时，每次都会先将 NameNode 的 FSImage 与 edits 文件拷贝一份过来。

所以 FSImage 与 edits 文件在 Secondary NameNode 当中也会保存一份。如果 NameNode 的 FSImage 与 edits 文件损坏，那么我们可以将 Secondary NameNode 当中的 FSImage 与 edits 拷贝过去给 NameNode 继续使用，只不过有可能会丢失一部分数据。

这里涉及几个配置选项。

## NameNode 保存 FSImage 的配置路径

```xml
<!-- NameNode 元数据存储路径，图片右侧内容被截断 -->

<property>

    <name>dfs.namenode.name.dir</name>

    <value>file:///export/servers/hadoop-2.6.0-cdh5.14.0/hadoopDatas/...</value>

</property>
```

## NameNode 保存 edits 文件的配置路径

```xml
<property>

    <name>dfs.namenode.edits.dir</name>

    <value>file:///export/servers/hadoop-2.6.0-cdh5.14.0/hadoopDatas/...</value>

</property>
```

## Secondary NameNode 保存 FSImage 文件的配置路径

```xml
<property>

    <name>dfs.namenode.checkpoint.dir</name>

    <value>file:///export/servers/hadoop-2.6.0-cdh5.14.0/hadoopDatas/...</value>

</property>
```

## Secondary NameNode 保存 edits 文件的配置路径

```xml
<property>

    <name>dfs.namenode.checkpoint.edits.dir</name>

    <value>file:///export/servers/hadoop-2.6.0-cdh5.14.0/hadoopDatas/...</value>

</property>
```

## 模拟 NameNode 故障恢复

1. 杀死 NameNode 进程：使用 `jps` 查看 NameNode 的进程号，使用 `kill -9` 直接杀死。

2. 删除 NameNode 的 FSImage 文件和 edits 文件。

根据上述配置，找到 NameNode 放置 FSImage 和 edits 的路径，使用下面的命令删除：

```bash
rm -rf <NameNode 元数据目录中的内容>
```

3. 将 Secondary NameNode 的 FSImage 与 edits 文件复制到 NameNode 的 FSImage 与 edits 文件目录。

根据上述配置，找到 Secondary NameNode 的 FSImage 和 edits 路径，将内容使用 `cp -r` 全部复制到 NameNode 对应的目录下。

4. 重新启动 NameNode，观察数据是否存在。
