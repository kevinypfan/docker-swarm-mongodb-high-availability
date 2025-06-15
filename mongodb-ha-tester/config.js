// 載入環境變數
require('dotenv').config();

// 輔助函數：轉換字串為布林值
const toBoolean = (value, defaultValue = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return defaultValue;
};

// 輔助函數：轉換字串為數字
const toNumber = (value, defaultValue = 0) => {
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
};

const config = {
  mongodb: {
    // MongoDB Replica Set 連線設定
    uri: process.env.MONGODB_URI || (
      process.env.NODE_ENV === 'production' 
        ? 'mongodb://admin:password123@mongodb-primary:27017,mongodb-secondary1:27017,mongodb-secondary2:27017/mongodb-ha-test?replicaSet=rs0&authSource=admin'
        : 'mongodb://admin:password123@localhost:27017,localhost:27018,localhost:27019/mongodb-ha-test?replicaSet=rs0&authSource=admin&directConnection=false'
    ),
    
    // 連線選項
    options: {
      maxPoolSize: toNumber(process.env.MAX_POOL_SIZE, 10),
      serverSelectionTimeoutMS: toNumber(process.env.SERVER_SELECTION_TIMEOUT_MS, 10000),
      socketTimeoutMS: toNumber(process.env.SOCKET_TIMEOUT_MS, 45000),
      bufferCommands: false,
      readPreference: process.env.READ_PREFERENCE || 'primaryPreferred',
      readConcern: { 
        level: process.env.READ_CONCERN_LEVEL || 'majority' 
      },
      writeConcern: { 
        w: process.env.WRITE_CONCERN_W || 'majority', 
        j: toBoolean(process.env.WRITE_CONCERN_J, true), 
        wtimeout: toNumber(process.env.WRITE_CONCERN_WTIMEOUT, 5000)
      },
    }
  },
  
  // 測試設定
  testing: {
    // 寫入測試間隔 (毫秒)
    writeInterval: toNumber(process.env.WRITE_INTERVAL, 1000),
    
    // 監控間隔 (毫秒)
    monitorInterval: toNumber(process.env.MONITOR_INTERVAL, 5000),
    
    // 資料驗證間隔 (毫秒)
    verifyInterval: toNumber(process.env.VERIFY_INTERVAL, 10000),
    
    // 批次大小
    batchSize: toNumber(process.env.BATCH_SIZE, 10),
    
    // 最大重試次數
    maxRetries: toNumber(process.env.MAX_RETRIES, 3),
    
    // 重試延遲 (毫秒)
    retryDelay: toNumber(process.env.RETRY_DELAY, 1000)
  },
  
  // 日誌設定
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableColors: true,
    enableTimestamp: true
  }
};

module.exports = config;