# 1、RDD基础

Spark 中的 RDD 就是一个不可变的分布式对象集合。每个 RDD 都被分为多个分区，这些分区运行在集群中的不同节点上。（所以RDD称之为Spark中最底层的核心数据抽象）

| 字母    | 英文                | 含义                                                                  |
| ----- | ----------------- | ------------------------------------------------------------------- |
| **R** | Resilient（弹性的）    | 容错能力强。某个分区的数据丢失后，Spark 可以根据血缘（Lineage）记录的转换步骤重新计算出该分区，不需要为每份数据都做副本。 |
| **D** | Distributed（分布式的） | 数据被切成多个分区（Partition），分散在集群不同节点的内存或磁盘上，由多个 Executor 并行处理。            |
| **D** | Dataset（数据集）      | 一组数据的集合。它是**只读、不可变**的，要改动只能通过转换（Transformation）生成新的 RDD。            |

简而言之：RDD 是一个**被切成多份、分布在多台机器上、不可变、丢了能按"计算食谱"重新算出来**的数据集合。

它只知道"有一堆数据"（RDD 可以包含 Python、Java、Scala 中任意类型的对象，甚至可以包含用户自定义的对象），不理解数据的结构，所以 Spark 没法对它做深度优化。后来的 `DataFrame`、`Dataset` 都是在它之上加了 `Schema` 等语义。

# 2、创建RDD

park 创建 RDD 的数据源头主要有两种：**读取外部数据集**，以及**在 Driver 程序中并行化一个本地集合**（更常用）。

> 此外，RDD 也可由已有的 RDD 或 `DataFrame/Dataset` 转换得到。现代 Spark 应用通常通过 `SparkSession` 进入，并优先使用 `DataFrame/Dataset API`，只在需要底层控制时才使用 RDD。

## 2.1 在 Driver 程序中并行化一个本地集合

把 Driver 进程内存里已经存在的本地集合（Python list、Scala Seq 等）切分成多个分区，分发到集群上，变成 RDD。

```scala
val sc = spark.sparkContext
sc.setLogLevel("WARN")
val rdd = sc.parallelize(Seq(1, 2, 3, 4, 5, 6), numSlices = 3)   // numSlices 指定分区数
println("NumPartitions: " + rdd.getNumPartitions)
println("NumDetails: " + rdd.glom().collect().map(_.toList).toList)   
//(NumPartitions: ,3)
//(NumDetails: ,List(List(1, 2), List(3, 4), List(5, 6)))
```

完整代码详见：[项目Demo](https://github.com/Eleanora-lyh/BigDataDemoProjects/blob/main/Spark/ScalaApplicaton/spark-line-count/src/main/scala/com/example/SparkBasicsApp.scala)

```scala
package com.example

import org.apache.spark.sql.{ SparkSession}

object SparkBasicsApp {

  def main(args: Array[String]): Unit = {
    val spark = SparkSession.builder()
      .appName("Scala Spark Playground")
      .master("local[2]")
      .config("spark.ui.enabled", "false")
      .config("spark.sql.shuffle.partitions", "2")
      .getOrCreate()

    val sc = spark.sparkContext
    sc.setLogLevel("WARN")
    try {
        
        val rdd = sc.parallelize(Seq(1, 2, 3, 4, 5, 6), numSlices = 3)   // numSlices 指定分区数
        println("NumPartitions: " + rdd.getNumPartitions)  // 3
        println("NumDetails: " + rdd.glom().collect().map(_.toList).toList)     // [[1, 2], [3, 4], [5, 6]]，可看到每个分区的内容
    } finally {
      spark.stop()
    }
  }
```

输出

```
NumPartitions: 3
NumDetails: List(List(1, 2), List(3, 4), List(5, 6))
```

## 2.2 读取外部数据集

由 Executor 直接从外部存储（HDFS、ADLS/Blob、S3、本地文件系统等）读取数据，Driver 不经手数据本身。

```scala
val sc = spark.sparkContext
sc.setLogLevel("WARN")
val rdd_lines = sc.textFile("data/input.txt")
```

在第 5 章详细介绍

# 3、RDD操作

RDD 支持两种操作：转化操作和行动操作。

- 转化操作：是惰性的，会基于已有 RDD **生成新的 RDD 并记录血缘**，遇到 Action 才提交 Job，比如 `map()` 和 `filter()`。

- 行动操作：**会触发实际计算（触发 Job 提交）**，把结果返回给 Driver 或写入外部存储，比如 `count(), first(), foreach` 。

多数情况下可以通过**返回值类型区分二者**（转化返回 RDD，行动返回其他类型或无返回值），但 cache()、getNumPartitions() 等方法是例外。

举例：

1. 读取输入文件作为初始RDD： `rdd_lines`

2. 执行转化操作：将`rdd_lines`中包含Spark关键字的转为`spark_rdd `

3. 执行行动操作：输出`spark_rdd.foreach(println)`

代码详见：[项目Demo](https://github.com/Eleanora-lyh/BigDataDemoProjects/blob/main/Spark/ScalaApplicaton/spark-line-count/src/main/scala/com/example/SparkBasicsApp.scala)

```scala
package com.example

import org.apache.spark.sql.{ SparkSession}

object SparkBasicsApp {

  def main(args: Array[String]): Unit = {
    val spark = SparkSession.builder()
      .appName("Scala Spark Playground")
      .master("local[2]")
      .config("spark.ui.enabled", "false")
      .config("spark.sql.shuffle.partitions", "2")
      .getOrCreate()

    val sc = spark.sparkContext
    sc.setLogLevel("WARN")
    try {
        
        // val rdd = sc.parallelize(Seq(1, 2, 3, 4, 5, 6), numSlices = 3)   // numSlices 指定分区数
        // println("NumPartitions: " + rdd.getNumPartitions)  // 3
        // println("NumDetails: " + rdd.glom().collect().map(_.toList).toList)     // [[1, 2], [3, 4], [5, 6]]，可看到每个分区的内容
    
        val rdd_lines = sc.textFile("data/input.txt")
        val spark_rdd = rdd_lines.filter(line => line.contains("Spark"))
        spark_rdd.foreach(println)
    } finally {
      spark.stop()
    }
  }
}
```

最后会输出

```plain text
[info] Input had 3 lines containing 'Spark'. They are:
[info] Spark
[info] PySpark
[info] Spark SQL
[success] Total time: 47 s, completed 2026-10-20 17:46:52
```

需要注意的是，每当我们调用一个新的行动操作时，整个 RDD 都会从头开始计算。要避免这种低效的行为，用户可以将中间结果持久化，这会在 6 节中介绍。

## 发散思维——和.NET的LINQ联动（不感兴趣的可忽略）

我看到RDD的两种操作后，突然想到这个惰性求值的思想和.NET的LINQ很类似（都是把一些操作合并到一起来减少计算数据），所以列出来给感兴趣的同学看一下。

.NET后端中针对集合可以使用lambda表达式将对集合的操作记录下来（懒加载），只有在真正使用到数据时如`Count()`（；类比Spark的行动操作）才会真正取数据。

| LINQ（`IEnumerable<T>`）                         | Spark RDD                                       | 说明                                         |
| ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| `Select` / `Where`                             | `map` / `filter`                                | 只构建处理管道，不取数据                               |
| `ToList()` / `Count()` / `First()` / `foreach` | `collect()` / `count()` / `first()` / `foreach` | 触发真正的计算                                    |
| 不调用上面的方法，lambda 就不会执行                          | 不调用 Action，转化函数就不会执行                            | 都是延迟执行                                     |
| 每次枚举都会重新执行整条管道                                 | 每次 Action 默认重新计算整条血缘                            | Spark 用 `cache()` 避免，LINQ 常用 `ToList()` 物化 |

**但是Spark的集合操作较LINQ不止是"增加了分区"的差别**

- **执行单位不同**：
  - LINQ 是单线程、逐元素拉取（迭代器），一个元素走完整条管道再取下一个。
  - Spark 是每个分区一个 Task，Task 内部也是逐元素流水线，但多个分区在多台机器上并行。
- **lambda 在哪里运行**：
  - LINQ 的 lambda 在当前进程内执行。
  - Spark 的 lambda 会被序列化，连同闭包变量发送到 Executor 上执行，所以闭包里引用的对象必须可序列化，修改外部变量也不会回到 Driver。
- **有 Shuffle 和 Stage**：
  - LINQ 的 `OrderBy`、`GroupBy` 会在内存里缓冲全部数据，这和 Spark 需要跨分区重新分发数据的操作（`groupByKey`、`sortByKey`）有些相似
  - 但 Spark 是通过网络 Shuffle 完成的，并以此划分 Stage。
- **容错**：
  - LINQ 出错整个查询失败。
  - Spark 记录血缘，某个分区的 Task 失败或数据丢失后，只重算这个分区。
- **调度层**：
  - Spark 先把转化链构建成 DAG，行动操作触发时再由 DAGScheduler 切成 Stage 和 Task。
  - LINQ 没有这一层。

**RDD 的转化和行动，相当于"分布式、可容错、带 DAG 调度的 IEnumerable 惰性管道"。惰性求值的思想一致，但 Spark 额外解决了跨机器并行、数据重新分发和失败重算的问题。**

> 最后这句话仔细一读就会发现：这不就是分布式计算(Spark)的优势嘛！

# 4、向Spark传递参数

Spark 的大部分转化操作和一部分行动操作，都需要依赖用户传递的函数来计算。在我们支持的三种主要语言中，向 Spark 传递函数的方式略有区别。

# 5、常见的转化操作/行动操作

# 6、持久化

# 7、总结
