# MongoDB HA Tester - Docker Swarm 部署指南

本指南說明如何在 Docker Swarm 上部署 MongoDB Replica Set 和 HA Tester。

## 🎯 架構概述

```
Docker Swarm 叢集
├── MongoDB Replica Set
│   ├── mongodb-primary (PRIMARY)
│   ├── mongodb-secondary1 (SECONDARY)
│   └── mongodb-secondary2 (SECONDARY)
└── MongoDB HA Tester
    ├── 監控器 (實時監控)
    ├── 寫入器 (有序寫入測試)
    └── 驗證器 (資料完整性驗證)
```

## 📋 前置需求

- Docker Engine 20.10+
- Docker Compose v3.8+
- Docker Swarm 模式已啟用
- 至少 3 個 Swarm 節點 (建議)
- 8GB+ RAM 和 20GB+ 磁碟空間

## 🚀 快速部署

### 1. 準備 Docker Hub 映像

#### 方式一: 使用預建映像 (推薦)
```bash
# 將在 GitHub Actions 建立後提供
docker pull yourusername/mongodb-ha-tester:latest
```

#### 方式二: 本地建立映像
```bash
cd mongodb-ha-tester
docker build -t yourusername/mongodb-ha-tester:latest .
docker push yourusername/mongodb-ha-tester:latest
```

### 2. 設定環境變數

```bash
# 設定 Docker Hub 使用者名稱
export DOCKER_USERNAME=yourusername

# 或建立 .env 檔案
echo "DOCKER_USERNAME=yourusername" > deployment/.env
```

### 3. 初始化 Docker Swarm

```bash
# 初始化 Swarm (如果尚未初始化)
docker swarm init

# 建立 overlay 網路
docker network create --driver overlay --attachable mongodb-network
```

### 4. 部署 MongoDB Replica Set + HA Tester

```bash
cd deployment

# 部署完整堆疊
docker stack deploy -c docker-compose.yml mongodb-stack
```

### 5. 檢查部署狀態

```bash
# 檢查服務狀態
docker service ls

# 檢查 HA Tester 日誌
docker service logs -f mongodb-stack_mongodb-ha-tester

# 檢查 MongoDB 服務日誌
docker service logs -f mongodb-stack_mongodb-primary
```

## 🔧 服務管理

### 檢查服務狀態
```bash
# 列出所有服務
docker service ls

# 檢查特定服務詳細資訊
docker service ps mongodb-stack_mongodb-ha-tester
docker service ps mongodb-stack_mongodb-primary

# 查看服務日誌
docker service logs mongodb-stack_mongodb-ha-tester --tail 100
```

### 縮放服務
```bash
# 縮放 HA Tester (通常保持 1 個實例)
docker service scale mongodb-stack_mongodb-ha-tester=1

# 停止 HA Tester 進行維護
docker service scale mongodb-stack_mongodb-ha-tester=0

# 重新啟動 HA Tester
docker service scale mongodb-stack_mongodb-ha-tester=1
```

### 更新服務
```bash
# 更新 HA Tester 映像
docker service update --image yourusername/mongodb-ha-tester:v1.1.0 mongodb-stack_mongodb-ha-tester

# 滾動重啟服務
docker service update --force mongodb-stack_mongodb-ha-tester
```

## 🧪 故障轉移測試

### 自動故障轉移測試

HA Tester 會自動監控和記錄故障轉移事件。

### 手動故障轉移測試

#### 1. 模擬主節點故障
```bash
# 停止主節點
docker service scale mongodb-stack_mongodb-primary=0

# 觀察 HA Tester 日誌
docker service logs -f mongodb-stack_mongodb-ha-tester

# 等待 30-60 秒觀察故障轉移

# 恢復主節點
docker service scale mongodb-stack_mongodb-primary=1
```

#### 2. 模擬副節點故障
```bash
# 停止一個副節點
docker service scale mongodb-stack_mongodb-secondary1=0

# 觀察系統行為
docker service logs -f mongodb-stack_mongodb-ha-tester

# 恢復副節點
docker service scale mongodb-stack_mongodb-secondary1=1
```

#### 3. 模擬網路分割
```bash
# 將節點移出網路 (需要在節點上執行)
docker network disconnect mongodb-network $(docker ps -q -f "name=mongodb-stack_mongodb-primary")

# 等待觀察
sleep 60

# 重新連接網路
docker network connect mongodb-network $(docker ps -q -f "name=mongodb-stack_mongodb-primary")
```

## 📊 監控和日誌

### HA Tester 監控輸出

HA Tester 會定期輸出以下監控資訊：

```
📊 MongoDB Replica Set 狀態報告
═══════════════════════════════════════════════════
時間: 2024-01-15 14:30:00
Replica Set: rs0
連線狀態: 已連線

🔗 節點狀態:
  ● mongodb-primary:27017 - PRIMARY (健康度: 1)
  ● mongodb-secondary1:27017 - SECONDARY (健康度: 1)
  ● mongodb-secondary2:27017 - SECONDARY (健康度: 1)

⚡ 效能指標:
  寫入延遲: 45ms
  讀取延遲: 12ms

📈 寫入進度報告
────────────────────────────────────
成功寫入: 1250
失敗次數: 0
吞吐量: 15 寫入/秒
平均延遲: 67ms
```

### 存取 MongoDB 資料

```bash
# 連接到主節點
docker exec -it $(docker ps -q -f "name=mongodb-stack_mongodb-primary") mongosh \
  --host mongodb-primary:27017 -u admin -p password123 --authenticationDatabase admin

# 查看測試資料
use mongodb-ha-test
db.testrecords.find().limit(5)
db.testrecords.count()

# 查看系統狀態
db.systemstatuses.find().sort({checkTime: -1}).limit(1)

# 查看錯誤日誌
db.errorlogs.find().sort({timestamp: -1}).limit(10)
```

## 🔧 配置調整

### 環境變數配置

在 `docker-compose.yml` 中調整 HA Tester 配置：

```yaml
mongodb-ha-tester:
  environment:
    MONGODB_URI: "mongodb://admin:password123@mongodb-primary:27017,mongodb-secondary1:27017,mongodb-secondary2:27017/mongodb-ha-test?replicaSet=rs0&authSource=admin"
    LOG_LEVEL: debug  # 或 info, warn, error
    NODE_ENV: production
    
    # 自訂測試參數 (可選)
    WRITE_INTERVAL: 1000    # 寫入間隔 (毫秒)
    MONITOR_INTERVAL: 5000  # 監控間隔 (毫秒)
    VERIFY_INTERVAL: 10000  # 驗證間隔 (毫秒)
```

### 資源限制調整

```yaml
mongodb-ha-tester:
  deploy:
    resources:
      limits:
        memory: 1G      # 增加記憶體限制
        cpus: '1.0'     # 設定 CPU 限制
      reservations:
        memory: 512M    # 預留記憶體
        cpus: '0.5'     # 預留 CPU
```

## 🚨 故障排除

### 常見問題

#### 1. HA Tester 無法連接 MongoDB
```bash
# 檢查網路連通性
docker exec $(docker ps -q -f "name=mongodb-stack_mongodb-ha-tester") \
  nc -zv mongodb-primary 27017

# 檢查 MongoDB 服務狀態
docker service ps mongodb-stack_mongodb-primary
```

#### 2. 服務無法啟動
```bash
# 檢查服務約束
docker service ps mongodb-stack_mongodb-ha-tester --no-trunc

# 檢查節點標籤
docker node ls
docker node inspect <node-id>
```

#### 3. 映像拉取失敗
```bash
# 檢查映像是否存在
docker pull yourusername/mongodb-ha-tester:latest

# 手動建立映像
cd mongodb-ha-tester
docker build -t yourusername/mongodb-ha-tester:latest .
```

#### 4. 記憶體不足
```bash
# 檢查系統資源
docker system df
docker system prune

# 調整服務資源限制
docker service update --limit-memory 256M mongodb-stack_mongodb-ha-tester
```

### 日誌分析

```bash
# 取得詳細錯誤日誌
docker service logs mongodb-stack_mongodb-ha-tester --details --since 1h

# 過濾特定錯誤
docker service logs mongodb-stack_mongodb-ha-tester 2>&1 | grep "ERROR"

# 即時監控日誌
docker service logs -f mongodb-stack_mongodb-ha-tester --tail 50
```

## 📈 效能調優

### MongoDB 調優
```yaml
# 在 mongod.conf 中調整
net:
  maxIncomingConnections: 1000
  
storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 2
```

### HA Tester 調優
```yaml
mongodb-ha-tester:
  environment:
    WRITE_INTERVAL: 500     # 增加寫入頻率
    BATCH_SIZE: 20          # 增加批次大小
    MAX_POOL_SIZE: 20       # 增加連線池大小
```

## 🔒 安全考慮

### 生產環境安全設定

1. **更改預設密碼**
   ```bash
   # 在部署前修改 docker-compose.yml 中的密碼
   MONGO_INITDB_ROOT_PASSWORD: your-secure-password
   ```

2. **使用 Docker Secrets**
   ```bash
   # 建立 secret
   echo "your-secure-password" | docker secret create mongodb-root-password -
   
   # 在 docker-compose.yml 中使用
   secrets:
     - mongodb-root-password
   ```

3. **網路隔離**
   ```yaml
   # 移除外部端口暴露
   # ports:
   #   - "27017:27017"
   ```

4. **TLS/SSL 啟用**
   ```yaml
   # 在 mongod.conf 中配置 TLS
   net:
     tls:
       mode: requireTLS
       certificateKeyFile: /etc/ssl/mongodb.pem
   ```

## 🧹 清理環境

### 完全移除堆疊
```bash
# 移除 stack
docker stack rm mongodb-stack

# 移除 volumes (⚠️ 會刪除所有資料)
docker volume prune

# 移除網路
docker network rm mongodb-network

# 清理未使用的映像
docker image prune -a
```

### 僅移除 HA Tester
```bash
# 僅移除測試服務
docker service rm mongodb-stack_mongodb-ha-tester
```

## 📚 進階主題

### CI/CD 整合

可以將故障轉移測試整合到 CI/CD 流水線中：

```yaml
# .github/workflows/ha-test.yml
- name: Deploy and Test HA
  run: |
    docker stack deploy -c docker-compose.yml test-stack
    sleep 60
    docker service scale test-stack_mongodb-primary=0
    sleep 60
    docker service logs test-stack_mongodb-ha-tester | grep "故障轉移"
    docker stack rm test-stack
```

### 多環境部署

```bash
# 開發環境
docker stack deploy -c docker-compose.yml -c docker-compose.dev.yml dev-mongodb

# 測試環境  
docker stack deploy -c docker-compose.yml -c docker-compose.test.yml test-mongodb

# 生產環境
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml prod-mongodb
```

### 監控整合

可以整合 Prometheus 和 Grafana 進行進階監控：

```yaml
# 加入 docker-compose.yml
monitoring:
  image: prom/prometheus
  networks:
    - mongodb-network
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
```

這個部署指南提供了完整的 Docker Swarm 部署流程，讓你可以在生產環境中測試 MongoDB 的高可用性！