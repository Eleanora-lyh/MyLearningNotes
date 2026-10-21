# 1、RDD基础

RDD 是一个**不可变的分布式对象集合**，是Spark中最底层的核心数据抽象。每个 RDD 都被分为多个分区，这些分区运行在集群中的不同节点上。

| 字母    | 英文                | 含义                                                                  |
| ----- | ----------------- | ------------------------------------------------------------------- |
| **R** | Resilient（弹性的）    | 容错能力强。某个分区的数据丢失后，Spark 可以根据血缘（Lineage）记录的转换步骤重新计算出该分区，不需要为每份数据都做副本。 |
| **D** | Distributed（分布式的） | 数据被切成多个分区（Partition），分散在集群不同节点的内存或磁盘上，由多个 Executor 并行处理。            |
| **D** | Dataset（数据集）      | 一组数据的集合。它是**只读、不可变**的，要改动只能通过转换（Transformation）生成新的 RDD。            |

简而言之：RDD 是一个**被切成多份、分布在多台机器上、不可变、丢了能按Lineage重新算出来**的数据集合。

> 它只知道"有一堆数据"（RDD 可以包含 Python、Java、Scala 中任意类型的对象，甚至可以包含用户自定义的对象），不理解数据的结构，所以 Spark 没法对它做深度优化。后来的 `DataFrame`、`Dataset` 都是在它之上加了 `Schema` 等语义。

## 1.1 发散思维——RDD和集合类比

因为作者本身是后端出身，所以我觉得用后端举一个例子更容易理解什么是弹性分布式集合RDD。

这里以.NET为例，假设业务上的需求是统计IT部门的人数，那么代码上的实现思路就是

- 创建数据连接从数据库取数据（常用的实现框架：**EF Core**）
  
  - 执行ORM映射：数据库表 → 实体类，表的列 → 类的属性，表中的一行数据 → 一个对象，最终获取到用户表users
  
  - 通过EFCore的LINQ语句编写统计语句，下面是两种写法res1 和 res2 
  
  - ```dotnet
    var users = dbContext.Users;
    var res1 = users.Count(x => x.DeptName == "IT");
    # 或
    var res2 = users
        .GroupBy(x => x.DeptName)
        .Where(g => g.Key == "IT")
        .Select(g => g.Count())
        .FirstOrDefault();
    ```

- 在这段代码中，`dbContext.Users` 通常是一个 `IQueryable<User>`，还没有真正读取数据库，当执行 Count() 时，EF Core 才会解析 LINQ 表达式，并尝试将它翻译为 SQL
  
  - ```sql
    SELECT COUNT(*)
    FROM Users
    WHERE DeptName = 'IT';
    ```
- SQL 被发送到数据库执行，数据库只将统计结果返回给应用程序。因此，这里的查询逻辑定义在应用程序中，但主要的数据过滤和统计计算发生在数据库中。

**此时的数据源是数据库，计算的过程定义在后端，计算的执行过程在数据库。**如果随着数据增长遇到查询慢，就有两个解决思路：

1. 优化代码的计算逻辑：使用第一种写法res1，因为直接过滤并计数通常比先按部门分组再寻找 IT 分组更合理。

2. 优化数据库查询速度：数据库中创建DeptName列索引，加快Where的查询

当数据规模持续扩大，或者处理逻辑需要扫描和转换大量数据，还想再快就很难解决了，这是因为当数据规模**超出单台数据库服务器**或**单个应用程序进程能够高效处理的范围**时，仅优化 LINQ 写法或数据库索引可能无法满足要求。

这时候就是**分布式计算框架Spark**的闪亮登场了！

但使用前提是数据存储结构已经重构，从数据库改为分布式存储（HDFS、ADLS、HBase），Spark 可以读取分布式存储或其他外部数据源，并将待处理的数据划分为多个分区，由集群中的多个 Executor 并行计算。此时代码里操作的集合就不是简单的List集合了，而是弹性分布式数据集RDD，所有的逻辑从应用到集合改为应用到RDD，Spark框架自动帮我们执行分布式的计算并将结果返回。

| 类比概念   | .NET 本地集合                    | Spark RDD 弹性分布式集合     |
| ------ | ---------------------------- | --------------------- |
| 数据集    | `IEnumerable<T>` / `List<T>` | `RDD<T>`              |
| 数据存储   | 本机内存                         | 分区，分布于集群              |
| 计算资源   | 本机 CPU / 线程                  | 多个节点的 Executor / Task |
| 筛选     | `Where`                      | `filter`              |
| 映射     | `Select`                     | `map`                 |
| 聚合     | `Count`、`Sum`                | `count`、`reduce`      |
| 是否立即执行 | 不一定                          | Transformation 延迟执行   |
| 是否可变   | `List<T>` 可变                 | RDD 不可变               |
| 容错     | 应用层控制                        | Lineage 重算            |

不过，这个类比只是为了帮助理解 API 的使用方式。RDD 与普通集合的本质区别在于，**RDD 不仅表示数据，还包含分区信息、上游依赖和重新计算方式**。Spark 可以基于这些信息组织分布式任务、并行执行计算，并在部分数据丢失时根据依赖关系重新计算对应分区。

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

# 4、向Spark传递函数

## 4.1 什么是向Spark传递函数？

 ——**把“如何处理一条数据”的规则，以函数的形式交给 Spark，Spark 会把这个函数序列化，发送到各个 Executor，由 Executor 在自己的分区数据上执行。**

例如：

```scala
val itUsers = usersRDD.filter(
  user => user.deptName == "IT"
)
```

其中的`user => user.deptName == "IT"` 就是传递给 Spark 的函数。

这个函数的参数是字符串，返回值是去除首尾空白后的字符串（这是lambda表达式的写法，因为只有1个参数1个返回值且操作的都是对象本身所以二者被省略了，只有逻辑处理过程成trim）

## 4.2 为什么要传函数

**1、数据很大，移动代码比移动数据划算**

假设数据有 1 TB，分散在 100 台机器上，有两种做法：

| 做法                 | 网络传输量    | 结果                        |
| ------------------ | -------- | ------------------------- |
| 把数据全拉到 Driver 再处理  | 1 TB     | Driver 内存放不下，网络成为瓶颈，也没有并行 |
| 把函数发到各台机器，在本地数据上执行 | 函数只有几 KB | 数据不动，100 台机器同时计算各自负责的数据分区 |

```scala
val itUsers = usersRDD.filter(
  user => user.deptName == "IT"
)
```

这就是"**移动计算，而不是移动数据**"的思想，Hadoop MapReduce 也是如此。Spark 的调度还会尽量把 Task 派到数据所在的节点（数据本地性）。

只写一次"处理一条数据"的逻辑（函数），Spark 会将**函数及其依赖的闭包变量序列化**，并将它们包含在 Task 中，发送到负责执行这些 Task 的 Executor。Executor**反序列化**后，在对应的数据分区上执行该函数。（闭包变量，改了也不会回到 Driver）

> 为什么要先把**函数及其依赖的闭包变量序列**，再发送到对应的 Executor？
> 
> 由于 Driver 和 Executor 位于不同进程，甚至不同机器，它们不能直接共享普通内存引用，Executor 无法直接访问 Driver 内存中的函数对象。
> 
> 所以park 需要把函数及其所依赖的外部变量转换为可传输的字节表示，在 Executor 端重新构造并执行。这个过程就是序列化和反序列化。序列化主要解决跨进程、跨机器传输问题，并不等同于压缩。（可以类比前后端需要序列化和反序列化才能传递大量参数）
> 
> 如果函数引用了**外部变量**，那么函数逻辑和它捕获的**外部变量**一起构成闭包。Executor 获得的是序列化后恢复出来的本地状态，而不是 Driver 中原始变量的共享引用。因此，在 Executor 中修改普通闭包变量，不会自动修改 Driver 中的原始变量。

**2、支撑惰性执行和容错计算**

- 惰性与优化：函数被记录进 DAG 后，Spark 能把连续的 map、filter 合并成同一个 Stage，逐条流水线处理，不产生中间结果。

- 容错：函数加上血缘（Lineage）构成了"计算食谱"。某个分区丢失后，Spark 只需拿原始数据重新应用这些函数，就能重算出该分区。为了保证 Task 重试和分区重算时结果一致，传给 Spark 的函数最好是确定性的，并尽量避免不可重复或非幂等的外部副作用。Spark 允许非确定性函数，但重算时可能产生不同结果。



Spark 的大部分转化操作和一部分行动操作，都需要依赖用户传递的函数来计算。在我们支持的三种主要语言中，向 Spark 传递函数的方式略有区别。

它是 Spark 编程模型的基础，因为 Spark 的大部分转化和行动操作都依赖用户传入的函数。

## 4.3 Scala代码实现

在 Scala 中，我们可以把定义的内联函数、方法的引用或静态方法传递给Spark，就像 Scala 的其他函数式 API 一样。

1、传递内联函数 `x => x % 2 == 0`（内联匿名函数，也称 Lambda）

```scala
val result = rdd.filter(x => x % 2 == 0)
```

> Lambda可以理解为是函数的缩写，这里就能看出来写法和LINQ很像

2、传递方法的引用

```scala
// 定义方法
def isEven(x: Int): Boolean = {
  x % 2 == 0
}
//传给 Spark
val result = rdd.filter(isEven)
// 等价于 val result = rdd.filter(x => isEven(x))
```

> Scala 的函数和 C# 的委托在编程模型上很相似，但Scala 的函数传入的不仅是内存中的函数指针，而是可以被序列化并分发到集群节点上执行的闭包

3、传递静态方法

“静态方法”更接近 Java 术语。在传统 Scala 代码中，通常使用 object 定义不依赖对象实例的工具方法：

```scala
//定义工具方法
object NumberUtils {
  def isEven(x: Int): Boolean = {
    x % 2 == 0
  }
}
//传给 Spark
val result = rdd.filter(NumberUtils.isEven)
```

## 4.4 闭包的注意事项

我们还要考虑其他一些细节：Spark 需要从 Driver 发送到 Executor 的函数闭包，以及闭包捕获的对象，所以它们必须能够**被 Spark 使用的序列化机制处理**。

如果任意以个对象无法序列化，就可能失败，此时可以沿着下面的引用关系检查：

- 传给 Spark 算子的 Lambda、匿名函数或方法引用；

- 函数直接捕获的局部变量；

- 函数是否隐式捕获了外部类实例 this；

- 如果捕获了 this，该实例引用的对象图中是否存在不可序列化的字段。

---

举例1、以Lambda 捕获的局部变量为例，看下具体怎么检查。

```scala
val targetDepartment = "IT"

val result = usersRDD.filter(
  user => user.deptName == targetDepartment
)
```

这里传给`filter`的函数是`user => user.deptName == targetDepartment`

这个函数引用了定义在函数外部的局部变量：`targetDepartment`

此时函数和捕获的外部状态组合成闭包：

```plain text
闭包
├── 函数逻辑：user.deptName == targetDepartment
└── 外部状态：targetDepartment = "IT"
```

当 Action 触发执行时，Spark 需要将这段函数逻辑及它捕获的 `targetDepartment` 发送到负责执行 Task 的 Executor。

由于`targetDepartment` 是 String，可以被正常序列化，而且数据量很小，因此通常不会有问题。

---

举例2、传递实例方法时隐式捕获 this

```scala
class UserProcessor {

  val targetDepartment = "IT"
  
  //UserProcessor实例的方法  
  def isTargetDepartment(user: User): Boolean = {
    user.deptName == targetDepartment
  }

  def process(usersRDD: RDD[User]): RDD[User] = {
    usersRDD.filter(isTargetDepartment) // 调用时会读取变量targetDepartment = "IT"
  }
}
```

`isTargetDepartment` 是 `UserProcessor` 的实例方法。其中的`targetDepartment`本质上是`this.targetDepartment`

因此，把实例方法 `isTargetDepartment` 传给 filter 时，Executor 不仅需要知道要执行哪个方法，还可能需要知道该方法属于哪个 `UserProcessor` 实例。可以将这个引用关系理解为：

```plain text
传递实例方法
    ↓
方法依赖 this.targetDepartment
    ↓
闭包捕获 this
    ↓
Spark 可能需要序列化 UserProcessor 实例
```

如果 `UserProcessor` 没有实现 `Serializable`，或者它包含不可序列化字段，就可能发生序列化异常。

---

如果Lambda 或实例方法隐式捕获了外部类实例 this，Spark 可能需要序列化该实例以及序列化过程涉及的对象图。为了减小闭包范围：

- 可以把真正需要的简单字段提前复制到局部变量中

- 并确保 Lambda 不再访问其他实例字段或实例方法

# 5、常见的转化操作/行动操作

根据RDD类型的不同，对应可以使用的转化/行动操作会有所不同。例如：数字类型的 RDD 支持统计型函数操作，而键值对形式的 RDD 则支持诸如根据键聚合数据的键值对操作。

## 5.1 基本RDD

先看下**任意数据类型的 RDD 都支持**的转化操作和行动操作。

### 5.1.1 通用的转化操作

原始数据定义： `val rdd = sc.parallelize(Seq(1, 2, 3, 3))`

| 函数名                                         | 目的                                               | 示例                          | 结果                   |
| ------------------------------------------- | ------------------------------------------------ | --------------------------- | -------------------- |
| `map()`                                     | 将函数应用于 RDD 中的每个元素，将返回值构成新的 RDD                   | `rdd.map(x => x + 1)`       | `{2, 3, 4, 4}`       |
| `flatMap()`                                 | 将函数应用于 RDD 中的每个元素，将返回的迭代器中的所有内容构成新的 RDD。通常用来切分单词 | `rdd.flatMap(x => x.to(3))` | `{1, 2, 3, 2, 3, 3}` |
| `filter()`                                  | 返回一个由通过传给 `filter()` 的函数的元素组成的 RDD               | `rdd.filter(x => x != 1)`   | `{2, 3}`             |
| `distinct()`                                | 去重                                               | `rdd.distinct()`            | `{1, 2, 3}`          |
| `sample(withReplacement, fraction, [seed])` | 对 RDD 采样，以及是否替换                                  | `rdd.sample(false, 0.5)`    | 非确定的                 |

其中两个最常用的转化操作是 `map()` 和 `filter()`

- `map()` 接收一个函数，把这个函数用于 RDD 中的每个元素，将函数的返回结果作为结果 RDD 中对应元素的值（返回值类型不需要和输入类型一样）。

- `filter()` 接收一个函数，并将 RDD 中满足该函数的元素放入新的 RDD中返回。

---

看一下`map`和`flatMap`的区别

- `map`：一个输入元素对应一个输出元素。

- `flatMap`： ≈ map + flatten。每个元素可以展开，一个输入元素可以对应零个、一个或多个输出元素，并把结果展开到同一层

```scala
val sentencesRDD =
  sc.parallelize(Seq("Hello Spark", "Hello RDD"))

val mappedResult =
  sentencesRDD.map(sentence => sentence.split(" ")) // 返回类型是RDD[Array[String]]

val flatMappedResult =
  sentencesRDD.flatMap(sentence => sentence.split(" ")) // 返回类型是RDD[String]

// 输出 map 结果
mappedResult
  .collect()
  .foreach(array => println(array.mkString("[", ", ", "]")))

// 输出 flatMap 结果
flatMappedResult
  .collect()
  .foreach(println)
```

输出如下

```plain text
[info] [Hello, Spark]
[info] [Hello, RDD]
[info] Hello
[info] Spark
[info] Hello
[info] RDD
```

用.NET LINQ 来理解的话就是这样的关系

| Spark / Scala | .NET LINQ    |
| ------------- | ------------ |
| `map`         | `Select`     |
| `flatMap`     | `SelectMany` |

### 5.1.2 伪集合的转化操作

尽管 RDD 本身不是严格意义上的集合，但它也支持许多数学上的集合操作，比如合并和相交操作。（使用前提：RDD 是相同数据类型的）

原始数据定义如下：

```scala
val left = sc.parallelize(Seq(1, 2, 3))
val right = sc.parallelize(Seq(3, 4, 5))
```

**对数据分别为 `{1, 2, 3}` 和 `{3, 4, 5}` 的两个 RDD 进行针对两个 RDD 的转化操作**

| 函数名              | 目的                                       | 示例                        | 结果                                                                         |
| ---------------- | ---------------------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| `union()`        | 生成一个包含两个 RDD 中所有元素的 RDD（不去重）             | `rdd.union(other)`        | `{1, 2, 3, 3, 4, 5}`                                                       |
| `intersection()` | 求两个 RDD 共同元素的 RDD（去重）                    | `rdd.intersection(other)` | `{3}`                                                                      |
| `subtract()`     | 移除一个 RDD 中同时存在于另一个 RDD 中的内容，例如移除训练数据（去重） | `rdd.subtract(other)`     | `{1, 2}`                                                                   |
| `cartesian()`    | 与另一个 RDD 进行笛卡儿积                          | `rdd.cartesian(other)`    | `{(1, 3), (1, 4), (1, 5), (2, 3), (2, 4), (2, 5), (3, 3), (3, 4), (3, 5)}` |

RDD 中最常缺失的集合属性是元素的唯一性，因为常常有重复的元素。如果只要唯一的元素，我们可以使用 `RDD.distinct()` 转化操作来生成一个只包含不同元素的新 RDD。不过需要注意，`distinct()`操作的开销很大，因为它需要将所有数据通过网络进行shuffle，以确保每个元素都只有一份。

下面的完整代码详见配套git [RDDCollectionOperationsApp.scala](https://github.com/Eleanora-lyh/BigDataDemoProjects/blob/main/Spark/ScalaApplicaton/spark-line-count/src/main/scala/com/example/RDDCollectionOperationsApp.scala)

#### 并集 union

如果输入的 RDD 中有重复数据，Spark 的 union() 操作也会包含这些重复数据（如有必要，我们可以通过`distinct() `实现相同的效果）

应用：处理来自多个数据源的日志文件。

```scala
left.union(right)
```

输出

```plain text
[info] left  = [1, 2, 3]
[info] right = [3, 4, 5]
[info] union: [1, 2, 3, 3, 4, 5]
```

#### 交集 intersection

返回两个 RDD 中都有的元素（已去掉重复的元素）。因为需要去掉重复的元素所以必然需要网络shuffle，性能会较`union`差很多。

```scala
left.intersection(right)
```

输出

```plain
[info] left  = [1, 2, 3]
[info] right = [3, 4, 5]
[info] intersection: [3]
```

#### 差集 subtract

返回一个由只存在于第一个 RDD 中而不存在于第二个 RDD 中的所有元素组成的 RDD（已去掉重复的元素）。

```scala
left.subtract(right)
right.subtract(left)
```

输出

```plain
[info] left  = [1, 2, 3]
[info] right = [3, 4, 5]
[info] left subtract right: [1, 2]
[info] right subtract left: [4, 5]
```

#### 笛卡儿积 cartesian

返回所有可能的 (a, b) 对，其中 a 是源RDD 中的元素，而 b 则来自另一个 RDD。

不过要特别注意的是，求大规模 RDD 的笛卡儿积开销巨大。

```scala
 val numbers = sc.parallelize(Seq(1, 2), numSlices = 2)
 val letters = sc.parallelize(Seq("A", "B"), numSlices = 2)
 val cartesianResult = numbers.cartesian(letters).collect().sorted.toSeq
```

输出

```plain
[info] cartesian: [(1,A), (1,B), (2,A), (2,B)]
```

### 5.1.3 行动操作

**行动操作**是能够**触发实际计算**、并把 RDD 的结果**返回给 Driver 程序**或**写出到外部存储**的一类算子。

原始数据定义如下：

```scala
// RDD 不是数学集合，重复的 3 会保留；两个分区分别为 [1, 2] 和 [3, 3]。
val rdd = sc.parallelize(Seq(1, 2, 3, 3), numSlices = 2)
```

本例的分区内容是：

```plain text
RDD
├── 分区 0：[1, 2]
└── 分区 1：[3, 3]
```

**对一个数据为 `{1, 2, 3, 3}` 的 RDD 进行基本的 RDD 行动操作（按照分类如下）**

| 分类           | 函数                                    | 作用                                              | 示例                             | 结果 / 特点                 |
| ------------ | ------------------------------------- | ----------------------------------------------- | ------------------------------ | ----------------------- |
| **1. 取数与计数** | `collect()`                           | 返回 RDD 中的所有元素到 Driver                           | `rdd.collect()`                | `{1, 2, 3, 3}`          |
|              | `count()`                             | 返回 RDD 中元素的个数                                   | `rdd.count()`                  | `4`                     |
|              | `first()`                             | 返回 RDD 中的第一个元素                                  | `rdd.first()`                  | `1`                     |
|              | `take(num)`                           | 返回 RDD 中前 `num` 个元素                             | `rdd.take(2)`                  | `{1, 2}`                |
| **2. 大小比较**  | `takeOrdered(num)`                    | 按排序规则返回前 `num` 个元素，默认升序                         | `rdd.takeOrdered(2)`           | `{1, 2}`                |
|              | `top(num)`                            | 返回最大的 `num` 个元素                                 | `rdd.top(2)`                   | `{3, 3}`                |
|              | `min()`                               | 返回 RDD 中的最小元素                                   | `rdd.min()`                    | `1`                     |
|              | `max()`                               | 返回 RDD 中的最大元素                                   | `rdd.max()`                    | `3`                     |
| **3. 聚合统计**  | `reduce(func)`                        | 使用同一个函数两两合并元素，没有初始值                             | `rdd.reduce((x, y) => x + y)`  | `9`                     |
|              | `fold(zero)(func)`                    | 提供 `zeroValue`，使用同一个函数聚合元素                      | `rdd.fold(0)((x, y) => x + y)` | `9`                     |
|              | `aggregate(zeroValue)(seqOp, combOp)` | 分区内使用 `seqOp`，分区间使用 `combOp`，允许聚合结果与 RDD 元素类型不同 | 例如同时统计 `(sum, count)`          | `(9, 4)`                |
|              | `countByValue()`                      | 统计 RDD 中每个值出现的次数                                | `rdd.countByValue()`           | `{(1,1), (2,1), (3,2)}` |
| **4. 抽样与遍历** | `takeSample()`                        | 从 RDD 中随机抽取指定数量的元素并返回 Driver                    | `rdd.takeSample(false, 2)`     | 随机结果                    |
|              | `foreach(func)`                       | 对 RDD 中每个元素执行指定函数                               | `rdd.foreach(func)`            | 无返回结果                   |
|              | `foreachPartition(func)`              | 对 RDD 的每个 Partition 执行一次函数                      | `rdd.foreachPartition(func)`   | 无返回结果                   |

下面的完整代码详见配套 Git 代码 [RDDActionOperationsApp.scala](https://github.com/Eleanora-lyh/BigDataDemoProjects/blob/main/Spark/ScalaApplicaton/spark-line-count/src/main/scala/com/example/RDDActionOperationsApp.scala)

#### 取数与计数

1、 `collect()`：取回全部元素（重复元素会保留）

**全部数据都要进入 Driver 内存，因此只适合小数据。**

```scala
rdd.collect().toSeq
// [info] RDD = [1, 2, 3, 3], partitions = 2
// [info] collect: WrappedArray(1, 2, 3, 3)
```

执行过程可以理解为：

```plain text
分区 0：[1, 2] ──┐
                ├── Driver：[1, 2, 3, 3]
分区 1：[3, 3] ──┘
```

- `collect()` 返回 `Array[Int]`。
- `.toSeq` 是 Driver 上的 Scala 集合转换，不是 Spark 操作。

2、 `count()`：统计元素总数

统计的是元素数量，不是不同值的数量。

```scala
rdd.count()
// [info] RDD = [1, 2, 3, 3], partitions = 2
// [info] count: 4
```

3、 `first()`：取第一个非空元素

空 RDD 调用 `first()` 会报错

```scala
rdd.first()
// [info] RDD = [1, 2, 3, 3], partitions = 2
// [info] first: 1
```

4、 `take(n)`：按顺序取前 n 个元素

如果请求的数量超过实际数量，则返回全部已有元素，不会补齐。

```scala
rdd.take(2).toSeq
// [info] RDD = [1, 2, 3, 3], partitions = 2
// [info] take(2): WrappedArray(1, 2)
```

按照当前 RDD 的分区及分区内顺序取数，取够就可以停止，不必为了返回全部数据而使用 `collect()`。

#### 大小比较

1、 `takeOrdered()`：按照元素的排序规则，选出最小的n个，并按升序返回



```scala
rdd.takeOrdered(3).toSeq
// [info] RDD = [1, 2, 3, 3], partitions = 2
// [info] takeOrdered(3): WrappedArray(1, 2, 3)
```

2、 `top(n)`：取最大的前n个元素

**`top` 不去重，原始 RDD 中有两个 `3`，它们就是最大的两个元素。**

```scala
rdd.top(2).toSeq
// [info] RDD = [1, 2, 3, 3], partitions = 2
// [info] top(2): WrappedArray(3, 3)
```

3. `min()` 和 `max()`：取最大/最小

只需要一个极值时，可以直接使用它们。空 RDD 调用这两个操作会报错。

```scala
rdd.min() 
rdd.max() 
// [info] RDD = [1, 2, 3, 3], partitions = 2
// [info] min: 1
// [info] max: 3
```

#### 聚合统计

1. `reduce()`：使用同一个函数不断合并

`_ + _` 是`(left, right) => left + right`的缩写

```scala
rdd.reduce(_ + _) //等价于 rdd.reduce((left, right) => left + right)
// [info] RDD = [1, 2, 3, 3], partitions = 2
// [info] reduce(sum): 9
```

按本例分区，可以理解为：

```plain text
分区 0：[1, 2] → 1 + 2 = 3
分区 1：[3, 3] → 3 + 3 = 6
最终合并：3 + 6 = 9
```

要点：

- 不需要提供初始值。
- 合并函数的输入、输出都是元素类型，本例为 `Int`。
- 空 RDD 没有元素可供归约，因此会报错。
- 函数应该满足**结合律和交换律**，避免依赖分区合并顺序。

例如，减法就不适合直接用于这种并行归约：`(1 - 2) - 3 ≠ 1 - (2 - 3)`

---

2、 `fold()`：使用同一个函数不断合并（带单位元的合并）

```scala
rdd.fold(0)(_ + _)
// [info] RDD = [1, 2, 3, 3], partitions = 2
// [info] fold(0)(sum): 9
```

它比 `reduce` 多了一个初始值 `0`，同一个函数不断合并各个分区时会加上单位元0

```plain text
分区 0：0 + 1 + 2 = 3
分区 1：0 + 3 + 3 = 6
最终合并：0 + 3 + 6 = 9
```

**这个初始值不是只加一次！**

因此应选择不会改变结果的“单位元”：

| 运算  | 合适的单位元 |
| --- | ------ |
| 加法  | `0`    |
| 乘法  | `1`    |

对于空的 `RDD[Int]` 

- 执行 `emptyRdd.fold(0)(_ + _)`会返回0

- 而`emptyRdd.reduce(_ + _)`，会因没有元素可供归约而报错。（这也是它与 `reduce` 的一个区别）

---

3、`aggregate()`：分区内累加 与 分区间合并 分开定义

```scala
val sumAndCount = rdd.aggregate((0, 0L))(
  (acc, value) => (acc._1 + value, acc._2 + 1L),
  (left, right) => (left._1 + right._1, left._2 + right._2)
)
// [info] RDD = [1, 2, 3, 3], partitions = 2
//[info] aggregate(sum, count): (9,4)
```

这个操作的目标是同时统计：

(总和, 个数)

分三部分看。

① 初始值 `(0, 0L)` 表示：总和 = 0、个数 = 0

② 分区内累加函数 `(acc, value) => (acc._1 + value, acc._2 + 1L)`表示：

每读到一个元素：总和加上该元素、个数加一

```plain text
分区 0 的计算：
初始：(0, 0)
读到 1 → (1, 1)
读到 2 → (3, 2)

分区 1 的计算：
初始：(0, 0)
读到 3 → (3, 1)
读到 3 → (6, 2)
```

③ 分区间合并函数 `(left, right) => (left._1 + right._1, left._2 + right._2)`

将两个统计结果合并：`(3, 2) + (6, 2) → (9, 4)`

随后在 Driver 上计算平均值：`sumAndCount._1.toDouble / sumAndCount._2`（9.0 / 4 = 2.25，这里 `.toDouble` 是为了避免整数除法）

**`aggregate` 的关键优势是：累加结果的类型可以与原始元素类型不同。**

原始元素：Int

累加结果：(Int, Long)

这段平均值计算不是新的 Spark Action，只是在 Driver 上处理已经返回的元组。

### 4. `countByValue`：统计每个值出现的次数

rdd.countByValue().toMap

// Map(1 -> 1L, 2 -> 1L, 3 -> 2L)

含义：

1 出现 1 次

2 出现 1 次

3 出现 2 次

它与 `count()` 的区别：

count()        → 总共有多少个元素：4

countByValue() → 每个值分别有多少个：{1:1, 2:1, 3:2}

结果是 Driver 端的 Map，**Map 的打印顺序没有保证**。代码比较的是键值内容，不是显示顺序。

如果不同值特别多，这个 Map 也可能占用大量 Driver 内存。

### 三种合并操作怎么选

| 操作          | 初始值     | 结果类型能否不同于元素类型 | 典型用途              |
| ----------- | ------- | ------------- | ----------------- |
| `reduce`    | 无       | 不能            | 求和、求最大值           |
| `fold`      | 有，使用单位元 | 不能            | 带单位元的归约，也能处理空 RDD |
| `aggregate` | 有       | 能             | 同时统计总和和个数等复杂汇总    |

---

#### 抽样与遍历

### 1. `takeSample`：随机抽取若干元素

val sample = rdd.takeSample(

  withReplacement = false,

  num = 3,

  seed = 42L

).toSeq

参数含义：

| 参数                        | 含义                |
| ------------------------- | ----------------- |
| `withReplacement = false` | 无放回抽样             |
| `num = 3`                 | 希望抽取 3 个元素        |
| `seed = 42L`              | 指定随机种子，便于在相同条件下复现 |

之前运行得到的是：

[2, 3, 3]

**无放回抽样为什么还能出现两个 `3`？**

因为无放回针对的是“元素实例”，不是“值”。

可以给原始元素加上标签来理解：

[1, 2, 3ₐ, 3ᵦ]

抽到：

[2, 3ₐ, 3ᵦ]

没有重复抽取同一个元素，但两个元素的值恰好相同。

代码没有断言样本必须等于 `[2, 3, 3]`，而是验证：

1. 样本数量为 3。
2. 每个值的出现次数不超过原始数据中的次数。

例如，样本中不能出现三个 `3`，因为原始 RDD 只有两个。

还要区分：

takeSample → Action，返回 Driver 上的数组

sample     → Transformation，返回一个新的 RDD

### 2. `foreach`：每个元素执行一次函数

rdd.foreach(value => println(s"  element = $value"))

本例会打印所有元素，但可能是：

3

3

1

2

而不是固定的：

1

2

3

3

原因是两个分区可以并行执行，**跨分区的打印顺序不保证**。

这里的函数在 Executor 执行：

Driver 发起 Action

    ├── Executor 处理分区 0，逐个打印

    └── Executor 处理分区 1，逐个打印

在本地模式中，你能在当前控制台看到这些输出；在集群中，它们通常出现在 Executor 日志中。

`foreach` 返回 `Unit`，不是把处理后的元素收集回 Driver。

### 3. `foreachPartition`：每个分区执行一次函数

rdd.foreachPartition { values =>

  println(s"  partition = ${values.mkString("[", ", ", "]")}")

}

这里的 `values` 是当前分区的迭代器，输出类似：

partition = [3, 3]

partition = [1, 2]

两者的区别是：

foreach          → 函数逐元素调用

foreachPartition → 函数逐分区调用，内部自行遍历元素

在本例正常单次执行中：

- `foreach`：处理四个元素。
- `foreachPartition`：处理两个分区。

`foreachPartition` 常用于复用数据库连接等资源：

逐元素建立连接：

每条数据 → 建连接 → 写入 → 关闭

逐分区复用连接：

每个分区 → 建连接 → 写入多条数据 → 关闭

但要注意：**Spark 任务可能重试，外部写入不能想当然地认为只执行一次，需要考虑幂等性。**

### 4. `rdd.foreach` 与 `rdd.collect().foreach`

代码最后专门进行了对比：

rdd.foreach(value => println(value))

与：

rdd.collect().foreach(value => println(value))

| 写法                           | 遍历位置     | 是否把全部数据拉到 Driver |
| ---------------------------- | -------- | ---------------- |
| `rdd.foreach(...)`           | Executor | 否                |
| `rdd.collect().foreach(...)` | Driver   | 是                |

第二种写法实际包含两个阶段：

① collect()：Spark Action，将全部数据拉回 Driver

② foreach()：普通 Scala 数组遍历，在 Driver 逐个打印

所以，**第二种写法中的 `foreach` 已经不是 RDD 行动操作了。**

`reduce()`是基本 RDD 上最常见的行动操作 。它接收一个函数作为参数，这个函数要操作两个 RDD 的元素类型的数据并返回一个同样类型的新元素。

```scala
val rdd = sc.parallelize(Seq(1, 2, 3, 4), 2)

val result = rdd.reduce((x, y) => x + y) // 1 + 2 + 3 + 4 = 10

println(result) // 10
```

- **`reduce()`**：直接把 RDD 中的元素两两合并，**没有初始值**。
- **`fold()`**：在 `reduce()` 的基础上增加一个 **零值 `zeroValue`**，但这个零值可能会被每个分区以及 Driver 端分别使用，并不是只使用一次。

## 5.2 在不同RDD类型之间转换

有些函数只能用于特定类型的 RDD，比如 `mean()` 和 `variance()` 只能用在数值 RDD 上，而 `join()` 只能用在键值对 RDD 上。

这些函数都没有定义在标准的 RDD 类中，所以要访问这些附加功能，必须要确保获得了正确的**专用 RDD 类**。

在 Scala 中，将 RDD 转为有特定函数的 RDD（比如在 `RDD[Double]` 上进行数值操作）是由**隐式转换**来自动处理的。这些隐式转换可以隐式地将一个 RDD 转为各种封装类，比如 `DoubleRDDFunctions`（数值数据的 RDD）和`PairRDDFunctions`（键值对 RDD），这样我们就有了诸如 `mean()` 和`variance()` 之类的额外的函数。

（隐式转换虽然强大，但是会让阅读代码的人感到困惑）

# 6、持久化（缓存）

如前所述，Spark RDD 是惰性求值的，而有时我们希望能多次使用同一个RDD。如果简单地对 RDD 调用行动操作，Spark 每次都会重算 RDD 以及它的所有依赖。这在迭代算法中消耗格外大，因为迭代算法常常会多次使用同一组数据。

**所以：为了避免多次计算同一个 RDD，可以让 Spark 对数据进行持久化。**

当我们让Spark 持久化存储一个 RDD 时，计算出 RDD 的节点会分别保存它们所求出的分区数据。

- 如果一个有持久化数据的节点发生故障，Spark 会在需要用到缓存的数据时重算丢失的数据分区。

- 如果希望节点故障的情况不会拖累我们的执行速度，也可以把数据备份到多个节点上。（通过在存储级别末尾加上 `_2`，将持久化数据存为两份）

出于不同的目的，我们可以为 RDD 选择不同的**持久化级别**。在 Scala 中，默认情况下 `persist()` 会把数据以**序列化的形式缓存在 JVM 的堆空间中**。当我们把数据写到磁盘或者堆外存储上时，也总是使用序列化后的数据。

`org.apache.spark.storage.StorageLevel` 和 `pyspark.StorageLevel` 中的持久化级别如下

| 级别                    | 使用的空间 | CPU 时间 | 是否在内存中 | 是否在磁盘上 | 备注                                |
| --------------------- | ----- | ------ | ------ | ------ | --------------------------------- |
| `MEMORY_ONLY`         | 高     | 低      | 是      | 否      | **仅**将数据存储**在内存**中                |
| `MEMORY_ONLY_SER`     | 低     | 高      | 是      | 否      | 以**序列化**形式将数据存储在内存中               |
| `MEMORY_AND_DISK`     | 高     | 中等     | 部分     | 部分     | 如果数据在内存中放不下，则**溢写到磁盘上**           |
| `MEMORY_AND_DISK_SER` | 低     | 高      | 部分     | 部分     | 如果数据在内存中放不下，则溢写到磁盘上；在内存中存放序列化后的数据 |
| `DISK_ONLY`           | 低     | 高      | 否      | 是      | **仅**将数据存储在**磁盘**上                |

> **说明：** 表中的“CPU 时间”是不同存储级别之间的相对比较。序列化存储可以减少内存占用，但重新使用数据时需要进行反序列化，因此通常会产生更多 CPU 开销。

```scala
val result = input.map(x => x * x)
result.persist(StorageLevel.DISK_ONLY)
println(result.count())
println(result.collect().mkString(","))
```

我们在第一次对这个 RDD 调用行动操作前就调用了 `persist()` 方法。`persist()` 调用本身不会触发强制求值。

如果要缓存的数据太多，内存中放不下，Spark 会自动利用最近最少使用（LRU）的缓存策略把最老的分区从内存中移除。

对于仅把数据存放在内存中的缓存级别，下一次要用到已经被移除的分区时，这些分区就需要重新计算。

但是对于使用内存与磁盘的缓存级别的分区来说，被移除的分区都会写入磁盘。

不论哪一种情况，都不必担心你的作业因为缓存了太多数据而被打断。不过，缓存不必要的数据会导致有用的数据被移出内存，带来更多重算的时间开销。

RDD 还有一个方法叫作 `unpersist()`，调用该方法可以手动把持久化的 RDD 从缓存中移除。

# 7、总结

在本章中，我们介绍了 **RDD 运行模型**以及 RDD 的许多**常见操作**。如果你读到了这里，恭喜——你已经学完了 Spark 的所有核心概念。我们在进行并行聚合、分组等操作时，常常需要利用键值对形式的 RDD。下一章会讲解键值对形式的 RDD 上一些相关的特殊操作。然后，我们会讨论各种数据源的输入输出，以及一些关于使用 SparkContext 的进阶话题。
