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

（以键值对集合 `rdd = {(1, 2), (3, 4), (3, 6)}` ，`other = {(3, 9)}`为例）

| 函数名              | 目的                                    | 示例                          | 结果                                                       |
| ---------------- | ------------------------------------- | --------------------------- | -------------------------------------------------------- |
| `subtractByKey`  | 删掉 RDD 中键与 other RDD 中的键相同的元素         | `rdd.subtractByKey(other)`  | `{(1, 2)}`                                               |
| `join`           | 对两个 RDD 进行内连接                         | `rdd.join(other)`           | `{(3, (4, 9)), (3, (6, 9))}`                             |
| `rightOuterJoin` | 对两个 RDD 进行连接操作，确保第一个 RDD 的键必须存在（右外连接） | `rdd.rightOuterJoin(other)` | `{(3, (Some(4), 9)), (3, (Some(6), 9))}`                 |
| `leftOuterJoin`  | 对两个 RDD 进行连接操作，确保第二个 RDD 的键必须存在（左外连接） | `rdd.leftOuterJoin(other)`  | `{(1, (2, None)), (3, (4, Some(9))), (3, (6, Some(9)))}` |
| `cogroup`        | 将两个 RDD 中拥有相同键的数据分组到一起                | `rdd.cogroup(other)`        | `{(1, ([2], [])), (3, ([4, 6], [9]))}`                   |

## 3.1 聚合操作

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

### reduceByKey()

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

### foldByKey()

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

```Plain
Apple → 0 + 10 + 30 = 40
Banana → 0 + 20 + 40 = 60
```

### aggregateByKey()

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

```plain
("Apple",  (40, 2))
("Banana", (60, 2))
```

`averages`取出后面的Values`(sum, count)`，再重新映射返回每个 Key 的平均值

```plain
(40, 2) -> 40/2=20
(60, 2) -> 60/2=30
```

所以最后返回

```plain
(Apple,20.0), (Banana,30.0)
```

### combineByKey()

```plain
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

## 3.2 数据分组

需要注意：上面的聚合需要让同一个 Key 的数据最终参与同一组计算，**但 Spark 不需要先把每个 Key 的所有 Value 完整收集成集合**。实际上是在每个分区内部进行局部Key聚合再通过Shuffle将所有分区的数据汇集到Driver后再将各个局部结果合并。

### groupByKey()

`groupByKey()` 才是真正把 Value 分组出来的操作，按 key 收集所有 value，演示重复值保留、组内顺序不保证。

```scala
val grouped = rdd.groupByKey()
```

返回值类型：

```scala
RDD[(String, Iterable[Int])]
```

```scala
val result = rdd
  .groupByKey()
  .mapValues(values => values.sum)
// 虽然功能一致，但是二者效率不同
val result = rdd.reduceByKey(_ + _)
```

前者的过程如下

```plain
所有 Value 经过 Shuffle 
        ↓
形成 Key → Iterable[Value]：A → [10, 20, 30]; B → [5, 15]
        ↓
对 Iterable 求和：A → 60;B → 20
```

后者的过程如下

```plain
分区内先局部聚合
        ↓
Shuffle 局部聚合结果
        ↓
分区间继续聚合
```

它不需要生成完整的 `Iterable[Value]`，所以速度更快

### cogroup()

`groupByKey()` 主要对**一个 Pair RDD**按照 Key 分组。

`cogroup()` 则可以对**多个 Pair RDD**按照 Key 分组，并且分别保留每个 RDD 的 Value 集合。

假设有两组PairRDD，分别表示学生的成绩和兴趣，如下

```plain
scores = [(Alice,80), (Bob,70), (Alice,90), (Bob,70), (Cindy,100)]
clubs = [("Alice", "Chess"), ("Alice", "Music"), ("Bob", "Sports"), ("David", "Art")]
```

我们想得到所有的分数集合和兴趣集合就可以使用`cogroup()`

```scala
val cogrouped: RDD[(String, (Iterable[Int], Iterable[String]))] = scores.cogroup(clubs)
```

输出中每一个Key，都有两组合并后的Value（记录了来自哪个 RDD）

```scala
//[info] cogroup: (scores, clubs): WrappedArray((Alice,(List(80, 90),List(Chess, Music))), (Bob,(List(70, 70),List(Sports))), (Cindy,(List(100),List())), (David,(List(),List(Art))))
```

整理一下就是

```plain
Alice → List(80, 90),List(Chess, Music)
Bob → List(70, 70),List(Sports)
Cindy → List(100),List()
David → List(),List(Art)
```

## 3.3 连接

Spark 对 `PairRDD[(K, V)]` 提供了类似 SQL 的 Join 操作，本质都是：

> **按照 Key 进行 Shuffle，然后把相同 Key 的数据拉到一起拼接**

`join()` 可以在概念上理解为：先 cogroup再对两边的 Value 做笛卡尔组合

```plain
sales：A → [10, 20]
costs：A → [7, 8]
```

执行 `sales.join(costs)` 后在概念上为

```plain
cogroup：
A → ([10, 20], [7, 8])

展开组合：
10 × 7
10 × 8
20 × 7
20 × 8

最的得到：
(A, (10, 7))
(A, (10, 8))
(A, (20, 7))
(A, (20, 8))
```

因此一个 Key 在两侧都有多个 Value 时，`join()` 可能产生很多结果：

左侧有 M 个 Value，右侧有 N 个 Value => 结果数量 = M × N

---

常见连接类型：

| 操作                   | 等价 SQL          | 说明          |
| -------------------- | --------------- | ----------- |
| 内连接`join`            | INNER JOIN      | 只保留两边都有 Key |
| 左外连接`leftOuterJoin`  | LEFT JOIN       | 左表全保留       |
| 右外连接`rightOuterJoin` | RIGHT JOIN      | 右表全保留       |
| 全连接`fullOuterJoin`   | FULL OUTER JOIN | 两边都保留       |
| 交叉连接`cogroup`        | 多 Key 聚合        | 不拼接值，而是分组   |

写法

```scala
scores.join(clubs)
scores.leftOuterJoin(clubs)
scores.rightOuterJoin(clubs)
scores.fullOuterJoin(clubs)
scores.cogroup(clubs)
```

## 3.4 数据排序

Pair RDD 的排序可以分成两类：**按 Key 排序**和**按自定义规则排序**。另外还有一种常见需求是只获取最大或最小的前 N 条数据。

| 排序方式            | 排序依据       | 返回结果 | 是否全局有序     | 是否触发 Shuffle |
| --------------- | ---------- | ---- | ---------- | ------------ |
| `sortByKey()`   | Key        | RDD  | 是          | 是            |
| `sortBy()`      | 自定义函数返回的值  | RDD  | 是          | 是            |
| `takeOrdered()` | 自定义排序规则    | 本地数组 | 是，只返回前 N 条 | 通常不进行全局排序    |
| `top()`         | 自定义排序规则    | 本地数组 | 是，只返回前 N 条 | 通常不进行全局排序    |
| 分区内排序           | Key 或自定义字段 | RDD  | 否，仅分区内有序   | 取决于实现        |

假设有一个 Pair RDD

```scala
val rdd = sc.parallelize(
  Seq(
     (3, "a"), (1, "b"), (2, "c"),(2, "d"), (5, "e")
  )
)
```

### sortByKey()

`sortByKey()` 要求 Key 是可排序的类型，默认是升序，返回Key整体有序的RDD

```scala
def sortByKey(
  ascending: Boolean = true,
  numPartitions: Int = self.partitions.length,
  partitioner: Partitioner = null
): RDD[(K, V)]
```

- 三个参数 **同时生效**
- `partitioner` 优先级最高
- `numPartitions` 仅在 `partitioner == null` 时生效
- `ascending` 只影响排序方向

```scala
import org.apache.spark.HashPartitioner

val rdd = sc.parallelize(Seq(
  (3, "a"), (1, "b"), (2, "c"),
  (2, "d"), (5, "e")
))
//
val sortByKeyInPartition = rdd.sortByKey(
  ascending = false,
  numPartitions = 4,
  partitioner = new HashPartitioner(2)
)
result.collect().foreach(println)
```

从**执行逻辑**看，顺序是：

✅ 第一步：确定 Partitioner（分区规则）

` partitioner = new HashPartitioner(2)`不为null，所以`numPartitions = 4` 被忽略

✅ 第二步：map 端按 partitioner 分桶（Shuffle）

| 分区器                | 主要目的           | 特点                     |
| ------------------ | -------------- | ---------------------- |
| `HashPartitioner`  | 按 Key 聚合、分组或连接 | 相同 Key 进入相同分区，但不保证大小顺序 |
| `RangePartitioner` | 按 Key 排序       | 按 Key 范围分区，使分区之间也有顺序   |
| `自定义 partitioner`  | 按你的规则          |                        |

按`HashPartitioner(2)`计算hash值后分为两个桶（此时完全没有排序）

| Partition | Keys                |
| --------- | ------------------- |
| 0         | (2,d), (2,c)        |
| 1         | (1,b), (3,a), (5,e) |

✅ 第三步： reduce 阶段 分区内排序（才用到 ascending）

每个 reduce task 内执行 `ExternalSorter.sort(ascending)`（**ascending 永远只影响“分区内排序”**）

- `ascending = true` → 升序
- `ascending = false` → 降序

| Partition | Keys                |
| --------- | ------------------- |
| 0         | (2,c), (2,d)        |
| 1         | (5,e), (3,a), (1,b) |

最终输出结果：分区内降序而不是全局降序

```plain
(2,c)
(2,d)
(5,e)
(3,a)
(1,b)
```

如果想全局降序 + 4 个分区，则不要声明` partitioner = new HashPartitioner(2)`，默认会使用`RangePartitioner(4)`

```scala
val sortByKeyInPartition = rdd.sortByKey(
  ascending = true,
  numPartitions = 4
)
```

Spark 会：

1. 创建 `RangePartitioner(4)`
2. 按 key 范围 shuffle
3. 每个 partition 内降序排序
4. 得到 **全局降序**

### sortBy()

sortBy() 并不是 Pair RDD 独有的方法，普通 RDD 也可以使用。它允许通过函数指定排序依据。

```scala
def sortBy[K](
  f: T => K, //排序字段提取函数
  ascending: Boolean = true, //是否升序
  numPartitions: Int = this.partitions.length //分区数
)(implicit ord: Ordering[K]): RDD[T]
```

- `f: T => K` 指的就是从元素中提取用于排序的字段，可以自定义，所以`sortBy()`可以适配任何的排序规则

- `ascending: Boolean = true` 是针对整体的排序，如果排序字段是Key+Value，那么会先按第一个字段升序，第一个相等时再按第二个字段升序排（如果想分别控制则必须使用下面介绍的`ord`参数）

- `ord: Ordering[K]` 可以定义每个字段的排序规则。默认是`Ordering.Tuple2(ord1, ord2)`即先按第一个字段排，第一个相等时再按第二个字段排（详见例3）
  
  - 升序：`ord1/odr2`=`Ordering.String`
  
  - 降序：`ord1/odr2`=`Ordering.String.reverse`

举例1：下面是三种等价的**按 Value 升序**(不写`ascending`默认是升序)

```scala
//写法1：对每条 (key, value)，提取 value 作为排序键，再按 value 排序
val sortByValueAsc = rdd.sortBy {
  case (key, value) => value
}

//写法2：可以使用匿名参数占位符简写为： _._2 表示“取元组的第二个元素”，也就是 value
val sortByValueAscAbb = rdd.sortBy(_._2)

//写法3：普通 lambda，显式命名参数
val sortByValueAscLam = rdd.sortBy(pair => pair._2)
```

举例2：**按 Value 降序**

```scala
val sortByValueDesc = rdd.sortBy(
  pair => pair._2,
  ascending = false
)
```

举例3：**按 Key 升序再按 Value 降序** (利用`Ordering`)

```scala
// 写法1：通过参数定义Ordering
val sortByKeyAscValueDesc1 = rdd.sortBy(
  pair => (pair._1, pair._2),          // 排序依据
  ascending = true                // 整体升序
)(Ordering.Tuple2(
   Ordering.String,               // key: 升序
   Ordering.Int.reverse           // value: 降序
))
//(1,b),(2,d),(2,c),(3,a),(5,e)

// 写法2：提取 Ordering 为变量
val ordering = Ordering.Tuple2(
  Ordering.Int,               // key: 升序
  Ordering.Int.reverse        // value: 降序
)
val sortByKeyAscValueDesc2 = rdd.sortBy(
  pair => (pair._1, pair._2),
  ascending = true
)(ordering)

// 写法3：定义为隐式 Ordering传入
implicit val ordering: Ordering[(Int, Int)] = Ordering.Tuple2(
  Ordering.Int,
  Ordering.Int.reverse
)
// 自动使用隐式 Ordering
val sortByKeyAscValueDesc3 = rdd.sortBy(pair => (pair._1, pair._2))
```

按照除了使用`ord`参数，针对此次操作的pairRDD还有个意想不到的实现方式，**用反转降序模拟升序**

```scala
val sortByKeyAscValueDesc4 = rdd.sortBy(
  pair => (-pair._1, pair._2),          // 排序依据时将Key变为-Key
  ascending = false                // 整体降序
)
```

过程如下

```scala
input如下，排序依据是-pair._1，同时整体降序 等价 Key 升序
(3, "a"), (1, "b"), (2, "c"),(2, "d"), (5, "e")
反转后得到
(-3, "a"), (-1, "b"), (-2, "c"),(-2, "d"), (-5, "e")
整体降序排列得到
(-1, "b"), (-2, "d"), (-2, "c"), (-3, "a"), (-5, "e")
```

> 需要注意：
> 
> 非数值字段不能“反转”
> 
> 极端情况会有溢出风险 Int.MinValue // 负值会溢出### 多字段排序假设数据结构是

### takeOrdered(n) / top(n)

如果不需要完整的有序 RDD，只想取得**最小/大的 N 条数据**，可以使用`takeOrdered(n)/top(n)`，等价于`sortByKey(false).take(n)`

方法定义如下（两者都返回 `Array[T]`（Driver 端内存），不是 RDD）

```scala
// takeOrdered: 取最小的 n 个等价于 sortByKey(true).take(n)
def takeOrdered(num: Int)(implicit ord: Ordering[T]): Array[T]

// top: 取最大的 n 个，等价于 sortByKey(false).take(n)
def top(num: Int)(implicit ord: Ordering[T]): Array[T]
```

举例：

```scala
val rdd = sc.parallelize(
  List(("b", 2), ("a", 3), ("a", 1), ("b", 1), ("a", 2))
)
val takeMin2 = rdd.takeOrdered(2)(
  Ordering.by_._1
)
val takeMax3 = rdd.top(3)(
  Ordering.by_._1
)
//返回类型不是 RDD，而是 Driver 端的数组Array[(String, Int)]
```

内部执行逻辑：

假设总数为N个，需要取出最大的n个元素，一共M个分区

1）每个分区内维护一个容量为n的有界优先队列（小顶堆），遍历所有元素时更新堆

- 当前元素不够大：通常只与堆顶比较，$O(1)$
- 当前元素进入 Top n：删除堆顶并插入新元素，$O(log n)$

2）理想状态下M个分区对应了M 个可并行运行的 Task 槽位，那么各个分区都可以并行计算，每个分区内部的元素数为 N/M，那么此时单个分区的最坏时间复杂度是：$ O\left(\frac{N}{M} \log n\right) $

3）M个分区各自独立取出 Top n后，会得到 M*n 个候选值，此时继续使用容量为N的有界优先队列取Top n，合并阶段的复杂度就为 $O(M*n logn)$

4）如果写了Ordering 最后还可能需要把最终 n 个元素按照结果顺序排列，返回 Driver，复杂度为$O(nlogn)$

综上得到整体复杂度 ：

$$
O\left(\frac{N}{M} \log n\right) + O(M*n logn) + O(nlogn) = O(\frac{N}{M} \log n + M*n logn + nlogn)
$$

当n是很小的固定常量时，可以简化为 $ O\left(\frac{N}{M} + nM\right)   $

```plain text
分区 1: top(3) → [a1, a2, a3]
分区 2: top(3) → [b1, b2, b3]
分区 3: top(3) → [c1, c2, c3]
        ↓
  全局 top(3) → 从 9 个候选中选最大的 3 个
```

# 4、Pair RDD的行动操作

和转化操作一样，所有基础 RDD 支持的传统行动操作也都在 pair RDD 上可用。Pair RDD 提供了一些额外的行动操作，可以让我们充分利用数据的键值对特性。

（以键值对集合 `{(1, 2), (3, 4), (3, 6)}` 为例）

| 函数               | 描述                                | 示例                   | 结果                            |
| ---------------- | --------------------------------- | -------------------- | ----------------------------- |
| `countByKey()`   | 统计的是 **每个 key 出现的次数**             | `rdd.countByKey()`   | `{(1, 1), (3, 2)}`            |
| `collectAsMap()` | 将结果**以映射表的形式返回**，相同 key 只会保留最后一个值 | `rdd.collectAsMap()` | `Map(1 -> 2, 3 -> 4, 3 -> 6)` |
| `lookup(key)`    | 返回的是该 key 对应的 **所有 value 组成的序列**  | `rdd.lookup(3)`      | `[4, 6]`                      |

# 5、数据分区

控制数据分布减少网络传输可以极大地提升整体性能。就像单节点的程序为记录集合需要选择合适的数据结构一样，**Spark 程序可以通过一个键函数对元素进行分组，进而控制 RDD 分区方式来减少通信开销**。

但并不是在任何情况都需要分区——比如，如果给定 RDD 只需要被扫描一
次，我们完全没有必要对其预先进行分区处理。只有数据集需要**多次基于键操作**时（如连接），分区才会有帮助。

## 5.1 案例引入

案例背景：

一张很大的用户信息表 (UserID, UserInfo)，UserInfo 包含一个该用户所订阅的主题的列表topics。

一个小文件记录了过去五分钟内某网站各用户发生的事件: (UserID, LinkInfo) 

有这样一个应用，需要周期性地统计用户访问其未订阅主题的页面情况

```scala
// 初始化代码；从HDFS商的一个Hadoop SequenceFile中读取用户信息
// userData中的元素会根据它们被读取时的来源，即HDFS块所在的节点来分布
// Spark此时无法获知某个特定的UserID对应的记录位于哪个节点上

val sc = new SparkContext(...)
val userData = sc.sequenceFile[UserID, UserInfo]("hdfs://...").persist()

// 周期性调用函数来处理过去五分钟产生的事件日志
// 假设这是一个包含(UserID, LinkInfo)对的SequenceFile
def processNewLogs(logFileName: String) {
    //读取事件文件
    val events = sc.sequenceFile[UserID, LinkInfo](logFileName)
    // 通过join过滤得到用户订阅的主题事件
    // RDD of (UserID, (UserInfo,LinkInfo)) pairs
    val joined = userData.join(events)
    // joined和events对比得到用户没有订阅的主题事件链接
    val offTopicVisits = joined.filter {
        // Expand the tuple into its components
        case (userId, (userInfo, linkInfo)) => 
            !userInfo.topics.contains(linkInfo.topic)
     }.count()
    println("Number of visits to non-subscribed topics: " + offTopicVisits)
}
```

这段代码可以正确运行，但是不够高效。这是因为在每次调用 `processNewLogs()` 时都会用到 `join()` 操作，而我们对数据集是如何分区的却一无所知。

默认情况下，连接操作会

- 将两个数据集中的所有键的哈希值都求出来，将该哈希值相同的记录通过网络传到同一台机器上

- 然后在那台机器上对所有键相同的记录进行连接操作



因为 userData表比每五分钟出现的访问日志表 events 要大得多，所以要浪费时间做很多
额外工作：在每次调用时都对 userData 表进行哈希值计算和跨节点数据混
洗，虽然这些数据从来都不会变化。

## 5.2 获取RDD的分区方式

## 5.3 从分区中获益的操作

## 5.3 实例PageRanl

## 5.4 自定义分区分啊故事
