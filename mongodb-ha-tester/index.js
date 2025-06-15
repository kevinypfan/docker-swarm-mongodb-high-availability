#!/usr/bin/env node

const colors = require('colors');
const moment = require('moment');
const mongoose = require('mongoose');

const config = require('./config');
const MongoDBMonitor = require('./monitor');
const SequentialWriter = require('./writer');
const DataIntegrityValidator = require('./validator');
const WebServer = require('./web-server');

class MongoDBHATester {
  constructor() {
    this.monitor = new MongoDBMonitor();
    this.writer = new SequentialWriter();
    this.validator = new DataIntegrityValidator();
    this.webServer = new WebServer();
    
    this.isRunning = false;
    this.startTime = null;
    this.components = {
      monitor: false,
      writer: false,
      validator: false,
      webServer: false
    };
  }

  // 顯示歡迎訊息
  displayWelcome() {
    console.log(colors.rainbow('═'.repeat(70)));
    console.log(colors.cyan('🔧 MongoDB High Availability Tester'));
    console.log(colors.white('   MongoDB Replica Set 高可用性測試工具'));
    console.log(colors.rainbow('═'.repeat(70)));
    console.log(colors.yellow('功能:'));
    console.log(colors.white('  📊 實時監控 MongoDB Replica Set 狀態'));
    console.log(colors.white('  ✏️  持續有序寫入測試資料'));
    console.log(colors.white('  🔍 驗證資料完整性和一致性'));
    console.log(colors.white('  🚨 故障檢測和報警'));
    console.log(colors.rainbow('═'.repeat(70)));
  }

  // 顯示使用說明
  displayUsage() {
    console.log(colors.cyan('\n📖 使用說明:'));
    console.log(colors.white('npm start                    # 啟動完整測試 (監控+寫入+驗證)'));
    console.log(colors.white('npm run monitor              # 僅啟動監控'));
    console.log(colors.white('node writer.js               # 僅啟動寫入測試'));
    console.log(colors.white('node writer.js batch 100     # 批次寫入 100 筆資料'));
    console.log(colors.white('node validator.js            # 執行一次完整驗證'));
    console.log(colors.white('node validator.js continuous # 持續驗證'));
    console.log(colors.white('node validator.js once [批次ID] # 驗證特定批次'));
    console.log('');
  }

  // 顯示配置資訊
  displayConfiguration() {
    console.log(colors.cyan('⚙️ 配置資訊:'));
    console.log(colors.white(`MongoDB URI: ${config.mongodb.uri.replace(/password123/g, '***')}`));
    console.log(colors.white(`寫入間隔: ${config.testing.writeInterval}ms`));
    console.log(colors.white(`監控間隔: ${config.testing.monitorInterval}ms`));
    console.log(colors.white(`驗證間隔: ${config.testing.verifyInterval}ms`));
    console.log(colors.white(`批次大小: ${config.testing.batchSize}`));
    console.log('');
  }

  // 初始化所有組件
  async initializeComponents() {
    console.log(colors.blue('🔧 正在初始化所有組件...'));
    
    try {
      // 初始化監控器
      console.log(colors.yellow('📊 初始化監控器...'));
      const monitorSuccess = await this.monitor.initialize();
      this.components.monitor = monitorSuccess;
      
      if (monitorSuccess) {
        console.log(colors.green('✅ 監控器初始化成功'));
      } else {
        console.log(colors.red('❌ 監控器初始化失敗'));
      }

      // 初始化寫入器
      console.log(colors.yellow('✏️ 初始化寫入器...'));
      const writerSuccess = await this.writer.initialize();
      this.components.writer = writerSuccess;
      
      if (writerSuccess) {
        console.log(colors.green('✅ 寫入器初始化成功'));
      } else {
        console.log(colors.red('❌ 寫入器初始化失敗'));
      }

      // 初始化驗證器
      console.log(colors.yellow('🔍 初始化驗證器...'));
      const validatorSuccess = await this.validator.initialize();
      this.components.validator = validatorSuccess;
      
      if (validatorSuccess) {
        console.log(colors.green('✅ 驗證器初始化成功'));
      } else {
        console.log(colors.red('❌ 驗證器初始化失敗'));
      }

      // 初始化 Web 服務器
      console.log(colors.yellow('🌐 初始化 Web 服務器...'));
      const webServerSuccess = await this.webServer.initialize();
      this.components.webServer = webServerSuccess;
      
      if (webServerSuccess) {
        console.log(colors.green('✅ Web 服務器初始化成功'));
      } else {
        console.log(colors.red('❌ Web 服務器初始化失敗'));
      }

      const successCount = Object.values(this.components).filter(Boolean).length;
      console.log(colors.blue(`🎯 組件初始化完成: ${successCount}/4 個組件成功`));
      
      return successCount > 0;
      
    } catch (error) {
      console.error(colors.red('❌ 組件初始化失敗:'), error.message);
      return false;
    }
  }

  // 啟動完整測試
  async startFullTest() {
    if (this.isRunning) {
      console.log(colors.yellow('⚠️ 測試已在運行中'));
      return;
    }

    console.log(colors.blue('🚀 啟動 MongoDB 高可用性完整測試...'));
    this.isRunning = true;
    this.startTime = Date.now();

    try {
      // 啟動監控
      if (this.components.monitor) {
        console.log(colors.yellow('📊 啟動監控器...'));
        await this.monitor.startMonitoring();
      }

      // 等待一下讓監控穩定
      await this.sleep(2000);

      // 啟動寫入測試
      if (this.components.writer) {
        console.log(colors.yellow('✏️ 啟動寫入測試...'));
        await this.writer.startContinuousWrite();
      }

      // 等待一下讓寫入開始
      await this.sleep(5000);

      // 啟動驗證
      if (this.components.validator) {
        console.log(colors.yellow('🔍 啟動資料驗證...'));
        await this.validator.startContinuousValidation();
      }

      // 啟動 Web 服務器
      if (this.components.webServer) {
        console.log(colors.yellow('🌐 啟動 Web 服務器...'));
        await this.webServer.start();
      }

      console.log(colors.green('✅ 所有組件已啟動，開始完整測試'));
      this.displayRunningStatus();

      // 定期顯示運行狀態
      this.statusInterval = setInterval(() => {
        this.displayRunningStatus();
      }, 60000); // 每分鐘顯示一次狀態

    } catch (error) {
      console.error(colors.red('❌ 啟動完整測試失敗:'), error.message);
      await this.stop();
    }
  }

  // 顯示運行狀態
  displayRunningStatus() {
    const runtime = this.startTime ? Date.now() - this.startTime : 0;
    const runtimeFormatted = moment.duration(runtime).humanize();

    console.log(colors.magenta('\n🔄 運行狀態報告'));
    console.log(colors.magenta('─'.repeat(50)));
    console.log(colors.white(`運行時間: ${runtimeFormatted}`));
    console.log(colors.white(`開始時間: ${moment(this.startTime).format('YYYY-MM-DD HH:mm:ss')}`));
    console.log(colors.white(`當前時間: ${moment().format('YYYY-MM-DD HH:mm:ss')}`));
    
    // 組件狀態
    console.log(colors.yellow('組件狀態:'));
    console.log(colors.white(`  📊 監控器: ${this.components.monitor ? colors.green('運行中') : colors.red('未運行')}`));
    console.log(colors.white(`  ✏️  寫入器: ${this.components.writer ? colors.green('運行中') : colors.red('未運行')}`));
    console.log(colors.white(`  🔍 驗證器: ${this.components.validator ? colors.green('運行中') : colors.red('未運行')}`));
    console.log(colors.white(`  🌐 Web服務器: ${this.components.webServer ? colors.green('運行中') : colors.red('未運行')}`));
    
    // 寫入統計
    if (this.components.writer && this.writer.successCount > 0) {
      console.log(colors.yellow('寫入統計:'));
      console.log(colors.white(`  成功寫入: ${colors.green(this.writer.successCount)}`));
      console.log(colors.white(`  失敗次數: ${colors.red(this.writer.errorCount)}`));
      console.log(colors.white(`  批次 ID: ${this.writer.batchId}`));
    }
    
    console.log(colors.magenta('─'.repeat(50)));
  }

  // 執行單次測試
  async runSingleTest() {
    console.log(colors.blue('🧪 執行單次測試...'));
    
    try {
      // 執行批次寫入
      if (this.components.writer) {
        console.log(colors.yellow('✏️ 執行批次寫入...'));
        await this.writer.performBatchWrite(20);
      }

      // 等待一下
      await this.sleep(2000);

      // 執行驗證
      if (this.components.validator) {
        console.log(colors.yellow('🔍 執行資料驗證...'));
        const result = await this.validator.performFullValidation();
        
        if (result && result.overallValid) {
          console.log(colors.green('✅ 單次測試完成，資料完整性良好'));
        } else {
          console.log(colors.red('❌ 單次測試完成，發現資料完整性問題'));
        }
      }

    } catch (error) {
      console.error(colors.red('❌ 單次測試失敗:'), error.message);
    }
  }

  // 停止所有組件
  async stop() {
    if (!this.isRunning) {
      console.log(colors.yellow('⚠️ 測試未在運行'));
      return;
    }

    console.log(colors.yellow('🛑 正在停止所有組件...'));
    this.isRunning = false;

    // 清除狀態顯示間隔
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }

    try {
      // 停止各組件
      if (this.components.writer) {
        this.writer.stopWrite();
      }

      if (this.components.validator) {
        this.validator.stopValidation();
      }

      if (this.components.monitor) {
        await this.monitor.stop();
      }

      if (this.components.webServer) {
        await this.webServer.stop();
      }

      // 等待組件完全停止
      await this.sleep(2000);

      // 顯示最終統計
      this.displayFinalSummary();

      console.log(colors.green('✅ 所有組件已停止'));
      
    } catch (error) {
      console.error(colors.red('❌ 停止組件時發生錯誤:'), error.message);
    }
  }

  // 顯示最終摘要
  displayFinalSummary() {
    const runtime = this.startTime ? Date.now() - this.startTime : 0;
    
    console.log(colors.magenta('\n📋 測試最終摘要'));
    console.log(colors.magenta('═'.repeat(60)));
    console.log(colors.white(`測試開始: ${moment(this.startTime).format('YYYY-MM-DD HH:mm:ss')}`));
    console.log(colors.white(`測試結束: ${moment().format('YYYY-MM-DD HH:mm:ss')}`));
    console.log(colors.white(`總運行時間: ${moment.duration(runtime).humanize()}`));
    
    if (this.components.writer) {
      console.log(colors.yellow('\n✏️ 寫入測試摘要:'));
      console.log(colors.white(`  成功寫入: ${colors.green(this.writer.successCount)}`));
      console.log(colors.white(`  失敗次數: ${colors.red(this.writer.errorCount)}`));
      console.log(colors.white(`  批次 ID: ${this.writer.batchId}`));
      
      if (this.writer.successCount > 0) {
        const throughput = runtime > 0 ? Math.round((this.writer.successCount * 1000) / runtime) : 0;
        console.log(colors.white(`  平均吞吐量: ${throughput} 寫入/秒`));
      }
    }
    
    if (this.components.validator) {
      console.log(colors.yellow('\n🔍 驗證測試摘要:'));
      console.log(colors.white(`  驗證次數: ${this.validator.validationCount}`));
      console.log(colors.white(`  最後驗證: ${this.validator.lastValidation ? moment(this.validator.lastValidation).format('HH:mm:ss') : '未執行'}`));
    }
    
    console.log(colors.magenta('═'.repeat(60)));
    console.log(colors.cyan('感謝使用 MongoDB High Availability Tester! 🎉'));
  }

  // 睡眠函數
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 處理命令行參數
  async handleCommand() {
    const command = process.argv[2] || 'full';

    switch (command) {
      case 'full':
      case 'complete':
        await this.startFullTest();
        break;
        
      case 'single':
      case 'once':
        await this.runSingleTest();
        process.exit(0);
        break;
        
      case 'monitor':
        if (this.components.monitor) {
          await this.monitor.startMonitoring();
        }
        break;
        
      case 'write':
        if (this.components.writer) {
          await this.writer.startContinuousWrite();
        }
        break;
        
      case 'validate':
        if (this.components.validator) {
          await this.validator.startContinuousValidation();
        }
        break;
        
      case 'help':
      case '--help':
      case '-h':
        this.displayUsage();
        process.exit(0);
        break;
        
      default:
        console.log(colors.red(`❌ 未知命令: ${command}`));
        this.displayUsage();
        process.exit(1);
    }
  }
}

// 主程式
async function main() {
  const tester = new MongoDBHATester();
  
  try {
    // 顯示歡迎訊息
    tester.displayWelcome();
    tester.displayConfiguration();
    
    // 初始化組件
    const initSuccess = await tester.initializeComponents();
    
    if (!initSuccess) {
      console.error(colors.red('❌ 組件初始化失敗，無法啟動測試'));
      process.exit(1);
    }
    
    // 處理命令
    await tester.handleCommand();
    
  } catch (error) {
    console.error(colors.red('❌ 程式執行失敗:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }

  // 優雅關閉處理
  process.on('SIGINT', async () => {
    console.log(colors.yellow('\n🛑 接收到停止信號，正在優雅地關閉...'));
    await tester.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log(colors.yellow('\n🛑 接收到終止信號，正在優雅地關閉...'));
    await tester.stop();
    process.exit(0);
  });
}

// 如果直接執行此檔案，啟動主程式
if (require.main === module) {
  main().catch(error => {
    console.error(colors.red('❌ 主程式執行失敗:'), error.message);
    process.exit(1);
  });
}

module.exports = MongoDBHATester;