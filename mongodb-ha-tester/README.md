# MongoDB High Availability Tester

一個用於測試和監控 MongoDB Replica Set 高可用性的 Node.js 工具。

## 功能特色

### 🔧 核心功能
- **實時監控** MongoDB Replica Set 狀態
- **有序寫入測試** 持續產生測試資料並驗證完整性
- **資料完整性驗證** 檢查序列缺失、重複和一致性問題
- **故障檢測** 自動檢測節點故障和主節點切換
- **效能監控** 測量讀寫延遲和吞吐量

### 📊 監控指標
- Replica Set 節點狀態和健康度
- 主副節點角色變化
- 寫入/讀取延遲
- 資料完整性統計
- 錯誤日誌和警報

## 安裝和設定

### 前置需求
- Node.js 18+ 
- MongoDB Replica Set (已部署並運行)
- 網路存取權限到 MongoDB 節點

### 安裝依賴
```bash
cd mongodb-ha-tester
npm install
```

### 配置設定
編輯 `config.js` 檔案來修改連線和測試參數：

```javascript
const config = {
  mongodb: {
    uri: 'mongodb://admin:password123@localhost:27017,localhost:27018,localhost:27019/mongodb-ha-test?replicaSet=rs0&authSource=admin',
    // 其他連線選項...
  },
  testing: {
    writeInterval: 1000,    // 寫入間隔 (毫秒)
    monitorInterval: 5000,  // 監控間隔 (毫秒)
    verifyInterval: 10000,  // 驗證間隔 (毫秒)
    // 其他測試參數...
  }
};
```

## 使用方式

### 🚀 快速開始

#### 1. 執行完整測試 (推薦)
```bash
npm start
# 或
node index.js
```
啟動所有功能：監控 + 寫入測試 + 資料驗證

#### 2. 執行單次測試
```bash
node index.js single
```
執行一次快速測試並退出

#### 3. 僅執行監控
```bash
npm run monitor
# 或
node monitor.js
```

### 📝 個別功能使用

#### 寫入測試
```bash
# 持續寫入
node writer.js

# 批次寫入
node writer.js batch 100
```

#### 資料驗證
```bash
# 執行一次完整驗證
node validator.js

# 持續驗證
node validator.js continuous

# 驗證特定批次
node validator.js once [批次ID]
```

#### 測試套件
```bash
npm test
# 或
node test.js
```

### 🔧 進階使用

#### 環境變數設定
```bash
# MongoDB 連線 URI
export MONGODB_URI="mongodb://user:pass@host1:27017,host2:27017,host3:27017/dbname?replicaSet=rs0"

# 日誌等級
export LOG_LEVEL="debug"
```

#### 命令行參數
```bash
# 完整測試
node index.js full

# 僅監控
node index.js monitor

# 僅寫入
node index.js write

# 僅驗證
node index.js validate

# 顯示說明
node index.js help
```

## 功能詳解

### 📊 監控功能 (monitor.js)

監控器會持續檢查 MongoDB Replica Set 的狀態：

- **節點健康度** - 檢查每個節點的運行狀態
- **角色變化** - 監控主副節點角色切換
- **網路延遲** - 測量節點間的心跳延遲
- **連線狀態** - 監控客戶端連線狀態
- **效能指標** - 測量讀寫操作延遲

**輸出範例：**
```
📊 MongoDB Replica Set 狀態報告
═══════════════════════════════════════════════════
時間: 2024-01-15 14:30:00
Replica Set: rs0
連線狀態: 已連線

🔗 節點狀態:
  ● mongodb-primary:27017 - PRIMARY (健康度: 1)
    最後心跳: a few seconds ago, 延遲: 0ms
  ● mongodb-secondary1:27017 - SECONDARY (健康度: 1)
    最後心跳: a few seconds ago, 延遲: 3ms
  ● mongodb-secondary2:27017 - SECONDARY (健康度: 1)
    最後心跳: a few seconds ago, 延遲: 2ms

⚡ 效能指標:
  寫入延遲: 45ms
  讀取延遲: 12ms
```

### ✏️ 寫入測試功能 (writer.js)

寫入器會持續產生有序的測試資料：

- **序列寫入** - 產生連續序列號的測試記錄
- **批次 ID 追蹤** - 每次執行使用唯一的批次識別
- **錯誤重試** - 自動重試失敗的寫入操作
- **效能統計** - 記錄寫入延遲和吞吐量
- **故障檢測** - 檢測和記錄寫入失敗

**資料結構：**
```javascript
{
  sequenceId: 12345,           // 有序 ID
  timestamp: "2024-01-15T14:30:00.000Z",
  data: "Test data #12345 - 2024-01-15 14:30:00.123",
  writtenTo: "mongodb-primary:27017",  // 寫入的節點
  batchId: "batch_1705328400000_abc123", // 批次 ID
  status: "confirmed"          // 狀態
}
```

### 🔍 資料驗證功能 (validator.js)

驗證器會檢查資料的完整性和一致性：

#### 序列完整性驗證
- 檢查序列號是否連續
- 找出缺失的序列號
- 偵測重複的序列號
- 計算資料完整度百分比

#### 時間戳一致性驗證
- 檢查時間戳順序是否正確
- 偵測時間反轉問題
- 分析時間戳分佈

#### 跨節點一致性驗證
- 從不同節點讀取資料
- 比較節點間的資料一致性
- 檢測復寫延遲問題

**驗證報告範例：**
```
📋 資料完整性驗證報告
══════════════════════════════════════════════════════════
驗證時間: 2024-01-15 14:30:00
耗時: 1250ms
批次 ID: batch_1705328400000_abc123
整體狀態: ✅ 正常

🔢 序列完整性:
  總記錄數: 1000
  預期記錄數: 1000
  完整度: 100.00%
  缺失序列: 0 個
  重複序列: 0 個
  間隙數量: 0 個

🕐 時間戳一致性:
  總記錄數: 1000
  時間不一致: 0 個

🔄 跨節點一致性:
  計數一致性: ✅
  序列一致性: ✅
  primary: 1000 記錄, 最新序列: 1000
  secondary: 1000 記錄, 最新序列: 1000
  secondaryPreferred: 1000 記錄, 最新序列: 1000
```

## 故障轉移測試

### 手動故障轉移測試

1. **啟動完整測試**
   ```bash
   npm start
   ```

2. **模擬主節點故障**
   ```bash
   # 停止主節點容器
   docker service scale mongodb-stack_mongodb-primary=0
   ```

3. **觀察切換過程**
   - 監控器會檢測到主節點下線
   - 副節點會自動選舉新的主節點
   - 寫入器會自動重新連線到新主節點
   - 驗證器會檢查資料完整性

4. **恢復主節點**
   ```bash
   # 恢復主節點容器
   docker service scale mongodb-stack_mongodb-primary=1
   ```

5. **檢查結果**
   - 驗證資料是否有遺失
   - 檢查故障轉移期間的錯誤日誌
   - 確認系統恢復正常運作

### 自動化故障轉移測試

可以編寫腳本來自動化故障轉移測試：

```bash
#!/bin/bash
# 自動故障轉移測試腳本

echo "啟動 MongoDB HA 測試..."
node index.js &
TEST_PID=$!

sleep 30

echo "模擬主節點故障..."
docker service scale mongodb-stack_mongodb-primary=0

sleep 60

echo "恢復主節點..."
docker service scale mongodb-stack_mongodb-primary=1

sleep 30

echo "停止測試並檢查結果..."
kill $TEST_PID

echo "執行最終驗證..."
node validator.js once
```

## 效能基準

### 預期效能指標

在標準配置下，預期的效能指標：

- **寫入吞吐量**: 100-500 寫入/秒
- **寫入延遲**: 10-100ms (平均)
- **讀取延遲**: 5-50ms (平均)
- **故障轉移時間**: 10-30秒
- **資料一致性**: 99.9%+

### 效能調優建議

1. **調整寫入關注等級**
   ```javascript
   writeConcern: { w: 1, j: false, wtimeout: 1000 }  // 更快但較不安全
   writeConcern: { w: 'majority', j: true, wtimeout: 5000 }  // 較慢但更安全
   ```

2. **調整連線池設定**
   ```javascript
   maxPoolSize: 20,  // 增加連線池大小
   minPoolSize: 5    // 設定最小連線數
   ```

3. **調整測試間隔**
   ```javascript
   writeInterval: 500,    // 增加寫入頻率
   monitorInterval: 2000, // 減少監控頻率
   ```

## 錯誤處理和故障排除

### 常見錯誤

#### 1. 連線失敗
```
❌ MongoDB 連接失敗: MongoServerSelectionError
```
**解決方案:**
- 檢查 MongoDB 服務是否運行
- 驗證連線字串和認證資訊
- 確認網路連通性

#### 2. 認證失敗
```
❌ MongoDB 連接失敗: MongoServerError: Authentication failed
```
**解決方案:**
- 檢查用戶名和密碼
- 確認認證資料庫設定正確
- 驗證用戶權限

#### 3. 寫入失敗
```
❌ 寫入失敗: MongoWriteConcernError: waiting for replication timed out
```
**解決方案:**
- 檢查副本節點狀態
- 調整寫入關注等級
- 增加 wtimeout 值

#### 4. 序列完整性問題
```
❌ 發現問題: 5 個缺失序列, 2 個間隙
```
**解決方案:**
- 檢查故障轉移期間的錯誤日誌
- 分析網路中斷情況
- 檢查寫入重試機制

### 日誌分析

#### 查看錯誤日誌
```bash
# 查看 MongoDB 錯誤日誌
node -e "
const mongoose = require('mongoose');
const { ErrorLog } = require('./models');
const config = require('./config');

mongoose.connect(config.mongodb.uri, config.mongodb.options).then(async () => {
  const errors = await ErrorLog.find().sort({ timestamp: -1 }).limit(20);
  console.log(JSON.stringify(errors, null, 2));
  process.exit(0);
});
"
```

#### 清理測試資料
```bash
# 清理所有測試資料
node -e "
const mongoose = require('mongoose');
const { TestRecord, SystemStatus, ErrorLog } = require('./models');
const config = require('./config');

mongoose.connect(config.mongodb.uri, config.mongodb.options).then(async () => {
  await TestRecord.deleteMany({});
  await SystemStatus.deleteMany({});
  await ErrorLog.deleteMany({});
  console.log('清理完成');
  process.exit(0);
});
"
```

## 進階配置

### 自訂測試場景

可以修改 `config.js` 來創建不同的測試場景：

```javascript
// 高頻寫入測試
const highFrequencyConfig = {
  testing: {
    writeInterval: 100,     // 每100ms寫入一次
    batchSize: 50,         // 大批次寫入
    maxRetries: 10         // 增加重試次數
  }
};

// 故障容忍測試
const faultToleranceConfig = {
  mongodb: {
    options: {
      serverSelectionTimeoutMS: 30000,  // 增加選擇超時
      socketTimeoutMS: 60000,           // 增加Socket超時
      retryWrites: true,                // 啟用寫入重試
      retryReads: true                  // 啟用讀取重試
    }
  }
};
```

### 整合 CI/CD

可以將測試整合到 CI/CD 流水線中：

```yaml
# .github/workflows/mongodb-ha-test.yml
name: MongoDB HA Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017
        env:
          MONGO_INITDB_ROOT_USERNAME: admin
          MONGO_INITDB_ROOT_PASSWORD: password123
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd mongodb-ha-tester
          npm install
      
      - name: Run tests
        run: |
          cd mongodb-ha-tester
          npm test
      
      - name: Run HA test
        run: |
          cd mongodb-ha-tester
          timeout 300 node index.js single
```

## 貢獻指南

歡迎提交 Issue 和 Pull Request！

### 開發環境設定
```bash
git clone <repository>
cd mongodb-ha-tester
npm install
npm run dev  # 使用 nodemon 進行開發
```

### 測試新功能
```bash
npm test     # 執行測試套件
npm start    # 執行完整測試
```

## 授權

MIT License

## 變更日誌

### v1.0.0 (2024-01-15)
- 初始版本發布
- 實作監控、寫入測試、資料驗證功能
- 支援 MongoDB Replica Set
- 完整的測試套件