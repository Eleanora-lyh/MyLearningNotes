**Hadoop 是一个整体生态 / 框架，HDFS 和 YARN 是它里面两个核心组件：**

- **HDFS = 分布式存储** Hadoop Distributed File System（存数据）
- **YARN = 分布式资源调度** Yet Another Resource Negotiator（管资源、分配算力）
- **MapReduce = 第一代分布式计算引擎**
- **Hadoop = HDFS + YARN + MapReduce + 周边工具**

## 一、HDFS集群环境部署

### 1.1 Hadoop 安装包目录结构

安装位置：`/export/server/hadoop-3.4.2/`,包含以下文件夹

| 目录      | 说明                                                                                                                                                                                                                                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bin     | Hadoop最基本的管理脚本和使用脚本的目录，脚本时sbin目录下管理脚本的基础实现，用户可以使用这些脚本管理和使用Hadoop                                                                                                                                                                                                                                                                              |
| sbin    | Hadoop管理脚本所在目录，包含HDFS和YARN中各类服务的启动/关闭脚本                                                                                                                                                                                                                                                                                                       |
| etc     | Hadoop配置文件所在目录(/export/server/hadoop-3.4.2/etc/hadoop/)<br />第一类1个：hadoop-env.sh(执行任何Hadoop命令，它都会第一时间自动读取hadoop-env.sh，是启动前必须知道的环境信息)<br/>第二类4个：xxxx-site.xml，site表示的是用户定义的配置，会覆盖default中的默认配置。<br/>core-site.xml 核心模块配置（配置回收站）<br/>hdfs-site.xml hdfs文件系统模块配置<br/>mapred-stie.xml MapReduce模块配置<br/>yarn-site.xml yarn模块配置<br/>第三类1个：workers |
| share   | Hadoop各个模块编译后的jar包所在目录                                                                                                                                                                                                                                                                                                                        |
| include | 对外提供的变成库头文件（具体动态库+静态库在lib目录中）这些头文件均用C++定义，通常用于C++程序访问HDFS或者编写MapReduce程序                                                                                                                                                                                                                                                                      |
| lib     | 包含Hadoop对外提供的变成动态\|静态库，与include目录中的头文件结合使用                                                                                                                                                                                                                                                                                                    |
| libexec | 各个服务对应的shell配置文件所在目录，用于配置日志输出、启动参数，如JVM参数等信息                                                                                                                                                                                                                                                                                                  |
| logs    | 日志                                                                                                                                                                                                                                                                                                                                            |

/data/nn    # NameNode 存储目录

/data/dn    # DataNode 存储目录

### 1.2 配置HDFS回收站

HDFS 会保证被删除的文件在回收站（`/user/<username>/.Trash/Current`）中至少存放 **1440min=24h**。超过这个时间，系统在下次检查点任务运行时就可以永久删除文件保留。

每 120 分钟（2 小时），HDFS 的 `NameNode`会启动一个后台任务，检查回收站中哪些文件已经超过了 `fs.trash.interval`设置的保留期。对于超期的文件，会将其从 `Current`目录移动到 `Checkpoint`目录，并最终清理掉。

```bash
    <property>
        <name>fs.trash.interval</name>
        <value>1440</value>
    </property>
    <property>
        <name>fs.trash.checkpoint.interval</name>
        <value>120</value>
    </property>
```

回收站位置：

```bash
/usr/hadoop/.Trash
```

在哪个集群配置就在哪里生效，无需重启集群。配置好后删除文件会进入回收站

```bash
[hadoop@node1 ~]$ hdfs dfs -rm test1.txt
2026-03-24 21:15:54,536 INFO fs.TrashPolicyDefault: Moved: 'hdfs://node1:8020/user/hadoop/test1.txt' to trash at: hdfs://node1:8020/user/hadoop/.Trash/Current/user/hadoop/test1.txt
```

恢复回收站文件

```bash
# 列出当前用户回收站根目录的内容
[hadoop@node1 ~]$ hdfs dfs -ls /user/hadoop/.Trash/Current

# 如果文件原来在深层目录，回收站会保留完整路径，可以递归查找
[hadoop@node1 ~]$ hdfs dfs -ls -R /user/hadoop/.Trash/Current | grep "被删文件名"
```

**例如**：

- 您删除了文件：`/test/data/important.log`
- 它在回收站中的路径将变为：`/user/hadoop/.Trash/Current/test/data/important.log`

```bash
hdfs dfs -mv <文件在回收站中的完整路径> <目标恢复路径>
```

### 1.3 HDFS集群的Web页面

启动成功后就可以看到hdfs的web：http://node1:9870/

yarn的web：http://node1:8088/

## 二、HDFS的Shell操作

### 2.1 Yarn、HDFS、Hadoop启停命令

“启动 Hadoop” = 启动 HDFS + YARN

启动必须切换为非root用户才行

```bash
[root@node1 ~]# su - hadoop
Last login: Thu Mar 12 21:42:54 CST 2026 on pts/0
[hadoop@node1 ~]$ hdfs namenode -format
# 格式化HDFS（仅首次启动时执行，重复执行会清空数据！）
```

执行原理：执行脚本的机器上，启动SecondaryNameNode-》读取core-site.xml内容，确定NameNode所在机器，启动NameNode-》读取workers内容，确定DataNode所在机器，启动全部DataNode

以下所有命令的文件存储位置均为

```bash
$HADOOP_HOME/sbin/stop-dfs.sh(hadoop-daemon.sh)
```

|            | 手动逐个进程启停(控制所在机器的进程启停)                     | shell脚本一键启停<br />(配置好机器之间的SSH免密登录和workers文件) |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| HDFS集群   | # hadoop2.x版本命令($HADOOP_HOME/sbin/hadoop-daemon.sh)<br />`hadoop-daemon.sh start | status                                                       |
| YARN集群   | # yarn2.x版本命令<br />`yarn-daemon.sh start                 | stop resourcemanager                                         |
| Hadoop集群 |                                                              | `start-all.sh`<br />`stop-all.sh`<br />一个命令代替start-dfs.sh和start-yarn.sh |

- 启动完毕之后可以使用`jps命令`查看进程是否启动成功
  
  ```bash
  [hadoop@node1 ~]$ jps
  4608 NameNode
  5063 SecondaryNameNode
  5421 NodeManager
  5789 Jps
  5294 ResourceManager
  ```

- Hadoop启动日志路径：`/export/server/hadoop-3.4.2/logs/`

### 2.2 HDFS的文件操作

命令行操作大全：

https://hadoop.apache.org/docs/r3.4.2/hadoop-project-dist/hadoop-common/FileSystemShell.html

当登录linux的hadoop用户后，默认会进入 /home/hadoop/文件夹

- 当执行`hadoop fs`或者`hdfs dfs`命令时操作的都是**HDFS 分布式文件系统**
- HDFS 的实际数据存储路径由 Hadoop 配置文件指定（和 Linux 本地路径是两回事），默认路径是 `hdfs://node1:9000/user/hadoop/hdfsAddDirTest`（`hadoop` 用户的 HDFS 家目录）；
- 这个目录**不会直接对应 Linux 本地的某个文件夹**，HDFS 的数据是「分块存储」在集群节点的本地磁盘上的，而非单个目录。

HDFS同Linux系统一样均以 / 作为根目录，同一个文件如果同时保存在HDFS、Linux中，此时就无法区分。所以引入协议头的概念(一般会自动识别为file://和hdfs://不用写)

|        | Linux                         | HDFS                                     |
| ------ | ----------------------------- | ---------------------------------------- |
| 假设文件位置 | /usr/local/hello.txt          | /usr/local/hello.txt                     |
| 协议头    | file://                       | hdfs://namenode:port/                    |
| ＋协议头后  | *file://*/usr/local/hello.txt | *hdfs://node1:8020/*/usr/local/hello.txt |

Hadoop fs [options] `fs` = **File System**（通用文件系统）：是更顶层、通用的命令，支持操作 HDFS、本地文件系统（Linux）、S3 等多种文件系统；

hdfs dfs [options] `dfs` = **Distributed File System**（分布式文件系统）：是专用于 HDFS 的命令，仅针对 HDFS 操作（本质是 `fs` 针对 HDFS 的别名）。

- 早期 Hadoop 只有 HDFS 一种核心文件系统，所以设计了 `hdfs dfs` 专用于 HDFS；
- 后来 Hadoop 支持了更多文件系统（如 S3、本地文件），为了统一入口，推出了 `hadoop fs`，兼容所有文件系统；
- 为了兼容老用户的使用习惯，`hdfs dfs` 被保留，本质上 `hdfs dfs` 就是 `hadoop fs` 针对 HDFS 的 “快捷方式”。

以下为HDFS文件系统和Linux系统文件的交互方式，必须要记住HDFS上的文件是「分块存储」在集群节点的本地磁盘上的，而非单个目录。

|                     | Hadoop                                                                | hdfs                                                              |
| ------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 创建文件夹               | hadoop fs -mkdir [-p] <path><br />-p：递归创建                             | hdfs dfs -mkdir [-p] <path>                                       |
| 查看指定目录下内容           | hadoop fs -ls [-h] [-R] <path>                                        | hdfs dfs -ls [-h] [-R] <path>                                     |
| 上传Linux文件到HDFS指定目录下 | hadoop fs -put [-f] [-p] <from> <to><br />-f: 覆盖  <br />-p: 保留访问时间    | hdfs dfs -put [-f] [-p] <from> <to><br />-f: 覆盖  <br />-p: 保留访问时间 |
| 查看HDFS文件内容          | hadoop fs -cat <path>                                                 | hdfs dfs -cat <path>                                              |
| 下载HDFS文件到Linux指定目录下 | hadoop fs -get [-f] [-p] <from> <to><br />-f: 覆盖  <br />-p: 保留访问时间    | hdfs dfs -get [-f] [-p] <from> <to><br />-f: 覆盖  <br />-p: 保留访问时间 |
| 拷贝HDFS文件到HDFS文件     | hadoop fs -cp [-f] <from> <to><br />-f: 覆盖                            | hdfs dfs -cp [-f] <from> <to><br />-f: 覆盖                         |
| 追加数据到HDFS文件中(无法修改)  | hadoop fs -appendToFile <from> <to>                                   | hdfs dfs -appendToFile <from> <to>                                |
| HDFS文件移动            | hadoop fs -mv <from> <to>                                             | hdfs dfs -mv <from> <to>                                          |
| 删除指定HDFS文件/文件夹      | hadoop fs -rm [-r] [-skipTrash] URI<br />-r：删除文件夹时使用<br />-skipTrash： | hdfs dfs -rm [-r] [-skipTrash] URI                                |

举例:上传Linux文件到HDFS指定目录下：

```bash
#上传Linux中/home/hadoop/TestDir/test.txt到hdfs的根目录(写明源为linux)
[hadoop@node1 logs]$ hdfs dfs -put file:///home/hadoop/TestDir/test.txt hdfs://node1:8020/

#查看
[hadoop@node1 logs]$ hdfs dfs -ls / 
#Found 1 items
#-rw-r--r--   3 hadoop supergroup         44 2026-03-22 10:55 /test.txt
```

```bash
[hadoop@node1 ~]$ vim TestDir/test2.txt
#不写明源为linux
[hadoop@node1 ~]$ hdfs dfs -put TestDir/test2.txt /
[hadoop@node1 ~]$ hdfs dfs -ls /
Found 2 items
-rw-r--r--   3 hadoop supergroup         44 2026-03-22 10:55 /test.txt
-rw-r--r--   3 hadoop supergroup         21 2026-03-22 11:02 /test2.txt
```

举例:下载HDFS文件到Linux指定目录下

```bash
[hadoop@node1 ~]$ hdfs dfs -get / ~
[hadoop@node1 ~]$ ll
total 8
-rw-r--r-- 1 hadoop hadoop 21 Mar 22 11:12 test2.txt
-rw-r--r-- 1 hadoop hadoop 44 Mar 22 11:12 test.txt
```

举例:HDFS文件移动(`mv` 命令**不会自动帮你创建不存在的目录**，必须先建目录再移动)

```bash
[hadoop@node1 ~]$ hdfs dfs -mv /test2.txt /TestDir/new.txt
```

bash 会**先把 `~` 替换成你本地 Linux 的家目录**，也就是 `/home/hadoop`，然后才把命令交给 HDFS 执行

本地 Linux 的家目录：/home/hadoop

HDFS 的家目录：/user/hadoop

所以`hdfs dfs -mv /test2.txt ~` 就变成了`hdfs dfs -mv /test2.txt /home/hadoop`。因此hdfs的home路径只能用 `.`

```bash
[hadoop@node1 ~]$ hdfs dfs -mv /test2.txt .
```

### 2.3 HDFS的UI操作

hdfs的启动端口保存在`$HADOOP_HOME/etc/hadoop/hdfs-site.xml`中，可以通过命令行查取

```bash
[hadoop@node1 ~]$ grep "dfs.namenode.http-address" $HADOOP_HOME/etc/hadoop/hdfs-site.xml
```

或者使用Hadoop命令直接查询，返回NameNode的HTTP地址和端口

```bash
[hadoop@node1 ~]$ hdfs getconf -confKey dfs.namenode.http-address
```

浏览器进入 node1:9870

![image-20260324212849747](./assets/image-20260324212849747.png)

但是UI页面中的权限无法创建文件，相当于匿名登录（dr.who登录，具有drwxr-xr-x），使用命令行是最高权限hadoop用户登录

如果需要在页面中具有操作权限，则在core.xml中配置网站的用户，并重启集群

```bash
    <property>
        <name>hadoop.http.staticuser.user</name>
        <value>hadoop</value>
    </property>
```

### 2.4 HDFS的权限

Linux系统中的超级用户是root，HDFS中的超级用户是**启动namenode的用户**(hadoop)

## 三、Windows连接HDFS

### 3.1 使用Data Grid中Big Data Tools插件连接HDFS

安装Data Grid，并配置相关环境：

1. 下载java8，配置环境变量 `JAVA_HOME=C:\Develop\Java\jdk1.8.0_202`;

2. 下载hadoop3.3.6，配置环境变量 `HADOOP_HOME=C:\Users\Eleanora\softwares\hadoop-3.3.6`;（路径中不能有空格）

3. 配置环境变量Path中添加
   
   ```text
   %JAVA_HOME%\bin
   %HADOOP_HOME%\bin
   ```

4. Data Grid 安装Big Data Tools插件，但是由于在Windows平台部署HDFS时，还需解决两大核心问题：**依赖库兼容性**与**运行环境适配**。Windows系统缺少Linux的本地库支持（如`libc.so`），且路径格式、权限模型存在差异，因此需要额外引入Windows适配层。
   
   典型依赖包括：
   
   - **Winutils.exe**：替代Linux下的`hadoop`命令行工具，处理HDFS权限、路径转换等操作。
   
   - **Hadoop.dll**：核心动态链接库，需与Java环境交互。
   
   - **第三方库**：如压缩库（`snappy.dll`、`lz4.dll`）、协议缓冲（`protobuf.dll`）等。

5. 将 `https://github.com/cdarlint/winutils` 中hadoop3.3.6/bin的文件下载下来后，替换本地的文件（引入Windows适配层）

6. 配置集群URL：`192.168.88.101:8020` + user：hadoop 或者 配置Hadoop文件夹：`C:\Users\Eleanora\softwares\hadoop-3.3.6\etc\hadoop` + user：hadoop 

### 3.2 使用Widows连接HDFS(HDFS NFS Gateway) （可选，windows专业版）

#### 3.2.1 NFS 定义

hdfs提供了基于NFS（Network File System）的插件，可以对外提供NFS网关，供其他系统挂载使用。支持上传、下载、删除、追加内容。
说人话翻译一下：**HDFS NFS网关就像一个“协议翻译器”**，它让HDFS这个“大数据专用仓库”能伪装成一台普通的“网络硬盘”，从而被那些只认识传统文件协议的系统直接访问。**HDFS为了降低使用门槛、方便与传统系统集成，提供了一个“协议适配器”服务。这个服务让HDFS能够“说”传统的NFS语言，从而允许任何支持NFS的系统像使用普通网络文件夹一样，直接挂载和访问HDFS海量数据，实现了“开箱即用”的集成。** 这是HDFS从“专用系统”走向“企业通用存储平台”的重要功能之一。

**1、NFS是什么？**

- **定义**：网络文件系统，一种古老而通用的标准协议。它的核心功能是让一台计算机能像访问本地硬盘一样，通过网络访问另一台计算机上的文件和目录。
- **类比**：就像在Windows上设置一个“网络驱动器（Z:盘）”，这个盘符实际上指向的是公司文件服务器。

**2、HDFS的“原生语言”问题**

- HDFS有自己的一套API（Java API， REST API）和通信协议，专为大数据吞吐量设计。
- 传统的操作系统（如Linux、Windows）和应用程序（如Notepad++、FFmpeg、甚至`cat`， `ls`命令）**天生不认识**HDFS的协议。它们只认识像NFS、SMB（Windows共享）这样的标准文件协议。

**3、NFS网关的作用 —— “协议翻译”**

- **功能**：HDFS NFS网关是一个独立的服务。它启动后，会“挂载”到HDFS的某个目录上，然后**对外暴露一个标准的NFS协议接口**。
- **过程**：
  - **外部系统**：发出一个标准的NFS请求，比如“读取 `/mnt/hdfs/data.txt`文件”。
  - **NFS网关**：接收到这个NFS请求，将其**翻译**成HDFS客户端能理解的RPC调用，向真正的HDFS集群请求数据。
  - **HDFS集群**：处理请求，将数据返回给NFS网关。
  - **NFS网关**：再将数据包装成标准的NFS格式，返回给外部系统。
- **结果**：对于外部系统而言，它完全感知不到背后的HDFS，它只是觉得自己在访问一个有点慢的“网络硬盘”。

#### 3.2.2 NFS使用场景

- 你可以直接在Linux终端里使用 `cp`， `ls`， `cat`， `vim`等所有熟悉的命令来操作HDFS里的文件，无需学习`hdfs dfs`命令

- **实现与现有应用的零代码集成**：
  
  任何能读写本地文件的程序，现在都能直接处理HDFS上的数据。比如，一个用Python写的日志分析脚本，或者一个视频转码工具，无需任何修改，只要把输入/输出路径指向挂载的HDFS目录即可。

- **方便数据迁移和交换**：在HDFS和本地或其他NFS存储之间拷贝大量数据变得像拷贝文件一样简单直观。

#### 3.2.3 NFS局限性

- **性能**：由于多了一层协议转换和网络跳转，性能**一定低于**原生的HDFS客户端API。它适合做数据访问、管理和小文件操作，不适合做高性能计算中间数据的频繁交换。

- **功能完整性**：并非所有HDFS的高级功能都能通过NFS完美映射（比如文件追加写入在早期版本支持不好）。

- **单点风险**：NFS网关服务本身可能成为单点故障。通常需要做高可用配置。

#### 3.2.4 配置 NFS

将 NFS 服务挂载到Windows后可以在Windows中以盘的形式去访问HDFS的文件。

NFS网关需要以一个“代理用户”的身份访问HDFS，因此需要在NameNode的 `core-site.xml`中添加配置。假设你启动NFS服务的Linux用户是 `hadoop`（也是启动HDFS集群的用户）。

**步骤1：配置代理用户（核心）**

```xml
<!-- 允许用户 'hadoop' 代理任何用户组（* 表示所有组） -->
<property>
    <name>hadoop.proxyuser.hadoop.groups</name>
    <value>*</value>
    <description>允许hadoop用户代理所有组的成员。通常需要包含'root'组。</description>
</property>

<!-- 允许从任何主机（*）发起的请求被代理 -->
<property>
    <name>hadoop.proxyuser.hadoop.hosts</name>
    <value>*</value>
    <description>运行NFS网关的主机。设为'*'允许来自任何主机的请求。</description>
</property>
```

**步骤2：配置NFS网关参数**

```xml
<!-- 设置HDFS文件访问时间精度，可提升NFS性能 -->
<property>
    <name>dfs.namenode.accesstime.precision</name>
    <value>3600000</value>
    <description>HDFS文件访问时间精确到该值（毫秒），默认1小时。设为0则禁用。</description>
</property>

<!-- 设置NFS操作HDFS系统的超级用户 -->
<property>
    <name>nfs.superuser</name>
    <value>hadoop</value>
    <description>设置NFS操作HDFS系统的超级用户为hadoop</description>
</property>

<!-- NFS网关临时文件转储目录 -->
<property>
    <name>nfs.dump.dir</name>
    <value>/tmp/.hdfs-nfs</value>
    <description>NFS接收上传数据时使用的临时目录。确保该目录存在且有写权限。</description>
</property>

<!-- 允许挂载的客户端及权限 -->
<property>
    <name>nfs.exports.allowed.hosts</name>
    <value>192.168.88.1 rw</value>
    <description>允许客户端192.168.88.1以读写(rw)权限挂载。可指定IP如'* rw'表示所有。</description>
</property>
```

VMware提供了几种网络连接方式，其中 **NAT（网络地址转换）** 是最常用的。在这种模式下：

- 虚拟机获得一个**私有IP地址**（如 `192.168.88.101`）。
- 宿主机上创建一个**虚拟网卡**（`VMnet8`），并分配一个**网关IP地址**（如 `192.168.88.1`）。
- 虚拟机通过宿主机的这个虚拟网卡共享宿主机的物理网络连接上网，对外部网络来说，所有虚拟机的流量都“伪装”成了宿主机的IP。

电脑和VMware的通信是由VMware Network Adapter VMnet8连接的，其ip是192.168.88.1

每次登录的时候也可以看到。所以这里允许挂载的客户端及权限设置为192.168.88.1

```bash
[C:\~]$ 

Host 'node1' resolved to 192.168.88.101.
Connecting to 192.168.88.101:22...
Connection established.
To escape to local shell, press 'Ctrl+Alt+]'.

Last login: Sun Mar 29 11:15:55 2026 from 192.168.88.1
```

**步骤3：分发配置并重启HDFS**

将修改后的 `core-site.xml`和 `hdfs-site.xml`同步到集群所有节点（NameNode和DataNodes）。

```bash
[root@node1 hadoop]# scp core-site.xml hdfs-site.xml node2:`pwd`
core-site.xml                                                           100% 1731   541.4KB/s   00:00    
hdfs-site.xml                                                           100% 2424     1.8MB/s   00:00    
[root@node1 hadoop]# scp core-site.xml hdfs-site.xml node3:`pwd`
core-site.xml                                                           100% 1731     1.6MB/s   00:00    
hdfs-site.xml 
```

**重启HDFS集群**以使配置生效：

```bash
stop-dfs.sh
start-dfs.sh
```

#### 3.2.5 启动NFS网关服务

由于NFS协议标准端口是固定的：

- **111端口**：rpcbind/portmap
- **2049端口**：nfs-server/nfs3

如果同时运行系统NFS和Hadoop NFS，会发生端口冲突：

```bash
传统NFS架构：                    Hadoop NFS网关架构：
┌─────────────────┐              ┌─────────────────┐
│   NFS客户端      │              │   NFS客户端      │
│   (mount命令)    │              │   (mount命令)    │
└────────┬────────┘              └────────┬────────┘
         │                                 │
         ▼                                 ▼
┌─────────────────┐              ┌─────────────────┐
│   系统rpcbind    │              │ Hadoop portmap  │
│   (端口111)      │              │   (端口111)     │
└────────┬────────┘              └────────┬────────┘
         │                                 │
         ▼                                 ▼
┌─────────────────┐              ┌─────────────────┐
│  系统nfs-server  │              │  Hadoop nfs3    │
│   (端口2049)     │              │   (端口2049)    │
└────────┬────────┘              └────────┬────────┘
         │                                 │
         ▼                                 ▼
┌─────────────────┐              ┌─────────────────┐
│   本地文件系统    │              │     HDFS        │
│   (ext4/xfs)    │              │   (分布式存储)   │
└─────────────────┘              └─────────────────┘
```

|                                                                                                                                           | 传统NFS                    | Hadoop NFS                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------- |
| **rpcbind / portmap - "电话总机"**<br />RPC（远程过程调用）端口映射服务<br />监听在**端口111**（TCP/UDP），维护一个"服务名 → 端口号"的映射表，户端查询"nfs服务在哪个端口？"，rpcbind回答"在2049端口" | 使用系统自带的`rpcbind`         | 使用Hadoop自带的`portmap`（功能相同，但专为Hadoop优化） |
| nfs-server / nfs3 - "文件服务前台<br />实际的NFS文件服务<br />监听在**端口2049**（TCP/UDP）处理客户端的文件操作请求（读、写、创建、删除等）实现NFSv3协议规范                                | `nfs-server`→ 访问本地磁盘文件系统 | `nfs3`→ 访问HDFS分布式文件系统                  |
| 存储后端                                                                                                                                      | 本地文件系统（ext4, xfs）        | HDFS分布式文件系统                            |
| 数据位置                                                                                                                                      | 单机磁盘                     | 多节点分布式存储                               |
| 元数据管理                                                                                                                                     | 本地inode                  | NameNode管理                             |
| 数据块管理                                                                                                                                     | 本地块设备                    | DataNode管理                             |

NFS协议 - "沟通语言"

- 无状态协议（简化了错误恢复）

- 支持大文件（64位文件大小）

- 异步写入（提高性能）支持TCP传输（更可靠）

| 传统NFS                                                                                                                                                                                                                                                                                                           | Hadoop NFS                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. 客户端执行：mount -t nfs server:/share /mnt<br/>2. 客户端查询server:111（rpcbind）→ "mountd在哪个端口？"<br/>3. rpcbind回复：mountd在端口4242<br/>4. 客户端连接server:4242（mountd）→ 请求挂载/share<br/>5. mountd验证权限，返回文件句柄<br/>6. 客户端查询server:111（rpcbind）→ "nfs在哪个端口？"<br/>7. rpcbind回复：nfs在端口2049<br/>8. 客户端连接server:2049（nfs-server）进行文件操作 | 1. 客户端执行：mount -t nfs hadoop-gateway:/hdfs /mnt<br/>2. 客户端查询hadoop-gateway:111（Hadoop portmap）→ "mountd在哪个端口？"<br/>3. Hadoop portmap回复：mountd在端口4242<br/>4. 客户端连接hadoop-gateway:4242（Hadoop mountd）→ 请求挂载/hdfs<br/>5. Hadoop mountd验证权限，返回HDFS文件句柄<br/>6. 客户端查询hadoop-gateway:111（Hadoop portmap）→ "nfs在哪个端口？"<br/>7. Hadoop portmap回复：nfs在端口2049<br/>8. 客户端连接hadoop-gateway:2049（Hadoop nfs3）进行文件操作<br/>9. Hadoop nfs3将NFS操作转换为HDFS API调用 |

**为什么Hadoop要自己实现？**

1. **架构差异**

**步骤1：停止系统自带的NFS服务（避免端口冲突）**

使用root用户在计划运行NFS网关的机器上执行，关掉系统自带的NFS，卸载rpcbind，替换为hadoop中的NFS和portmap

```bash
systemctl stop nfs
systemctl disable nfs
# 或者使用
sudo systemctl stop nfs
sudo systemctl disable nfs  # 或 nfs，取决于发行版
```

卸载系统自带的rpcbind

```bash
yum remove -y rpcbind
```

启动portmap(HDFS自带的rpcbind，root用户执行)

```bash
hdfs --daemon start portmap
```

启动nfs3服务（hadoop用户执行）

```bash
hdfs --daemon start nfs3
```

#### 3.2.6 验证NFS网关服务

切换到node2：检查RPC服务是否注册成功，应看到portmapper（100000）、mountd（100005）、nfs（100003）服务

```bash
[root@node2 ~]# rpcinfo -p node1
   program vers proto   port  service
    100005    3   udp   4242  mountd
    100005    1   tcp   4242  mountd
    100000    2   udp    111  portmapper
    100000    2   tcp    111  portmapper
    100005    3   tcp   4242  mountd
    100005    2   tcp   4242  mountd
    100003    3   tcp   2049  nfs
    100005    2   udp   4242  mountd
    100005    1   udp   4242  mountd
```

允许192.168.88.1连接到node1

```bash
[root@node2 ~]# showmount -e node1
Export list for node1:
/ 192.168.88.1
```

#### 3.2.7 Windows挂载HDFS文件系统

这里以你的**Windows宿主机（IP: 192.168.88.1）** 挂载到**Linux虚拟机（IP: 192.168.88.101，运行NFS网关）** 为例。

**步骤1：在Windows上启用NFS客户端功能**

1. 打开“控制面板” → “程序” → “启用或关闭Windows功能”。
2. 勾选 **“NFS客户端”** 和 **“用于NFS的Telnet客户端”**（可选），点击确定并重启。

**步骤2：在Windows命令提示符（管理员）中挂载**

```bash
net use X: \\192.168.88.101\!
```

```cmd
# 语法：mount -o 选项 NFS服务器IP:导出路径 本地盘符
# 注意：Windows NFS客户端默认使用NFSv3，但参数语法与Linux不同
mount -o anon \\192.168.88.101\ /hdfs Z:
```

**参数解释**：

- \\192.168.88.101\`：NFS网关服务器的IP，后面跟的是HDFS的导出路径（根目录`/`）。在Windows中，路径用反斜杠和共享名表示。
- `Z:`：希望映射的本地驱动器号。
- `-o anon`：以匿名身份挂载。因为我们在`core-site.xml`中配置了代理用户`hadoop`，NFS网关会以该用户身份执行操作。

**步骤3：验证挂载**

打开计算机，可以看到 NFS服务器 以磁盘的形式显示

##  四、HDFS的存储原理

文件在存储到HDFS的集群前会被拆分为Block块，HDFS的最小储存单位(每个256M,可改)。并通过副本冗余防止数据丢失

<img src="C:\Users\Eleanora\AppData\Roaming\Typora\typora-user-images\image-20260325221246751.png" alt="image-20260325221246751" style="zoom:40%;" />

### 4.1 fsck命令 File System Check

#### 4.1.1 配置HDFS数据块的副本数量

| 功能                | 位置                              | 代码                                                                             |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| 修改副本数             | 每个集群中`hdfs-site.xml`中配置         | <property>    <name>dfs.replication</name><br/>    <value>3</value></property> |
| 上传文件时临时决定副本数量     | 上传命令的中间添加`-D dfs.replication=2` | `hdfs dfs -D dfs.replication=2 -put test.txt /tmp/`                            |
| 已存在的HDFS文件，修改副本数量 | 指定path的内容会被修改为2个副本存储            | `hdfs dfs -setrep [-R] 2 path`<br/>-R表示对子目录的文件同样生效                             |

#### 4.1.2 fsck命令查看文件副本数

```bash
hdfs fsck 文件路径 [-files [-blocks [-locations]]]
```

`-files` 列出路径内的文件状态

`-files -blocks` 输出文件块报告（有几个块，多少副本）

`-files -blocks -location` 输出每个block的详情

举例，查看某文件的状态+blocks+blocks详情：

```bash
[hadoop@node1 ~]$ hdfs fsck new.txt -files -blocks -locations
```

输出

```text
Connecting to namenode via http://node1:9870/fsck?ugi=hadoop&files=1&blocks=1&locations=1&path=%2Fuser%2Fhadoop%2Fnew.txt
FSCK started by hadoop (auth:SIMPLE) from /192.168.88.101 for path /user/hadoop/new.txt at Mon Mar 30 21:19:48 CST 2026

/user/hadoop/new.txt 42 bytes, replicated: replication=3, 1 block(s):  OK
0. BP-397460804-192.168.88.101-1774236967721:blk_1073741826_1003 len=42 Live_repl=3  [DatanodeInfoWithStorage[192.168.88.103:9866,DS-1045212b-874e-4331-84bf-4fcff0a31ddc,DISK], DatanodeInfoWithStorage[192.168.88.102:9866,DS-fdb19663-a199-4777-986a-75a2e43d1231,DISK], DatanodeInfoWithStorage[192.168.88.101:9866,DS-37aaf5d8-3886-47ac-bd88-998ae2deef58,DISK]]


Status: HEALTHY
 Number of data-nodes:	3
 Number of racks:		1
 Total dirs:			0
 Total symlinks:		0

Replicated Blocks:
 Total size:	42 B
 Total files:	1
 Total blocks (validated):	1 (avg. block size 42 B)
 Minimally replicated blocks:	1 (100.0 %)
 Over-replicated blocks:	0 (0.0 %)
 Under-replicated blocks:	0 (0.0 %)
 Mis-replicated blocks:		0 (0.0 %)
 Default replication factor:	3
 Average block replication:	3.0
 Missing blocks:		0
 Corrupt blocks:		0
 Missing replicas:		0 (0.0 %)
 Blocks queued for replication:	0

Erasure Coded Block Groups:
 Total size:	0 B
 Total files:	0
 Total block groups (validated):	0
 Minimally erasure-coded block groups:	0
 Over-erasure-coded block groups:	0
 Under-erasure-coded block groups:	0
 Unsatisfactory placement block groups:	0
 Average block group size:	0.0
 Missing block groups:		0
 Corrupt block groups:		0
 Missing internal blocks:	0
 Blocks queued for replication:	0
FSCK ended at Mon Mar 30 21:19:48 CST 2026 in 3 milliseconds


The filesystem under path '/user/hadoop/new.txt' is HEALTHY

```

验证了文件有多个副本、文件被分成多个块存储，每个块256M

默认每个块256M，但也可以在`hdfs-site.xml`中配置

```xml
<property>
    <name>dfs.blocksize</name>
    <value>268435456</value>
    <descriptino>设置HDFS块大小，单位b</descriptino>
</property>
```

### 4.2 NameNode元数据

hdfs中文件很多，每个文件又被分为了很多个块，当想要查询一个文件时应该找？
NameNode基于edits**（NameNode记录）**和FSImage的配合，完成整个文件系统的管理

- 每次对HDFS的操作，均被edits文件记录。NameNode 会定期（默认1小时）或当 edits 文件达到一定大小（默认64MB）时，触发 **SecondaryNameNode**执行 **检查点操作**。
- 该操作会将**上一个检查点之后的 edits 日志**与**上一个检查点的 FSImage** 合并，生成一个**全新的、更完整的 FSImage**
- 这个新生成的 FSImage 会被保存到磁盘，**它并不会覆盖旧的 FSImage**，而是作为一个新的版本存在

**“最终状态”的载体**：**最新的“文件系统最终状态”实际上是由“最新的那个 FSImage + 它之后的所有 edits 日志”共同定义的。** NameNode 启动时，正是将这两者结合，在内存中生成唯一的最新元数据镜像。

其中hdfs的数据目录current路径记录在

```bash
vim /export/server/hadoop/etc/hadoop/hdfs-site.xml
```

的
```xml
<property>
        <name>dfs.namenode.name.dir</name>
        <value>/data/nn</value>
    </property>

```

进入数据目录current路径后，即可看到edits和FSImage

```bash
[root@node1 nn]# cd /data/nn/current
[root@node1 current]# ls -nl
total 5244
# 省略 。。。。
-rw-rw-r-- 1 1001 1001     664 Mar 30 21:47 edits_0000000000000000114-0000000000000000123
-rw-rw-r-- 1 1001 1001 1048576 Mar 30 21:47 edits_inprogress_0000000000000000124
-rw-rw-r-- 1 1001 1001     690 Mar 30 08:12 fsimage_0000000000000000113
-rw-rw-r-- 1 1001 1001      62 Mar 30 08:12 fsimage_0000000000000000113.md5
-rw-rw-r-- 1 1001 1001     760 Mar 30 21:47 fsimage_0000000000000000123
-rw-rw-r-- 1 1001 1001      62 Mar 30 21:47 fsimage_0000000000000000123.md5
-rw-rw-r-- 1 1001 1001       4 Mar 30 21:47 seen_txid
-rw-rw-r-- 1 1001 1001     217 Mar 27 21:00 VERSION

```

### 4.3 SecondaryNamenode 负责元数据合并

元数据的合并通过 检查时间，条件符合来控制

- 检查是否达到条件：`dfs.namenode.checkpoint.check.period` 默认60s

- 以下任意一个条件满足则发生

  - `dfs.namenode.checkpoint.period`，默认3600s(1h)

  - `dfs.namenode.checkpoint.txns`，默认100w次事务

### 4.4 HDFS数据读写流

![image-20260331074609575](./assets/image-20260331074609575.png)



![image-20260331074807481](./assets/image-20260331074807481.png)

无论读写，namenode都不经手数据，均由客户端和datanode直接通讯，否则namenode压力太大。

网络距离：

同一台机器->同一个局域网（交换机）->跨越交换机->跨越交数据中心

HDFS内置网络距离算法，通过IP地址和路由表来推断网络距离
