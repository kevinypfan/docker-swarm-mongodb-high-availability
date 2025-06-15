const config = {
  mongodb: {
    // MongoDB Replica Set 連線設定
    // 容器環境使用服務名稱，本地開發使用 localhost
    uri: process.env.MONGODB_URI || (
      process.env.NODE_ENV === 'production' 
        ? 'mongodb://admin:password123@mongodb-primary:27017,mongodb-secondary1:27017,mongodb-secondary2:27017/mongodb-ha-test?replicaSet=rs0&authSource=admin'
        : 'mongodb://admin:password123@localhost:27017,localhost:27018,localhost:27019/mongodb-ha-test?replicaSet=rs0&authSource=admin&directConnection=false'
    ),
    
    // 連線選項
    options: {
      maxPoolSize: 10, // 最大連線池大小
      serverSelectionTimeoutMS: 10000, // 伺服器選擇超時時間
      socketTimeoutMS: 45000, // Socket 超時時間
      bufferCommands: false, // 禁用 mongoose 緩衝命令
      readPreference: 'primaryPreferred', // 讀取偏好設定
      readConcern: { level: 'majority' }, // 讀取關注等級
      writeConcern: { w: 'majority', j: true, wtimeout: 5000 }, // 寫入關注等級
    }
  },
  
  // 測試設定
  testing: {
    // 寫入測試間隔 (毫秒)
    writeInterval: 1000,
    
    // 監控間隔 (毫秒)
    monitorInterval: 5000,
    
    // 資料驗證間隔 (毫秒)
    verifyInterval: 10000,
    
    // 批次大小
    batchSize: 10,
    
    // 最大重試次數
    maxRetries: 3,
    
    // 重試延遲 (毫秒)
    retryDelay: 1000
  },
  
  // 日誌設定
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableColors: true,
    enableTimestamp: true
  }
};

module.exports = config;