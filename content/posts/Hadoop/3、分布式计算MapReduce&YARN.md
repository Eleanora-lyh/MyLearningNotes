## 3.1、分布式概述

分布式数据计算分为两种

- 分散->汇总模式 Spark、Flink

  ![image-20260331081253206](./assets/image-20260331081253206.png)

- 中心调度->步骤执行模式 MapReduce

  ![image-20260331081554547](./assets/image-20260331081554547.png)

### MapReduce

MapReduce是Hadoop的分布式计算组件（分散->汇总模式），包含两个变成接口

- Map提供分散功能，由服务器分布式对数据进行处理
- Reduce提供汇总功能，将分布式的处理结果汇总

### YARN

YARN是Hadoop内提供的分布式资源调度组件，（资源包括：CPU、内存、硬盘、网络）

服务器会运行多个程序，每个程序对资源（CPU内存等）的使用都不同，程序有多少用多少，没有节制，调度就非常重要了

**架构**

![image-20260331222823761](./assets/image-20260331222823761.png)

YARN中的核心角色

- ResourceManager：整个集群的资源调度者，负责协调各个程序所需资源
- NodeManager：单个服务器的资源调度者，负责调度单个服务器上的资源给应用程序使用

YARN中的辅助角色（运行更稳定）

- 代理服务器 ProxyServer：Web Application Proxy Web应用程序代理

  减少通过YARN进行基于网络的攻击可能性：警告用户正在访问一个不受信任的站点、剥离用户访问的Cookie等

- 历史服务器 JobHistoryServer：应用程序历史信息记录服务

  程序运行时是在各自的map容器中，对应的日志也产生在那里，当想看某个map的日志需要登录对应的服务器+命令行查看。使用JobHistoryServer就可以将日志统一到HDFS中，在页面中查看

## 3.2、YARN部署

### MapReduce配置文件

1. 核心配置文件,**hadoop-env.sh** - Java环境配置

```bash
cd /export/server/hadoop-3.4.2/etc/hadoop/
vim mapred-env.sh
```

打开后输入

```bash
# 设置JDK路径
export JAVA_HOME=/export/server/jdk
# 设置 JobHistoryServer进程为1G
export HADOOP_JOB_HISTORYSERVER_HEAPSIZE=1024
# 设置日志级别为INFO
export HADOOP_MAPRED_ROOT_LOGGER=INFO,RFA
```

2. **mapred-site.xml** - MapReduce配置（关键！）

```bash
vim mapred-site.xml
```

打开后输入

```bash
<configuration>
    <property>
        <name>mapreduce.framework.name</name>
        <value>yarn</value>
        <description>指定MapReduce的运行框架为YARN</description>
    </property>
    
    <property>
        <name>mapreduce.jobhistory.address</name>
        <value>node1:10020</value>
        <description>MapReduce历史服务器地址</description>
    </property>

    <property>
        <name>mapreduce.jobhistory.webapp.address</name>
        <value>node1:19888</value>
        <description>MapReduce历史服务器Web UI地址</description>
    </property>
    
    <property>
        <name>mapreduce.jobhistory.intermediate-done-dir</name>
        <value>/data/mr-history/tmp</value>
        <description>历史信息在HDFS的记录临时路径</description>
    </property>
    
    <property>
        <name>mapreduce.jobhistory.done-dir</name>
        <value>/data/mr-history/done</value>
        <description>历史信息在HDFS的记录路径</description>
    </property>
    
    <property>
        <name>yarn.app.mapreduce.am.env</name>
        <value>HADOOP_MAPRED_HOME=$HADOOP_HOME</value>
        <description>MapReduce HOME设置为HADOOP_HOME,作用对象Application Master</description>
    </property>
    <property>
        <name>mapreduce.map.env</name>
        <value>HADOOP_MAPRED_HOME=$HADOOP_HOME</value>
        <description>MapReduce HOME设置为HADOOP_HOME,作用对象Map任务容器</description>
    </property>
    
    <property>
        <name>mapreduce.reduce.env</name>
        <value>HADOOP_MAPRED_HOME=$HADOOP_HOME</value>
        <description>MapReduce HOME设置为HADOOP_HOME,作用对象Reduce任务容器</description>
    </property>
</configuration>
```

3. 在 $HADOOP_HOME/etc/hadoop 文件夹内，修改

yarn-env.sh文件，添加4行环境变量内容

```bash
vim yarn-env.sh
```

```bash
# 设置JDK的环境变量
export JAVA_HOME=/export/server/jdk
# 设置HADOOP_HOME的环境变量
export HADOOP_HOME=/export/server/hadoop
# 设置配置文件路径的环境变量
export HADOOP_CONF_DIR=$HADOOP_HOME/etc/hadoop
# 设置日志文件路径的环境变量
export JAVA_LOG_DIR=$HADOOP_HOME/logs
```

4. yarn-site.xml - YARN资源配置

```bash
vim yarn-site.xml
```

```xml
<configuration>
    <property>
        <name>yarn.resourcemanager.hostname</name>
        <value>node1</value>
        <description>ResourceManager设置在node1节点</description>
    </property>
    
    <property>
        <name>yarn.nodemanager.local-dirs</name>
        <value>/data/nm-local</value>
        <description>NodeManager中间数据本地存储路径</description>
    </property>
    
    <property>
        <name>yarn.nodemanager.log-dirs</name>
        <value>/data/nm-log</value>
        <description>NodeManager数据日志本地存储路径</description>
    </property>
    
    <property>
        <name>yarn.nodemanager.aux-services</name>
        <value>mapreduce_shuffle</value>
        <description>NodeManager上运行的附属服务：开启Shuffle</description>
    </property>
    
    <property>
        <name>yarn.log.server.url</name>
        <value>http://node1:19888/jobhistory/logs</value>
        <description>历史服务器URL</description>
    </property>
    
    <property>
        <name>yarn.web-proxy.address</name>
        <value>node1:8089</value>
        <description>代理服务器主机和端口</description>
    </property>
    
    <property>
        <name>yarn.log-aggregation-enable</name>
        <value>true</value>
        <description>开启日志聚合</description>
    </property>
    
    <property>
        <name>yarn.nodemanagrer.remote-app-log-dir</name>
        <value>/tmp/logs</value>
        <description>程序日志和HDFS的存储路径</description>
    </property>
    
    <property>
        <name>yarn.resourcemanager.scheduler.class</name>
        <value>org.apache.hadoop.yarn.server.resourcemanager.scheduler.fair.FairScheduler</value>
        <description>选择公平调度器</description>
    </property>
</configuration>
```

5. 分发配置文件

```bash
scp mapred-env.sh mapred-site.xml yarn-env.sh yarn-site.xml node2:`pwd`/
scp mapred-env.sh mapred-site.xml yarn-env.sh yarn-site.xml node3:`pwd`/
```

### 启动YARN

|               | 启动                                                         | 关闭                                                         |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 逐个启停yarn  | $HADOOP_HOME/bin/yarn --daemon start resourcemanager\|nodemanager\|proxyserver | $HADOOP_HOME/bin/yarn --daemon stop resourcemanager\|nodemanager\|proxyserver |
| 一键启停yarn  | $HADOOP_HOME/sbin/start-yarn.sh                              | $HADOOP_HOME/sbin/stop-yarn.sh                               |
| historyserver | $HADOOP_HOME/bin/mapred --daemon start historyserver         | $HADOOP_HOME/bin/mapred --daemon stop historyserver          |

YARN的WEB UI：查看YARN集群的监控页面（ResourceManager的WEB UI）http://node1:8088

HDFS的WEB UI：http://node1:9870



```bash
$HADOOP_HOME/sbin/start-yarn.sh
```

- 从yarn-site.xml中读取配置，确定ResourceManager所在机器，并启动它

- 读取workers文件，确定机器，启动全部的NodeManager

- 当前机器启动ProxySercer（代理服务器）

## 3.3、提交MapReduce任务到YARN

Hive底层用的MapReduce,目前很少写MapReduce的程序代码

YARN作为资源调度管控框架，提供资源给很多程序运行

- MapReduce
- Spark
- Flink

Hadoop中内置了一些预置的MapReduce程序代码，无需编程，通过命令即可使用。示例程序代码记录在(Hadoop编译之后的jar包)`$HADOOP_HOME/share/hadoop/mapreduce/hadoop-mapreduce-examples-3.4.2.jar`

- wordcount：单词计数（统计指定文件内各个单词出现的次数）
- pi：求圆周率（通过蒙特卡罗算法，统计模拟法）

语法：`Hadoop jar 程序文件 java类名 [程序参数] ... [程序参数]`

### 3.3.1、wordcount示例

```bash
hadoop jar $HADOOP_HOME/share/hadoop/mapreduce/hadoop-mapreduce-examples-3.4.2.jar wordcount hdfs://node1:8020/input hdfs://node1:8020/output/wc
```

输出：

```bash
2026-04-06 12:10:27,044 INFO client.DefaultNoHARMFailoverProxyProvider: Connecting to ResourceManager at node1/192.168.88.101:8032
2026-04-06 12:10:27,351 INFO mapreduce.JobResourceUploader: Disabling Erasure Coding for path: /tmp/hadoop-yarn/staging/hadoop/.staging/job_1775445823073_0001
2026-04-06 12:10:27,816 INFO input.FileInputFormat: Total input files to process : 1
2026-04-06 12:10:27,874 INFO mapreduce.JobSubmitter: number of splits:1
2026-04-06 12:10:27,954 INFO mapreduce.JobSubmitter: Submitting tokens for job: job_1775445823073_0001
2026-04-06 12:10:27,954 INFO mapreduce.JobSubmitter: Executing with tokens: []
2026-04-06 12:10:28,039 INFO conf.Configuration: resource-types.xml not found
2026-04-06 12:10:28,040 INFO resource.ResourceUtils: Unable to find 'resource-types.xml'.
2026-04-06 12:10:28,406 INFO impl.YarnClientImpl: Submitted application application_1775445823073_0001
2026-04-06 12:10:28,425 INFO mapreduce.Job: The url to track the job: http://node1:8089/proxy/application_1775445823073_0001/
2026-04-06 12:10:28,425 INFO mapreduce.Job: Running job: job_1775445823073_0001
2026-04-06 12:10:34,503 INFO mapreduce.Job: Job job_1775445823073_0001 running in uber mode : false
2026-04-06 12:10:34,503 INFO mapreduce.Job:  map 0% reduce 0%
2026-04-06 12:10:40,556 INFO mapreduce.Job:  map 100% reduce 0%
2026-04-06 12:10:45,636 INFO mapreduce.Job:  map 100% reduce 100%
2026-04-06 12:10:45,645 INFO mapreduce.Job: Job job_1775445823073_0001 completed successfully
2026-04-06 12:10:45,699 INFO mapreduce.Job: Counters: 54
	File System Counters
		FILE: Number of bytes read=136
		FILE: Number of bytes written=621481
		FILE: Number of read operations=0
		FILE: Number of large read operations=0
		FILE: Number of write operations=0
		HDFS: Number of bytes read=152
		HDFS: Number of bytes written=82
		HDFS: Number of read operations=8
		HDFS: Number of large read operations=0
		HDFS: Number of write operations=2
		HDFS: Number of bytes read erasure-coded=0
	Job Counters 
		Launched map tasks=1
		Launched reduce tasks=1
		Data-local map tasks=1
		Total time spent by all maps in occupied slots (ms)=3217
		Total time spent by all reduces in occupied slots (ms)=2836
		Total time spent by all map tasks (ms)=3217
		Total time spent by all reduce tasks (ms)=2836
		Total vcore-milliseconds taken by all map tasks=3217
		Total vcore-milliseconds taken by all reduce tasks=2836
		Total megabyte-milliseconds taken by all map tasks=3294208
		Total megabyte-milliseconds taken by all reduce tasks=2904064
	Map-Reduce Framework
		Map input records=2
		Map output records=12
		Map output bytes=106
		Map output materialized bytes=136
		Input split bytes=94
		Combine input records=12
		Combine output records=12
		Reduce input groups=12
		Reduce shuffle bytes=136
		Reduce input records=12
		Reduce output records=12
		Spilled Records=24
		Shuffled Maps =1
		Failed Shuffles=0
		Merged Map outputs=1
		GC time elapsed (ms)=178
		CPU time spent (ms)=1100
		Physical memory (bytes) snapshot=342614016
		Virtual memory (bytes) snapshot=5439385600
		Total committed heap usage (bytes)=165810176
		Peak Map Physical memory (bytes)=221446144
		Peak Map Virtual memory (bytes)=2715934720
		Peak Reduce Physical memory (bytes)=121167872
		Peak Reduce Virtual memory (bytes)=2723450880
	Shuffle Errors
		BAD_ID=0
		CONNECTION=0
		IO_ERROR=0
		WRONG_LENGTH=0
		WRONG_MAP=0
		WRONG_REDUCE=0
	File Input Format Counters 
		Bytes Read=58
	File Output Format Counters 
		Bytes Written=82
```

程序运行结束会在目标文件夹中生成两个文件，一个标识运行是否成功，一个为统计结果

```bash
[hadoop@node1 ~]$ hdfs dfs -ls /output/wc/
Found 2 items
-rw-r--r--   3 hadoop supergroup          0 2026-04-06 12:10 /output/wc/_SUCCESS
-rw-r--r--   3 hadoop supergroup         82 2026-04-06 12:10 /output/wc/part-r-00000
```

```bash
[hadoop@node1 ~]$ hdfs dfs -cat /output/wc/part-r-00000
a	1
count	1
guess	1
here	1
how	1
is	1
many	1
test	1
text.	1
this	1
word	1
words	1

```

同时在http://node1:8088/的application中可以看到资源运行的过程，下图为log日志内容

![image-20260408202706725](./assets/image-20260408202706725.png)

### 3.3.1、pi示例

```bash
hadoop jar $HADOOP_HOME/share/hadoop/mapreduce/hadoop-mapreduce-examples-3.4.2.jar pi 3 1000
```

3表示3个map任务，1000表示模拟求的样本数（越大，越准，耗时越长）
输出：

```bash
[hadoop@node1 ~]$ hadoop jar $HADOOP_HOME/share/hadoop/mapreduce/hadoop-mapreduce-examples-3.4.2.jar pi 3 1000
Number of Maps  = 3
Samples per Map = 1000
Wrote input for Map #0
Wrote input for Map #1
Wrote input for Map #2
Starting Job
2026-04-08 22:25:26,997 INFO client.DefaultNoHARMFailoverProxyProvider: Connecting to ResourceManager at node1/192.168.88.101:8032
2026-04-08 22:25:27,205 INFO mapreduce.JobResourceUploader: Disabling Erasure Coding for path: /tmp/hadoop-yarn/staging/hadoop/.staging/job_1775445823073_0003
2026-04-08 22:25:27,285 INFO input.FileInputFormat: Total input files to process : 3
2026-04-08 22:25:27,326 INFO mapreduce.JobSubmitter: number of splits:3
2026-04-08 22:25:27,411 INFO mapreduce.JobSubmitter: Submitting tokens for job: job_1775445823073_0003
2026-04-08 22:25:27,411 INFO mapreduce.JobSubmitter: Executing with tokens: []
2026-04-08 22:25:27,495 INFO conf.Configuration: resource-types.xml not found
2026-04-08 22:25:27,495 INFO resource.ResourceUtils: Unable to find 'resource-types.xml'.
2026-04-08 22:25:27,552 INFO impl.YarnClientImpl: Submitted application application_1775445823073_0003
2026-04-08 22:25:27,568 INFO mapreduce.Job: The url to track the job: http://node1:8089/proxy/application_1775445823073_0003/
2026-04-08 22:25:27,568 INFO mapreduce.Job: Running job: job_1775445823073_0003
2026-04-08 22:25:32,633 INFO mapreduce.Job: Job job_1775445823073_0003 running in uber mode : false
2026-04-08 22:25:32,633 INFO mapreduce.Job:  map 0% reduce 0%
2026-04-08 22:25:36,680 INFO mapreduce.Job:  map 33% reduce 0%
2026-04-08 22:25:37,687 INFO mapreduce.Job:  map 100% reduce 0%
2026-04-08 22:25:41,709 INFO mapreduce.Job:  map 100% reduce 100%
2026-04-08 22:25:41,718 INFO mapreduce.Job: Job job_1775445823073_0003 completed successfully
2026-04-08 22:25:41,778 INFO mapreduce.Job: Counters: 54
	File System Counters
		FILE: Number of bytes read=72
		FILE: Number of bytes written=1244037
		FILE: Number of read operations=0
		FILE: Number of large read operations=0
		FILE: Number of write operations=0
		HDFS: Number of bytes read=783
		HDFS: Number of bytes written=215
		HDFS: Number of read operations=17
		HDFS: Number of large read operations=0
		HDFS: Number of write operations=3
		HDFS: Number of bytes read erasure-coded=0
	Job Counters 
		Launched map tasks=3
		Launched reduce tasks=1
		Data-local map tasks=3
		Total time spent by all maps in occupied slots (ms)=7594
		Total time spent by all reduces in occupied slots (ms)=1977
		Total time spent by all map tasks (ms)=7594
		Total time spent by all reduce tasks (ms)=1977
		Total vcore-milliseconds taken by all map tasks=7594
		Total vcore-milliseconds taken by all reduce tasks=1977
		Total megabyte-milliseconds taken by all map tasks=7776256
		Total megabyte-milliseconds taken by all reduce tasks=2024448
	Map-Reduce Framework
		Map input records=3
		Map output records=6
		Map output bytes=54
		Map output materialized bytes=84
		Input split bytes=429
		Combine input records=0
		Combine output records=0
		Reduce input groups=2
		Reduce shuffle bytes=84
		Reduce input records=6
		Reduce output records=0
		Spilled Records=12
		Shuffled Maps =3
		Failed Shuffles=0
		Merged Map outputs=3
		GC time elapsed (ms)=207
		CPU time spent (ms)=2110
		Physical memory (bytes) snapshot=840318976
		Virtual memory (bytes) snapshot=10928119808
		Total committed heap usage (bytes)=548610048
		Peak Map Physical memory (bytes)=279293952
		Peak Map Virtual memory (bytes)=2772090880
		Peak Reduce Physical memory (bytes)=123793408
		Peak Reduce Virtual memory (bytes)=2724159488
	Shuffle Errors
		BAD_ID=0
		CONNECTION=0
		IO_ERROR=0
		WRONG_LENGTH=0
		WRONG_MAP=0
		WRONG_REDUCE=0
	File Input Format Counters 
		Bytes Read=354
	File Output Format Counters 
		Bytes Written=97
Job Finished in 14.825 seconds
Estimated value of Pi is 3.14133333333333333333
```

