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

综上在 Spark 中，**Pair RDD 并不是一种独立的 RDD 类型**，它本质上是元素为二元组 `(Key, Value)` 的普通 RDD。

所以构造Pair RDD也就是通过各种方式来构造出形式为`(Key, Value)` 的 RDD。

下面的代码详见 [PairRDDCreationApp.scala](https://github.com/Eleanora-lyh/BigDataDemoProjects/blob/main/Spark/ScalaApplicaton/spark-line-count/src/main/scala/com/example/PairRDDCreationApp.scala)

## 2.1 (Key, Value)集合—>Pair RDD

### 使用parallelize将二元组集合并行化

用`parallelize`将二元组集合`Seq(("apple", 2), ("banana", 3), ("apple", 1))`并行化

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



### 从文本文件创建 Pair RDD

如果文本文件中存储数据格式是键值对，那么读取时会直接返回`(Key, Value)`对象，此时就可以直接构造出由其键值对数据组成的 pair RDD

假设文件内容为：

```plain
alice,90
bob,85
alice,95
```

解析为 (姓名, 分数)：

```scala
val linesRDD = sc.textFile("scores.txt")//读取文件
val scorePairRDD = linesRDD.map { line =>
  val fields = line.split(",")
  val name = fields(0)
  val score = fields(1).toInt

  (name, score)
}
val totalScores = scorePairRDD.reduceByKey(_ + _)
```

输出

```plain
(alice,185)
(bob,85)
```

## 2.2 普通 RDD —> Pair RDD

这里分为两种构造形式，分别使用转换操作`map()`和`keyBy()`，先举例子看下分别怎么使用

### map()

用`map`将普通 RDD 转成 Pair RDD，这里`map`的函数可以自定义

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

通常用来统计文字出现的次数（有简写方式）

```scala
val words = sc.parallelize(Seq("spark", "scala", "spark"), numSlices = 2)
val wordPairs = words.map(word => (word, 1))
val wordCounts = wordPairs.reduceByKey((a, b) => a + b)
// 可以简写为
val wordCounts2 = words
        .map(word => (word, 1))
        .reduceByKey(_ + _)
```

当需要按分区批量初始化资源或处理数据时，也可以用`mapPartitions`返回键值对：

```scala
val pairRDD = words.mapPartitions { iterator =>
  iterator.map(word => (word, 1))
}
```

### keyBy()

使用创建 Pair RDD

如果已经有一个对象 RDD，并且想从对象中选取某个属性作为 Key，可以使用 keyBy()。

```scala
val words = sc.parallelize(Seq("spark", "scala", "spark"), numSlices = 2)
val wordsByLength: RDD[(Int, String)] = words.keyBy(word => word.length)
val keyedResult = wordsByLength.collect().sorted.toSeq
println(s"keyBy length: ${keyedResult.mkString("[", ", ", "]")}")
// keyBy length: [(5,scala), (5,spark), (5,spark)]
```

### 区别

| 操作                 | Key | Value      |
| ------------------ | --- | ---------- |
| `map(x => (k, v))` | 自定义 | 自定义        |
| `keyBy(x => k)`    | 自定义 | 固定为原元素 `x` |

- `map()` 会把**原来的整个元素作为函数参数**，然后由你自定义输出的 **Key 和 Value**：（原来的元素 x 不一定作为 Key，Key 和 Value 都可以自由定义）

```scala
rdd.map(x => (自定义Key, 自定义Value))
```

- `keyBy()` 只让你定义如何从原元素中生成 **Key**，而 **Value 一定是原来的完整元素**

```scala
rdd.map(x => (自定义Key, x))
简写为
rdd.keyBy(x => 自定义Key)
```

# 3、Pair RDD的转化操作

由于 pair RDD 中包含二元组，所以需要传递的函数应当操作二元组而不是独立的元素。（比如`map()`函数就是操作的整个二元组）

## 3.1 单个Pair RDD

（以键值对集合 `{(1, 2), (3, 4), (3, 6)}` 为例）

| 函数名                                                                     | 目的                                                             | 示例                                 | 结果                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `reduceByKey(func)`                                                     | 合并具有相同键的值                                                      | `rdd.reduceByKey((x, y) => x + y)` | `{(1, 2), (3, 10)}`                                |
| `groupByKey()`                                                          | 对具有相同键的值进行分组                                                   | `rdd.groupByKey()`                 | `{(1, [2]), (3, [4, 6])}`                          |
| `combineByKey(createCombiner, mergeValue, mergeCombiners, partitioner)` | 使用不同的返回类型合并具有相同键的值                                             | 见例 4-12 到例 4-14                    |                                                    |
| `mapValues(func)`                                                       | 对 pair RDD 中的每个值应用一个函数，而不改变键                                   | `rdd.mapValues(x => x + 1)`        | `{(1, 3), (3, 5), (3, 7)}`                         |
| `flatMapValues(func)`                                                   | 对 pair RDD 中的每个值应用一个返回迭代器的函数，然后对返回的每个元素都生成一个对应原键的键值对记录。通常用于符号化 | `rdd.flatMapValues(x => (x to 5))` | `{(1, 2), (1, 3), (1, 4), (1, 5), (3, 4), (3, 5)}` |
| `keys()`                                                                | 返回一个仅包含键的 RDD                                                  | `rdd.keys()`                       | `{1, 3, 3}`                                        |
| `values()`                                                              | 返回一个仅包含值的 RDD                                                  | `rdd.values()`                     | `{2, 4, 6}`                                        |
| `sortByKey()`                                                           | 返回一个根据键排序的 RDD                                                 | `rdd.sortByKey()`                  | `{(1, 2), (3, 4), (3, 6)}`                         |

### 3.1.1 聚合操作

之前讲解过基础 RDD 上的 `fold()`、`combine()`、`reduce()` 等行动操作，pair RDD 上也有相应的针对键的转化操作。

- 基础 RDD 的 `reduce()`、`fold()`、`aggregate()` 是对**整个 RDD**进行聚合，最终通常得到一个结果；

- Pair RDD 的 `reduceByKey()`、`foldByKey()`、`aggregateByKey()`、`combineByKey()` 则是按照 **Key 分组**，分别聚合每个 Key 对应的 Value。

假设有一个 Pair RDD，记录不同商品的销售额

```scala
val sales = sc.parallelize(
  Seq(
    ("Apple", 10),
    ("Banana", 20),
    ("Apple", 30),
    ("Banana", 40)
  )
)
```

通过下面的操作，可以得到总销售额、整体平均值

| 操作                                  | 验证结果                             |
| ----------------------------------- | -------------------------------- |
| `reduce()`、`fold()`                 | 总销售额 `100`                       |
| `reduceByKey()`、`foldByKey()`       | Apple：`40`，Banana：`60`           |
| `aggregate()`                       | `(100, 4)`，整体平均值 `25.0`          |
| `aggregateByKey()`、`combineByKey()` | Apple：`(40, 2)`，Banana：`(60, 2)` |
| 两种聚合后的 `mapValues()`                | Apple：`20.0`，Banana：`30.0`       |

下面的代码详见 [PairRDDCollectinoOperation](https://github.com/Eleanora-lyh/BigDataDemoProjects/blob/main/Spark/ScalaApplicaton/spark-line-count/src/main/scala/com/example/PairRDDCollectinoOperation)

#### reduceByKey()

基础 RDD 的 `reduce()`不关心 Key，它会把**整个 RDD** 做一次聚合，即将所有销售额合并成一个值，即 `10 + 20 + 30 + 40 = 100`

```scala
val total = sales.values.reduce((x, y) => x + y) //可以简写sales.values..reduce(_ + _)
//[info] sales = [(Apple,10), (Banana,20), (Apple,30), (Banana,40)]
//[info] reduce: total sales: 100
```

Pair RDD 的 `reduceByKey()`会针对 **每个 Key** 分别做一次聚合，即`Apple  → 10 + 30 = 40;Banana → 20 + 40 = 60`

```scala
val result = sales.reduceByKey((x, y) => x + y) //可以简写为sales.reduceByKey(_ + _)
[info] reduceByKey: totals: WrappedArray((Apple,40), (Banana,60))
```

#### foldByKey()

基础 RDD 的 `fold()` 需要提供一个初始值(零值)，**整个 RDD** 使用零值进行聚合

> 在分布式计算中，`fold()` 的零值会参与每个分区内部的计算，也会参与分区结果的合并。因此，零值通常应满足：`op(zeroValue, x) = x`（例如，加法使用 0，乘法使用1）

```scala
val total = sales.values.fold(0)((x, y) => x + y)
// [info] fold: total sales: 100
// 计算过程是 (0 + 10 + 20 + 30 + 40 = 100)
```

Pair RDD 的 `foldByKey()`会针对**每个 Key** 使用零值进行聚合，相当于对每个 Key 分别执行一次 `fold()`

```scala
val result = sales.foldByKey(0)((x, y) => x + y)
[info] foldByKey: totals: WrappedArray((Apple,40), (Banana,60))
```

逻辑上可以理解为：

```Plain Text
Apple → 0 + 10 + 30 = 40
Banana → 0 + 20 + 40 = 60
```

#### aggregateByKey()

基础 RDD 的 `aggregate()` 可以针对一个元素统计两个数值`(sum, count)`

```scala
// result得出的是针对10,20,30,40的sum和count
val result = sales.values.aggregate((0, 0))(
  (acc, value) => (acc._1 + value, acc._2 + 1),
  (left, right) => (left._1 + right._1, left._2 + right._2)
)

//average=100/4=25
val average = result._1.toDouble / result._2

[info] aggregate: (sum, count): (100,4)
[info] aggregate: average: 25.0
```

Pair RDD 的 `aggregateByKey()`

```scala
val result = sales.aggregateByKey((0, 0))(
  (acc, value) => (acc._1 + value, acc._2 + 1),
  (left, right) => (left._1 + right._1, left._2 + right._2)
)
val averages = result.mapValues {
  case (sum, count) => sum.toDouble / count
}
[info] aggregateByKey: (sum, count): WrappedArray((Apple,(40,2)), (Banana,(60,2)))
[info] aggregateByKey + mapValues: averages: WrappedArray((Apple,20.0), (Banana,30.0))
```

`result `得到的是Key分区下的`(sum, count)`结果

```plain text
("Apple",  (40, 2))
("Banana", (60, 2))
```

`averages`取出后面的Values`(sum, count)`，再重新映射返回每个 Key 的平均值

```plain text
(40, 2) -> 40/2=20
(60, 2) -> 60/2=30
```

所以最后返回

```plain text
(Apple,20.0), (Banana,30.0)
```

#### combineByKey()

```plain text
reduceByKey : 无零值 + 分区内外使用相同函数
    ↓ 增加初始值
foldByKey : 固定零值 + 分区内外使用相同函数
    ↓ 允许聚合结果与 Value 类型不同，并区分分区内和分区间函数
aggregateByKey : 固定零值 + 分区内外使用不同函数
    ↓ 不直接提供固定初始值，而是从每个 Key 的第一个 Value 创建聚合器
combineByKey : 根据第一个 Value 动态创建聚合器 + 分区内外使用不同函数
```

总结

| 操作               | 理解                                                                  | 特点                             |
| ---------------- | ------------------------------------------------------------------- | ------------------------------ |
| `reduceByKey`    | 对每个 Key 的 Value 使用同一个函数进行聚合                                         | 无初始值，分区内外使用相同函数，输入输出类型相同       |
| `foldByKey`      | 对每个 Key 的 Value 进行聚合，并提供一个与 Value 同类型的初始值                           | **有固定初始值**，分区内外使用相同函数，输入输出类型相同 |
| `aggregateByKey` | 为每个 Key 提供初始聚合值，并分别定义分区内聚合`seqOp`和分区间合并`combOp`，聚合结果可以与原 Value 类型不同 | 有固定初始值，**分区内外使用不同函数，输入输出类型不同** |
| `combineByKey`   | 为每个 Key 从第一个 Value 创建中间聚合器，再定义 Value 如何加入聚合器，以及不同分区的聚合器如何合并         | **有可变初始值**，分区内外使用不同函数，输入输出类型不同 |

`combineByKey` 一共有三个函数，允许你**完全自定义三件事**：

1. `createCombiner`用某个 Key 的第一个 Value 创建中间聚合器，解决**如何为“第一次出现的 Key”创建初始的累加值**
2. `mergeValue` 在分区内，将后续 Value 合并进中间聚合器，解决**如何在同一个分区内合并值**
3. `mergeCombiners`  合并不同分区的中间聚合器，解决**如何跨分区合并分区结果**

```scala
def combineByKey[C](
  createCombiner: V => C, //每个分区的每个Key只执行一次
  mergeValue: (C, V) => C, //每个分区的Key执行多次
  mergeCombiners: (C, C) => C //shuffle 后的跨分区合并多个相同的Key
): RDD[(K, C)]
```

举例如下

```scala
// createCombiner：每个分区中某 key 的第一个 value 创建 (销售额, 1)，即各个分区Key销售额初始值为value，累加器初始值为1。
 // mergeValue：把该分区中同 key 的后续 value 加入累加器。
 // mergeCombiners：合并不同分区中同 key 的累加器。
val combined: RDD[(String, (Int, Int))] = sales.combineByKey[(Int, Int)](
        (value: Int) => (value, 1),
        (acc: (Int, Int), value: Int) => (acc._1 + value, acc._2 + 1),
        (left: (Int, Int), right: (Int, Int)) =>
          (left._1 + right._1, left._2 + right._2)
      )
val averages = combined.mapValues { case (sum, count) => sum.toDouble / count }
//[info] combineByKey: (sum, count): WrappedArray((Apple,(40,2)), (Banana,(60,2)))
//[info] combineByKey + mapValues: averages: WrappedArray((Apple,20.0), (Banana,30.0))
```

这时你可能会有疑惑，这不就是之前使用`aggregateByKey`统计平均值的做法：

```scala
val result = sales.aggregateByKey((0, 0))(
  (acc, value) => (acc._1 + value, acc._2 + 1),
  (left, right) => (left._1 + right._1, left._2 + right._2)
)
val averages = result.mapValues {
  case (sum, count) => sum.toDouble / count
}
```

没错，这是因为这个例子使用combineByKey时使用的初始值刚好和aggregateByKey的(0,0)效果等价，实际上`combineByKey`可以使用更复杂函数来的初始值。

可以理解成 “aggregateByKey 是 combineByKey 的语法糖，底层完全一样，只是把 createCombiner 封装成了 zeroValue + seqOp。”

### 3.1.2 数据分组



### 3.1.3 连接

### 3.1.4 数据排序

## 3.2 两个pair RDD

（以键值对集合 `rdd = {(1, 2), (3, 4), (3, 6)}` ，`other = {(3, 9)}`为例）

| 函数名              | 目的                                    | 示例                          | 结果                                                       |
| ---------------- | ------------------------------------- | --------------------------- | -------------------------------------------------------- |
| `subtractByKey`  | 删掉 RDD 中键与 other RDD 中的键相同的元素         | `rdd.subtractByKey(other)`  | `{(1, 2)}`                                               |
| `join`           | 对两个 RDD 进行内连接                         | `rdd.join(other)`           | `{(3, (4, 9)), (3, (6, 9))}`                             |
| `rightOuterJoin` | 对两个 RDD 进行连接操作，确保第一个 RDD 的键必须存在（右外连接） | `rdd.rightOuterJoin(other)` | `{(3, (Some(4), 9)), (3, (Some(6), 9))}`                 |
| `leftOuterJoin`  | 对两个 RDD 进行连接操作，确保第二个 RDD 的键必须存在（左外连接） | `rdd.leftOuterJoin(other)`  | `{(1, (2, None)), (3, (4, Some(9))), (3, (6, Some(9)))}` |
| `cogroup`        | 将两个 RDD 中拥有相同键的数据分组到一起                | `rdd.cogroup(other)`        | `{(1, ([2], [])), (3, ([4, 6], [9]))}`                   |

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
