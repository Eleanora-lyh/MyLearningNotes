**整体类比：** 工厂人力资源部

- **ResourceManager** = 人事总监（管全厂资源）
- **NodeManager** = 各车间主任（管自己车间）
- **ApplicationMaster** = 项目经理（管一个具体项目，向总监要资源）
- **Container** = 一个工位（固定CPU+内存）

### 介绍下YARN

YARN（Yet Another Resource Negotiator）是Hadoop的资源管理框架，将资源管理和作业调度分离，支持多计算框架（MapReduce/Spark/Flink）共享集群资源。

### YARN有几个模块

4个核心模块：

- **ResourceManager（RM）**：全局资源管理
- **NodeManager（NM）**：单节点资源管理
- **ApplicationMaster（AM）**：每个应用独立，申请资源+任务调度
- **Container**：资源封装单元（CPU + 内存）

### YARN工作机制

1. Client向RM提交应用
2. RM分配Container，启动AM（项目经理上班）
3. AM评估需要多少资源，向RM申请Container列表
4. RM分配Container，AM通知对应NM启动Container执行任务
5. 任务完成，AM向RM注销，资源释放

### YARN有什么优势，能解决什么问题？

解决Hadoop 1.x的JobTracker单点瓶颈（同时负责资源管理和任务调度）。

YARN优势：

- 职责分离，RM专注资源，AM专注应用
- 支持多框架共享集群（MR/Spark/Flink）
- 更好的扩展性（支持数万节点）

### YARN容错机制

- **RM故障**：ZooKeeper实现RM HA，Standby自动接管
- **NM故障**：RM检测到心跳超时，将该节点任务重新调度
- **AM故障**：RM重新启动AM（默认重试2次）
- **Container/Task故障**：AM检测到，重新申请Container重跑

### YARN高可用

Active RM + Standby RM + ZooKeeper（选主+状态存储）

Active故障时Standby自动切换。

### YARN调度器

同Hadoop调度器：FIFO / CapacityScheduler（默认）/ FairScheduler

### YARN中Container是如何启动的？

1. AM向RM申请到Container（包含Host、资源量）
2. AM直接联系对应NM，发送启动命令（包含命令、环境变量、资源文件）
3. NM在本地启动Container进程，设置CPU/内存限制（cgroups）
4. Container向AM汇报状态

### YARN的改进之处，Hadoop3.x相对于Hadoop 2.x？

- 支持GPU/FPGA资源调度
- Opportunistic Container（低优先级抢占式Container，提高利用率）
- 更好的RM HA
- Timeline Service v2（更好的监控和历史记录）
