const mongoose = require('mongoose');
const colors = require('colors');
const moment = require('moment');
const config = require('./config');
const { TestRecord, ErrorLog, getNextSequenceId } = require('./models');

class SequentialWriter {
  constructor() {
    this.isRunning = false;
    this.writeCount = 0;
    this.errorCount = 0;
    this.successCount = 0;
    this.startTime = null;
    this.lastWriteTime = null;
    this.batchId = null;
    this.writeStats = {
      totalWrites: 0,
      totalErrors: 0,
      avgLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      latencySum: 0
    };
  }

  // 初始化寫入器
  async initialize() {
    try {
      console.log(colors.blue('✏️ 初始化序列寫入器...'));
      
      // 連接到 MongoDB
      await this.connect();
      
      // 生成批次 ID
      this.batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(colors.green('✅ 序列寫入器初始化成功'));
      console.log(colors.white(`批次 ID: ${this.batchId}`));
      
      return true;
    } catch (error) {
      console.error(colors.red('❌ 序列寫入器初始化失敗:'), error.message);
      await this.logError('system', '序列寫入器初始化失敗', error);
      return false;
    }
  }

  // 連接到 MongoDB
  async connect() {
    try {
      if (mongoose.connection.readyState === 0) {
        console.log(colors.yellow('🔗 正在連接到 MongoDB...'));
        await mongoose.connect(config.mongodb.uri, config.mongodb.options);
      }
      
      console.log(colors.green('✅ MongoDB 連接成功'));
      return true;
    } catch (error) {
      console.error(colors.red('❌ MongoDB 連接失敗:'), error.message);
      await this.logError('connection', 'MongoDB 連接失敗', error);
      throw error;
    }
  }

  // 獲取當前主節點資訊
  async getCurrentPrimary() {
    try {
      const admin = mongoose.connection.db.admin();
      const result = await admin.command({ replSetGetStatus: 1 });
      const primary = result.members.find(member => member.stateStr === 'PRIMARY');
      return primary ? primary.name : 'unknown';
    } catch (error) {
      console.error(colors.red('❌ 獲取主節點資訊失敗:'), error.message);
      return 'unknown';
    }
  }

  // 執行單次寫入
  async performWrite() {
    const writeStartTime = Date.now();
    let sequenceId = null;
    
    try {
      // 獲取下一個序列 ID
      sequenceId = await getNextSequenceId('test_sequence');
      
      // 獲取當前主節點
      const primaryNode = await this.getCurrentPrimary();
      
      // 創建測試記錄
      const testRecord = new TestRecord({
        sequenceId,
        data: `Test data #${sequenceId} - ${moment().format('YYYY-MM-DD HH:mm:ss.SSS')}`,
        writtenTo: primaryNode,
        batchId: this.batchId,
        status: 'pending'
      });
      
      // 寫入資料
      await testRecord.save();
      
      const writeEndTime = Date.now();
      const latency = writeEndTime - writeStartTime;
      
      // 更新統計資料
      this.updateWriteStats(latency);
      this.successCount++;
      this.lastWriteTime = new Date();
      
      // 每100次寫入顯示一次進度
      if (this.successCount % 100 === 0) {
        this.displayProgress();
      }
      
      return {
        success: true,
        sequenceId,
        latency,
        primaryNode
      };
      
    } catch (error) {
      this.errorCount++;
      
      console.error(colors.red(`❌ 寫入失敗 (序列 ID: ${sequenceId}):`, error.message));
      
      await this.logError('write', `寫入失敗 (序列 ID: ${sequenceId})`, error);
      
      return {
        success: false,
        sequenceId,
        error: error.message
      };
    }
  }

  // 批次寫入
  async performBatchWrite(batchSize = config.testing.batchSize) {
    console.log(colors.yellow(`📝 執行批次寫入 (批次大小: ${batchSize})...`));
    
    const batchStartTime = Date.now();
    const results = [];
    
    for (let i = 0; i < batchSize; i++) {
      if (!this.isRunning) break;
      
      const result = await this.performWrite();
      results.push(result);
      
      // 寫入間隔控制
      if (i < batchSize - 1) {
        await this.sleep(100); // 100ms 間隔
      }
    }
    
    const batchEndTime = Date.now();
    const batchDuration = batchEndTime - batchStartTime;
    
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    
    console.log(colors.blue(`📊 批次寫入完成:`));
    console.log(colors.white(`  成功: ${colors.green(successCount)}, 失敗: ${colors.red(errorCount)}`));
    console.log(colors.white(`  耗時: ${batchDuration}ms, 平均: ${Math.round(batchDuration / batchSize)}ms/寫入`));
    
    return results;
  }

  // 更新寫入統計
  updateWriteStats(latency) {
    this.writeStats.totalWrites++;
    this.writeStats.latencySum += latency;
    this.writeStats.avgLatency = Math.round(this.writeStats.latencySum / this.writeStats.totalWrites);
    this.writeStats.minLatency = Math.min(this.writeStats.minLatency, latency);
    this.writeStats.maxLatency = Math.max(this.writeStats.maxLatency, latency);
  }

  // 顯示進度
  displayProgress() {
    const runtime = this.startTime ? Date.now() - this.startTime : 0;
    const throughput = runtime > 0 ? Math.round((this.successCount * 1000) / runtime) : 0;
    
    console.log(colors.cyan('\n📈 寫入進度報告'));
    console.log(colors.cyan('─'.repeat(40)));
    console.log(colors.white(`時間: ${moment().format('HH:mm:ss')}`));
    console.log(colors.white(`成功寫入: ${colors.green(this.successCount)}`));
    console.log(colors.white(`失敗次數: ${colors.red(this.errorCount)}`));
    console.log(colors.white(`運行時間: ${Math.round(runtime / 1000)}秒`));
    console.log(colors.white(`吞吐量: ${throughput} 寫入/秒`));
    console.log(colors.white(`平均延遲: ${this.writeStats.avgLatency}ms`));
    console.log(colors.white(`延遲範圍: ${this.writeStats.minLatency}ms - ${this.writeStats.maxLatency}ms`));
    console.log(colors.white(`批次 ID: ${this.batchId}`));
    console.log(colors.cyan('─'.repeat(40)));
  }

  // 持續寫入模式
  async startContinuousWrite() {
    if (this.isRunning) {
      console.log(colors.yellow('⚠️ 寫入器已在運行中'));
      return;
    }
    
    this.isRunning = true;
    this.startTime = Date.now();
    
    console.log(colors.blue(`🚀 開始持續寫入 (間隔: ${config.testing.writeInterval}ms)`));
    console.log(colors.white(`批次 ID: ${this.batchId}`));
    
    const writeLoop = async () => {
      if (!this.isRunning) return;
      
      try {
        await this.performWrite();
      } catch (error) {
        console.error(colors.red('❌ 寫入循環錯誤:'), error.message);
        await this.logError('write', '寫入循環錯誤', error);
      }
      
      // 設定下次寫入
      if (this.isRunning) {
        setTimeout(writeLoop, config.testing.writeInterval);
      }
    };
    
    // 開始寫入循環
    writeLoop();
    
    // 定期顯示進度
    const progressInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(progressInterval);
        return;
      }
      this.displayProgress();
    }, 30000); // 每30秒顯示一次進度
  }

  // 停止寫入
  stopWrite() {
    if (!this.isRunning) {
      console.log(colors.yellow('⚠️ 寫入器未在運行'));
      return;
    }
    
    this.isRunning = false;
    console.log(colors.yellow('🛑 正在停止寫入...'));
    
    // 顯示最終統計
    setTimeout(() => {
      this.displayFinalStats();
    }, 1000);
  }

  // 顯示最終統計
  displayFinalStats() {
    const runtime = this.startTime ? Date.now() - this.startTime : 0;
    const throughput = runtime > 0 ? Math.round((this.successCount * 1000) / runtime) : 0;
    
    console.log(colors.magenta('\n📊 寫入測試最終報告'));
    console.log(colors.magenta('═'.repeat(50)));
    console.log(colors.white(`批次 ID: ${this.batchId}`));
    console.log(colors.white(`開始時間: ${moment(this.startTime).format('YYYY-MM-DD HH:mm:ss')}`));
    console.log(colors.white(`結束時間: ${moment().format('YYYY-MM-DD HH:mm:ss')}`));
    console.log(colors.white(`總運行時間: ${Math.round(runtime / 1000)}秒`));
    console.log(colors.white(`成功寫入: ${colors.green(this.successCount)}`));
    console.log(colors.white(`失敗次數: ${colors.red(this.errorCount)}`));
    console.log(colors.white(`成功率: ${this.successCount + this.errorCount > 0 ? Math.round((this.successCount / (this.successCount + this.errorCount)) * 100) : 0}%`));
    console.log(colors.white(`平均吞吐量: ${throughput} 寫入/秒`));
    console.log(colors.white(`平均延遲: ${this.writeStats.avgLatency}ms`));
    console.log(colors.white(`最小延遲: ${this.writeStats.minLatency}ms`));
    console.log(colors.white(`最大延遲: ${this.writeStats.maxLatency}ms`));
    console.log(colors.magenta('═'.repeat(50)));
  }

  // 記錄錯誤
  async logError(type, message, error) {
    try {
      const errorLog = new ErrorLog({
        type,
        message,
        details: {
          batchId: this.batchId,
          writeCount: this.successCount,
          stack: error?.stack,
          code: error?.code,
          name: error?.name
        },
        stack: error?.stack
      });
      
      await errorLog.save();
    } catch (logError) {
      console.error(colors.red('❌ 記錄錯誤失敗:'), logError.message);
    }
  }

  // 睡眠函數
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 清理並關閉
  async cleanup() {
    this.stopWrite();
    
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log(colors.yellow('🔌 MongoDB 連接已關閉'));
      }
    } catch (error) {
      console.error(colors.red('❌ 關閉連接失敗:'), error.message);
    }
  }
}

module.exports = SequentialWriter;

// 如果直接執行此檔案，啟動寫入器
if (require.main === module) {
  const writer = new SequentialWriter();
  
  writer.initialize().then(success => {
    if (success) {
      // 可以選擇批次寫入或持續寫入
      const mode = process.argv[2] || 'continuous';
      
      if (mode === 'batch') {
        const batchSize = parseInt(process.argv[3]) || config.testing.batchSize;
        writer.performBatchWrite(batchSize).then(() => {
          writer.cleanup();
        });
      } else {
        writer.startContinuousWrite();
      }
    } else {
      process.exit(1);
    }
  });

  // 優雅關閉
  process.on('SIGINT', async () => {
    console.log(colors.yellow('\n🛑 接收到停止信號，正在關閉寫入器...'));
    await writer.cleanup();
    process.exit(0);
  });
}