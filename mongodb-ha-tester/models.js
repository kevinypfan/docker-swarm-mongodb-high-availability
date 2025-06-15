const mongoose = require('mongoose');

// 測試資料記錄 Schema
const testRecordSchema = new mongoose.Schema({
  // 有序 ID，用於檢查資料完整性
  sequenceId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  
  // 時間戳
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // 測試資料
  data: {
    type: String,
    required: true
  },
  
  // 寫入的節點資訊
  writtenTo: {
    type: String,
    required: true
  },
  
  // 批次 ID
  batchId: {
    type: String,
    index: true
  },
  
  // 狀態
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'verified'],
    default: 'pending'
  }
}, {
  timestamps: true,
  versionKey: false
});

// 系統狀態記錄 Schema
const systemStatusSchema = new mongoose.Schema({
  // 檢查時間
  checkTime: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Replica Set 狀態
  replicaSetStatus: {
    type: Object,
    required: true
  },
  
  // 連線狀態
  connectionStatus: {
    primary: String,
    secondary: [String],
    isConnected: Boolean,
    error: String
  },
  
  // 效能指標
  performance: {
    writeLatency: Number,
    readLatency: Number,
    throughput: Number
  },
  
  // 資料完整性檢查結果
  dataIntegrity: {
    totalRecords: Number,
    missingSequences: [Number],
    duplicateSequences: [Number],
    isValid: Boolean
  }
}, {
  timestamps: true,
  versionKey: false
});

// 錯誤日誌 Schema
const errorLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  type: {
    type: String,
    enum: ['connection', 'write', 'read', 'validation', 'system'],
    required: true,
    index: true
  },
  
  message: {
    type: String,
    required: true
  },
  
  details: {
    type: Object
  },
  
  stack: String,
  
  resolved: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  versionKey: false
});

// 計數器 Schema (用於產生序列 ID)
const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  
  sequence_value: {
    type: Number,
    default: 0
  }
}, {
  versionKey: false
});

// 建立模型
const TestRecord = mongoose.model('TestRecord', testRecordSchema);
const SystemStatus = mongoose.model('SystemStatus', systemStatusSchema);
const ErrorLog = mongoose.model('ErrorLog', errorLogSchema);
const Counter = mongoose.model('Counter', counterSchema);

// 序列 ID 產生器
async function getNextSequenceId(sequenceName) {
  const counter = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence_value;
}

module.exports = {
  TestRecord,
  SystemStatus,
  ErrorLog,
  Counter,
  getNextSequenceId
};