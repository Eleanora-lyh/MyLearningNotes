# 1、引入

上一篇文章我们操作的都是普通类型的RDD，但按**元素类型**RDD可以分的两大类：

- 普通类型的RDD：`RDD[T]`，T 是任意类型。（可以是String、Int、User等）

- 键值对 RDD：`PairRDD[K, V]`，**本质上是**元素为**二元组 (Key, Value) 的普通 RDD： RDD[(K, V)]**

**Pair RDD** 在普通 RDD 的分布式计算能力之上，**引入了 Key 这一层语义**，使 Spark 可以进行按 Key 的聚合、分区和 Join，并能够通过**分区内预聚合、复用 Partitioner 等机制**，从而减少 Shuffle 的数据量，或者在一些场景下**避免不必要的重复 Shuffle**。

**需要注意**：`PairRDD` 不是一个独立的类。打开源码你会发现，根本不存在 `PairRDD` 这个类——它只是对 `RDD[(K, V)]` 的**约定俗成的叫法**。所有"只对键值对生效"的算子（`reduceByKey`、`groupByKey`、`join`），本质上都是定义在普通 RDD 上的方法，只是通过隐式转换（`implicit`) 在编译期做了限制。

```scala
// 这两行声明的是同一个东西
val rdd1: RDD[(String, Int)] = ...
val rdd2: PairRDD[String, Int] = ...   // 并不存在这个类型
```

为什么这么设计？因为 Scala 的隐式类 `PairRDDFunctions` 会在你调用 `reduceByKey` 时自动包装：

```
RDD[(K, V)]  --隐式转换-->  PairRDDFunctions[K, V]
                                    │
                          reduceByKey / groupByKey / join ...
```

如果你对一个 `RDD[Int]` 调用 `reduceByKey`，编译器会报错——因为它找不到对应的隐式转换。**这就是 Spark 用类型系统在编译期拦住错误，而不是运行时报错。**

# 2、创建Pair RDD

下面的代码详见 [PairRDDCreationApp.scala](https://github.com/Eleanora-lyh/BigDataDemoProjects/blob/main/Spark/ScalaApplicaton/spark-line-count/src/main/scala/com/example/PairRDDCreationApp.scala)

## 2.1 从普通集合直接创建

类型 `RDD[(String, Int)]`

```scala
// 方式一：直接将二元组集合并行化；相同的 key 可以出现多次。
val pairs: RDD[(String, Int)] = sc.parallelize(
  Seq(("apple", 2), ("banana", 3), ("apple", 1)),
  numSlices = 2
)
val pairResult = pairs.collect().sorted.toSeq
println(s"parallelize tuples: ${pairResult.mkString("[", ", ", "]")}")
//[info] parallelize tuples: [(apple,1), (apple,2), (banana,3)]
```

## 2.2 使用 map() 把普通 RDD 转成 Pair RDD

```scala
// word -> 1 与 (word, 1) 等价，常用于词频统计的准备阶段。
val words = sc.parallelize(Seq("spark", "scala", "spark"), numSlices = 2)
val wordPairs: RDD[(String, Int)] = words.map(word => (word, 1))
val wordPairResult = wordPairs.collect().sorted.toSeq
println(s"map to pairs: ${wordPairResult.mkString("[", ", ", "]")}")
//[info] map to pairs: [(scala,1), (spark,1), (spark,1)]
```

具体过程如下

```plain
Driver
  |
  |-- sc.parallelize --> Partition0("spark")
  |                     Partition1("scala","spark")
  |
  |-- map --> Partition0("spark",1)
  |           Partition1("scala",1),("spark",1)
  |
  |-- collect() --> 拉回 Driver
  |
  |-- sorted --> 排序
  |
  |-- println --> 输出
```

如果想统计文字出现的次数可以这样写

```scala
val words = sc.parallelize(Seq("spark", "scala", "spark"), numSlices = 2)
val wordPairs = words.map(word => (word, 1))
val wordCounts = wordPairs.reduceByKey((a, b) => a + b)
// 可以简写为
val wordCounts2 = words
        .map(word => (word, 1))
        .reduceByKey(_ + _)
```

## 2.3 从文本文件创建 Pair RDD

## 2.4 使用 keyBy() 创建 Pair RDD

## 2.5 使用 mapPartitions() 创建

# 3、Pair RDD的转化操作

# 4、Pair RDD的行动操作

# 5、数据分区

6、总结

**

我们一般要先通过一些初始 ETL（抽取、转化、装载）操作来将数据转化为键值对形式。键值对 RDD 提供了一些新的操作接口（比如统计每个产品的评论，将数据中
键相同的分为一组，将两个不同的 RDD 进行分组合并等）。

有时，使用可控的分区方式把常被一起访问的数据放到同一个节点上，可以大大减少应用的通信开销。这会带来明显的性能提升。

二者的区别在于可应用函数的范围不同，同时可用的算子集也不同：

| 操作     | 普通 RDD[T]                     | 键值对 RDD[(K, V)]                                        |
| ------ | ----------------------------- | ------------------------------------------------------ |
| 过滤     | `filter(func)`                | `filterByRange(low, high)` 按 key 区间过滤                  |
| 聚合     | `reduce(func)` —— **全局**聚合    | `reduceByKey(func)` —— **按 key 分区内**先聚合再 shuffle       |
| 分组     | `groupBy(func)` —— 全量 shuffle | `groupByKey()` —— 按 key shuffle                        |
| 排序     | `sortBy(func)` —— 需指定排哪个字段    | `sortByKey()` —— 直接按 key 排                             |
| 映射     | `map(func)`                   | `mapValues(func)` —— **只动 value，不动 key**，保留分区器         |
| 关联     | 无                             | `join` / `leftOuterJoin` / `cogroup` / `subtractByKey` |
| 聚合(计数) | `count()`                     | `countByKey()`                                         |
| 采样     | `sample()`                    | `sampleByKey()` / `sampleByKeyExact()`                 |
| 聚合(通用) | `aggregate()`                 | `aggregateByKey()` —— **初始值只在每个分区创建一次                  |
