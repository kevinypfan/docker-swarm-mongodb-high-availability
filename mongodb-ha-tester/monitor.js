const mongoose = require('mongoose');
const colors = require('colors');
const moment = require('moment');
const config = require('./config');
const { SystemStatus, ErrorLog } = require('./models');

class MongoDBMonitor {
  constructor() {
    this.isConnected = false;
    this.connectionStatus = {};
    this.lastCheck = null;
    this.errorCount = 0;
  }

  // 初始化監控器
  async initialize() {
    try {
      console.log(colors.blue('🔧 初始化 MongoDB 監控器...'));
      
      // 設定 Mongoose 連線事件監聽器
      this.setupConnectionListeners();
      
      // 連接到 MongoDB
      await this.connect();
      
      console.log(colors.green('✅ MongoDB 監控器初始化成功'));
      return true;
    } catch (error) {
      console.error(colors.red('❌ MongoDB 監控器初始化失敗:'), error.message);
      await this.logError('system', '監控器初始化失敗', error);
      return false;
    }
  }

  // 連接到 MongoDB
  async connect() {
    try {
      console.log(colors.yellow('🔗 正在連接到 MongoDB Replica Set...'));
      
      await mongoose.connect(config.mongodb.uri, config.mongodb.options);
      
      this.isConnected = true;
      console.log(colors.green('✅ 成功連接到 MongoDB'));
      
      return true;
    } catch (error) {
      this.isConnected = false;
      console.error(colors.red('❌ MongoDB 連接失敗:'), error.message);
      await this.logError('connection', 'MongoDB 連接失敗', error);
      throw error;
    }
  }

  // 設定連線事件監聽器
  setupConnectionListeners() {
    mongoose.connection.on('connected', () => {
      this.isConnected = true;
      console.log(colors.green('🟢 MongoDB 連線已建立'));
    });

    mongoose.connection.on('error', async (error) => {
      this.isConnected = false;
      console.error(colors.red('🔴 MongoDB 連線錯誤:'), error.message);
      // 不在連接錯誤時調用 logError，避免循環錯誤
    });

    mongoose.connection.on('disconnected', () => {
      this.isConnected = false;
      console.log(colors.yellow('🟡 MongoDB 連線已斷開'));
    });

    mongoose.connection.on('reconnected', () => {
      this.isConnected = true;
      console.log(colors.green('🟢 MongoDB 重新連線成功'));
    });
  }

  // 檢查 Replica Set 狀態
  async checkReplicaSetStatus() {
    try {
      const admin = mongoose.connection.db.admin();
      const result = await admin.command({ replSetGetStatus: 1 });
      
      const status = {
        set: result.set,
        date: result.date,
        myState: result.myState,
        members: result.members.map(member => ({
          _id: member._id,
          name: member.name,
          health: member.health,
          state: member.state,
          stateStr: member.stateStr,
          uptime: member.uptime,
          optime: member.optime,
          optimeDate: member.optimeDate,
          lastHeartbeat: member.lastHeartbeat,
          lastHeartbeatRecv: member.lastHeartbeatRecv,
          pingMs: member.pingMs,
          syncSourceHost: member.syncSourceHost,
          configVersion: member.configVersion
        }))
      };

      // 更新連線狀態
      this.updateConnectionStatus(status);
      
      return status;
    } catch (error) {
      console.error(colors.red('❌ 檢查 Replica Set 狀態失敗:'), error.message);
      await this.logError('system', '檢查 Replica Set 狀態失敗', error);
      return null;
    }
  }

  // 更新連線狀態
  updateConnectionStatus(replicaSetStatus) {
    const primary = replicaSetStatus.members.find(m => m.stateStr === 'PRIMARY');
    const secondaries = replicaSetStatus.members.filter(m => m.stateStr === 'SECONDARY');
    
    this.connectionStatus = {
      primary: primary ? primary.name : null,
      secondary: secondaries.map(s => s.name),
      isConnected: this.isConnected,
      lastUpdate: new Date(),
      totalMembers: replicaSetStatus.members.length,
      healthyMembers: replicaSetStatus.members.filter(m => m.health === 1).length
    };
  }

  // 測試寫入延遲
  async measureWriteLatency() {
    try {
      const startTime = Date.now();
      
      // 執行一個簡單的寫入操作
      const testDoc = {
        timestamp: new Date(),
        testData: `latency-test-${Date.now()}`
      };
      
      await mongoose.connection.db.collection('latency_test').insertOne(testDoc);
      
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      // 清理測試文件
      await mongoose.connection.db.collection('latency_test').deleteOne({ _id: testDoc._id });
      
      return latency;
    } catch (error) {
      console.error(colors.red('❌ 測量寫入延遲失敗:'), error.message);
      await this.logError('system', '測量寫入延遲失敗', error);
      return null;
    }
  }

  // 測試讀取延遲
  async measureReadLatency() {
    try {
      const startTime = Date.now();
      
      // 執行一個簡單的讀取操作
      await mongoose.connection.db.collection('test').findOne({});
      
      const endTime = Date.now();
      return endTime - startTime;
    } catch (error) {
      console.error(colors.red('❌ 測量讀取延遲失敗:'), error.message);
      await this.logError('system', '測量讀取延遲失敗', error);
      return null;
    }
  }

  // 記錄系統狀態
  async recordSystemStatus() {
    try {
      const replicaSetStatus = await this.checkReplicaSetStatus();
      if (!replicaSetStatus) return null;

      const writeLatency = await this.measureWriteLatency();
      const readLatency = await this.measureReadLatency();
      
      // 獲取 MongoDB 版本資訊
      let version = 'N/A';
      try {
        const buildInfo = await mongoose.connection.db.admin().command({ buildInfo: 1 });
        version = buildInfo.version;
      } catch (versionError) {
        console.warn('⚠️ 無法獲取 MongoDB 版本:', versionError.message);
      }

      const systemStatus = new SystemStatus({
        replicaSetStatus,
        connectionStatus: this.connectionStatus,
        version,
        performance: {
          writeLatency,
          readLatency,
          throughput: null // 將在主程式中計算
        }
      });

      await systemStatus.save();
      this.lastCheck = new Date();
      
      return systemStatus;
    } catch (error) {
      console.error(colors.red('❌ 記錄系統狀態失敗:'), error.message);
      await this.logError('system', '記錄系統狀態失敗', error);
      return null;
    }
  }

  // 顯示狀態摘要
  displayStatus(systemStatus) {
    if (!systemStatus) return;

    const { replicaSetStatus, connectionStatus, performance } = systemStatus;
    
    console.log(colors.cyan('\n📊 MongoDB Replica Set 狀態報告'));
    console.log(colors.cyan('═'.repeat(50)));
    
    // 基本資訊
    console.log(colors.white(`時間: ${moment().format('YYYY-MM-DD HH:mm:ss')}`));
    console.log(colors.white(`Replica Set: ${replicaSetStatus.set}`));
    console.log(colors.white(`連線狀態: ${connectionStatus.isConnected ? colors.green('已連線') : colors.red('未連線')}`));
    
    // 節點狀態
    console.log(colors.yellow('\n🔗 節點狀態:'));
    replicaSetStatus.members.forEach(member => {
      const statusColor = member.health === 1 ? colors.green : colors.red;
      const stateColor = member.stateStr === 'PRIMARY' ? colors.blue : 
                        member.stateStr === 'SECONDARY' ? colors.green : colors.yellow;
      
      console.log(`  ${statusColor('●')} ${member.name} - ${stateColor(member.stateStr)} (健康度: ${member.health})`);
      
      if (member.lastHeartbeat) {
        const heartbeatTime = moment(member.lastHeartbeat).fromNow();
        console.log(`    最後心跳: ${heartbeatTime}, 延遲: ${member.pingMs || 0}ms`);
      }
    });
    
    // 效能指標
    console.log(colors.yellow('\n⚡ 效能指標:'));
    if (performance.writeLatency) {
      const writeColor = performance.writeLatency < 100 ? colors.green : 
                        performance.writeLatency < 500 ? colors.yellow : colors.red;
      console.log(`  寫入延遲: ${writeColor(performance.writeLatency + 'ms')}`);
    }
    
    if (performance.readLatency) {
      const readColor = performance.readLatency < 50 ? colors.green : 
                       performance.readLatency < 200 ? colors.yellow : colors.red;
      console.log(`  讀取延遲: ${readColor(performance.readLatency + 'ms')}`);
    }
    
    console.log(colors.cyan('═'.repeat(50)));
  }

  // 記錄錯誤
  async logError(type, message, error) {
    try {
      // 只在連接時才嘗試保存到資料庫
      if (this.isConnected) {
        const errorLog = new ErrorLog({
          type,
          message,
          details: {
            stack: error?.stack,
            code: error?.code,
            name: error?.name
          },
          stack: error?.stack
        });
        
        await errorLog.save();
        this.errorCount++;
      } else {
        // 連接斷開時只記錄到控制台
        console.error(colors.red(`❌ [${type}] ${message}:`), error?.message || error);
      }
    } catch (logError) {
      console.error(colors.red('❌ 記錄錯誤失敗:'), logError.message);
    }
  }

  // 開始監控
  async startMonitoring() {
    console.log(colors.blue(`🔍 開始監控 MongoDB (間隔: ${config.testing.monitorInterval}ms)`));
    
    const monitorLoop = async () => {
      try {
        const systemStatus = await this.recordSystemStatus();
        this.displayStatus(systemStatus);
      } catch (error) {
        console.error(colors.red('❌ 監控循環錯誤:'), error.message);
        await this.logError('system', '監控循環錯誤', error);
      }
    };

    // 立即執行一次
    await monitorLoop();
    
    // 設定定期監控
    setInterval(monitorLoop, config.testing.monitorInterval);
  }

  // 停止監控
  async stop() {
    try {
      await mongoose.connection.close();
      console.log(colors.yellow('🛑 MongoDB 監控已停止'));
    } catch (error) {
      console.error(colors.red('❌ 停止監控失敗:'), error.message);
    }
  }
}

module.exports = MongoDBMonitor;

// 如果直接執行此檔案，啟動監控器
if (require.main === module) {
  const monitor = new MongoDBMonitor();
  
  monitor.initialize().then(success => {
    if (success) {
      monitor.startMonitoring();
    } else {
      process.exit(1);
    }
  });

  // 優雅關閉
  process.on('SIGINT', async () => {
    console.log(colors.yellow('\n🛑 接收到停止信號，正在關閉監控器...'));
    await monitor.stop();
    process.exit(0);
  });
}