---
title: "Windows 使用 Docker Compose 搭建 Hive 4.1.0 + MySQL 持久化环境"
date: 2026-06-01T22:12:03+08:00
draft: false
tags: ["Hive", "Docker", "Docker Compose", "Metastore"]
categories: ["Hive"]
description: "记录在 Windows 本机通过 Docker Compose 搭建 HiveServer2、Hive Metastore 和 MySQL Metastore DB，并实现 Hive 元数据与表数据持久化的本地学习环境。"
---

# Windows 使用 Docker Compose 搭建 Hive 4.1.0 + MySQL 持久化环境

这篇笔记记录一套适合本地学习的 Hive 环境：在 Windows 本机通过 Docker Compose 一次性启动 **HiveServer2 + Hive Metastore + MySQL Metastore DB**，并支持 Beeline 和 DBeaver 连接。

目标不是搭建生产级 Hadoop 集群，而是为了学习：

- Hive SQL
- database、table、partition、insert、join、group by、窗口函数
- ODS、DWD、DWS、ADS 离线数仓分层
- Hive 元数据、表数据和持久化的基本关系

---

## 1. 为什么用 Docker 而不是 VMware

使用 VMware 从零创建虚拟机，需要自己安装 Linux、Java、Hadoop、Hive、MySQL，并处理大量环境变量、网络、权限和服务启动顺序。这个过程更接近完整集群搭建，适合学习 Hadoop 运维，但对刚开始学习 Hive SQL 来说成本偏高。

Docker 更适合当前阶段：

| 方式             | 优点                                            | 缺点                    | 适合场景                           |
| -------------- | --------------------------------------------- | --------------------- | ------------------------------ |
| VMware 虚拟机     | 更接近真实 Linux 服务器；可完整体验 Hadoop/Hive 安装过程        | 配置步骤多；占用资源较大；排错成本高    | 学习集群安装、Linux 运维、生产环境结构         |
| Docker Compose | 一条命令启动多个服务；环境可删除重建；配置集中在 `docker-compose.yml` | 不等于真实生产集群；部分底层细节被镜像封装 | 本地快速学习 Hive SQL、Metastore、数仓分层 |

所以这里选择 Docker Compose：先把 Hive 跑起来，尽快进入 SQL 和数仓建模练习。

---

## 2. 为什么使用 HiveServer2 + Metastore + MySQL

Hive 的核心可以拆成三部分：

| 组件                 | 本文容器名            | 作用                             |
| ------------------ | ---------------- | ------------------------------ |
| HiveServer2        | `hive4`          | 对外提供 JDBC/Beeline/DBeaver 查询入口 |
| Hive Metastore     | `hive-metastore` | 管理 Hive 元数据，例如库、表、字段、分区、表数据位置  |
| MySQL Metastore DB | `hive-mysql`     | 持久化保存 Metastore 元数据            |

这套结构比单容器 Hive 更稳定，也更接近真实使用方式。

| 方案                              | 元数据保存位置      | 表数据保存位置                 | 特点                  |
| ------------------------------- | ------------ | ----------------------- | ------------------- |
| 单容器 Hive + 内置 Derby             | 容器内部 Derby   | 容器或 volume 中的 warehouse | 最简单，但删除容器后元数据容易丢失   |
| HiveServer2 + Metastore + MySQL | MySQL volume | warehouse volume        | 元数据和表数据都能持久化，适合长期学习 |

本文采用：

```text
Windows / DBeaver / Beeline
        |
        | jdbc:hive2://localhost:10000
        v
HiveServer2 容器 hive4
        |
        | thrift://hive-metastore:9083
        v
Hive Metastore 容器 hive-metastore
        |
        | jdbc:mysql://mysql:3306/hive_metastore
        v
MySQL 容器 hive-mysql
```

持久化分两部分：

| 持久化对象     | Docker volume    | 容器内路径                      | 保存内容                       |
| --------- | ---------------- | -------------------------- | -------------------------- |
| MySQL 元数据 | `mysql-data`     | `/var/lib/mysql`           | Hive 的库、表、字段、分区等元数据        |
| Hive 表数据  | `warehouse-data` | `/opt/hive/data/warehouse` | Hive managed table 的实际数据文件 |

---

## 3. 初始准备

需要先安装并启动：

1. Docker Desktop for Windows
2. DBeaver，可选，但推荐用于图形化连接 Hive
3. PowerShell 或 CMD

检查 Docker 是否可用：

```powershell
docker --version
docker compose version
```

如果能看到版本号，说明 Docker 和 Compose 可用。

---

## 4. 创建 Compose 项目目录

建议单独建一个目录保存 Docker Compose 配置和 JDBC 驱动：

```powershell
mkdir C:\Users\v-liuyuhang\source\repos\MyPro\docker-hive4
cd C:\Users\v-liuyuhang\source\repos\MyPro\docker-hive4
```

最终目录结构：

```text
docker-hive4
├── docker-compose.yml
└── mysql-connector-j-8.4.0.jar
```

为什么要单独建目录：Docker Compose 默认读取当前目录下的 `docker-compose.yml`，并以当前目录作为一个独立项目来创建容器、网络和 volume。

---

## 5. 下载 MySQL JDBC Driver

Hive Metastore 是 Java 程序，连接 MySQL 需要 MySQL JDBC Driver。否则容易出现：

```text
ClassNotFoundException: com.mysql.cj.jdbc.Driver
No suitable driver found for jdbc:mysql://...
```

在 Compose 项目目录中执行：

```powershell
Invoke-WebRequest `
  -Uri "https://repo1.maven.org/maven2/com/mysql/mysql-connector-j/8.4.0/mysql-connector-j-8.4.0.jar" `
  -OutFile "mysql-connector-j-8.4.0.jar"
```

下载完成后检查文件：

```powershell
dir
```

应该能看到：

```text
docker-compose.yml
mysql-connector-j-8.4.0.jar
```

如果此时还没创建 `docker-compose.yml`，只看到 jar 文件也正常。

---

## 6. 创建 docker-compose.yml

在 Compose 项目目录中创建文件：

```powershell
notepad docker-compose.yml
```

写入下面内容：

```yaml
services:
  mysql:
    image: mysql:8.4
    container_name: hive-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: hive_metastore
      MYSQL_USER: hive
      MYSQL_PASSWORD: hive
    ports:
      - "3307:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    command:
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h localhost -uroot -proot || exit 1"]
      interval: 10m
      timeout: 5s
      retries: 20
      start_interval: 180s
      start_period: 180s

  hive-metastore:
    image: apache/hive:4.1.0
    container_name: hive-metastore
    restart: unless-stopped
    depends_on:
      mysql:
        condition: service_healthy
    environment:
      SERVICE_NAME: metastore
      DB_DRIVER: mysql
      SERVICE_OPTS: >
        -Djavax.jdo.option.ConnectionDriverName=com.mysql.cj.jdbc.Driver
        -Djavax.jdo.option.ConnectionURL=jdbc:mysql://mysql:3306/hive_metastore?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
        -Djavax.jdo.option.ConnectionUserName=hive
        -Djavax.jdo.option.ConnectionPassword=hive
        -Dhive.metastore.warehouse.dir=/opt/hive/data/warehouse
        -Dhive.metastore.server.min.threads=20
        -Dhive.metastore.server.max.threads=200
    ports:
      - "9083:9083"
    volumes:
      - warehouse-data:/opt/hive/data/warehouse
      - ./mysql-connector-j-8.4.0.jar:/opt/hive/lib/mysql-connector-j-8.4.0.jar
    healthcheck:
      test: ["CMD-SHELL", "bash -ec ': >/dev/tcp/127.0.0.1/9083'"]
      interval: 10m
      timeout: 5s
      retries: 20
      start_interval: 180s
      start_period: 180s

  hiveserver2:
    image: apache/hive:4.1.0
    container_name: hive4
    restart: unless-stopped
    depends_on:
      hive-metastore:
        condition: service_healthy
    environment:
      SERVICE_NAME: hiveserver2
      IS_RESUME: "true"
      SERVICE_OPTS: >
        -Dhive.metastore.uris=thrift://hive-metastore:9083
        -Dhive.server2.thrift.bind.host=0.0.0.0
        -Dhive.server2.thrift.port=10000
        -Dhive.server2.webui.host=0.0.0.0
        -Dhive.server2.webui.port=10002
    ports:
      - "10001:10000"
      - "10002:10002"
    volumes:
      - warehouse-data:/opt/hive/data/warehouse
      - ./mysql-connector-j-8.4.0.jar:/opt/hive/lib/mysql-connector-j-8.4.0.jar

volumes:
  mysql-data:
  warehouse-data:
```

---

## 7. 配置文件关键点解释

### 7.1 MySQL 服务

```yaml
mysql:
  image: mysql:8.4
  container_name: hive-mysql
```

作用：启动一个独立的 Docker MySQL，专门给 Hive Metastore 保存元数据。它不是 Windows 本机安装的 MySQL。

```yaml
environment:
  MYSQL_ROOT_PASSWORD: root
  MYSQL_DATABASE: hive_metastore
  MYSQL_USER: hive
  MYSQL_PASSWORD: hive
```

作用：MySQL 首次初始化时自动创建数据库和用户。

| 配置                               | 含义             |
| -------------------------------- | -------------- |
| `MYSQL_DATABASE: hive_metastore` | 创建 Hive 元数据库   |
| `MYSQL_USER: hive`               | 创建普通用户 `hive`  |
| `MYSQL_PASSWORD: hive`           | 设置 `hive` 用户密码 |
| `MYSQL_ROOT_PASSWORD: root`      | 设置 root 密码     |

```yaml
ports:
  - "3307:3306"
```

含义：

| 访问方向                    | 地址               |
| ----------------------- | ---------------- |
| Windows 访问 Docker MySQL | `localhost:3307` |
| Docker 容器内部访问 MySQL     | `mysql:3306`     |

如果 Windows 本机已经有 MySQL 占用 `3306`，Docker MySQL 就不能再映射 `3306:3306`，所以这里使用 `3307:3306`。

```yaml
volumes:
  - mysql-data:/var/lib/mysql
```

作用：持久化 MySQL 数据。Hive 的库、表、字段、分区等元数据最终会保存到这个 volume 中。

```yaml
healthcheck:
  test: ["CMD-SHELL", "mysqladmin ping -h localhost -uroot -proot || exit 1"]
```

作用：确认 MySQL 服务真正可连接后，再让 Metastore 启动，避免 Metastore 抢跑导致连接失败。

### 7.2 Hive Metastore 服务

```yaml
hive-metastore:
  image: apache/hive:4.1.0
  container_name: hive-metastore
```

作用：启动 Hive 元数据服务。Hive Metastore 负责管理：

- 有哪些 database
- 有哪些 table
- 表有哪些 column
- 表数据存放在哪里
- 表有哪些 partition

```yaml
SERVICE_NAME: metastore
DB_DRIVER: mysql
```

作用：告诉 `apache/hive:4.1.0` 镜像当前容器启动 Metastore，并且 Metastore 后端数据库是 MySQL。

```yaml
-Djavax.jdo.option.ConnectionURL=jdbc:mysql://mysql:3306/hive_metastore?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
```

这里必须使用 `mysql:3306`，不能写 `localhost:3307`。

原因是 Metastore 和 MySQL 都在 Docker Compose 内部网络中，容器之间通过服务名通信：

| 写法                                           | 是否正确 | 原因                                           |
| -------------------------------------------- | ---- | -------------------------------------------- |
| `jdbc:mysql://mysql:3306/hive_metastore`     | 正确   | `mysql` 是 Compose 服务名，`3306` 是容器内部端口         |
| `jdbc:mysql://localhost:3307/hive_metastore` | 错误   | 在容器内 `localhost` 指向 Metastore 自己，不是 MySQL 容器 |
| `jdbc:mysql://mysql:3307/hive_metastore`     | 错误   | `3307` 是 Windows 宿主机端口，不是容器内部端口              |

```yaml
volumes:
  - warehouse-data:/opt/hive/data/warehouse
  - ./mysql-connector-j-8.4.0.jar:/opt/hive/lib/mysql-connector-j-8.4.0.jar
```

作用：

- `warehouse-data` 保存 Hive 表数据。
- `mysql-connector-j-8.4.0.jar` 让 Metastore 能加载 MySQL JDBC Driver。

### 7.3 HiveServer2 服务

```yaml
hiveserver2:
  image: apache/hive:4.1.0
  container_name: hive4
```

作用：启动 HiveServer2。DBeaver 和 Beeline 连接的就是这个服务。

```yaml
SERVICE_NAME: hiveserver2
```

作用：告诉 Hive 镜像当前容器启动 HiveServer2，不是 Metastore。

```yaml
-Dhive.metastore.uris=thrift://hive-metastore:9083
```

作用：告诉 HiveServer2 去哪里找 Metastore。HiveServer2 自己不直接保存表结构，它需要通过 Metastore 查询元数据。

```yaml
ports:
  - "10000:10000"
  - "10002:10002"
```

端口说明：

| 端口      | 作用                              |
| ------- | ------------------------------- |
| `10000` | HiveServer2 JDBC / Beeline 查询端口 |
| `10002` | HiveServer2 Web UI 端口           |

DBeaver 连接 Hive 时使用：

```text
jdbc:hive2://localhost:10000/default
```

---

## 8. 第一次启动环境

在 `docker-compose.yml` 所在目录执行：

```powershell
docker compose up -d
```

命令含义：

| 命令               | 作用                |
| ---------------- | ----------------- |
| `docker compose` | 使用 Docker Compose |
| `up`             | 创建并启动服务           |
| `-d`             | 后台运行              |

查看容器状态：

```powershell
docker ps
```

正常情况下应该看到 3 个容器：

```text
hive-mysql
hive-metastore
hive4
```

端口重点看：

```text
0.0.0.0:3307->3306/tcp
0.0.0.0:9083->9083/tcp
0.0.0.0:10000->10000/tcp
0.0.0.0:10002->10002/tcp
```

---

## 9. 自测环境是否成功

### 9.1 查看日志

如果容器没有正常运行，按依赖顺序看日志：

```powershell
docker logs hive-mysql
docker logs hive-metastore
docker logs hive4
```

顺序很重要：MySQL 起不来，Metastore 大概率也起不来；Metastore 起不来，HiveServer2 大概率也不可用。

### 9.2 使用 Beeline 连接 Hive

进入 HiveServer2 容器：

```powershell
docker exec -it hive4 bash
```

在容器内部连接 HiveServer2：

```sh
beeline -u jdbc:hive2://localhost:10000
```

进入后执行：

```sql
SHOW DATABASES;
```

能看到 `default`，说明 HiveServer2 基本可用。

退出 Beeline：

```sql
!quit
```

退出容器：

```sh
exit
```

### 9.3 创建测试库表

在 Beeline 中执行：

```sql
CREATE DATABASE IF NOT EXISTS ods;

USE ods;

CREATE TABLE IF NOT EXISTS test_user (
  id INT,
  name STRING
);

INSERT INTO test_user VALUES
(1, 'Alice'),
(2, 'Bob');

SELECT * FROM test_user;
```

如果能查询到数据，说明完整链路可用：

```text
SQL 请求
  -> HiveServer2
  -> Hive Metastore
  -> MySQL 保存表结构等元数据
  -> warehouse-data 保存表数据
```

### 9.4 验证持久化

停止并删除容器，但保留 volume：

```powershell
docker compose down
docker compose up -d
```

重新连接 Hive 后执行：

```sql
USE ods;
SELECT * FROM test_user;
```

如果表和数据还在，说明 MySQL 元数据和 Hive warehouse 数据都已经持久化。

---

## 10. DBeaver 连接方式

### 10.1 连接 Hive

在 DBeaver 中新建 Hive 连接：

```text
Host: localhost
Port: 10000
Database: default
JDBC URL: jdbc:hive2://localhost:10000/default
```

用户名和密码可以先尝试：

```text
Username: hive
Password: hive
```

如果连接失败，再尝试用户名密码留空。

连接成功后，可以直接在 DBeaver 中执行 Hive SQL：

```sql
CREATE DATABASE IF NOT EXISTS ods;
CREATE DATABASE IF NOT EXISTS dwd;
CREATE DATABASE IF NOT EXISTS dws;
CREATE DATABASE IF NOT EXISTS ads;
```

### 10.2 连接 MySQL 元数据库

如果想观察 Hive 元数据，可以在 DBeaver 中再创建一个 MySQL 连接：

```text
Host: localhost
Port: 3307
Database: hive_metastore
Username: hive
Password: hive
```

创建 Hive 表后，MySQL 的 `hive_metastore` 中会出现很多元数据表，例如：

```text
DBS
TBLS
COLUMNS_V2
SDS
SERDES
PARTITIONS
```

这些表用于保存 Hive 的库、表、字段、存储描述、序列化方式和分区信息。

---

## 11. 日常启动和停止

进入 Compose 项目目录：

```powershell
cd C:\Users\v-liuyuhang\source\repos\MyPro\docker-hive4
```

启动环境：

```powershell
docker compose up -d
```

查看状态：

```powershell
docker ps
```

停止环境但保留数据：

```powershell
docker compose down
```

查看日志：

```powershell
docker logs hive-mysql
docker logs hive-metastore
docker logs hive4
```

实时查看 HiveServer2 日志：

```powershell
docker logs -f hive4
```

进入 Hive 容器：

```powershell
docker exec -it hive4 bash
```

进入 MySQL 容器：

```powershell
docker exec -it hive-mysql mysql -uroot -proot
```

查看 Compose 创建的数据卷：

```powershell
docker volume ls
```

---

## 12. 重置环境

### 12.1 删除容器但保留数据

```powershell
docker compose down
```

作用：删除容器和网络，保留 `mysql-data` 与 `warehouse-data`。下次执行 `docker compose up -d` 后，之前创建的 Hive 表和数据仍然存在。

### 12.2 删除容器并清空数据

```powershell
docker compose down -v
```

作用：删除容器、网络和 volume，会清空：

- MySQL 中的 Hive 元数据
- Hive warehouse 中的表数据

只有在配置错了、想彻底重来、或者明确不需要旧数据时再执行。

### 12.3 修改配置后重新启动

如果修改了 `docker-compose.yml`：

```powershell
docker compose down
docker compose up -d
```

如果只是想重启服务：

```powershell
docker compose restart
```

---

## 13. 常见问题处理

### 13.1 端口 3306 被占用

现象：启动 MySQL 容器时报类似错误：

```text
ports are not available: exposing port TCP 0.0.0.0:3306
Only one usage of each socket address is normally permitted
```

原因：Windows 本机已经有 MySQL 占用了 `localhost:3306`。

处理：Docker MySQL 对外端口使用 `3307:3306`。

```yaml
ports:
  - "3307:3306"
```

注意：Metastore 连接 MySQL 仍然写 `mysql:3306`，不是 `mysql:3307`。

### 13.2 找不到 MySQL JDBC Driver

现象：Metastore 日志出现：

```text
ClassNotFoundException: com.mysql.cj.jdbc.Driver
No suitable driver found for jdbc:mysql://...
```

检查：

```powershell
dir
docker logs hive-metastore
```

处理：确认 `mysql-connector-j-8.4.0.jar` 和 `docker-compose.yml` 在同一个目录，并且 Compose 中挂载路径正确：

```yaml
- ./mysql-connector-j-8.4.0.jar:/opt/hive/lib/mysql-connector-j-8.4.0.jar
```

### 13.3 Metastore 连接 MySQL 失败

现象：Metastore 日志出现：

```text
Communications link failure
Connection refused
```

排查顺序：

```powershell
docker ps
docker logs hive-mysql
docker logs hive-metastore
```

重点确认：

- `hive-mysql` 是否正在运行
- MySQL healthcheck 是否正常
- `ConnectionURL` 是否为 `jdbc:mysql://mysql:3306/hive_metastore...`
- 不要把容器内部连接地址写成 `localhost:3307`

### 13.4 HiveServer2 连接不上

现象：DBeaver 或 Beeline 连不上 `localhost:10000`。

排查：

```powershell
docker ps
docker logs hive4
docker logs hive-metastore
```

重点确认：

- `hive4` 是否正在运行
- `10000:10000` 端口是否已映射
- `hive-metastore` 是否正常运行
- HiveServer2 的 Metastore 地址是否为 `thrift://hive-metastore:9083`

### 13.5 修改配置后没有生效

原因：`docker start` 只会按旧配置启动已有容器，不会重新应用新的端口、环境变量、volume 或 Compose 配置。

处理：在 Compose 目录中执行：

```powershell
docker compose down
docker compose up -d
```

如果要彻底重置数据，再使用：

```powershell
docker compose down -v
docker compose up -d
```

---

## 14. 一次性速通命令

首次创建时按下面顺序执行：

```powershell
mkdir C:\Users\v-liuyuhang\source\repos\MyPro\docker-hive4
cd C:\Users\v-liuyuhang\source\repos\MyPro\docker-hive4

Invoke-WebRequest `
  -Uri "https://repo1.maven.org/maven2/com/mysql/mysql-connector-j/8.4.0/mysql-connector-j-8.4.0.jar" `
  -OutFile "mysql-connector-j-8.4.0.jar"

notepad docker-compose.yml
docker compose up -d
docker ps
docker logs hive-mysql
docker logs hive-metastore
docker logs hive4
docker exec -it hive4 bash
```

进入容器后：

```sh
beeline -u jdbc:hive2://localhost:10000
```

Beeline 中执行：

```sql
SHOW DATABASES;

CREATE DATABASE IF NOT EXISTS ods;
USE ods;

CREATE TABLE IF NOT EXISTS test_user (
  id INT,
  name STRING
);

INSERT INTO test_user VALUES
(1, 'Alice'),
(2, 'Bob');

SELECT * FROM test_user;
```

日常使用只需要：

```powershell
cd C:\Users\v-liuyuhang\source\repos\MyPro\docker-hive4
docker compose up -d
```

不用时停止：

```powershell
docker compose down
```

---

## 15. 总结

这套环境本质上是用 Docker Compose 在 Windows 本地启动一个小型 Hive 学习环境：HiveServer2 负责接收 SQL，Hive Metastore 负责管理元数据，MySQL 负责持久化元数据，`warehouse-data` volume 负责持久化 Hive 表数据。

最容易混淆的是端口：Windows 访问 Docker MySQL 用 `localhost:3307`，但容器内部 Metastore 访问 MySQL 必须用 `mysql:3306`。DBeaver 连接 Hive 则使用 `jdbc:hive2://localhost:10000/default`。
