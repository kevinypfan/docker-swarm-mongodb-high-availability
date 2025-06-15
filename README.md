# MongoDB High Availability Testing Suite

這個專案提供了在 Docker Swarm 上建立和測試 MongoDB 高可用性 Replica Set 的完整解決方案，包含自動化監控、資料完整性驗證和故障轉移測試。

## 🎯 專案結構

```
mongodb-test/
├── deployment/                    # MongoDB Replica Set 部署檔案
│   ├── docker-compose.yml        # Docker Swarm 服務定義 (含 HA Tester)
│   ├── mongod.conf               # MongoDB 配置檔案
│   ├── mongodb-keyfile           # Replica Set 內部認證金鑰
│   └── init-replica-set.js       # Replica Set 初始化腳本
├── mongodb-ha-tester/            # MongoDB 高可用性測試工具
│   ├── Dockerfile                # HA Tester 容器映像
│   ├── .env.example              # 環境變數範例檔案
│   ├── .env                      # 環境變數設定 (git ignored)
│   ├── config.js                 # 配置檔案 (dotenv 支援)
│   ├── models.js                 # 資料庫模型定義
│   ├── monitor.js                # MongoDB 狀態監控器
│   ├── writer.js                 # 有序寫入測試器
│   ├── validator.js              # 資料完整性驗證器
│   ├── index.js                  # 主程式 (整合所有功能)
│   ├── test.js                   # 測試套件
│   ├── docker-test.sh            # 本地 Docker 測試腳本
│   └── README.md                 # 詳細使用說明
├── .github/workflows/            # GitHub Actions 自動化部署
├── deploy.sh                     # 一鍵部署腳本
├── DEPLOYMENT.md                 # Docker Swarm 部署指南
└── README.md                     # 專案總覽 (本檔案)
```

## 🔧 主要組件

### 1. MongoDB Replica Set (deployment/)
- **3 節點高可用架構**: PRIMARY + 2×SECONDARY
- **自動故障轉移**: 主節點故障時自動選舉新主節點
- **安全認證**: 啟用 keyfile 內部認證和用戶認證
- **持久化儲存**: 使用 Docker volumes 保存資料

### 2. HA Tester (mongodb-ha-tester/)
- **📊 實時監控**: Replica Set 狀態、節點健康度、效能指標
- **✏️ 有序寫入測試**: 持續產生序列化測試資料
- **🔍 完整性驗證**: 檢查資料缺失、重複、時間一致性
- **🚨 故障檢測**: 自動檢測故障轉移事件
- **🐳 容器化**: 支援 Docker Swarm 部署和本地測試

### 3. 環境配置管理
- **dotenv 支援**: 使用 `.env` 檔案管理配置
- **環境區分**: 自動偵測容器/本地開發環境
- **參數可調**: 完全可配置的測試參數

### 4. 自動化部署
- **GitHub Actions**: 自動建立和推送 Docker 映像
- **多平台支援**: linux/amd64 和 linux/arm64
- **安全掃描**: 整合 Trivy 漏洞掃描

## 架構概述

- **3 節點 Replica Set**: 1 個主節點 + 2 個副本節點
- **高可用性**: 主節點故障時自動故障轉移
- **安全認證**: 啟用 keyfile 內部認證和用戶認證
- **持久化儲存**: 使用 Docker volumes 保存資料
- **網路隔離**: 使用 overlay 網路通訊

## 檔案結構

```
mongodb-test/
├── docker-compose.yml      # Docker Swarm 服務定義
├── mongod.conf            # MongoDB 配置檔案
├── init-replica-set.js    # Replica Set 初始化腳本
├── mongodb-keyfile        # 內部認證金鑰檔案
├── memo.md               # 連線資訊備忘錄
└── README.md             # 專案說明文件
```

## 🚀 快速開始

### 方式一: 一鍵自動部署 (推薦)

```bash
# 一鍵部署完整測試套件 (首次運行會自動建立 .env 檔案)
./deploy.sh

# 或者重新建立映像並部署
./deploy.sh deploy --build

# 如需自定義設定，可手動複製和編輯環境變數檔案
cp mongodb-ha-tester/.env.example mongodb-ha-tester/.env
# 編輯 mongodb-ha-tester/.env 檔案調整設定
```

### 方式二: Docker Swarm 手動部署

1. **設定環境變數**
   ```bash
   export DOCKER_USERNAME=yourusername
   ```

2. **手動部署步驟**
   ```bash
   # 初始化 Docker Swarm (如果尚未初始化)
   docker swarm init
   
   # 建立 overlay 網路
   docker network create --driver overlay --attachable mongodb-network
   
   # 建立並推送映像
   cd mongodb-ha-tester
   docker build -t $DOCKER_USERNAME/mongodb-ha-tester:latest .
   docker push $DOCKER_USERNAME/mongodb-ha-tester:latest
   
   # 部署完整堆疊
   cd ../deployment
   docker stack deploy -c docker-compose.yml mongodb-stack
   
   # 查看服務狀態和日誌
   docker service ls
   docker service logs -f mongodb-stack_mongodb-ha-tester
   ```

### 方式三: 本地 Docker 測試

1. **使用本地測試腳本**
   ```bash
   cd mongodb-ha-tester
   
   # 建立映像並啟動測試環境
   ./docker-test.sh build
   ./docker-test.sh start
   
   # 查看測試日誌
   ./docker-test.sh logs
   
   # 執行故障轉移測試
   ./docker-test.sh failover
   
   # 清理環境
   ./docker-test.sh cleanup
   ```

### 方式四: 本地 Node.js 開發

1. **啟動 MongoDB Replica Set**
   ```bash
   cd deployment
   docker stack deploy -c docker-compose.yml mongodb-stack
   ```

2. **設定本地開發環境**
   ```bash
   cd mongodb-ha-tester
   
   # 複製環境變數檔案
   cp .env.example .env
   
   # 編輯 .env，取消註解本地開發 URI
   # MONGODB_URI=mongodb://admin:password123@localhost:27017,localhost:27018,localhost:27019/mongodb-ha-test?replicaSet=rs0&authSource=admin
   
   # 安裝依賴並運行
   npm install
   npm start  # 完整測試
   # 或
   npm test   # 測試套件
   ```

### 3. 初始化 Replica Set

```bash
# 連接到主節點並初始化 replica set
docker exec $(docker ps -q -f "name=mongodb-stack_mongodb-primary") mongosh \
  --host mongodb-primary:27017 -u admin -p password123 \
  --authenticationDatabase admin \
  --eval "rs.initiate({
    _id: 'rs0',
    members: [
      { _id: 0, host: 'mongodb-primary:27017', priority: 2 },
      { _id: 1, host: 'mongodb-secondary1:27017', priority: 1 },
      { _id: 2, host: 'mongodb-secondary2:27017', priority: 1 }
    ]
  })"
```

### 4. 驗證 Replica Set 狀態

```bash
# 檢查 replica set 狀態
docker exec $(docker ps -q -f "name=mongodb-stack_mongodb-primary") mongosh \
  --host mongodb-primary:27017 -u admin -p password123 \
  --authenticationDatabase admin \
  --eval "rs.status()"
```

## 📋 連接資訊

### Docker Swarm 環境 (容器內部)
| 節點 | 服務名稱 | 角色 |
|------|----------|------|
| mongodb-primary:27017 | mongodb-primary | PRIMARY |
| mongodb-secondary1:27017 | mongodb-secondary1 | SECONDARY |
| mongodb-secondary2:27017 | mongodb-secondary2 | SECONDARY |

### 外部存取 (localhost)
| 節點 | 端口 | 角色 |
|------|------|------|
| localhost:27017 | mongodb-primary | PRIMARY |
| localhost:27018 | mongodb-secondary1 | SECONDARY |
| localhost:27019 | mongodb-secondary2 | SECONDARY |

**認證資訊:**
- 用戶名: `admin`
- 密碼: `password123`
- 認證資料庫: `admin`

### 連接字串範例

**Docker Swarm 內部:**
```javascript
mongodb://admin:password123@mongodb-primary:27017,mongodb-secondary1:27017,mongodb-secondary2:27017/mydb?replicaSet=rs0&authSource=admin
```

**外部連接:**
```javascript
mongodb://admin:password123@localhost:27017,localhost:27018,localhost:27019/mydb?replicaSet=rs0&authSource=admin
```

## 連接字串範例

```javascript
// Node.js MongoDB Driver
const uri = "mongodb://admin:password123@localhost:27017,localhost:27018,localhost:27019/mydb?replicaSet=rs0&authSource=admin";

// MongoDB Compass
mongodb://admin:password123@localhost:27017,localhost:27018,localhost:27019/mydb?replicaSet=rs0&authSource=admin
```

## 🔧 管理命令

### 使用部署腳本管理
```bash
# 查看部署狀態
./deploy.sh status

# 監控 HA Tester 日誌
./deploy.sh logs

# 顯示連線資訊
./deploy.sh info

# 清理整個環境
./deploy.sh cleanup

# 重新建立映像
./deploy.sh build
```

### Docker 原生命令
```bash
# 查看所有服務
docker service ls

# 查看特定服務日誌
docker service logs -f mongodb-stack_mongodb-ha-tester
docker service logs -f mongodb-stack_mongodb-primary

# 查看服務詳細資訊
docker service ps mongodb-stack_mongodb-ha-tester
docker service ps mongodb-stack_mongodb-primary
```

### 故障轉移測試
```bash
# 停止主節點服務（測試故障轉移）
docker service scale mongodb-stack_mongodb-primary=0

# 檢查新的主節點
docker exec $(docker ps -q -f "name=mongodb-stack_mongodb-secondary") mongosh \
  --host mongodb-secondary1:27017 -u admin -p password123 \
  --authenticationDatabase admin \
  --eval "rs.status()"

# 恢復主節點
docker service scale mongodb-stack_mongodb-primary=1
```

### 清理環境
```bash
# 移除 MongoDB stack
docker stack rm mongodb-stack

# 移除網路
docker network rm mongodb-network

# 移除 volumes（注意：這會刪除所有資料）
docker volume prune
```

## 配置說明

### MongoDB 配置 (mongod.conf)
- **端口**: 27017
- **綁定 IP**: 0.0.0.0 (允許所有網路介面)
- **Replica Set 名稱**: rs0
- **認證**: 啟用 keyfile 和用戶認證
- **儲存路徑**: /data/db

### Docker Compose 配置
- **網路**: 使用 overlay 網路 `mongodb-network`
- **持久化**: 每個節點都有獨立的 volumes
- **部署約束**: 確保服務分佈在不同節點
- **重啟策略**: 失敗時自動重啟

## 高可用性特性

1. **自動故障轉移**: 主節點故障時，副本節點會自動選舉新的主節點
2. **資料複製**: 所有寫入操作會自動複製到所有副本節點
3. **讀取分散**: 可以從副本節點讀取資料，減輕主節點負載
4. **一致性保證**: 支援多種讀取關注等級 (Read Concern)
5. **寫入關注**: 可配置寫入確認等級 (Write Concern)

## 注意事項

1. **生產環境**: 建議使用更強的密碼和證書認證
2. **監控**: 建議添加 MongoDB 監控和警報系統
3. **備份**: 定期備份資料庫和配置檔案
4. **網路安全**: 在生產環境中限制網路存取
5. **資源配置**: 根據負載調整 MongoDB 記憶體和 CPU 配置

## 故障排除

### 常見問題

1. **服務無法啟動**
   ```bash
   # 檢查服務日誌
   docker service logs mongodb-stack_mongodb-primary --tail 50
   ```

2. **無法連接到 MongoDB**
   ```bash
   # 檢查網路連接
   docker network ls
   docker network inspect mongodb-network
   ```

3. **Replica Set 初始化失敗**
   ```bash
   # 檢查所有節點是否正常運行
   docker service ps mongodb-stack_mongodb-primary
   docker service ps mongodb-stack_mongodb-secondary1
   docker service ps mongodb-stack_mongodb-secondary2
   ```

## 🔄 GitHub Actions 自動化部署

### 設定 GitHub Actions

1. **設定 Repository Secrets**
   在 GitHub Repository 的 Settings > Secrets and variables > Actions 中新增：
   - `DOCKER_USERNAME`: 你的 Docker Hub 使用者名稱
   - `DOCKER_PASSWORD`: 你的 Docker Hub 存取令牌

2. **推送代碼觸發建立**
   ```bash
   git add .
   git commit -m "Add MongoDB HA Tester"
   git push origin main
   ```

3. **自動建立流程**
   - GitHub Actions 會自動建立多平台映像
   - 推送到 Docker Hub: `yourusername/mongodb-ha-tester:latest`
   - 執行安全漏洞掃描
   - 支援版本標籤 (當推送 git tag 時)

### 使用預建映像

當 GitHub Actions 完成後，你可以直接使用預建映像：

```bash
# 拉取映像
docker pull yourusername/mongodb-ha-tester:latest

# 或在 docker-compose.yml 中直接使用
image: yourusername/mongodb-ha-tester:latest
```

## 🎯 實際應用場景

這個測試套件適用於以下場景：

1. **生產環境驗證**: 確保 MongoDB 高可用性配置正確
2. **故障演練**: 定期測試故障轉移機制
3. **效能監控**: 持續監控 MongoDB 叢集效能
4. **資料完整性檢查**: 驗證複製一致性
5. **容災測試**: 模擬各種故障情況
6. **CI/CD 整合**: 自動化資料庫高可用性測試

## 📚 進階使用

- **詳細部署指南**: 參閱 [`DEPLOYMENT.md`](DEPLOYMENT.md)
- **HA Tester 文件**: 參閱 [`mongodb-ha-tester/README.md`](mongodb-ha-tester/README.md)
- **配置說明**: 編輯 [`mongodb-ha-tester/config.js`](mongodb-ha-tester/config.js)
- **本地測試**: 使用 [`mongodb-ha-tester/docker-test.sh`](mongodb-ha-tester/docker-test.sh)

## 參考資料

- [MongoDB Replica Set 文檔](https://docs.mongodb.com/manual/replication/)
- [Docker Swarm 文檔](https://docs.docker.com/engine/swarm/)
- [MongoDB 安全最佳實踐](https://docs.mongodb.com/manual/security/)

---

現在你可以在 Docker Swarm 上輕鬆部署和測試 MongoDB 的高可用性！🎉